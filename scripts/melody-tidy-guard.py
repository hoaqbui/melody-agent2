#!/usr/bin/env python3
"""Guard for Melody's nightly tidy-up (task 278, `scripts/routines/tidy-up.yaml`).

Redesigned 2026-09-23 after two review FAILs of a revert-in-place guard: the
prior designs read and wrote the user's own checkout while validating and
undoing a run, which meant commit ownership, races with the user's own
edits, partial recovery, and the user's checkout being written by anything
other than a single atomic operation. This version never runs the tidy-up
recipe against the user's checkout at all, and never reverts, stashes,
resets, or cleans anything, anywhere:

  guard --begin      -> creates an isolated worktree + branch, prints the path
  the tidy-up recipe -> runs entirely inside that worktree
  guard              -> validates the worktree's branch, then either
                         `git merge --ff-only`s it into the notebook, or
                         doesn't merge it at all

`--begin` (real usage: `--notebook ~/Melody`; a fixture builds its own):
  - refuses (exit 2) if a `tidy-up/*` branch or the fixed worktree directory
    already exists — that's the active-run lock; a stuck run needs a person,
    not an automatic cleanup, so nothing here clears one
  - refuses (exit 2) if there is no commit yet (a root-commit baseline can't
    be recorded) or HEAD is detached (nothing to fast-forward later)
  - records `{base, notebook, notebook_branch, tidy_branch, worktree, date}`
    to the state file (default `~/.local/state/melody/tidy-run.json`; a
    fixture uses a temp path), creates the worktree with
    `git worktree add <path> -b tidy-up/<date> <base>`, and prints `<path>`
    — the tidy-up recipe's `working_dir` parameter. The user's checkout is
    never touched by this or by the run that follows.

The check reads that state, confirms the notebook is still on the recorded
branch, and diffs `base..tidy-up/<date>` *inside the worktree* — never
against the notebook's own (possibly since-moved) HEAD:
  - every `journal/*.md` must be untouched (diff, so a rename or delete is
    caught too)
  - only `MEMORY.md`, `DREAMS.md`, and `notes/**` may change at all —
    anything else added, modified, or deleted is a violation
  - neither `MEMORY.md` nor `DREAMS.md` may be a symlink, in the baseline or
    the tip
  - `MEMORY.md` must not have lost more than a quarter of its baseline
    lines, counted as diff deletions (`difflib`), so replacing lines counts
    as removing them
  - `DREAMS.md`'s baseline content must be an exact prefix of the new
    content, with exactly one `## tidy-up <date>` entry appended
  - the worktree must be clean at the end

On a clean pass: `git merge --ff-only tidy-up/<date>` into the notebook,
then the worktree and branch are removed — exit 0. If the notebook moved
since `--begin` (the user committed something directly, outside this run),
the fast-forward is refused: the worktree is removed but the branch is kept,
the notebook is untouched, and that's exit 2, not 0 or 1.

On a violation: a single commit — base plus one `## tidy-up <date> — not
merged: <cause>` appended to DREAMS.md — is built with plumbing
(`read-tree`/`hash-object`/`write-tree`/`commit-tree` against a scratch
index), never by writing into any working tree. If the notebook is still at
`base`, that commit is fast-forwarded in the same way; if the notebook has
moved, the cause is recorded in the state file only, never written into the
notebook. Either way the worktree and both branches (the tidy-up branch and
the disposable cause branch) are removed — exit 1. Nothing here calls a
model.

Fixture: --fixture DIR builds a throwaway notebook (a fresh temp git repo)
from DIR/spec.json (day offsets from "today", matching the style of
`scripts/melody-routines.py`, task 279), drives it through the same
begin -> (simulated recipe) -> check lifecycle production uses, and discards
it on exit. Use --fixture while proving this script; the real default,
--notebook ~/Melody, is Hoa's own notebook and is never exercised here.

    python3 scripts/melody-tidy-guard.py --fixture scripts/fixtures/notebook-tidy/ok
"""

import argparse
import difflib
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path

MEMORY_DROP_LIMIT_PCT = 25
ALLOWED_PATH_RE = re.compile(r"^(MEMORY\.md|DREAMS\.md|notes/.*)$")
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


