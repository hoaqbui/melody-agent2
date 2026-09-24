#!/usr/bin/env python3
"""Guard for Melody's nightly tidy-up (task 278, `scripts/routines/tidy-up.yaml`).

Run-scoped design: the scheduled job is `guard --begin` → the tidy-up recipe
→ `guard` (the check, the default mode). `--begin` records the run's start
point outside the notebook, so the check never has to guess a baseline from
commit subjects, and never re-resolves HEAD once it has pinned the run's
commit list.

`--begin` (real usage: `--notebook ~/Melody`, or `--fixture DIR` for the
fixture harness):
  - refuses (exit 2) unless the tree is clean, untracked files included
  - refuses (exit 2) if there is no commit yet (a root-commit baseline can't
    be recorded — reject explicitly rather than fake one)
  - writes `{"start_sha": <HEAD>}` to the state file (default
    `~/.local/state/melody/tidy-run.json`; a fixture uses a temp path)

The check reads that state file and validates the exact range
`start_sha..HEAD`, HEAD pinned once at the top of the run and never
re-resolved:
  - the range must be non-empty, contain no merge commit, and every commit's
    subject must be `memory: tidy-up <date>` — otherwise the run is
    unverifiable, not a pass: exit 2, log the reason to stderr and the state
    file, revert nothing
  - every `journal/*.md` must be untouched in the range (diff, not content
    comparison, so a rename or delete is caught too)
  - the tree must be clean after the run (untracked included) — a leftover
    file is a violation
  - `MEMORY.md` must not have lost more than a quarter of its *baseline*
    lines, counted as diff deletions (`difflib`) so replacing four lines out
    of five counts as removing four, not as "same length, no drop"
  - `DREAMS.md`'s baseline content must be an exact prefix of the new
    content (nothing already there may change), and the appended text must
    be exactly one `## tidy-up <date>` entry

A violation never discards a dirty tree to make room for the revert: it
might be the user's, not the tidy-up's (a chat writing a journal line, or an
edit made through Team Context, while the run was in progress). If the tree
is dirty, it's preserved first with `git stash push -u`, named in both the
`DREAMS.md` cause entry and the state file so it can be recovered. Only then
does it revert the run's pinned commits with `git revert --no-commit`
(newest first, so the sequence applies cleanly), append the cause as one
`DREAMS.md` entry read from git history (never the working copy, which the
stash has already cleared anyway), and stage and commit exactly the touched
paths — never a blanket `git add -A`. If anything in that sequence fails or
leaves an unaccounted-for change, it's `git revert --abort` only — never a
destructive reset or clean — and if the abort itself doesn't return the tree
to the pinned head, it's left exactly as it is. Either way that's also
unverifiable: exit 2, not 1. A clean pass is exit 0, a detected-and-reverted
violation is exit 1. Nothing here calls a model.

Fixture: --fixture DIR builds a throwaway git repository in a fresh temp
directory from DIR/spec.json (day offsets from "today", matching the style
of `scripts/melody-routines.py`, task 279), running the same begin/tidy-up/
check lifecycle as production against it, then discards it on exit. Use
--fixture while proving this script; the real default, --notebook ~/Melody,
is Hoa's own notebook and is never exercised here.

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
TIDY_UP_SUBJECT_RE = re.compile(r"^memory: tidy-up (\d{4}-\d{2}-\d{2})$")
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


def require_git_repo(notebook: Path) -> None:
    if _git_ok(notebook, "rev-parse", "--git-dir").returncode != 0:
        raise NotGitRepo(f"not a git repository: {notebook}")


def _show(repo: Path, rev: str, path: str) -> str | None:
    """`git show rev:path`, or None if that path doesn't exist at rev."""
    result = _git_ok(repo, "show", f"{rev}:{path}")
    return result.stdout if result.returncode == 0 else None


def clean_tree(repo: Path) -> bool:
    return _git(repo, "status", "--porcelain", "--untracked-files=all").strip() == ""


def _note(state_file: Path, message: str) -> None:
    """A DREAMS-free record of the last outcome, kept outside the notebook."""
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


