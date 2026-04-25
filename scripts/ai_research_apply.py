#!/usr/bin/env python3
"""AI research auto-apply worker.

Picks one queued finding, asks Claude to produce a unified diff against an
allowlisted file, runs gates (tsc + eslint), pushes a feature branch, opens a
PR via GitHub API, and (if eligible + auto-merge enabled) merges it. DigitalOcean
auto-deploys on merge to main.

Hard safety rails — these are intentional and should not be loosened lightly:
  - File allowlist below. Anything not in the allowlist is rejected.
  - Diff size cap (max ~60 changed lines).
  - Diff content checks: no new imports, no fetch() to new URLs, no env-var
    reads, no auth/token strings.
  - Daily cap: max 1 auto-merge per 24h (counted via API).
  - Kill switch: env var AI_AUTO_APPLY_ENABLED must be "true".
  - Auto-merge requires riskLevel=low AND relevanceScore>=8.
"""

import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error

ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
ADMIN_URL = os.environ["ADMIN_URL"].rstrip("/")
GH_TOKEN = os.environ["GH_PR_TOKEN"]
GH_REPO = os.environ.get("GH_REPO", "ethanwilli84/ethan-admin")
ENABLED = os.environ.get("AI_AUTO_APPLY_ENABLED", "false").lower() == "true"

# Files the worker is allowed to modify. Start narrow, expand only when trust
# is established. Note: list mods to this file itself are NOT allowed.
ALLOWED_FILES = {
    "app/api/ai-research/sync/route.ts",
    "app/api/sync-issues/route.ts",
}

# Substrings that disqualify a diff line from being added/removed. Cheap defense
# against the model sneaking in dangerous changes.
FORBIDDEN_PATTERNS = [
    r"\bprocess\.env\b",
    r"\bMONGODB_URI\b",
    r"\bANTHROPIC_API_KEY\b",
    r"\bMETA_PAGE_TOKEN\b",
    r"\bGH_PR_TOKEN\b",
    r"^\+\s*import\s",
    r"^\+\s*export\s",
    r"^\+\s*function\s",
    r"^\+\s*const\s+\w+\s*=\s*async",
    r"\bnew\s+MongoClient\b",
    r"\bfetch\s*\(\s*['\"]https?:",
]

MAX_DIFF_LINES = 60


def http_json(method, url, body=None, headers=None):
    headers = headers or {}
    headers.setdefault("Content-Type", "application/json")
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"raw": body}


def run(cmd, check=True, cwd=None):
    print(f"$ {' '.join(cmd)}", flush=True)
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    if r.stdout:
        print(r.stdout)
    if r.stderr:
        print(r.stderr, file=sys.stderr)
    if check and r.returncode != 0:
        raise RuntimeError(f"command failed: {' '.join(cmd)}")
    return r


def get_one_queued():
    code, data = http_json("GET", f"{ADMIN_URL}/api/ai-research?status=queued&limit=1")
    if code != 200:
        raise RuntimeError(f"fetch queued failed: {code} {data}")
    arr = data.get("findings", [])
    return arr[0] if arr else None


def daily_cap_hit():
    """Return True if any finding was auto-shipped in the last 24h."""
    code, data = http_json("GET", f"{ADMIN_URL}/api/ai-research?status=shipped&limit=10")
    if code != 200:
        return False
    cutoff = time.time() - 24 * 3600
    for f in data.get("findings", []):
        if not f.get("prNumber"):
            continue  # manually marked shipped, not auto
        ts = f.get("updatedAt", "")
        try:
            from datetime import datetime
            t = datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
            if t > cutoff:
                return True
        except Exception:
            pass
    return False


def report_apply(finding_id, success, **kwargs):
    body = {"action": "report_apply", "id": finding_id, "success": success, **kwargs}
    http_json("POST", f"{ADMIN_URL}/api/ai-research", body)


