---
name: github-issue-triage
description: >
  Pull active GitHub issues for the repo, triage them by priority and complexity,
  interview the user to clarify intent, then launch sub-agents to implement fixes.
  Use when asked to triage issues, fix GitHub issues, or work the issue backlog.
---

# GitHub Issue Triage & Fix Skill

Fetch open GitHub issues, triage them, ask the user enough questions to fully
understand each issue and the desired fix, then delegate implementation to
focused sub-agents — one per issue.

---

## Workflow

Make a todo checklist covering every step below and work through them in order.
Tick each item as you complete it.

---

### Step 1 — Fetch open issues

Use `mcp__github__list_issues` with `state: "open"` for the current repo.
If the repo is not known, derive it from `git remote get-url origin`.

Collect: issue number, title, labels, assignees, creation date, comment count,
and the full body of each issue.

If there are more than 20 open issues, fetch in pages until you have them all
(use the `page` parameter). Cap at 100 issues; if more exist, tell the user and
ask which range to focus on.

---

### Step 2 — Display triage table

Print a concise Markdown table:

| # | Title | Labels | Age | Comments | Est. Complexity |
|---|-------|--------|-----|----------|-----------------|

**Estimating complexity** (one pass, no user input yet):

- **XS** — typo, copy change, single-line fix, missing import
- **S** — isolated bug in one file, straightforward config change
- **M** — multi-file change, moderate logic, needs a test
- **L** — new feature, schema change, cross-cutting refactor
- **XL** — architecture change, major new subsystem, migration

Base your estimate on the issue body, labels (e.g. "bug", "enhancement",
"good first issue"), and comment signals. State your reasoning briefly after
the table.

---

### Step 3 — Ask triage questions

Ask the user **all of the following in a single message** (do not split across
multiple turns):

1. **Scope** — "Which issue numbers should I work on? (comma-separated list, or
   'all', or a label filter like 'bug')"
2. **Priority order** — "Should I tackle them in order of age, complexity
   (XS→XL), or a custom order you specify?"
3. **Parallelism** — "Should I run sub-agents in parallel (faster, more context
   usage) or sequentially (safer, easier to review)?"
4. **Branch strategy** — "One branch per issue (recommended) or all fixes on a
   single branch?"
5. **PR behaviour** — "Open a draft PR for each fix automatically, or just push
   the branch and let you open the PR?"
6. **Skips** — "Any issues I should skip or de-prioritise?"

Wait for the user to answer before continuing.

---

### Step 4 — Per-issue deep-dive interview

Step 4 is split into two phases: a parallel research phase (4a + 4b) that fans
out across Explore sub-agents, and an interactive phase (4c + 4d) that runs in
the main thread where the user can respond.

#### 4a + 4b — Parallel research (Explore sub-agents)

Spawn one **Explore** sub-agent per selected issue simultaneously. Each
sub-agent receives a self-contained prompt like:

```
Research GitHub issue #<N> in the <owner>/<repo> codebase.

## Issue details
Title: <title>
Body:
<full body>
Comments (if any):
<comments fetched from mcp__github__issue_read>

## Your task
1. Read the full issue thread via mcp__github__issue_read for issue #<N>
   in <owner>/<repo> if not already provided above.
2. Search the codebase with Grep and Glob to locate all files likely
   relevant to this issue. Search for: error messages quoted in the issue,
   function/component/hook names mentioned, UI labels, route names, and
   any other specific keywords.
3. For each relevant file found, read enough of it to understand the
   current behaviour and where a fix would go.

## Report back (be concise)
- **Relevant files:** list with a one-line note on why each is relevant
- **Root cause hypothesis:** 2-3 sentences on what is likely wrong and why
- **Suggested fix location:** the specific function/component/line range
  where the change should land
- **Unknowns:** questions that can only be answered by the user (not by
  reading the code) — e.g. platform scope, design intent, edge cases.
  List only genuine blockers; aim for 0-3.
```

Use `subagent_type: "Explore"` and run all research sub-agents in a single
parallel batch. Do not wait for one to finish before launching the next.