def _show(repo: Path, rev: str, path: str) -> str | None:
    """`git show rev:path`, or None if that path doesn't exist at rev."""
    result = _git_ok(repo, "show", f"{rev}:{path}")
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


# ---------- begin ----------


def _active_run_lock(notebook: Path, worktree: Path) -> str | None:
    branches = _git(notebook, "for-each-ref", "--format=%(refname:short)", "refs/heads/tidy-up/").split()
    if branches:
        return f"branch {branches[0]} already exists"
    listing = _git(notebook, "worktree", "list", "--porcelain")
    if "branch refs/heads/tidy-up/" in listing:
        return "a tidy-up worktree is already registered"
    if worktree.exists():
        return f"a stale worktree directory exists at {worktree}"
    return None


def begin(notebook: Path, state_file: Path) -> int:
    require_git_repo(notebook)

    worktree = state_file.parent / "tidy-worktree"
    lock = _active_run_lock(notebook, worktree)
    if lock:
        return _fail(state_file, f"refusing to begin: {lock} (active-run lock)")

    head = _git_ok(notebook, "rev-parse", "HEAD")
    if head.returncode != 0:
        return _fail(
            state_file, f"refusing to begin: {notebook} has no commit yet (root-commit baseline)"
        )
    base = head.stdout.strip()

    branch = _git_ok(notebook, "symbolic-ref", "--short", "HEAD")
    if branch.returncode != 0:
        return _fail(state_file, f"refusing to begin: {notebook} HEAD is detached")
    notebook_branch = branch.stdout.strip()

    today = date.today().isoformat()
    tidy_branch = f"tidy-up/{today}"

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


def symlink_violation(repo: Path, base: str, tip: str) -> str | None:
    for path in ("MEMORY.md", "DREAMS.md"):
        for rev in (base, tip):
            if _mode_at(repo, rev, path) == "120000":
                return f"{path} is a symlink at {rev[:7]}"
    return None


def memory_removed(before_text: str, after_text: str) -> tuple[int, int, int, bool]:
    """Baseline line count, lines removed (diff deletions, not net count),
    the rounded percent for display, and whether that exceeds the limit.

    Using `difflib` rather than `len(before) - len(after)` means replacing
    lines counts as removing them: a MEMORY.md held at the same length by
    swapping most of its content for something else is still a drop.
    """
    before_lines = before_text.splitlines()
    after_lines = after_text.splitlines()
    removed = sum(1 for line in difflib.ndiff(before_lines, after_lines) if line.startswith("- "))
    before_count = len(before_lines)
    pct = round(removed * 100 / before_count) if before_count else 0
    over_limit = before_count > 0 and removed * 100 > before_count * MEMORY_DROP_LIMIT_PCT
    return before_count, removed, pct, over_limit


def dreams_violation(before_text: str, after_text: str) -> str | None:
    if not after_text.startswith(before_text):
        return "DREAMS.md rewritten: an earlier entry changed"
    appended = after_text[len(before_text):]
    headings = DREAM_HEADING_RE.findall(appended)
    if len(headings) != 1:
        return f"{len(headings)} new DREAMS.md entries appended (expected 1)"
    if not DREAM_ENTRY_DATE_RE.match(appended.lstrip("\n")):
        return "appended DREAMS.md entry isn't `## tidy-up <date>`"
    return None


# ---------- accept / reject ----------


def _remove_worktree(notebook: Path, worktree: Path) -> None:
    _git_ok(notebook, "worktree", "remove", "--force", str(worktree))
    _git_ok(notebook, "worktree", "prune")
    listing = _git_ok(notebook, "worktree", "list", "--porcelain")
    if listing.returncode == 0 and "branch refs/heads/tidy-up/" in listing.stdout:
        print(
            f"warning: {worktree} could not be fully removed — it's still registered; "
            "the active-run lock will hold until a person clears it",
            file=sys.stderr,
        )