def mark_applying(finding_id):
    http_json(
        "POST",
        f"{ADMIN_URL}/api/ai-research",
        {"action": "mark_applying", "id": finding_id},
    )


def call_claude_for_diff(finding, file_path, file_content):
    """Ask Claude for a unified diff to apply the finding to the given file."""
    system = (
        "You produce unified diffs (git format) for surgical code changes. "
        "RULES: (1) modify ONLY the file given, (2) do not change imports, "
        "exports, function signatures, env var reads, fetch URLs, or auth code, "
        "(3) keep the diff small (<60 lines), (4) preserve existing TypeScript "
        "types and ESLint conventions. Output ONLY the diff, no prose, no "
        "markdown fences."
    )
    user = (
        f"Finding to apply:\nTitle: {finding['title']}\n"
        f"Action: {finding['proposedAction']}\n"
        f"Rationale: {finding['rationale']}\n"
        f"URL: {finding.get('url','')}\n\n"
        f"File path: {file_path}\n"
        f"Current contents:\n```\n{file_content}\n```\n\n"
        "Produce the unified diff only."
    )
    code, data = http_json(
        "POST",
        "https://api.anthropic.com/v1/messages",
        {
            "model": "claude-sonnet-4-5-20250929",
            "max_tokens": 4000,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        },
        headers={
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
    )
    if code != 200:
        raise RuntimeError(f"claude diff call failed: {code} {data}")
    blocks = data.get("content", [])
    text = ""
    for b in blocks:
        if b.get("type") == "text":
            text = b.get("text", "")
            break
    text = text.strip()
    text = re.sub(r"^```(?:diff|patch)?\n", "", text)
    text = re.sub(r"\n```$", "", text)
    return text.strip()


def validate_diff(diff_text, file_path):
    """Static checks on the diff. Raises if anything looks dangerous."""
    lines = diff_text.splitlines()
    if not lines:
        raise ValueError("empty diff")
    # Touched files must be inside allowlist
    touched = []
    for ln in lines:
        if ln.startswith("+++ ") or ln.startswith("--- "):
            path = ln[4:].strip()
            if path.startswith("a/") or path.startswith("b/"):
                path = path[2:]
            if path == "/dev/null":
                continue
            touched.append(path)
    for t in touched:
        if t not in ALLOWED_FILES:
            raise ValueError(f"diff touches non-allowlisted file: {t}")
    # Size check
    changed = [ln for ln in lines if ln.startswith(("+", "-")) and not ln.startswith(("+++", "---"))]
    if len(changed) > MAX_DIFF_LINES:
        raise ValueError(f"diff too large: {len(changed)} changed lines > {MAX_DIFF_LINES}")
    # Forbidden patterns
    for ln in lines:
        if not (ln.startswith("+") or ln.startswith("-")):
            continue
        for pat in FORBIDDEN_PATTERNS:
            if re.search(pat, ln):
                raise ValueError(f"forbidden pattern {pat!r} in line: {ln[:120]}")


def gate_tsc():
    run(["npx", "tsc", "--noEmit"])


def gate_eslint(files):
    if files:
        run(["npx", "eslint", *files])


def open_pr(branch, title, body):
    url = f"https://api.github.com/repos/{GH_REPO}/pulls"
    code, data = http_json(
        "POST",
        url,
        {"title": title, "head": branch, "base": "main", "body": body},
        headers={
            "Authorization": f"token {GH_TOKEN}",
            "Accept": "application/vnd.github+json",
        },
    )
    if code not in (200, 201):
        raise RuntimeError(f"pr open failed: {code} {data}")
    return data["number"], data["html_url"]


def merge_pr(number):
    url = f"https://api.github.com/repos/{GH_REPO}/pulls/{number}/merge"
    code, data = http_json(
        "PUT",
        url,
        {"merge_method": "squash"},
        headers={
            "Authorization": f"token {GH_TOKEN}",
            "Accept": "application/vnd.github+json",
        },
    )
    if code != 200:
        raise RuntimeError(f"pr merge failed: {code} {data}")
    return data


def main():
    if not ENABLED:
        print("AI_AUTO_APPLY_ENABLED!=true — skipping run.")
        return 0

    finding = get_one_queued()
    if not finding:
        print("no queued findings")
        return 0

    fid = finding["_id"]
    print(f"processing finding {fid}: {finding['title']}")
    mark_applying(fid)

    try:
        # Pick the first allowlisted file in proposedFiles
        target = None
        for p in finding.get("proposedFiles", []):
            if p in ALLOWED_FILES:
                target = p
                break
        if not target:
            raise ValueError(
                f"no allowlisted file in proposedFiles={finding.get('proposedFiles')}; "
                f"allowed={sorted(ALLOWED_FILES)}"
            )

        with open(target, "r") as f:
            file_content = f.read()
        diff_text = call_claude_for_diff(finding, target, file_content)
        if not diff_text.strip():
            raise ValueError("model returned empty diff")
        validate_diff(diff_text, target)

        # Apply diff
        with open(".ai-apply.diff", "w") as f:
            f.write(diff_text + ("\n" if not diff_text.endswith("\n") else ""))
        run(["git", "apply", "--check", ".ai-apply.diff"])
        run(["git", "apply", ".ai-apply.diff"])

        # Gates
        gate_tsc()
        gate_eslint([target])

        # Branch + commit + push
        branch = f"ai-auto/{fid[:8]}"
        run(["git", "checkout", "-b", branch])
        run(["git", "add", target])
        commit_msg = f"ai-auto: {finding['title'][:60]}\n\nFinding: {fid}\nScore: {finding.get('relevanceScore')}/10\nRisk: {finding.get('riskLevel')}\n\n{finding.get('rationale','')[:300]}"
        run(["git", "commit", "-m", commit_msg])
        run(["git", "push", "-u", "origin", branch])

        # PR
        pr_body = (
            f"**Auto-generated by AI research worker**\n\n"
            f"Finding ID: `{fid}`\nScore: {finding.get('relevanceScore')}/10\n"
            f"Risk: {finding.get('riskLevel')}\nCategory: {finding.get('category')}\n\n"
            f"**Action:** {finding.get('proposedAction','')}\n\n"
            f"**Rationale:** {finding.get('rationale','')}\n\n"
            f"Source: {finding.get('url','')}"
        )
        pr_number, pr_url = open_pr(branch, f"ai-auto: {finding['title'][:60]}", pr_body)
        print(f"opened PR #{pr_number} {pr_url}")

        # Auto-merge eligibility
        eligible = (
            finding.get("riskLevel") == "low"
            and (finding.get("relevanceScore") or 0) >= 8
            and not daily_cap_hit()
        )
        if eligible:
            try:
                merge_pr(pr_number)
                report_apply(fid, True, prNumber=pr_number, prUrl=pr_url, outcome=f"auto-merged PR #{pr_number}")
                print("auto-merged")
            except Exception as e:
                report_apply(fid, False, prNumber=pr_number, prUrl=pr_url, error=f"merge failed: {e}")
                raise
        else:
            reason = []
            if finding.get("riskLevel") != "low":
                reason.append("not low risk")
            if (finding.get("relevanceScore") or 0) < 8:
                reason.append("score < 8")
            if daily_cap_hit():
                reason.append("daily cap hit")
            report_apply(
                fid,
                False,
                prNumber=pr_number,
                prUrl=pr_url,
                error=f"queued for manual review: {', '.join(reason)}",
            )
            print(f"left PR open for manual review: {', '.join(reason)}")
        return 0
    except Exception as e:
        print(f"apply failed: {e}", file=sys.stderr)
        report_apply(fid, False, error=str(e))
        return 1


if __name__ == "__main__":
    sys.exit(main())
