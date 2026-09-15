#!/bin/bash
# check-spine: the fork never edits Goose's agent loop.
# Why: upstream is migrating agent.rs -> state_machine/ and requires every
# loop change to land in both paths (goose AGENTS.md "Agent Loop Migration");
# ARCHITECTURE.md §Invariants keeps those files upstream-only in this fork.
# Usage: bash scripts/check-spine.sh   -> "spine clean" / exit 1 listing paths

set -euo pipefail

offending=()
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  if [[ "$file" == "crates/goose/src/agents/agent.rs" ]] || \
     [[ "$file" == crates/goose/src/agents/state_machine/* ]]; then
    offending+=("$file")
  fi
done < <(
  (git diff --name-only upstream/main; git diff --cached --name-only upstream/main) | sort -u
)

if [[ ${#offending[@]} -gt 0 ]]; then
  echo "Error: changes to agent loop spine paths detected:" >&2
  printf '  %s\n' "${offending[@]}" >&2
  exit 1
fi

echo "spine clean"
exit 0