def begin(notebook: Path, state_file: Path) -> int:
    require_git_repo(notebook)
    if not clean_tree(notebook):
        return _fail(state_file, f"refusing to begin: {notebook} is not clean")

    head = _git_ok(notebook, "rev-parse", "HEAD")
    if head.returncode != 0:
        return _fail(
            state_file,
            f"refusing to begin: {notebook} has no commit yet (root-commit baseline)",
        )

    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(json.dumps({"start_sha": head.stdout.strip(), "notebook": str(notebook)}))
    return 0


# ---------- check ----------


def _is_merge_commit(repo: Path, sha: str) -> bool:
    parents = _git(repo, "rev-list", "--parents", "-n", "1", sha).split()
    return len(parents) > 2  # sha itself + more than one parent


def _validate_commit_list(repo: Path, commit_list: list[str]) -> list[str]:
    problems = []
    for sha in commit_list:
        if _is_merge_commit(repo, sha):
            problems.append(f"{sha[:7]} is a merge commit")
            continue
        subject = _git(repo, "log", "-1", "--format=%s", sha).strip()
        if not TIDY_UP_SUBJECT_RE.match(subject):
            problems.append(f"{sha[:7]} is not a tidy-up commit ({subject!r})")
    return problems


def journal_violation(repo: Path, start: str, head: str) -> str | None:
    changed = _git(repo, "diff", "--name-only", start, head, "--", "journal/").splitlines()
    if changed:
        return "journal edited: " + ", ".join(sorted(changed))
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


def _abort_revert(repo: Path, pinned_head: str) -> str | None:
    """`git revert --abort` only — never a destructive reset. A dirty tree we
    stashed before reverting might be the user's, not the tidy-up's (a chat
    writing a journal line, or an edit made through Team Context, while the
    run was in progress), so a failure here must never fall back to
    `reset --hard` or `git clean`. Returns a description of the mismatch if
    the tree isn't back at the pinned head afterwards, or None if it is.
    """
    _git_ok(repo, "revert", "--abort")
    restored = _git_ok(repo, "rev-parse", "HEAD")
    if restored.returncode != 0 or restored.stdout.strip() != pinned_head or not clean_tree(repo):
        return "`git revert --abort` did not return the tree to the pinned head — left as is"
    return None


def _stash_dirt(repo: Path, pinned_head: str) -> tuple[str | None, str | None]:
    """Preserve a dirty tree before we touch history, rather than discarding
    it: it might not be the tidy-up's at all. Returns (stash sha, None) if
    something was stashed, (None, None) if the tree was already clean, or
    (None, error) if the stash itself failed.
    """
    if clean_tree(repo):
        return None, None
    today = date.today().isoformat()
    stashed = _git_ok(
        repo, "stash", "push", "-u", "-m", f"tidy-guard {today} {pinned_head[:7]}"
    )
    if stashed.returncode != 0:
        return None, stashed.stderr.strip() or "git stash push failed"
    sha = _git_ok(repo, "rev-parse", "stash@{0}")
    if sha.returncode != 0:
        return None, "stashed the dirty tree but could not resolve the stash's sha"
    return sha.stdout.strip(), None