def _cause_commit(notebook: Path, base: str, run_date: str, cause_line: str, index_file: Path) -> tuple[str | None, str | None]:
    """Build one commit — `base` plus a single DREAMS.md append — entirely
    with plumbing against a scratch index. No working tree, the notebook's
    own or the worktree's, is ever touched to build this commit; the only
    write to the notebook's checkout anywhere in this file is the
    `git merge --ff-only` the caller makes afterward.
    """
    baseline_dreams = _show(notebook, base, "DREAMS.md") or ""
    if baseline_dreams and not baseline_dreams.endswith("\n"):
        baseline_dreams += "\n"
    new_dreams = baseline_dreams + f"## tidy-up {run_date} — not merged: {cause_line}\n"

    env = {**os.environ, "GIT_INDEX_FILE": str(index_file)}
    index_file.unlink(missing_ok=True)

    read = subprocess.run(["git", "-C", str(notebook), "read-tree", base], capture_output=True, text=True, env=env)
    if read.returncode != 0:
        return None, f"read-tree failed: {read.stderr.strip()}"

    blob = subprocess.run(
        ["git", "-C", str(notebook), "hash-object", "-w", "--stdin"],
        input=new_dreams,
        capture_output=True,
        text=True,
        env=env,
    )
    if blob.returncode != 0:
        return None, f"hash-object failed: {blob.stderr.strip()}"
    blob_sha = blob.stdout.strip()

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


def _accept(notebook: Path, worktree: Path, tidy_branch: str, state_file: Path, pct: int) -> int:
    merged = _git_ok(notebook, "merge", "--ff-only", tidy_branch)
    if merged.returncode != 0:
        _remove_worktree(notebook, worktree)
        return _fail(
            state_file,
            f"fast-forward refused — the notebook changed since begin: "
            f"{merged.stderr.strip()} (branch {tidy_branch} kept)",
        )

    _remove_worktree(notebook, worktree)
    deleted = _git_ok(notebook, "branch", "-d", tidy_branch)
    if deleted.returncode != 0:
        print(f"warning: could not delete {tidy_branch} after merging it: {deleted.stderr.strip()}", file=sys.stderr)

    message = f"journal identical · dropped {pct}% · 1 dream"
    print(message)
    _note(state_file, message)
    return 0


def _reject(
    notebook: Path, worktree: Path, base: str, tidy_branch: str, run_date: str, causes: list[str], state_file: Path
) -> int:
    cause_line = "; ".join(causes)
    index_file = state_file.parent / "cause.index"
    cause_sha, err = _cause_commit(notebook, base, run_date, cause_line, index_file)
    index_file.unlink(missing_ok=True)

    if err:
        _remove_worktree(notebook, worktree)
        _git_ok(notebook, "branch", "-D", tidy_branch)
        return _fail(state_file, f"violation ({cause_line}); could not build the cause commit: {err}")

    cause_branch = f"{tidy_branch}-cause"
    _git_ok(notebook, "branch", cause_branch, cause_sha)

    current_head = _git_ok(notebook, "rev-parse", "HEAD")
    if current_head.returncode == 0 and current_head.stdout.strip() == base:
        merged = _git_ok(notebook, "merge", "--ff-only", cause_branch)
        merge_note = (
            "cause note merged into the notebook"
            if merged.returncode == 0
            else f"cause note not merged: {merged.stderr.strip()}"
        )
    else:
        merge_note = "the notebook moved since begin; the cause is recorded in the state file only"

    _remove_worktree(notebook, worktree)
    _git_ok(notebook, "branch", "-D", tidy_branch)
    _git_ok(notebook, "branch", "-D", cause_branch)

    for cause in causes:
        print(f"violation: {cause}", file=sys.stderr)
    print(merge_note, file=sys.stderr)
    _note(state_file, "violation: " + cause_line + f"; {merge_note}")
    return 1


# ---------- check ----------


