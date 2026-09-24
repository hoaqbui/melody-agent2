#!/usr/bin/env python3
"""Headless upkeep for Melody's notebook (task 279).

Five routines, all advisory or additive — none of them deletes anything a
person didn't ask for, and none of them calls a model:

  cap-check  warn past 160/200 MEMORY.md lines or 60k boot characters; never cuts
  archive    git mv journal days older than 90 into journal/archive/YYYY-MM/
  sweep      list merged wt/* branches older than 7 days; remove nothing
  backup     git push when a remote is configured, else say so and exit 0
  reminders  write REMINDERS.md from memories/** stale_after, pending proposals,
             and a check-in overdue by the weekly cadence

The only network call in this file is `git push`, and only from `backup` when
a remote exists.

Proposals have no home yet anywhere in the notebook (checked: no `proposals/`
directory, no mention in AGENTS.md or the memories bundle). This script picks
the smallest convention that matches the journal's own filename-dated style
and states it here for review: a pending proposal is a file at
`proposals/YYYY-MM-DD-<name>.md`, dated by when it was raised; once the user
decides it, moving or deleting the file is what clears the reminder — there
is no separate status field.

Fixture: --fixture DIR builds a throwaway git repository in a fresh temp
directory from DIR/spec.json (day offsets from "today", not literal dates,
so the numbers don't drift with the calendar) and discards it when the
process exits. `build_fixture()` is importable for tests that want to point
--notebook at a fixture repo across more than one invocation (e.g. to show
archive is idempotent).

    python3 scripts/melody-routines.py --fixture scripts/fixtures/notebook-routines all
"""

import argparse
import json
import re
import subprocess
import sys
import tempfile
import time
from datetime import date, datetime, timedelta
from pathlib import Path

MEMORY_WARN_LINES = 160
MEMORY_CAP_LINES = 200
BOOT_WARN_CHARS = 60_000
JOURNAL_ARCHIVE_DAYS = 90
BRANCH_SWEEP_DAYS = 7
PROPOSAL_PENDING_DAYS = 2
CHECKIN_DUE_DAYS = 7

JOURNAL_NAME_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})\.md$")
PROPOSAL_NAME_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})-(.+)\.md$")
STALE_AFTER_RE = re.compile(r"^stale_after:\s*(\d{4}-\d{2}-\d{2})\s*$", re.MULTILINE)


class NotGitRepo(RuntimeError):
    pass


def _git(repo: Path, *args: str, env: dict | None = None, check: bool = True) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args], capture_output=True, text=True, env=env
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


# ---------- cap-check ----------


def cap_check(notebook: Path) -> str:
    memory = notebook / "MEMORY.md"
    lines = len(memory.read_text().splitlines()) if memory.exists() else 0

    today = date.today()
    boot_files = [
        notebook / "SOUL.md",
        notebook / "USER.md",
        notebook / "MEMORY.md",
        notebook / "memories" / "index.md",
        notebook / "BOOTSTRAP.md",
        notebook / "journal" / f"{today.isoformat()}.md",
        notebook / "journal" / f"{(today - timedelta(days=1)).isoformat()}.md",
    ]
    boot_chars = sum(len(f.read_text()) for f in boot_files if f.exists())

    warn = lines > MEMORY_WARN_LINES or boot_chars > BOOT_WARN_CHARS
    return f"cap {lines}/{MEMORY_CAP_LINES} {'warn' if warn else 'ok'}"


# ---------- archive ----------


def archive(notebook: Path) -> tuple[list[str], str]:
    journal_dir = notebook / "journal"
    if not journal_dir.is_dir():
        return [], "archived 0"

    cutoff = date.today() - timedelta(days=JOURNAL_ARCHIVE_DAYS)
    moved: list[str] = []
    for entry in sorted(journal_dir.iterdir()):
        if not entry.is_file():
            continue
        m = JOURNAL_NAME_RE.match(entry.name)
        if not m:
            continue
        day = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        if day >= cutoff:
            continue
        dest_dir = journal_dir / "archive" / f"{day:%Y-%m}"
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / entry.name
        old_rel, new_rel = entry.relative_to(notebook), dest.relative_to(notebook)
        _git(notebook, "mv", str(old_rel), str(new_rel))
        moved.append(f"{old_rel} -> {new_rel}")

    if moved:
        _git(notebook, "commit", "-q", "-m", f"memory: archive {len(moved)} journal day(s)")
    return moved, f"archived {len(moved)}"


