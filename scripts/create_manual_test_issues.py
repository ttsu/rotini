#!/usr/bin/env python3
"""Create GitHub issues from docs/release/manual-test-plan.md.

Usage:
  python3 scripts/create_manual_test_issues.py [--dry-run]
  python3 scripts/create_manual_test_issues.py [--write-json PATH] [--export-only]

  --dry-run        Print issue titles only; do not write files or call gh.
  --write-json     Write [{"id","title","body"}, ...] to PATH (UTF-8).
  --export-only    With --write-json, skip `gh issue create` (for tokens without
                   issues:write, or bulk import elsewhere).

Env:
  GH_REPO  (default: ttsu/rotini)

If `gh issue create` fails with "Resource not accessible by integration", run
with `--write-json … --export-only` and create issues using a user PAT
(`gh auth login` with `write:issues`) or the GitHub UI.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAN_PATH = ROOT / "docs" / "release" / "manual-test-plan.md"


def parse_blocks(lines: list[str]) -> list[dict]:
    blocks: list[dict] = []
    section = ""
    current: dict | None = None
    for i, line in enumerate(lines):
        m2 = re.match(r"^## (\d+)\.\s+(.+)$", line)
        if m2:
            section = m2.group(2).strip()
            continue
        m3 = re.match(r"^### ([A-Z0-9-]+)\s+(.+)$", line)
        if m3:
            if current:
                blocks.append(current)
            current = {"id": m3.group(1), "title": m3.group(2).strip(), "section": section, "start_line": i}
    if current:
        blocks.append(current)
    for j, b in enumerate(blocks):
        start = b.pop("start_line")
        end = blocks[j + 1]["start_line"] if j + 1 < len(blocks) else len(lines)
        b["body_lines"] = lines[start:end]
    return blocks


def _append_continuation(target: list[str], fragment: str) -> None:
    fragment = fragment.strip()
    if not fragment:
        return
    target.append(fragment)


def parse_case(body_lines: list[str]) -> dict:
    """Parse Coverage, Personas, Result, Issue IDs, and nested Steps (incl. wrapped lines)."""
    rest = body_lines[1:]
    coverage = personas = result = issue_ids = ""
    steps: list[dict] = []
    mode = "preamble"
    submode: str | None = None
    current: dict | None = None

    def normalize_sub_line(raw: str) -> str:
        """Strip `  - ` prefix; inner lines may be `- Expected:` after outer indent trim."""
        t = raw.strip()
        if t.startswith("- "):
            t = t[2:].strip()
        return t

    def flush_expected_observed_line(raw: str) -> None:
        nonlocal current, submode
        assert current is not None
        t = normalize_sub_line(raw)
        if t.startswith("Expected:"):
            submode = "expected"
            _append_continuation(current["_expected_parts"], t.removeprefix("Expected:").strip())
        elif t.startswith("Observed:"):
            submode = "observed"
            _append_continuation(current["_observed_parts"], t.removeprefix("Observed:").strip())
        elif submode == "expected":
            _append_continuation(current["_expected_parts"], t)
        elif submode == "observed":
            _append_continuation(current["_observed_parts"], t)

    for line in rest:
        if line.startswith("## "):
            break
        if line.startswith("### "):
            break

        t = line.strip()
        if t.startswith("Coverage:"):
            coverage = t.removeprefix("Coverage:").strip()
            mode = "meta"
            submode = None
            continue
        if t.startswith("Personas:"):
            personas = t.removeprefix("Personas:").strip()
            mode = "meta"
            submode = None
            continue
        if t.startswith("Result:"):
            result = t.removeprefix("Result:").strip()
            mode = "meta"
            submode = None
            continue
        if t.startswith("Issue IDs:"):
            issue_ids = t.removeprefix("Issue IDs:").strip()
            mode = "meta"
            submode = None
            continue
        if t == "Steps:":
            mode = "steps"
            submode = None
            continue

        if mode != "steps":
            continue

        if re.match(r"^-\s+", line) and not re.match(r"^  -\s+", line):
            if current:
                steps.append(
                    {
                        "action": " ".join(current["_action_parts"]).strip(),
                        "expected": " ".join(current["_expected_parts"]).strip(),
                        "observed": " ".join(current["_observed_parts"]).strip(),
                    }
                )
            current = {
                "_action_parts": [re.sub(r"^-\s+", "", line).strip()],
                "_expected_parts": [],
                "_observed_parts": [],
            }
            submode = "action"
            continue

        if current is None:
            continue

        if re.match(r"^  -\s+", line):
            flush_expected_observed_line(line)
            continue

        if re.match(r"^  \S", line) or re.match(r"^   ", line):
            cont = line[2:] if line.startswith("  ") else line
            cont = cont.strip()
            if submode == "action":
                _append_continuation(current["_action_parts"], cont)
            elif submode == "expected":
                _append_continuation(current["_expected_parts"], cont)
            elif submode == "observed":
                _append_continuation(current["_observed_parts"], cont)
            continue

    if current:
        steps.append(
            {
                "action": " ".join(current["_action_parts"]).strip(),
                "expected": " ".join(current["_expected_parts"]).strip(),
                "observed": " ".join(current["_observed_parts"]).strip(),
            }
        )

    return {"coverage": coverage, "personas": personas, "result": result, "issue_ids": issue_ids, "steps": steps}


def build_body(repo: str, block: dict, parsed: dict) -> str:
    bid = block["id"]
    blob = f"https://github.com/{repo}/blob/main/docs/release/manual-test-plan.md"
    parts: list[str] = []
    parts.append("## Test case\n\n")
    parts.append("| | |\n| --- | --- |\n")
    parts.append(f"| **ID** | `{bid}` |\n")
    parts.append(f"| **Section** | {block['section']} |\n")
    parts.append(f"| **Plan** | [manual-test-plan.md]({blob}) |\n\n")

    parts.append("## Scope\n\n")
    parts.append(f"**Coverage:** {parsed['coverage'] or '—'}\n\n")
    parts.append(f"**Personas:** {parsed['personas'] or '—'}\n\n")

    parts.append("## Run tracker\n\n")
    parts.append("Update as you execute the manual test run.\n\n")
    r = parsed["result"] or "UNTESTED"
    iid = parsed["issue_ids"] or "[]"
    parts.append(
        f"- [ ] **Result** — Replace with **PASS** / **FAIL** / **BLOCKED** (was: `{r}`)\n"
    )
    parts.append(f"- [ ] **Issue IDs** — Link or list failure tickets (was: `{iid}`)\n\n")

    parts.append("## Steps\n\n")
    parts.append(
        "Check each box when that part is done. Add notes under **Notes** if anything fails.\n\n"
    )

    for idx, s in enumerate(parsed["steps"], 1):
        parts.append(f"### Step {idx}\n\n")
        parts.append(f"- [ ] **Action:** {s['action']}\n")
        if s["expected"]:
            parts.append(f"- [ ] **Expected:** {s['expected']}\n")
        obs = s["observed"] or "_(record what you saw)_"
        parts.append(f"- [ ] **Observed:** {obs}\n\n")

    parts.append("### Notes\n\n")
    parts.append("_(environment, screenshots, linked bugs)_\n")
    return "".join(parts)


def gh_issue_create(repo: str, title: str, body: str) -> str:
    args = [
        "gh",
        "issue",
        "create",
        "--repo",
        repo,
        "--title",
        title,
        "--body",
        body,
        "--label",
        "manual-test",
    ]
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT)


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Export and/or create GitHub issues from the manual test plan."
    )
    ap.add_argument("--dry-run", action="store_true", help="Print issue titles only")
    ap.add_argument(
        "--write-json",
        metavar="PATH",
        help="Write issue payloads (id, title, body) as JSON to PATH",
    )
    ap.add_argument(
        "--export-only",
        action="store_true",
        help="With --write-json, do not call gh (export payloads only)",
    )
    ap.add_argument("--repo", default=os.environ.get("GH_REPO", "ttsu/rotini"))
    args = ap.parse_args()

    text = PLAN_PATH.read_text(encoding="utf8")
    lines = text.splitlines()
    blocks = parse_blocks(lines)

    bundle: list[dict] = []
    for block in blocks:
        parsed = parse_case(block["body_lines"])
        title = f"[Manual QA] {block['id']} — {block['title']}"
        body = build_body(args.repo, block, parsed)
        bundle.append({"id": block["id"], "title": title, "body": body})

    if args.write_json:
        Path(args.write_json).write_text(json.dumps(bundle, indent=2), encoding="utf8")
        print(f"Wrote {len(bundle)} issue payloads to {args.write_json}", file=sys.stderr)

    if args.dry_run:
        for item in bundle:
            print(item["title"])
        return 0

    do_create = not (args.export_only and args.write_json)
    if args.export_only and not args.write_json:
        print("--export-only requires --write-json", file=sys.stderr)
        return 2

    if not do_create:
        print(json.dumps({"repo": args.repo, "exported": len(bundle), "path": args.write_json}, indent=2))
        return 0

    created: list[dict] = []
    for item in bundle:
        try:
            out = gh_issue_create(args.repo, item["title"], item["body"])
        except subprocess.CalledProcessError as e:
            out = getattr(e, "output", "") or ""
            print(out, file=sys.stderr)
            print(
                "\nGitHub rejected issue creation (often the token lacks `issues: write`). "
                "Export payloads and create issues with a PAT or in the UI:\n"
                f"  python3 scripts/create_manual_test_issues.py --write-json /tmp/manual-test-issues.json --export-only\n",
                file=sys.stderr,
            )
            return e.returncode
        m = re.search(r"https://github\.com/[^\s]+/issues/(\d+)", out)
        created.append(
            {
                "id": item["id"],
                "title": item["title"],
                "url": out.strip(),
                "number": m.group(1) if m else None,
            }
        )

    print(json.dumps({"repo": args.repo, "count": len(created), "issues": created}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
