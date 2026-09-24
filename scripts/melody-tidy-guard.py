#!/usr/bin/env python3
"""Guard for Melody's nightly tidy-up (task 278, `scripts/routines/tidy-up.yaml`).

Runs after the tidy-up recipe, as a scheduler script job (`settings.command`,
task 276), and checks the commit(s) it made since a baseline ref — default:
the commit before the last `memory: tidy-up <date>` commit — against the
three guarantees the PRD makes for that pass
(`docs/2026-09-22-agent-memory-prd-v2.md` step 9, Criteria):

  * every `journal/*.md` is byte-identical (the tidy-up never touches the
    journal; that is `archive`'s job, task 279)
  * `MEMORY.md` lost no more than a quarter of its lines, net
  * exactly one new `## tidy-up ...` entry landed in `DREAMS.md`

A violation is fixed the same way a person would fix it by hand: revert the
tidy-up's own commit(s) with `git revert` (new commits, no history rewrite),
write the cause as a `DREAMS.md` entry, commit that, and exit 1. Nothing here
calls a model.

Fixture: --fixture DIR builds a throwaway git repository in a fresh temp
directory from DIR/spec.json (day offsets from "today", matching the style of
`scripts/melody-routines.py`, task 279) and discards it when the process
exits. Use --fixture while proving this script; the real default,
--notebook ~/Melody, is Hoa's own notebook and is never exercised here.

    python3 scripts/melody-tidy-guard.py --fixture scripts/fixtures/notebook-tidy/ok
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

MEMORY_DROP_LIMIT_PCT = 25
TIDY_UP_SUBJECT_RE = re.compile(r"^memory: tidy-up (\d{4}-\d{2}-\d{2})$")
REVERT_SUBJECT_RE = re.compile(r"^memory: tidy-up reverted ")
DREAM_HEADING_RE = re.compile(r"^## ", re.MULTILINE)


class NotGitRepo(RuntimeError):
    pass


class NoTidyUpCommit(RuntimeError):
    pass


def _git(repo: Path, *args: str, check: bool = True) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args], capture_output=True, text=True
    )
    if check and result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout


def require_git_repo(notebook: Path) -> None:
    probe = subprocess.run(
        ["git", "-C", str(notebook), "rev-parse", "--git-dir"],
        capture_output=True,
        text=True,
    )
    if probe.returncode != 0:
        raise NotGitRepo(f"not a git repository: {notebook}")


def _show(repo: Path, rev: str, path: str) -> str | None:
    """`git show rev:path`, or None if that path doesn't exist at rev."""
    result = subprocess.run(
        ["git", "-C", str(repo), "show", f"{rev}:{path}"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None
    return result.stdout


def default_since(repo: Path) -> str:
    """The commit before the last `memory: tidy-up <date>` commit."""
    log = _git(repo, "log", "--format=%H\t%s")
    for line in log.splitlines():
        sha, _, subject = line.partition("\t")
        if TIDY_UP_SUBJECT_RE.match(subject):
            return f"{sha}^"
    raise NoTidyUpCommit("no `memory: tidy-up <date>` commit found")


def already_reverted(repo: Path, since: str) -> bool:
    log = _git(repo, "log", "--format=%s", f"{since}..HEAD")
    return any(REVERT_SUBJECT_RE.match(subject) for subject in log.splitlines())


def only_tidy_up_commits(repo: Path, since: str) -> bool:
    """since..HEAD must be nothing but the tidy-up's own commit(s).

    A scheduler retry can leave `since` pointing at an older tidy-up (this
    one never committed, or ran below `min_seat_room`) with a day of the
    user's own journal commits landing in between. Reverting that range
    would undo real work the journal's append-only rule protects, so we act
    only when every commit in the range is a `memory: tidy-up <date>`.
    """
    subjects = _git(repo, "log", "--format=%s", f"{since}..HEAD").splitlines()
    return bool(subjects) and all(TIDY_UP_SUBJECT_RE.match(s) for s in subjects)


def journal_violation(repo: Path, since: str) -> str | None:
    changed = _git(
        repo, "diff", "--name-only", since, "HEAD", "--", "journal/"
    ).splitlines()
    if changed:
        return "journal edited: " + ", ".join(sorted(changed))
    return None


def memory_drop(repo: Path, since: str) -> tuple[int, int, int, bool]:
    """Line counts before/after, the rounded drop percent for display, and
    whether the drop exceeds the limit — computed on the exact fraction
    (`dropped * 100 > before * MEMORY_DROP_LIMIT_PCT`) so a display value
    that rounds down to the limit (e.g. 25.4% -> "25%") still fails.
    """
    before_text = _show(repo, since, "MEMORY.md") or ""
    after_text = _show(repo, "HEAD", "MEMORY.md") or ""
    before = len(before_text.splitlines())
    after = len(after_text.splitlines())
    dropped = max(0, before - after)
    pct = round(dropped * 100 / before) if before else 0
    over_limit = before > 0 and dropped * 100 > before * MEMORY_DROP_LIMIT_PCT
    return before, after, pct, over_limit


def dreams_new_entries(repo: Path, since: str) -> int:
    before_text = _show(repo, since, "DREAMS.md") or ""
    after_text = _show(repo, "HEAD", "DREAMS.md") or ""
    before = len(DREAM_HEADING_RE.findall(before_text))
    after = len(DREAM_HEADING_RE.findall(after_text))
    return after - before


def revert_and_record(repo: Path, since: str, causes: list[str]) -> str:
    _git(repo, "revert", "--no-edit", f"{since}..HEAD")
    today = date.today().isoformat()
    cause_line = "; ".join(causes)
    dreams_path = repo / "DREAMS.md"
    existing = dreams_path.read_text() if dreams_path.exists() else ""
    if existing and not existing.endswith("\n"):
        existing += "\n"
    entry = f"## tidy-up {today} reverted\n\n- why: {cause_line}\n"
    dreams_path.write_text(existing + ("\n" if existing else "") + entry)
    _git(repo, "add", "DREAMS.md")
    _git(repo, "commit", "-q", "-m", f"memory: tidy-up reverted {today} — {cause_line}")
    revert_log = _git(repo, "log", "--oneline", "-3")
    return revert_log


def run(notebook: Path, since_arg: str | None) -> int:
    require_git_repo(notebook)
    try:
        since = since_arg or default_since(notebook)
    except NoTidyUpCommit as err:
        print(f"{err}: nothing to guard", file=sys.stderr)
        return 0

    if already_reverted(notebook, since):
        print("already reverted", file=sys.stderr)
        return 0

    if not only_tidy_up_commits(notebook, since):
        print(f"since {since}: commits are not all tidy-up — not acting", file=sys.stderr)
        return 0

    causes = []
    journal_cause = journal_violation(notebook, since)
    if journal_cause:
        causes.append(journal_cause)

    before, after, pct, over_limit = memory_drop(notebook, since)
    if over_limit:
        causes.append(f"MEMORY.md dropped {pct}% ({before} -> {after} lines, > {MEMORY_DROP_LIMIT_PCT}%)")

    new_dreams = dreams_new_entries(notebook, since)
    if new_dreams != 1:
        causes.append(f"{new_dreams} new DREAMS.md entries (expected 1)")

    if causes:
        for cause in causes:
            print(f"violation: {cause}", file=sys.stderr)
        revert_log = revert_and_record(notebook, since, causes)
        print(revert_log, file=sys.stderr)
        return 1

    print(f"journal identical · dropped {pct}% · {new_dreams} dream")
    return 0


# ---------- fixture ----------


def _commit(repo: Path, message: str, when: date) -> None:
    iso = f"{when.isoformat()}T03:30:00"
    env = {**os.environ, "GIT_AUTHOR_DATE": iso, "GIT_COMMITTER_DATE": iso}
    subprocess.run(
        ["git", "-C", str(repo), "add", "-A"], check=True, capture_output=True
    )
    subprocess.run(
        ["git", "-C", str(repo), "commit", "-q", "-m", message],
        check=True,
        capture_output=True,
        env=env,
        text=True,
    )


def build_fixture(spec_dir: Path, dest: Path) -> None:
    """Build a fixture git repository at `dest` from `spec_dir/spec.json`.

    Two commits: a baseline (the state before the tidy-up ran) and a
    `memory: tidy-up <date>` commit (the state the guard checks). All ages
    are day offsets from today, computed here, so results hold regardless of
    when this runs.
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

    (dest / "MEMORY.md").write_text(
        "".join(f"- fixture memory line {i}\n" for i in range(1, spec["memory_lines_before"] + 1))
    )

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

    if spec.get("edit_journal_day_ago") is not None:
        edited_day = today - timedelta(days=spec["edit_journal_day_ago"])
        edited_path = dest / "journal" / f"{edited_day.isoformat()}.md"
        edited_path.write_text(edited_path.read_text() + "- 23:59 [inferred] a line the tidy-up should not have added\n")

    (dest / "MEMORY.md").write_text(
        "".join(f"- fixture memory line {i}\n" for i in range(1, spec["memory_lines_after"] + 1))
    )

    dreams_added = "".join(
        f"## tidy-up {today.isoformat()}\n\n"
        "- added: fixture promoted line\n"
        "- merged: none\n"
        "- retired: none\n"
        "- why: fixture tidy-up pass\n\n"
        for _ in range(spec.get("dreams_entries_added", 1))
    )
    existing_dreams = (dest / "DREAMS.md").read_text() if (dest / "DREAMS.md").exists() else ""
    (dest / "DREAMS.md").write_text(existing_dreams + dreams_added)

    _commit(dest, f"memory: tidy-up {today.isoformat()}", today)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--notebook", type=Path, default=Path.home() / "Melody")
    ap.add_argument(
        "--since",
        help="baseline ref; default is the commit before the last `memory: tidy-up` commit",
    )
    ap.add_argument(
        "--fixture",
        type=Path,
        help="build a fresh fixture repo from DIR/spec.json and use it instead of --notebook",
    )
    args = ap.parse_args()

    try:
        if args.fixture:
            with tempfile.TemporaryDirectory(prefix="melody-tidy-guard-fixture-") as tmp:
                notebook = Path(tmp) / "notebook"
                build_fixture(args.fixture, notebook)
                return run(notebook, args.since)
        return run(args.notebook, args.since)
    except (NotGitRepo, RuntimeError, OSError, json.JSONDecodeError, KeyError) as err:
        print(f"error: {err}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