def revert_and_record(
    repo: Path, start: str, pinned_head: str, commits_newest_first: list[str], causes: list[str]
) -> tuple[str | None, str | None, str | None]:
    """Returns (log, failure, stash_sha). `causes` is extended in place with
    a note naming the stash, so callers that report `causes` (stderr, the
    state file) mention it too.
    """
    stash_sha, stash_err = _stash_dirt(repo, pinned_head)
    if stash_err:
        return None, f"could not preserve the dirty tree before reverting: {stash_err}", None

    reverted = _git_ok(repo, "revert", "--no-commit", *commits_newest_first)
    if reverted.returncode != 0:
        abort_note = _abort_revert(repo, pinned_head)
        reason = f"git revert failed: {reverted.stderr.strip()}"
        if abort_note:
            reason += f"; {abort_note}"
        return None, reason, stash_sha

    today = date.today().isoformat()
    if stash_sha:
        causes.append(
            f"a dirty tree was stashed before reverting: {stash_sha} "
            f"(restore with `git stash apply {stash_sha}`)"
        )
    cause_line = "; ".join(causes)
    # Read the baseline from git history, never the working copy: the tree
    # was dirty (now safely stashed above), so anything still on disk before
    # this point could have been an uncommitted edit sitting in DREAMS.md.
    baseline_dreams = _show(repo, start, "DREAMS.md") or ""
    if baseline_dreams and not baseline_dreams.endswith("\n"):
        baseline_dreams += "\n"
    (repo / "DREAMS.md").write_text(
        baseline_dreams + f"## tidy-up {today} reverted\n\n- why: {cause_line}\n"
    )

    # Only the paths the tidy-up's commits touched, plus our own DREAMS.md
    # write, go into this commit — never `-A`, which would also sweep in
    # whatever else was dirty (already stashed, not discarded, above).
    touched = set(_git(repo, "diff", "--name-only", start, pinned_head).split())
    touched.add("DREAMS.md")

    added = _git_ok(repo, "add", "--", *sorted(touched))
    if added.returncode != 0:
        abort_note = _abort_revert(repo, pinned_head)
        reason = f"git add failed: {added.stderr.strip()}"
        if abort_note:
            reason += f"; {abort_note}"
        return None, reason, stash_sha

    stray = [
        line
        for line in _git(repo, "status", "--porcelain", "--untracked-files=all").splitlines()
        if line[3:] not in touched
    ]
    if stray:
        abort_note = _abort_revert(repo, pinned_head)
        reason = "unaccounted-for change(s) after revert: " + ", ".join(stray)
        if abort_note:
            reason += f"; {abort_note}"
        return None, reason, stash_sha

    committed = _git_ok(
        repo, "commit", "-q", "-m", f"memory: tidy-up reverted {today} — {cause_line}"
    )
    if committed.returncode != 0:
        abort_note = _abort_revert(repo, pinned_head)
        reason = f"git commit failed: {committed.stderr.strip()}"
        if abort_note:
            reason += f"; {abort_note}"
        return None, reason, stash_sha

    return _git(repo, "log", "--oneline", "-3"), None, stash_sha


