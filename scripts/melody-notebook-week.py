#!/usr/bin/env python3
"""How many chats in Melody's notebook left a journal line (task 205).

A chat counts when its session's working directory is the notebook; it left a line
when the notebook's git log has a commit touching journal/ between the chat's first
message and ten minutes after its last. Prints `chats · with a journal line · without`.

Live: reads goose's sessions DB read-only and `git log` in the notebook.
Fixture: `--fixture DIR` reads DIR/sessions.json and DIR/journal-commits.json instead.
Exits 1 when the journal can't be read, so a missing journal never reads as a clean week.
"""

import argparse
import json
import os
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

GRACE_SECONDS = 600


def live_chats(db: Path, notebook: Path, since: int) -> list[tuple[int, int]]:
    uri = f"file:{db}?mode=ro"
    with sqlite3.connect(uri, uri=True) as conn:
        rows = conn.execute(
            """
            select min(m.created_timestamp), max(m.created_timestamp)
            from sessions s join messages m on m.session_id = s.id
            where s.working_dir in (?, ?)
            group by s.id
            having min(m.created_timestamp) >= ?
            """,
            (str(notebook), str(notebook.resolve()), since),
        ).fetchall()
    return [(start, end) for start, end in rows]


def live_journal_commits(notebook: Path, since: int) -> list[int]:
    out = subprocess.run(
        ["git", "-C", str(notebook), "log", f"--since={since}", "--format=%ct", "--", "journal/"],
        capture_output=True,
        text=True,
    )
    if out.returncode != 0 or not (notebook / "journal").is_dir():
        raise FileNotFoundError(f"no journal under {notebook}")
    return [int(line) for line in out.stdout.split()]


def fixture(dir_: Path) -> tuple[list[tuple[int, int]], list[int]]:
    chats = [(c["start"], c["end"]) for c in json.loads((dir_ / "sessions.json").read_text())]
    journal = dir_ / "journal-commits.json"
    if not journal.exists():
        raise FileNotFoundError(f"no journal in {dir_}")
    return chats, json.loads(journal.read_text())


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--notebook", type=Path, default=Path.home() / "Melody")
    ap.add_argument(
        "--db", type=Path, default=Path.home() / ".local/share/goose/sessions/sessions.db"
    )
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--fixture", type=Path)
    args = ap.parse_args()

    try:
        if args.fixture:
            chats, commits = fixture(args.fixture)
        else:
            since = int(time.time()) - args.days * 86400
            chats = live_chats(args.db, args.notebook, since)
            commits = live_journal_commits(args.notebook, since)
    except (FileNotFoundError, sqlite3.Error) as err:
        print(f"can't read the week: {err}", file=sys.stderr)
        return 1

    noted = sum(1 for start, end in chats if any(start <= c <= end + GRACE_SECONDS for c in commits))
    print(f"{len(chats)} · {noted} · {len(chats) - noted}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