def check(state_file: Path) -> int:
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

    require_git_repo(notebook)
    require_git_repo(worktree)

    cur_branch = _git_ok(notebook, "symbolic-ref", "--short", "HEAD")
    if cur_branch.returncode != 0 or cur_branch.stdout.strip() != notebook_branch:
        return _fail(state_file, f"the notebook is no longer on {notebook_branch} — unverifiable")

    tip = _git_ok(worktree, "rev-parse", tidy_branch)
    if tip.returncode != 0:
        return _fail(state_file, f"{tidy_branch} not found in the worktree — unverifiable")
    tip_sha = tip.stdout.strip()

    if _git_ok(worktree, "cat-file", "-e", base).returncode != 0:
        return _fail(state_file, f"base {base} not found in the worktree — unverifiable")

    if not clean_tree(worktree):
        return _fail(state_file, f"the worktree at {worktree} is not clean after the run")

    causes = []

    journal_cause = journal_violation(worktree, base, tip_sha)
    if journal_cause:
        causes.append(journal_cause)

    allowed_cause = allowed_paths_violation(worktree, base, tip_sha)
    if allowed_cause:
        causes.append(allowed_cause)

    symlink_cause = symlink_violation(worktree, base, tip_sha)
    if symlink_cause:
        causes.append(symlink_cause)

    before_mem = _show(worktree, base, "MEMORY.md") or ""
    after_mem = _show(worktree, tip_sha, "MEMORY.md") or ""
    mem_before, removed, pct, over_limit = memory_removed(before_mem, after_mem)
    if over_limit:
        causes.append(
            f"MEMORY.md removed {pct}% of its baseline lines ({removed}/{mem_before}, > {MEMORY_DROP_LIMIT_PCT}%)"
        )

    before_dreams = _show(worktree, base, "DREAMS.md") or ""
    after_dreams = _show(worktree, tip_sha, "DREAMS.md") or ""
    dreams_cause = dreams_violation(before_dreams, after_dreams)
    if dreams_cause:
        causes.append(dreams_cause)

    if causes:
        return _reject(notebook, worktree, base, tidy_branch, run_date, causes, state_file)

    return _accept(notebook, worktree, tidy_branch, state_file, pct)


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


def build_fixture(spec_dir: Path, dest: Path, state_file: Path) -> None:
    """Build a fixture notebook at `dest` from `spec_dir/spec.json` and drive
    it through the same begin -> (simulated recipe) -> (check, by the
    caller) lifecycle production uses. All ages are day offsets from today,
    computed here, so results hold regardless of when this runs.
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

    subprocess.run(["git", "init", "-q", "-b", "main", str(dest)], check=True)
    _git(dest, "config", "user.email", "fixture@melody.local")
    _git(dest, "config", "user.name", "Melody Fixture")

    baseline_day = today - timedelta(days=spec.get("baseline_days_ago", 1))
    _commit(dest, "memory: baseline", baseline_day)

    rc = begin(dest, state_file)
    if rc != 0:
        raise RuntimeError(f"fixture setup: begin() failed (exit {rc}) on a freshly committed baseline")

    state = json.loads(state_file.read_text())
    worktree = Path(state["worktree"])

    # Everything from here through the tidy-up commit happens INSIDE the
    # worktree, simulating what the recipe would do — never in `dest`
    # (the notebook), which is the point being tested.
    if spec.get("edit_journal_day_ago") is not None:
        edited_day = today - timedelta(days=spec["edit_journal_day_ago"])
        edited_path = worktree / "journal" / f"{edited_day.isoformat()}.md"
        edited_path.write_text(
            edited_path.read_text() + "- 23:59 [inferred] a line the tidy-up should not have added\n"
        )

    if spec.get("delete_soul"):
        (worktree / "SOUL.md").unlink()

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
        dreams_path.write_text(existing_dreams + new_entry)

    _commit(worktree, f"memory: tidy-up {today.isoformat()}", today)

    # These two simulate the notebook's *own* checkout changing while the
    # run was in progress — the recipe never sees this, only `check()` does.
    if spec.get("user_commit_during_run"):
        extra_path = dest / "journal" / f"{(today + timedelta(days=1)).isoformat()}.md"
        extra_path.write_text("- 09:00 [stated] a real chat note during the run\n")
        _commit(dest, "memory: chat note", today)

    if spec.get("user_dirty_edit"):
        today_path = dest / "journal" / f"{today.isoformat()}.md"
        original = today_path.read_text() if today_path.exists() else ""
        today_path.write_text(original + "- 22:15 [stated] a live edit while the tidy-up was running\n")


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
                build_fixture(args.fixture, notebook, state_file)
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