Once all research sub-agents return, synthesise their findings in the main
thread before proceeding to 4c.

#### 4c — Ask targeted clarifying questions (main thread)

For each issue, present the research summary to the user and ask **only the
unknowns the Explore sub-agent flagged** — questions that cannot be resolved
by reading the code. Examples:

- "The issue mentions 'the save button does nothing' — is this on the web or
  mobile build, or both?"
- "Issue #12 says 'add dark mode' but doesn't specify which screens. Should I
  apply it globally or just the home screen?"
- "The stack trace points to `useAuth`. Should the fix go in that hook, or
  should we add a guard higher up in the navigation stack?"

If the Explore sub-agent flagged no unknowns, state "No clarification needed
for #N — proceeding." and skip asking.

Batch all per-issue questions into **one message** so the user answers
everything in a single reply. Wait for the user before continuing.

#### 4d — Confirm the plan (main thread)

For each issue, state in plain English:

> "For issue #N — [title]
> **Root cause:** …
> **Proposed fix:** …
> **Files to change:** …
> **Tests:** …
> **PR title:** …"

Ask "Does this look right? (yes / adjust: …)" and wait for confirmation or
corrections. If the user says adjust, incorporate the feedback and re-confirm.

Batch all issue plans into **one message** where possible so the user can
approve everything at once.

---

### Step 5 — Spawn sub-agents

Once all selected issues are interviewed and confirmed, spawn sub-agents
according to the user's parallelism preference.

#### Sub-agent prompt template

Craft a self-contained prompt for each sub-agent. Include **all** of:

```
You are implementing a fix for GitHub issue #<N> in the <owner>/<repo> repo.

## Issue
Title: <title>
Body:
<full body>

## Root cause (pre-analysed)
<your analysis from Step 4b>

## Agreed fix
<the plan confirmed in Step 4d>

## Files most likely involved
<list from Step 4b>

## Branch
Create and push to branch: fix/issue-<N>-<slug>
Base it off: <current default branch, usually main>

## Task
1. Implement the fix exactly as described above.
2. Write or update tests if the fix changes logic (skip for pure copy/config changes).
3. Run the project's lint and test commands to verify nothing is broken.
4. Commit with message: "fix: <short description> (closes #<N>)"
5. Push the branch.
6. If instructed, open a draft PR titled "<PR title from Step 4d>" targeting <default branch>.

## Constraints
- Touch only files necessary for this fix.
- Do not refactor unrelated code.
- Do not add features beyond what the issue asks for.
- If you discover the fix is much larger than expected, stop and report back instead of guessing.
```

Use `subagent_type: "general-purpose"` for all sub-agents.

---

### Step 6 — Monitor and report

After each sub-agent completes:

1. Check its returned summary for errors or blockers.
2. If it succeeded: record the branch name and (if created) PR URL.
3. If it reported a blocker or partial completion: summarise the blocker to the
   user and ask how to proceed (skip, retry with adjusted instructions, or hand
   off to the user).

Do **not** silently swallow failures.

---

### Step 7 — Final summary

When all sub-agents have finished (or been handed off), print a summary table:

| Issue | Title | Status | Branch / PR |
|-------|-------|--------|-------------|
| #N    | …     | ✅ Fixed / ⚠️ Partial / ❌ Blocked | branch or PR link |

Follow with any action items the user needs to take (e.g. review a PR, answer a
question a sub-agent raised, manually test a UI change).

---

## Rules

- Never commit directly to `main` or `master`.
- Never open a non-draft PR without explicit user permission.
- Do not spawn a sub-agent for an issue the user has not confirmed.
- Keep sub-agent prompts fully self-contained — they have no context from this
  conversation, so everything they need must be in the prompt.
- If a sub-agent prompt would exceed roughly 4 000 words, split the issue into
  smaller tasks and spawn one sub-agent per task.
- Prefer parallel sub-agents when the user allows it and the issues are
  independent (no shared files or migrations).