# ---------- sweep ----------


def sweep(notebook: Path) -> tuple[list[str], str]:
    out = _git(
        notebook,
        "for-each-ref",
        "--merged",
        "HEAD",
        "--format=%(refname:short) %(committerdate:unix)",
        "refs/heads/wt/",
    )
    cutoff = time.time() - BRANCH_SWEEP_DAYS * 86400
    stale = []
    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        name, ts = line.rsplit(" ", 1)
        if int(ts) < cutoff:
            stale.append(name)
    return stale, f"sweep {len(stale)} listed"


# ---------- backup ----------


def backup(notebook: Path) -> str:
    remotes = _git(notebook, "remote").split()
    if not remotes:
        return "backup: no remote set"
    _git(notebook, "push")
    return "backup: pushed"


# ---------- reminders ----------


def _last_checkin(notebook: Path) -> date | None:
    log = _git(notebook, "log", "--format=%ct\t%s")
    for line in log.splitlines():
        ts, _, subject = line.partition("\t")
        if subject.startswith("memory: check-in"):
            return datetime.fromtimestamp(int(ts)).date()
    return None


def reminders(notebook: Path) -> tuple[list[str], str]:
    today = date.today()
    lines: list[str] = []

    memories_dir = notebook / "memories"
    if memories_dir.is_dir():
        for page in sorted(memories_dir.rglob("*.md")):
            if page.name in ("index.md", "log.md"):
                continue
            m = STALE_AFTER_RE.search(page.read_text())
            if not m:
                continue
            stale_after = date.fromisoformat(m.group(1))
            if stale_after < today:
                lines.append(f"stale: {page.relative_to(memories_dir)} (stale_after {stale_after})")

    proposals_dir = notebook / "proposals"
    if proposals_dir.is_dir():
        for proposal in sorted(proposals_dir.glob("*.md")):
            m = PROPOSAL_NAME_RE.match(proposal.name)
            if not m:
                continue
            created = date.fromisoformat(m.group(1))
            age = (today - created).days
            if age >= PROPOSAL_PENDING_DAYS:
                lines.append(f"proposal pending: {m.group(2)} ({age}d)")

    last_checkin = _last_checkin(notebook)
    if last_checkin is None:
        lines.append("check-in due (none on record)")
    elif (today - last_checkin).days >= CHECKIN_DUE_DAYS:
        lines.append(f"check-in due (last {last_checkin})")

    body = "# Reminders\n\n" + ("".join(f"- {line}\n" for line in lines) if lines else "- nothing due\n")
    reminders_path = notebook / "REMINDERS.md"
    existing = reminders_path.read_text() if reminders_path.exists() else None
    if existing != body:
        reminders_path.write_text(body)
        _git(notebook, "add", "REMINDERS.md")
        if _git(notebook, "status", "--porcelain", "--", "REMINDERS.md").strip():
            _git(notebook, "commit", "-q", "-m", f"memory: reminders {today.isoformat()}")

    return lines, f"reminders {len(lines)}"


# ---------- fixture ----------


def _commit(repo: Path, message: str, when: date) -> None:
    iso = f"{when.isoformat()}T12:00:00"
    import os

    env = {**os.environ, "GIT_AUTHOR_DATE": iso, "GIT_COMMITTER_DATE": iso}
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", message, env=env)


