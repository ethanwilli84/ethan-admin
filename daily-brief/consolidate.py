#!/usr/bin/env python3
"""
Weekly consolidation pass. Reads the last 90 days of raw feedback from
brief_feedback, asks Claude to produce a clean, deduplicated, non-contradicting
set of "rules learned," and writes it to prompts/learned_rules.md.

Run weekly Sundays 23:00 America/New_York via daily-brief-consolidate.timer.
"""

from __future__ import annotations

import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from pymongo import MongoClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("brief-consolidate")

ROOT = Path(__file__).parent
PROMPTS = ROOT / "prompts"
MODEL = "claude-sonnet-4-6"

CONSOLIDATE_INSTRUCTIONS = """\
You are tuning the curation prompt for Ethan's daily brief.

Below is 90 days of raw feedback from inline 👍/👎/less-of-this/note/override
clicks, plus the existing learned_rules.md (if any). Your job: produce a
clean, deduplicated, non-contradicting set of curation rules in markdown.

Rules:
- Group by topic. One section per cluster of feedback.
- When new feedback contradicts old rules, the newer pattern wins.
- Drop rules that have no recent reinforcement (no feedback supporting them
  in the last 30 days).
- Be specific: "stop showing AGI doom takes" beats "filter low-quality content."
- Each rule should be one line, imperative voice, in Ethan's tone.
- Limit total length to ~80 lines so it stays cheap to load.

Output FORMAT (markdown, no preamble, no code fences):

# Learned rules

## What to keep more of
- ...

## What to cut
- ...

## Voice / format adjustments
- ...

## Topic-specific calibrations
- ...
"""


def main() -> int:
    load_dotenv(ROOT / ".env", override=True)
    load_dotenv(ROOT.parent / ".env.local", override=False)

    uri = os.environ.get("MONGODB_URI")
    if not uri:
        log.error("MONGODB_URI required")
        return 1

    client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    coll = client["ethan-admin"]["brief_feedback"]
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    rows = list(
        coll.find({"created_at": {"$gte": cutoff}}, {"_id": 0}).sort("created_at", 1)
    )
    log.info("loaded %d feedback events from last 90 days", len(rows))

    if not rows:
        log.info("no feedback to consolidate, skipping")
        return 0

    feedback_text = "\n".join(_format(r) for r in rows)

    existing = ""
    learned_path = PROMPTS / "learned_rules.md"
    if learned_path.exists():
        existing = learned_path.read_text()

    user = (
        f"Existing learned_rules.md:\n\n```\n{existing or '(none)'}\n```\n\n"
        f"90 days of feedback ({len(rows)} events):\n\n```\n{feedback_text}\n```"
    )

    api = anthropic.Anthropic()
    resp = api.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=CONSOLIDATE_INSTRUCTIONS,
        messages=[{"role": "user", "content": user}],
    )
    out = "".join(
        b.text for b in resp.content if getattr(b, "type", None) == "text"
    ).strip()

    # Strip code fences if present
    if out.startswith("```"):
        out = out.strip("`")
        if out.lower().startswith("markdown"):
            out = out[len("markdown") :]
        out = out.strip()

    learned_path.write_text(out + "\n")
    log.info("wrote %s (%d chars)", learned_path, len(out))
    return 0


def _format(r: dict) -> str:
    ts = r.get("created_at")
    ts_str = ts.strftime("%Y-%m-%d") if hasattr(ts, "strftime") else str(ts)[:10]
    verdict = r.get("verdict", "?")
    title = (r.get("item_title") or "")[:120]
    note = (r.get("note") or "").strip()
    line = f"- {ts_str} [{verdict}] {title}"
    if note:
        line += f" — note: {note}"
    return line


if __name__ == "__main__":
    sys.exit(main())
