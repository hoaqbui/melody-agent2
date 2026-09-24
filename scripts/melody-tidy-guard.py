#!/usr/bin/env python3
"""Guard for Melody's nightly tidy-up (task 278, `scripts/routines/tidy-up.yaml`).

Round 4: the isolated-worktree design (never touch the live checkout to
validate or undo a run) held up, but a third review found the mechanics
underneath it loose enough to be gamed or raced. This version tightens
every one of those:

  guard --begin      -> locked, isolated worktree + branch, prints the path
  the tidy-up recipe -> runs entirely inside that worktree
  guard              -> locked check; merges a validated SHA, never a name

`--begin` (real usage: `--notebook ~/Melody`; a fixture builds its own):
  - holds an exclusive `flock` on a lock file beside the state file for its
    entire duration, so two `--begin`s (or a `--begin` racing a `check`)
    can't interleave
  - refuses (exit 2) if a `tidy-up/*` branch or a registered tidy-up
    worktree already exists — the active-run lock; a stuck run needs a
    person, nothing here clears one
  - refuses (exit 2) if there is no commit yet, HEAD is detached, or the
    base has a symlink anywhere under `MEMORY.md`, `DREAMS.md`, or
    `notes/**` — in every refusal case, no worktree is created at all
  - a unique run id (`<date>-<6 hex>`) names the branch
    (`tidy-up/<run id>`), the worktree, and (later, only if needed) the
    cause branch and its scratch index — nothing here is shared across runs
  - records `{base, notebook, notebook_branch, tidy_branch, worktree, date,
    run_id}` to the state file (default `~/.local/state/melody/tidy-run.json`;
    a fixture uses a temp path), creates the worktree, and prints its path
    — the tidy-up recipe's `working_dir` parameter

The check holds the same lock, confirms the notebook is still on the
recorded branch, and diffs `base..<tip sha>` *inside the worktree*:
  - every `journal/*.md` untouched (diff, so a rename or delete is caught)
  - only `MEMORY.md`, `DREAMS.md`, and `notes/**` may change at all
  - no symlink anywhere under those same paths at the tip (the base was
    already guaranteed clean of this at `--begin`)
  - `MEMORY.md`'s removal measured as diff deletions against the *exact
    bytes* of the baseline (decoded only for the diff itself), not net
    line count
  - `DREAMS.md`'s baseline content is an exact **byte** prefix of the new
    content — read as bytes, never through a text decode that could
    normalize a line ending — plus exactly one `## tidy-up <date>` entry
    appended
  - the worktree clean at the end

Every merge — the tip on a pass, or the cause commit on a violation — is a
`git merge --ff-only` against a resolved SHA, never a branch name, with
`--no-autostash --no-overwrite-ignore` and `-c merge.autoStash=false`, and
is preceded by one more check that the notebook is still on its recorded
branch (closing most, not all, of the window between validation and the
write — see `_still_on_branch`). `--no-overwrite-ignore` means a merge that
would clobber an ignored-but-present file in the notebook is refused rather
than silently overwriting it.

On a clean pass: merge the tip SHA, then remove the worktree (never
`--force`) and delete the branch only if it still points at that same SHA
(`git update-ref -d`, a compare-and-delete). Either half of that cleanup
failing is exit 2, never 0 — the merge landed, but a person needs to look.
A refused merge (the notebook moved, or the ignore-overwrite guard fired)
removes the worktree, keeps the branch, and is exit 2.

On a violation: the cause commit (`base` plus one `## tidy-up <date> — not
merged: <cause>`, built from `base`'s raw DREAMS.md bytes) is built
entirely with plumbing (`read-tree` / `hash-object` / `write-tree` /
`commit-tree` against a scratch index unique to this run) — no working
tree, anywhere, is touched to build it. If `base`'s own DREAMS.md is
somehow a symlink (shouldn't be reachable given the `--begin`-time check,
but never assume it), no cause commit is attempted at all — the cause goes
to the state file only. Otherwise: if the notebook is still at `base`, the
cause SHA is merged the same way a pass is; a refused cause merge is exit 2
with both branches kept, not exit 1. If the notebook has moved, the cause
is recorded in the state file only, never written into the notebook.
Either way, once whatever could be merged has been, cleanup removes the
worktree and deletes both branches (again, only if each still points where
expected) — exit 1 if the violation was fully handled (recorded, one way or
the other), exit 2 if any step along the way couldn't be verified. Nothing
here calls a model, and nothing here reverts, stashes, resets, or cleans
anything, anywhere.

Fixture: --fixture DIR builds a throwaway notebook (a fresh temp git repo)
from DIR/spec.json (day offsets from "today", matching the style of
`scripts/melody-routines.py`, task 279), drives it through the same
begin -> (simulated recipe) -> check lifecycle production uses, and
discards it on exit.

    python3 scripts/melody-tidy-guard.py --fixture scripts/fixtures/notebook-tidy/ok
"""