def build_fixture(spec_dir: Path, dest: Path) -> None:
    """Build a fixture git repository at `dest` from `spec_dir/spec.json`.

    All ages in the spec are day offsets from today, computed here, so the
    fixture's results (archived/sweep/reminders counts) hold regardless of
    when this runs.
    """
    spec = json.loads((spec_dir / "spec.json").read_text())
    dest.mkdir(parents=True, exist_ok=True)
    today = date.today()

    (dest / "journal").mkdir()
    (dest / "memories").mkdir()
    (dest / "proposals").mkdir()

    (dest / "SOUL.md").write_text("# Soul\n\nFixture notebook for melody-routines.py (task 279).\n")
    (dest / "USER.md").write_text("# User\n\nFixture user, not a real person.\n")
    (dest / "MEMORY.md").write_text(
        "".join(f"- fixture memory line {i}\n" for i in range(1, spec["memory_lines"] + 1))
    )
    (dest / "memories" / "index.md").write_text('---\nokf_version: "0.2"\ntype: Index\n---\n\n# Memories\n')

    for page in spec["memory_pages"]:
        if "stale_after_days_ago" in page:
            stale_after = today - timedelta(days=page["stale_after_days_ago"])
        else:
            stale_after = today + timedelta(days=page["stale_after_days_from_now"])
        (dest / "memories" / f"{page['name']}.md").write_text(
            "---\n"
            f"generated: {{ by: fixture, at: {today.isoformat()} }}\n"
            "status: draft\n"
            f"stale_after: {stale_after.isoformat()}\n"
            "---\n\n"
            f"# {page['name']}\n"
        )

    for offset in spec["journal_archive_days_ago"] + spec["journal_keep_days_ago"]:
        day = today - timedelta(days=offset)
        (dest / "journal" / f"{day.isoformat()}.md").write_text(f"- {day} fixture journal entry\n")

    for proposal in spec["proposals"]:
        created = today - timedelta(days=proposal["created_days_ago"])
        (dest / "proposals" / f"{created.isoformat()}-{proposal['name']}.md").write_text(
            f"# {proposal['name']}\n\nFixture proposal, pending.\n"
        )

    _git(dest, "init", "-q", "-b", "main")
    _git(dest, "config", "user.email", "fixture@melody.local")
    _git(dest, "config", "user.name", "Melody Fixture")

    checkin_day = today - timedelta(days=spec["last_checkin_days_ago"])
    _commit(dest, f"memory: check-in {checkin_day.isoformat()}", checkin_day)

    branch_id = 0
    for offset in spec["branches_merged_old_days_ago"] + spec["branches_merged_recent_days_ago"]:
        branch_id += 1
        branch = f"wt/t{branch_id}"
        day = today - timedelta(days=offset)
        _git(dest, "checkout", "-q", "-b", branch)
        (dest / f"{branch.replace('/', '-')}.md").write_text(f"work for {branch}\n")
        _commit(dest, f"task {branch_id}: fixture work", day)
        _git(dest, "checkout", "-q", "main")
        _git(dest, "merge", "-q", "--no-ff", "-m", f"Merge branch '{branch}'", branch)

    for offset in spec["branches_unmerged_old_days_ago"]:
        branch_id += 1
        branch = f"wt/t{branch_id}"
        day = today - timedelta(days=offset)
        _git(dest, "checkout", "-q", "-b", branch, "main")
        (dest / f"{branch.replace('/', '-')}.md").write_text(f"unmerged work for {branch}\n")
        _commit(dest, f"task {branch_id}: fixture work (unmerged)", day)
        _git(dest, "checkout", "-q", "main")


# ---------- CLI ----------


def _print_detail(lines: list[str], summary: str) -> None:
    for line in lines:
        print(line)
    print(summary)


def _run(routine: str, notebook: Path) -> int:
    require_git_repo(notebook)

    if routine == "all":
        print(
            " · ".join(
                [
                    cap_check(notebook),
                    archive(notebook)[1],
                    sweep(notebook)[1],
                    backup(notebook),
                    reminders(notebook)[1],
                ]
            )
        )
        return 0

    if routine == "cap-check":
        print(cap_check(notebook))
    elif routine == "archive":
        _print_detail(*archive(notebook))
    elif routine == "sweep":
        _print_detail(*sweep(notebook))
    elif routine == "backup":
        print(backup(notebook))
    elif routine == "reminders":
        _print_detail(*reminders(notebook))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("routine", choices=["cap-check", "archive", "sweep", "backup", "reminders", "all"])
    ap.add_argument("--notebook", type=Path, default=Path.home() / "Melody")
    ap.add_argument(
        "--fixture",
        type=Path,
        help="build a fresh fixture repo from DIR/spec.json and use it instead of --notebook",
    )
    args = ap.parse_args()

    try:
        if args.fixture:
            with tempfile.TemporaryDirectory(prefix="melody-routines-fixture-") as tmp:
                notebook = Path(tmp) / "notebook"
                build_fixture(args.fixture, notebook)
                return _run(args.routine, notebook)
        return _run(args.routine, args.notebook)
    except (NotGitRepo, RuntimeError, OSError, json.JSONDecodeError, KeyError) as err:
        print(f"error: {err}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
