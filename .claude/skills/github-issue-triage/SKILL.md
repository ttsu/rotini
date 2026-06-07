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

For each issue selected, do the following **before** spawning a sub-agent:

#### 4a. Read the full issue thread

Use `mcp__github__issue_read` to get the full body and all comments for the issue.

#### 4b. Search the codebase for context

Use `Grep` and `Glob` to locate the files most likely relevant to the issue
(search for error messages, function names, component names, or keywords from
the issue body). Summarise what you find in 2-3 sentences.

#### 4c. Ask targeted clarifying questions

Based on what you read and what you found in the code, ask the user **only the
questions you cannot answer yourself**. Examples:

- "The issue mentions 'the save button does nothing' — is this on the web or
  mobile build, or both?"
- "Issue #12 says 'add dark mode' but doesn't specify which screens. Should I
  apply it globally or just the home screen?"
- "The stack trace points to `useAuth`. Should the fix go in that hook, or
  should we add a guard higher up in the navigation stack?"

Do **not** ask questions you can resolve by reading the code. Aim for 0–3
questions per issue. If the issue is fully clear, state "No clarification
needed for #N — proceeding."

Wait for the user's answers before spawning any sub-agent for that issue.

#### 4d. Confirm the plan

Before spawning, state in plain English:

> "For issue #N — [title]
> **Root cause:** …
> **Proposed fix:** …
> **Files to change:** …
> **Tests:** …
> **PR title:** …"

Ask "Does this look right? (yes / adjust: …)" and wait for confirmation or
corrections. If the user says adjust, incorporate the feedback and re-confirm.

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