def check(notebook: Path, state_file: Path) -> int:
    require_git_repo(notebook)

    if not state_file.exists():
        return _fail(state_file, f"no run-start record at {state_file} — unverifiable")

    try:
        state = json.loads(state_file.read_text())
        start = state["start_sha"]
    except (json.JSONDecodeError, KeyError, OSError) as err:
        return _fail(state_file, f"unreadable run-start record at {state_file}: {err} — unverifiable")

    if _git_ok(notebook, "cat-file", "-e", start).returncode != 0:
        return _fail(state_file, f"run-start sha {start} not found in {notebook} — unverifiable")

    head = _git_ok(notebook, "rev-parse", "HEAD")
    if head.returncode != 0:
        return _fail(state_file, f"{notebook} has no commit — unverifiable")
    pinned_head = head.stdout.strip()

    commit_list = _git(notebook, "rev-list", "--reverse", f"{start}..{pinned_head}").split()
    if not commit_list:
        return _fail(state_file, f"no commit since {start} — unverifiable (expected a tidy-up commit)")

    problems = _validate_commit_list(notebook, commit_list)
    if problems:
        return _fail(state_file, "unrelated commit(s) in range, not acting: " + "; ".join(problems))

    causes = []

    journal_cause = journal_violation(notebook, start, pinned_head)
    if journal_cause:
        causes.append(journal_cause)

    if not clean_tree(notebook):
        dirty = _git(notebook, "status", "--porcelain", "--untracked-files=all").splitlines()
        paths = sorted(line[3:] for line in dirty if line)
        causes.append("working tree dirty after run: " + ", ".join(paths))

    before_mem = _show(notebook, start, "MEMORY.md") or ""
    after_mem = _show(notebook, pinned_head, "MEMORY.md") or ""
    mem_before, removed, pct, over_limit = memory_removed(before_mem, after_mem)
    if over_limit:
        causes.append(
            f"MEMORY.md removed {pct}% of its baseline lines ({removed}/{mem_before}, > {MEMORY_DROP_LIMIT_PCT}%)"
        )

    before_dreams = _show(notebook, start, "DREAMS.md") or ""
    after_dreams = _show(notebook, pinned_head, "DREAMS.md") or ""
    dreams_cause = dreams_violation(before_dreams, after_dreams)
    if dreams_cause:
        causes.append(dreams_cause)

    if causes:
        newest_first = list(reversed(commit_list))
        log, failure, stash_sha = revert_and_record(notebook, start, pinned_head, newest_first, causes)
        if failure:
            if stash_sha:
                failure += f" (the pre-existing dirty tree is safe in stash {stash_sha})"
            return _fail(state_file, f"revert failed: {failure}")
        for cause in causes:
            print(f"violation: {cause}", file=sys.stderr)
        print(log, file=sys.stderr)
        _note(state_file, "reverted: " + "; ".join(causes))
        return 1

    message = f"journal identical · dropped {pct}% · 1 dream"
    print(message)
    _note(state_file, message)
    return 0


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
    """Build a fixture git repository at `dest` from `spec_dir/spec.json` and
    drive it through the same begin -> tidy-up -> (check, by the caller)
    lifecycle production uses. All ages are day offsets from today, computed
    here, so results hold regardless of when this runs.
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
        raise RuntimeError(f"fixture setup: begin() refused (exit {rc}) on a freshly committed baseline")

    if spec.get("edit_journal_day_ago") is not None:
        edited_day = today - timedelta(days=spec["edit_journal_day_ago"])
        edited_path = dest / "journal" / f"{edited_day.isoformat()}.md"
        edited_path.write_text(
            edited_path.read_text() + "- 23:59 [inferred] a line the tidy-up should not have added\n"
        )

    churn = spec.get("memory_churn_lines")
    if churn:
        (dest / "MEMORY.md").write_text(_memory_content(spec["memory_lines_before"], churned_prefix=churn))
    else:
        (dest / "MEMORY.md").write_text(_memory_content(spec["memory_lines_after"]))

    existing_dreams = (dest / "DREAMS.md").read_text() if (dest / "DREAMS.md").exists() else ""
    if spec.get("rewrite_earlier_dream"):
        existing_dreams = existing_dreams.replace("earlier fixture pass", "TAMPERED fixture pass")
    new_entry = (
        f"## tidy-up {today.isoformat()}\n\n"
        "- added: fixture promoted line\n"
        "- merged: none\n"
        "- retired: none\n"
        "- why: fixture tidy-up pass\n\n"
    )
    (dest / "DREAMS.md").write_text(existing_dreams + new_entry)

    _commit(dest, f"memory: tidy-up {today.isoformat()}", today)

    if spec.get("leave_stray_file"):
        (dest / "scratch.local").write_text("an uncommitted leftover the tidy-up forgot\n")

    if spec.get("dirty_user_journal_edit"):
        # A live edit to a *tracked* journal file, uncommitted — as if a chat
        # were writing a journal line while the tidy-up ran. This must be
        # stashed, not discarded, by whatever reverts the tidy-up.
        today_path = dest / "journal" / f"{today.isoformat()}.md"
        original = today_path.read_text() if today_path.exists() else ""
        today_path.write_text(original + "- 22:15 [stated] a live edit while the tidy-up was running\n")

    if spec.get("extra_commit_after"):
        extra_path = dest / "journal" / f"{(today + timedelta(days=1)).isoformat()}.md"
        extra_path.write_text("- 09:00 [stated] a real chat note after the tidy-up\n")
        _commit(dest, "memory: chat note", today)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--notebook", type=Path, default=Path.home() / "Melody")
    ap.add_argument("--begin", action="store_true", help="record this run's start point and exit")
    ap.add_argument(
        "--state-file",
        type=Path,
        help="where the run-start record lives; default ~/.local/state/melody/tidy-run.json",
    )
    ap.add_argument(
        "--fixture",
        type=Path,
        help="build a fresh fixture repo from DIR/spec.json and run begin+check against it",
    )
    args = ap.parse_args()

    try:
        if args.fixture:
            with tempfile.TemporaryDirectory(prefix="melody-tidy-guard-fixture-") as tmp:
                tmp_path = Path(tmp)
                notebook = tmp_path / "notebook"
                state_file = args.state_file or (tmp_path / "state" / "tidy-run.json")
                build_fixture(args.fixture, notebook, state_file)
                return check(notebook, state_file)

        state_file = args.state_file or (Path.home() / ".local" / "state" / "melody" / "tidy-run.json")
        if args.begin:
            return begin(args.notebook, state_file)
        return check(args.notebook, state_file)
    except (NotGitRepo, RuntimeError, OSError, json.JSONDecodeError, KeyError) as err:
        print(f"error: {err}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