import argparse
import difflib
import fcntl
import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path

MEMORY_DROP_LIMIT_PCT = 25
ALLOWED_PATH_RE = re.compile(r"^(MEMORY\.md|DREAMS\.md|notes/.*)$")
ALLOWED_TOP_PATHSPECS = ("MEMORY.md", "DREAMS.md", "notes")
DREAM_HEADING_RE = re.compile(r"^## ", re.MULTILINE)
DREAM_ENTRY_DATE_RE = re.compile(r"^## tidy-up \d{4}-\d{2}-\d{2}\b")


class NotGitRepo(RuntimeError):
    pass


def _git(repo: Path, *args: str, check: bool = True) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args], capture_output=True, text=True
    )
    if check and result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout


def _git_ok(repo: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)


def require_git_repo(repo: Path) -> None:
    if _git_ok(repo, "rev-parse", "--git-dir").returncode != 0:
        raise NotGitRepo(f"not a git repository: {repo}")


def _show_bytes(repo: Path, rev: str, path: str) -> bytes | None:
    """`git show rev:path` as raw bytes, or None if that path doesn't exist
    at rev. Never text-mode: a text decode can normalize a line ending,
    which would silently defeat the byte-exact DREAMS.md prefix check."""
    result = subprocess.run(["git", "-C", str(repo), "show", f"{rev}:{path}"], capture_output=True)
    return result.stdout if result.returncode == 0 else None


def clean_tree(repo: Path) -> bool:
    return _git(repo, "status", "--porcelain", "--untracked-files=all").strip() == ""


def _note(state_file: Path, message: str) -> None:
    """A record of the last outcome, kept outside the notebook and the
    worktree — never written into either."""
    data = {}
    if state_file.exists():
        try:
            data = json.loads(state_file.read_text())
        except (json.JSONDecodeError, OSError):
            data = {}
    data["last_check"] = {"at": datetime.now().isoformat(timespec="seconds"), "message": message}
    try:
        state_file.parent.mkdir(parents=True, exist_ok=True)
        state_file.write_text(json.dumps(data, indent=2))
    except OSError:
        pass


def _fail(state_file: Path, message: str) -> int:
    print(message, file=sys.stderr)
    _note(state_file, message)
    return 2


