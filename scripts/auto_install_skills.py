#!/usr/bin/env python3
"""Mac-side auto-installer for `claude_skill` findings.

Polls ethan-admin for accepted (or auto-eligible new) claude_skill findings,
parses install commands from `proposedAction`, runs them via the local
`claude plugin` CLI, and reports outcomes back. Designed to run from a
LaunchAgent every 6h.

Auto-eligibility (skip the accept step entirely):
  - status='new' AND category='claude_skill' AND riskLevel='low'
    AND relevanceScore >= 8

Manual eligibility:
  - status='accepted' AND category='claude_skill'

Both paths run the install commands. Successful → status='shipped'. Failed →
status='apply_failed' with the error captured.

Required env:
  ADMIN_URL  — https://ethan-admin.ondigitalocean.app
  AI_AUTO_INSTALL_SKILLS_ENABLED  — 'true' to actually install
"""

import json
import os
import re
import subprocess
import sys
import urllib.request
import urllib.error

ADMIN_URL = os.environ.get("ADMIN_URL", "https://ethan-admin.ondigitalocean.app").rstrip("/")
ENABLED = os.environ.get("AI_AUTO_INSTALL_SKILLS_ENABLED", "false").lower() == "true"

CLAUDE_BIN = "/opt/homebrew/bin/claude"

MARKETPLACE_RE = re.compile(r"/?plugin\s+marketplace\s+add\s+([\w\-./]+)", re.IGNORECASE)
INSTALL_RE = re.compile(r"/?plugin\s+install\s+([\w\-]+)@([\w\-]+)", re.IGNORECASE)


def http_json(method, url, body=None, headers=None):
    headers = headers or {}
    headers.setdefault("Content-Type", "application/json")
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"raw": body}


def run_claude(args):
    print(f"$ {CLAUDE_BIN} {' '.join(args)}", flush=True)
    r = subprocess.run([CLAUDE_BIN] + args, capture_output=True, text=True, timeout=180)
    out = (r.stdout or "") + (r.stderr or "")
    print(out)
    return r.returncode == 0, out


def parse_install_commands(action_text):
    """Pull marketplace-add and plugin-install pairs out of free-text."""
    marketplaces = MARKETPLACE_RE.findall(action_text or "")
    installs = INSTALL_RE.findall(action_text or "")
    return marketplaces, installs


def install_finding(f):
    action = (f.get("proposedAction") or "") + "\n" + (f.get("rationale") or "")
    marketplaces, installs = parse_install_commands(action)

    if not installs and not marketplaces:
        return False, "no install/marketplace commands parsed from proposedAction"

    log = []
    # Add marketplaces first
    for repo in marketplaces:
        ok, out = run_claude(["plugin", "marketplace", "add", repo])
        log.append(f"marketplace {repo}: {'ok' if ok else 'fail'}")
        if not ok and "already exists" not in out and "already added" not in out:
            return False, f"marketplace add failed for {repo}: {out[-200:]}"

    # Then install plugins
    for plugin, marketplace in installs:
        ok, out = run_claude(["plugin", "install", f"{plugin}@{marketplace}"])
        log.append(f"install {plugin}@{marketplace}: {'ok' if ok else 'fail'}")
        if not ok:
            return False, f"install failed for {plugin}@{marketplace}: {out[-200:]}"

    return True, " | ".join(log)


def report(finding_id, ok, outcome):
    body = {
        "action": "report_apply" if ok else "report_apply",
        "id": finding_id,
        "success": ok,
        "outcome" if ok else "error": outcome,
    }
    http_json("POST", f"{ADMIN_URL}/api/ai-research", body)


def fetch_candidates():
    """Return findings to process: auto-eligible new + manually-accepted."""
    items = []
    # Manual accepts
    code, data = http_json(
        "GET",
        f"{ADMIN_URL}/api/ai-research?status=accepted&category=claude_skill&limit=20",
    )
    if code == 200:
        items.extend(data.get("findings", []))
    # Auto-eligible: status='new' AND category='claude_skill' AND low risk + score >= 8
    code, data = http_json(
        "GET",
        f"{ADMIN_URL}/api/ai-research?status=new&category=claude_skill&limit=30&minScore=8",
    )
    if code == 200:
        for f in data.get("findings", []):
            if f.get("riskLevel") == "low":
                items.append(f)
    # De-dupe by _id
    seen = set()
    out = []
    for f in items:
        fid = f.get("_id")
        if fid and fid not in seen:
            seen.add(fid)
            out.append(f)
    return out


def main():
    if not ENABLED:
        print("AI_AUTO_INSTALL_SKILLS_ENABLED!=true — skipping run.")
        return 0
    cands = fetch_candidates()
    if not cands:
        print("no candidates")
        return 0
    print(f"processing {len(cands)} candidate skill findings")
    for f in cands:
        fid = f["_id"]
        title = f.get("title", "")
        print(f"\n=== {fid} :: {title} ===")
        try:
            ok, outcome = install_finding(f)
            report(fid, ok, outcome)
            print(f"→ {'shipped' if ok else 'failed'}: {outcome[:200]}")
        except Exception as e:
            report(fid, False, f"exception: {e}")
            print(f"→ exception: {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
