# AGENTS.md §Model routing — the Agent-tool row (task 107)

Dated 2026-09-20. For `~/github/agent-workspace/AGENTS.md`, one bullet under the routing
table, above the `codex exec` flags note. The session's write to that file was refused by
the permission classifier (an agent-instructions file), so the row waits here for the
user's hand. Two advisors on non-Claude runtimes read the proposal and the evidence; both
returned "land with changes", and the wording below is their changes applied.

## The row

```
- **Agent-tool workers (2026-09-19, melody-agent2 tranches 1–7; provisional):**
  a Claude Code session with the Agent tool routes its worktree
  subagents by the same `worker:` tiers, *instead of* the CLI ladder
  when that mechanism runs — `worker: low` → `model: haiku`;
  `worker: medium` and above → `model: sonnet` first (17/17 haiku
  diffs on medium tasks needed session corrections; the two sonnet
  diffs landed with none). Agent-tool workers are leaves like CLI
  print-mode runs: they spawn no subagent and invoke no agent CLI.
  A worker that stalls with an empty worktree is retried once only
  if a same-model probe answers and the worktree holds no edits;
  otherwise, or on a second stall, the session takes the task
  (task 83, three stalls in a Sonnet outage). Provisional until one
  medium task is measured both ways (session minutes to land,
  haiku-then-correct vs sonnet-first) and one trivial sonnet worker
  separates endpoint from isolation. Say which mechanism ran in the
  hand-back. Advisors: codex gpt-6-astra (architect) and cursor-agent
  (PM), both "land with changes", 2026-09-20; their changes are this
  wording.
```

## Advisor verdicts, verbatim

### codex exec -m gpt-6-astra (architect lens)

- **Verdict: land with changes.** Keep one tier policy with two explicitly named mechanisms; a separate Agent-tool routing table would duplicate policy and invite drift.

- **Name the scope.** Say “Claude Code sessions with the Agent tool” and use explicit `haiku` / `sonnet` model names; “a session with the Agent tool” and “haiku-class” imply mappings across runtimes that the evidence does not establish.
- **Clarify precedence.** State that Agent-tool routing applies *instead of* the CLI worker ladder when that mechanism is selected; otherwise “sonnet-class first” leaves the fallback order undefined.
- **Preserve leaf execution explicitly.** Add: “Only the coordinating session delegates; CLI print-mode workers and Agent-tool workers are leaves and invoke neither subagents nor agent CLIs.” The proposal does not inherently break “chains never nest,” but the existing wording only explicitly constrains CLI leaves.
- **Separate the empty-worktree case.** Retry once after checking endpoint availability and confirming no edits; a second stall returns ownership to the session for reassessment. Immediate retry during an outage adds delay, and handing ownership back should not require the session to implement through the same unavailable endpoint.
- **PM, briefly:** The 17/17 correction rate supports a provisional move of medium tasks to Sonnet, but two clean completions do not establish comparative cost efficiency. Measure accepted-task cost, session correction time, completion time, and endpoint versus isolation failures before making this a durable default.
12,197

### cursor-agent -p (PM lens)

**Verdict: land with changes.**

**Q2 — medium off haiku:** Yes for the Agent-tool path, not yet for the CLI table. 17/17 is not a noisy sample; it is a systematic miss (session redid walks, Rust, compile, two main-checkout strays). Token price is the wrong unit. The card is “the rung that lands it.” Haiku at ~⅓ of Sonnet plus a session rewrite is the expensive path. The 3 stalls vs 2 completions do **not** prove Sonnet is reliable: 83’s empty trees sat in a same-window Sonnet outage; 94/89 each needed one resume. Before rewriting the table’s first rung, measure: (a) session-minutes-to-land on one medium task, haiku-then-correct vs sonnet-first; (b) one trivial Agent-tool sonnet task once the endpoint answers (isolates stall vs isolation); (c) CLI `-p` haiku correction rate on one medium task. **Retry once is too generous in an outage** (83 would have burned another 600s) and about right for an isolated hang — retry once only if a same-model session probe answers; otherwise the session takes it immediately.

**Q1 — shape:** Give Agent-tool its own dated row (or a second `when` column). “Same tiers, two mechanisms” hides that the first rung now differs. Leaves stay leaves: a session-spawned Agent-tool worker is not a nested CLI.

## After applying

`python ~/github/agent-workspace/scripts/check-reach.py` → PASS is task 107's second
confirm; the first (`grep -c "2026-09-19" ~/github/agent-workspace/AGENTS.md` → ≥ 1) is
true once the row is pasted.