class _RunLock:
    """Exclusive ownership of one notebook's tidy-up run. Held for the whole
    of `--begin` or the whole of a check, via a non-blocking `flock` on a
    file beside the state file — never across the two (they're separate
    process invocations), just enough to stop two of either from
    interleaving."""

    def __init__(self, path: Path):
        self.path = path
        self._fh = None

    def acquire(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fh = open(self.path, "a+")
        try:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as err:
            fh.close()
            raise RuntimeError(f"another tidy-guard run holds the lock at {self.path}") from err
        self._fh = fh

    def release(self) -> None:
        if self._fh:
            fcntl.flock(self._fh.fileno(), fcntl.LOCK_UN)
            self._fh.close()
            self._fh = None

    def __enter__(self) -> "_RunLock":
        self.acquire()
        return self

    def __exit__(self, *exc) -> None:
        self.release()


# ---------- begin ----------


def _active_run_lock(notebook: Path) -> str | None:
    branches = _git(notebook, "for-each-ref", "--format=%(refname:short)", "refs/heads/tidy-up/").split()
    if branches:
        return f"branch {branches[0]} already exists"
    listing = _git(notebook, "worktree", "list", "--porcelain")
    if "branch refs/heads/tidy-up/" in listing:
        return "a tidy-up worktree is already registered"
    return None


def _symlinks_under_allowed(repo: Path, rev: str) -> list[str]:
    """Every path at `rev` under the allowed set (`MEMORY.md`, `DREAMS.md`,
    `notes/**`) that is a symlink — one `ls-tree -r` covers all three."""
    listing = _git_ok(repo, "ls-tree", "-r", rev, "--", *ALLOWED_TOP_PATHSPECS)
    hits = []
    for line in listing.stdout.splitlines():
        meta, _, path = line.partition("\t")
        if meta and meta.split()[0] == "120000":
            hits.append(path)
    return hits


def begin(notebook: Path, state_file: Path) -> int:
    with _RunLock(state_file.parent / "tidy-run.lock"):
        return _begin_locked(notebook, state_file)


def _begin_locked(notebook: Path, state_file: Path) -> int:
    require_git_repo(notebook)

    lock_reason = _active_run_lock(notebook)
    if lock_reason:
        return _fail(state_file, f"refusing to begin: {lock_reason} (active-run lock)")

    head = _git_ok(notebook, "rev-parse", "HEAD")
    if head.returncode != 0:
        return _fail(state_file, f"refusing to begin: {notebook} has no commit yet (root-commit baseline)")
    base = head.stdout.strip()

    branch = _git_ok(notebook, "symbolic-ref", "--short", "HEAD")
    if branch.returncode != 0:
        return _fail(state_file, f"refusing to begin: {notebook} HEAD is detached")
    notebook_branch = branch.stdout.strip()

    base_symlinks = _symlinks_under_allowed(notebook, base)
    if base_symlinks:
        return _fail(
            state_file,
            "refusing to begin: symlink under an allowed path in the base: " + ", ".join(sorted(base_symlinks)),
        )

    today = date.today().isoformat()
    run_id = f"{today}-{secrets.token_hex(3)}"
    tidy_branch = f"tidy-up/{run_id}"
    worktree = state_file.parent / f"tidy-worktree-{run_id}"

    added = _git_ok(notebook, "worktree", "add", str(worktree), "-b", tidy_branch, base)
    if added.returncode != 0:
        return _fail(state_file, f"could not create the tidy-up worktree: {added.stderr.strip()}")

    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(
        json.dumps(
            {
                "base": base,
                "notebook": str(notebook),
                "notebook_branch": notebook_branch,
                "tidy_branch": tidy_branch,
                "worktree": str(worktree),
                "date": today,
                "run_id": run_id,
            }
        )
    )
    print(str(worktree))
    return 0


# ---------- the checks (all operate on the worktree's committed history) ----------


def journal_violation(repo: Path, base: str, tip: str) -> str | None:
    changed = _git(repo, "diff", "--name-only", base, tip, "--", "journal/").splitlines()
    if changed:
        return "journal edited: " + ", ".join(sorted(changed))
    return None


def allowed_paths_violation(repo: Path, base: str, tip: str) -> str | None:
    changed = _git(repo, "diff", "--name-only", base, tip).splitlines()
    disallowed = [p for p in changed if not ALLOWED_PATH_RE.match(p) and not p.startswith("journal/")]
    if disallowed:
        return "disallowed path(s) changed: " + ", ".join(sorted(disallowed))
    return None


def _mode_at(repo: Path, rev: str, path: str) -> str | None:
    line = _git_ok(repo, "ls-tree", rev, "--", path).stdout.strip()
    return line.split()[0] if line else None


def symlink_violation_at(repo: Path, rev: str) -> str | None:
    hits = _symlinks_under_allowed(repo, rev)
    if hits:
        return "symlink under an allowed path: " + ", ".join(sorted(hits))
    return None


def memory_removed(before_bytes: bytes, after_bytes: bytes) -> tuple[int, int, int, bool]:
    """Baseline line count, lines removed (diff deletions, not net count),
    the rounded percent for display, and whether that exceeds the limit.
    Decoded from bytes only here, for the line-based diff; replacing lines
    counts as removing them, so a MEMORY.md held at the same length by
    swapping most of its content for something else is still a drop.
    """
    before_text = before_bytes.decode("utf-8", errors="surrogateescape")
    after_text = after_bytes.decode("utf-8", errors="surrogateescape")
    before_lines = before_text.splitlines()
    after_lines = after_text.splitlines()
    removed = sum(1 for line in difflib.ndiff(before_lines, after_lines) if line.startswith("- "))
    before_count = len(before_lines)
    pct = round(removed * 100 / before_count) if before_count else 0
    over_limit = before_count > 0 and removed * 100 > before_count * MEMORY_DROP_LIMIT_PCT
    return before_count, removed, pct, over_limit


def dreams_violation(before_bytes: bytes, after_bytes: bytes) -> str | None:
    if not after_bytes.startswith(before_bytes):
        return "DREAMS.md rewritten: an earlier entry changed"
    appended = after_bytes[len(before_bytes):].decode("utf-8", errors="replace")
    headings = DREAM_HEADING_RE.findall(appended)
    if len(headings) != 1:
        return f"{len(headings)} new DREAMS.md entries appended (expected 1)"
    if not DREAM_ENTRY_DATE_RE.match(appended.lstrip("\n")):
        return "appended DREAMS.md entry isn't `## tidy-up <date>`"
    return None


# ---------- accept / reject ----------


def _still_on_branch(notebook: Path, expected_branch: str) -> bool:
    # There is a small window between this check and the merge call right
    # after it where the branch could still change underneath us; closing
    # it fully needs an OS-level lock on the notebook's own HEAD, out of
    # scope here. This narrows the race to that one gap; it doesn't close it.
    cur = _git_ok(notebook, "symbolic-ref", "--short", "HEAD")
    return cur.returncode == 0 and cur.stdout.strip() == expected_branch


def _merge_ff_only(notebook: Path, sha: str) -> subprocess.CompletedProcess:
    return _git_ok(
        notebook,
        "-c", "merge.autoStash=false",
        "merge", "--ff-only", "--no-autostash", "--no-overwrite-ignore",
        sha,
    )


def _remove_worktree(notebook: Path, worktree: Path, state_file: Path) -> bool:
    removed = _git_ok(notebook, "worktree", "remove", str(worktree))
    _git_ok(notebook, "worktree", "prune")
    if removed.returncode != 0:
        note = f"worktree at {worktree} could not be removed ({removed.stderr.strip()}); kept for inspection"
        print(f"warning: {note}", file=sys.stderr)
        _note(state_file, note)
        return False
    return True


def _delete_branch_if_at(notebook: Path, branch: str, sha: str) -> bool:
    """Compare-and-delete: refuses if the branch has moved since `sha`."""
    return _git_ok(notebook, "update-ref", "-d", f"refs/heads/{branch}", sha).returncode == 0


def _fail_and_cleanup(notebook: Path, worktree: Path, tidy_branch: str, state_file: Path, message: str) -> int:
    """Used by every check-time failure that isn't a validated pass or a
    validated violation, so a stuck run doesn't hold the active-run lock
    forever: best-effort, never-forced cleanup, then the usual `_fail`.

    The branch is deleted only once the worktree that has it checked out is
    actually gone — deleting it first (or regardless) is exactly what a
    checked-out branch refuses porcelain for and plumbing doesn't check. If
    the worktree removal fails, the branch is left too: a kept worktree
    keeps its branch, which is the one coherent "stuck run" state.
    """
    tip = _git_ok(notebook, "rev-parse", tidy_branch)
    if _remove_worktree(notebook, worktree, state_file) and tip.returncode == 0:
        _delete_branch_if_at(notebook, tidy_branch, tip.stdout.strip())
    return _fail(state_file, message)


def _cause_commit(notebook: Path, base: str, run_date: str, cause_line: str, index_file: Path) -> tuple[str | None, str | None]:
    """Build one commit — `base` plus a single DREAMS.md append, from
    `base`'s raw bytes — entirely with plumbing against a scratch index
    unique to this run. No working tree, anywhere, is touched to build it;
    the only write to the notebook's checkout anywhere in this file is the
    `git merge --ff-only` a caller makes afterward.
    """
    baseline_bytes = _show_bytes(notebook, base, "DREAMS.md") or b""
    if baseline_bytes and not baseline_bytes.endswith(b"\n"):
        baseline_bytes += b"\n"
    new_dreams_bytes = baseline_bytes + f"## tidy-up {run_date} — not merged: {cause_line}\n".encode("utf-8")

    env = {**os.environ, "GIT_INDEX_FILE": str(index_file)}
    index_file.unlink(missing_ok=True)

    read = subprocess.run(["git", "-C", str(notebook), "read-tree", base], capture_output=True, text=True, env=env)
    if read.returncode != 0:
        return None, f"read-tree failed: {read.stderr.strip()}"

    blob = subprocess.run(
        ["git", "-C", str(notebook), "hash-object", "-w", "--stdin"],
        input=new_dreams_bytes,
        capture_output=True,
        env=env,
    )
    if blob.returncode != 0:
        return None, f"hash-object failed: {blob.stderr.decode(errors='replace').strip()}"
    blob_sha = blob.stdout.decode().strip()

    updated = subprocess.run(
        ["git", "-C", str(notebook), "update-index", "--add", "--cacheinfo", f"100644,{blob_sha},DREAMS.md"],
        capture_output=True,
        text=True,
        env=env,
    )
    if updated.returncode != 0:
        return None, f"update-index failed: {updated.stderr.strip()}"

    written = subprocess.run(["git", "-C", str(notebook), "write-tree"], capture_output=True, text=True, env=env)
    if written.returncode != 0:
        return None, f"write-tree failed: {written.stderr.strip()}"
    new_tree = written.stdout.strip()

    committed = subprocess.run(
        [
            "git", "-C", str(notebook), "commit-tree", new_tree, "-p", base, "-m",
            f"memory: tidy-up {run_date} not merged — {cause_line}",
        ],
        capture_output=True,
        text=True,
        env=env,
    )
    if committed.returncode != 0:
        return None, f"commit-tree failed: {committed.stderr.strip()}"
    return committed.stdout.strip(), None


def _accept(
    notebook: Path, worktree: Path, notebook_branch: str, tidy_branch: str, tip_sha: str, state_file: Path, pct: int
) -> int:
    if not _still_on_branch(notebook, notebook_branch):
        _remove_worktree(notebook, worktree, state_file)
        return _fail(
            state_file,
            f"the notebook moved off {notebook_branch} just before merging — nothing merged (branch {tidy_branch} kept)",
        )

    merged = _merge_ff_only(notebook, tip_sha)
    if merged.returncode != 0:
        _remove_worktree(notebook, worktree, state_file)
        return _fail(state_file, f"fast-forward refused — {merged.stderr.strip()} (branch {tidy_branch} kept)")

    if not _remove_worktree(notebook, worktree, state_file):
        return _fail(state_file, f"merged, but the worktree at {worktree} could not be removed — needs a person")

    if not _delete_branch_if_at(notebook, tidy_branch, tip_sha):
        return _fail(state_file, f"merged, but {tidy_branch} could not be deleted (it may have moved) — needs a person")

    message = f"journal identical · dropped {pct}% · 1 dream"
    print(message)
    _note(state_file, message)
    return 0


def _reject(
    notebook: Path,
    worktree: Path,
    base: str,
    notebook_branch: str,
    tidy_branch: str,
    tip_sha: str,
    run_date: str,
    causes: list[str],
    state_file: Path,
) -> int:
    cause_line = "; ".join(causes)

    if _mode_at(notebook, base, "DREAMS.md") == "120000":
        # Defense in depth: `--begin` already refuses a symlinked base, so
        # this shouldn't be reachable. If it ever is, don't turn a symlink
        # into a regular file as a side effect of recording a cause.
        if _remove_worktree(notebook, worktree, state_file):
            _delete_branch_if_at(notebook, tidy_branch, tip_sha)
        for cause in causes:
            print(f"violation: {cause}", file=sys.stderr)
        note = cause_line + "; DREAMS.md is a symlink in the base — cause recorded in the state file only, no cause commit"
        print(f"violation: {note}", file=sys.stderr)
        _note(state_file, "violation: " + note)
        return 1

    run_id = tidy_branch.split("/", 1)[1]
    index_file = state_file.parent / f"cause-{run_id}.index"
    cause_sha, err = _cause_commit(notebook, base, run_date, cause_line, index_file)
    index_file.unlink(missing_ok=True)

    if err:
        if _remove_worktree(notebook, worktree, state_file):
            _delete_branch_if_at(notebook, tidy_branch, tip_sha)
        return _fail(state_file, f"violation ({cause_line}); could not build the cause commit: {err}")

    cause_branch = f"{tidy_branch}-cause"
    _git_ok(notebook, "branch", cause_branch, cause_sha)

    current_head = _git_ok(notebook, "rev-parse", "HEAD")
    notebook_at_base = current_head.returncode == 0 and current_head.stdout.strip() == base

    if not notebook_at_base:
        if _remove_worktree(notebook, worktree, state_file):
            _delete_branch_if_at(notebook, tidy_branch, tip_sha)
            _delete_branch_if_at(notebook, cause_branch, cause_sha)
        for cause in causes:
            print(f"violation: {cause}", file=sys.stderr)
        note = cause_line + "; the notebook moved since begin — the cause is recorded in the state file only"
        print(f"violation: {note}", file=sys.stderr)
        _note(state_file, "violation: " + note)
        return 1

    if not _still_on_branch(notebook, notebook_branch):
        _remove_worktree(notebook, worktree, state_file)
        return _fail(
            state_file,
            f"the notebook moved off {notebook_branch} just before merging the cause — nothing merged (branches kept)",
        )

    merged = _merge_ff_only(notebook, cause_sha)
    if merged.returncode != 0:
        _remove_worktree(notebook, worktree, state_file)
        return _fail(state_file, f"the cause merge was refused — {merged.stderr.strip()} (branches kept)")

    if _remove_worktree(notebook, worktree, state_file):
        _delete_branch_if_at(notebook, tidy_branch, tip_sha)
        _delete_branch_if_at(notebook, cause_branch, cause_sha)
    else:
        print("warning: cause merged, but the worktree could not be removed; both branches kept", file=sys.stderr)

    for cause in causes:
        print(f"violation: {cause}", file=sys.stderr)
    print("cause note merged into the notebook", file=sys.stderr)
    _note(state_file, "violation: " + cause_line + "; cause note merged into the notebook")
    return 1


# ---------- check ----------


def check(state_file: Path) -> int:
    with _RunLock(state_file.parent / "tidy-run.lock"):
        return _check_locked(state_file)


def _check_locked(state_file: Path) -> int:
    if not state_file.exists():
        return _fail(state_file, f"no run-start record at {state_file} — unverifiable")

    try:
        state = json.loads(state_file.read_text())
        base = state["base"]
        notebook = Path(state["notebook"])
        notebook_branch = state["notebook_branch"]
        tidy_branch = state["tidy_branch"]
        worktree = Path(state["worktree"])
        run_date = state["date"]
    except (json.JSONDecodeError, KeyError, OSError) as err:
        return _fail(state_file, f"unreadable run-start record at {state_file}: {err} — unverifiable")

    if _git_ok(notebook, "rev-parse", "--git-dir").returncode != 0:
        return _fail_and_cleanup(
            notebook, worktree, tidy_branch, state_file, f"{notebook} is missing or not a git repository — unverifiable"
        )

    cur_branch = _git_ok(notebook, "symbolic-ref", "--short", "HEAD")
    if cur_branch.returncode != 0 or cur_branch.stdout.strip() != notebook_branch:
        return _fail_and_cleanup(
            notebook, worktree, tidy_branch, state_file, f"the notebook is no longer on {notebook_branch} — unverifiable"
        )

    if _git_ok(worktree, "rev-parse", "--git-dir").returncode != 0:
        return _fail_and_cleanup(
            notebook, worktree, tidy_branch, state_file,
            f"the worktree at {worktree} is missing or not a git repository — unverifiable",
        )

    tip = _git_ok(notebook, "rev-parse", tidy_branch)
    if tip.returncode != 0:
        return _fail_and_cleanup(notebook, worktree, tidy_branch, state_file, f"{tidy_branch} not found — unverifiable")
    tip_sha = tip.stdout.strip()

    if _git_ok(notebook, "cat-file", "-e", base).returncode != 0:
        return _fail_and_cleanup(notebook, worktree, tidy_branch, state_file, f"base {base} not found — unverifiable")

    if not clean_tree(worktree):
        return _fail_and_cleanup(
            notebook, worktree, tidy_branch, state_file, f"the worktree at {worktree} is not clean after the run"
        )

    causes = []

    journal_cause = journal_violation(worktree, base, tip_sha)
    if journal_cause:
        causes.append(journal_cause)

    allowed_cause = allowed_paths_violation(worktree, base, tip_sha)
    if allowed_cause:
        causes.append(allowed_cause)

    symlink_cause = symlink_violation_at(worktree, tip_sha)
    if symlink_cause:
        causes.append(symlink_cause)

    before_mem = _show_bytes(worktree, base, "MEMORY.md") or b""
    after_mem = _show_bytes(worktree, tip_sha, "MEMORY.md") or b""
    mem_before, removed, pct, over_limit = memory_removed(before_mem, after_mem)
    if over_limit:
        causes.append(
            f"MEMORY.md removed {pct}% of its baseline lines ({removed}/{mem_before}, > {MEMORY_DROP_LIMIT_PCT}%)"
        )

    before_dreams = _show_bytes(worktree, base, "DREAMS.md") or b""
    after_dreams = _show_bytes(worktree, tip_sha, "DREAMS.md") or b""
    dreams_cause = dreams_violation(before_dreams, after_dreams)
    if dreams_cause:
        causes.append(dreams_cause)

    if causes:
        return _reject(notebook, worktree, base, notebook_branch, tidy_branch, tip_sha, run_date, causes, state_file)

    return _accept(notebook, worktree, notebook_branch, tidy_branch, tip_sha, state_file, pct)


# ---------- fixture ----------


def _commit(repo: Path, message: str, when: date) -> None:
    iso = f"{when.isoformat()}T03:30:00"
    env = {**os.environ, "GIT_AUTHOR_DATE": iso, "GIT_COMMITTER_DATE": iso}
    subprocess.run(["git", "-C", str(repo), "add", "-A"], check=True, capture_output=True)
    subprocess.run(
        ["git", "-C", str(repo), "commit", "-q", "-m", message],
        check=True,
        capture_output=True,
        env=env,
        text=True,
    )


def _memory_content(n: int, churned_prefix: int = 0) -> str:
    lines = []
    for i in range(1, n + 1):
        label = "churned" if i <= churned_prefix else "fixture"
        lines.append(f"- {label} memory line {i}\n")
    return "".join(lines)


def build_fixture(spec_dir: Path, dest: Path, state_file: Path) -> int | None:
    """Build a fixture notebook at `dest` from `spec_dir/spec.json` and
    drive it through begin -> (simulated recipe) -> (check, by the caller).
    Returns an exit code if `--begin` itself was expected to fail (nothing
    left to check), else None. All ages are day offsets from today, so
    results hold regardless of when this runs.
    """
    spec = json.loads((spec_dir / "spec.json").read_text())
    dest.mkdir(parents=True, exist_ok=True)
    today = date.today()

    (dest / "journal").mkdir()
    (dest / "notes").mkdir()

    for offset in spec["journal_days_ago"]:
        day = today - timedelta(days=offset)
        (dest / "journal" / f"{day.isoformat()}.md").write_text(
            f"- 09:00 [stated] fixture journal entry for {day}\n"
        )

    (dest / "SOUL.md").write_text("# Soul\n\nFixture notebook for melody-tidy-guard.py (task 278).\n")
    (dest / "MEMORY.md").write_text(_memory_content(spec["memory_lines_before"]))

    dreams_before = "".join(
        f"## tidy-up {(today - timedelta(days=30 * i + 1)).isoformat()}\n\n- why: earlier fixture pass\n\n"
        for i in range(spec.get("dreams_entries_before", 0))
    )
    if dreams_before:
        (dest / "DREAMS.md").write_text(dreams_before)

    if spec.get("notebook_gitignore"):
        (dest / ".gitignore").write_text("\n".join(spec["notebook_gitignore"]) + "\n")

    if spec.get("symlink_at_baseline"):
        target = dest / spec["symlink_at_baseline"]
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() or target.is_symlink():
            target.unlink()
        target.symlink_to("/etc/passwd")

    subprocess.run(["git", "init", "-q", "-b", "main", str(dest)], check=True)
    _git(dest, "config", "user.email", "fixture@melody.local")
    _git(dest, "config", "user.name", "Melody Fixture")

    baseline_day = today - timedelta(days=spec.get("baseline_days_ago", 1))
    _commit(dest, "memory: baseline", baseline_day)

    rc = begin(dest, state_file)
    if rc != 0:
        if spec.get("expect_begin_failure"):
            return rc
        raise RuntimeError(f"fixture setup: begin() failed (exit {rc}) on a freshly committed baseline")

    state = json.loads(state_file.read_text())
    worktree = Path(state["worktree"])

    if spec.get("notebook_ignored_file"):
        info = spec["notebook_ignored_file"]
        ignored_path = dest / info["path"]
        ignored_path.parent.mkdir(parents=True, exist_ok=True)
        ignored_path.write_text(info["content"])

    # Everything from here through the tidy-up commit happens INSIDE the
    # worktree, simulating what the recipe would do — never in `dest`.
    if spec.get("edit_journal_day_ago") is not None:
        edited_day = today - timedelta(days=spec["edit_journal_day_ago"])
        edited_path = worktree / "journal" / f"{edited_day.isoformat()}.md"
        edited_path.write_text(
            edited_path.read_text() + "- 23:59 [inferred] a line the tidy-up should not have added\n"
        )

    if spec.get("delete_soul"):
        (worktree / "SOUL.md").unlink()

    if spec.get("worktree_adds_notes_file"):
        info = spec["worktree_adds_notes_file"]
        add_path = worktree / info["path"]
        add_path.parent.mkdir(parents=True, exist_ok=True)
        add_path.write_text(info["content"])
        # The notebook's own .gitignore is tracked, so it's checked out into
        # this worktree too — force-add so the tidy-up's commit actually
        # contains the path, simulating a run that added it despite the
        # ignore (however that happened), which is what exercises the
        # notebook-side `--no-overwrite-ignore` guard at merge time.
        _git(worktree, "add", "-f", info["path"])

    churn = spec.get("memory_churn_lines")
    if churn:
        (worktree / "MEMORY.md").write_text(_memory_content(spec["memory_lines_before"], churned_prefix=churn))
    else:
        (worktree / "MEMORY.md").write_text(_memory_content(spec["memory_lines_after"]))

    dreams_path = worktree / "DREAMS.md"
    existing_dreams = ""
    if dreams_path.exists() and not dreams_path.is_symlink():
        existing_dreams = dreams_path.read_text()
    if spec.get("rewrite_earlier_dream"):
        existing_dreams = existing_dreams.replace("earlier fixture pass", "TAMPERED fixture pass")

    if spec.get("symlink_dreams"):
        if dreams_path.exists() or dreams_path.is_symlink():
            dreams_path.unlink()
        dreams_path.symlink_to("/etc/passwd")
    else:
        new_entry = (
            f"## tidy-up {today.isoformat()}\n\n"
            "- added: fixture promoted line\n"
            "- merged: none\n"
            "- retired: none\n"
            "- why: fixture tidy-up pass\n\n"
        )
        combined = existing_dreams + new_entry
        if spec.get("dreams_crlf"):
            dreams_path.write_bytes(combined.replace("\n", "\r\n").encode("utf-8"))
        else:
            dreams_path.write_text(combined)

    _commit(worktree, f"memory: tidy-up {today.isoformat()}", today)

    # These simulate the notebook's *own* checkout changing while the run
    # was in progress — the recipe never sees any of this, only check() does.
    if spec.get("user_commit_during_run"):
        extra_path = dest / "journal" / f"{(today + timedelta(days=1)).isoformat()}.md"
        extra_path.write_text("- 09:00 [stated] a real chat note during the run\n")
        _commit(dest, "memory: chat note", today)

    if spec.get("user_dirty_edit"):
        today_path = dest / "journal" / f"{today.isoformat()}.md"
        original = today_path.read_text() if today_path.exists() else ""
        today_path.write_text(original + "- 22:15 [stated] a live edit while the tidy-up was running\n")

    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--notebook", type=Path, default=Path.home() / "Melody")
    ap.add_argument(
        "--begin", action="store_true", help="lock, branch, and worktree a new run; print the worktree path"
    )
    ap.add_argument(
        "--state-file",
        type=Path,
        help="where the run record lives; default ~/.local/state/melody/tidy-run.json",
    )
    ap.add_argument(
        "--fixture",
        type=Path,
        help="build a fresh fixture notebook from DIR/spec.json and run begin+check against it",
    )
    args = ap.parse_args()

    try:
        if args.fixture:
            with tempfile.TemporaryDirectory(prefix="melody-tidy-guard-fixture-") as tmp:
                tmp_path = Path(tmp)
                notebook = tmp_path / "notebook"
                state_file = args.state_file or (tmp_path / "state" / "tidy-run.json")
                outcome = build_fixture(args.fixture, notebook, state_file)
                if outcome is not None:
                    return outcome
                return check(state_file)

        state_file = args.state_file or (Path.home() / ".local" / "state" / "melody" / "tidy-run.json")
        if args.begin:
            return begin(args.notebook, state_file)
        return check(state_file)
    except (NotGitRepo, RuntimeError, OSError, json.JSONDecodeError, KeyError) as err:
        print(f"error: {err}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
