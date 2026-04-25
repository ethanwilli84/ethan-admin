from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import anthropic

from sources.base import Candidate

log = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent / "prompts"
MODEL = "claude-sonnet-4-6"


# Tool schema — forces the model to return structured JSON, no parse risk.
CURATE_TOOL = {
    "name": "submit_curation",
    "description": (
        "Submit the curated daily brief content. Score every candidate 0-10 and "
        "place each into exactly one of: ai_news (top 3-5), "
        "stuff_that_affects_my_life (top 3-5), or killed (everything filtered). "
        "Write summaries in Ethan's voice per the system prompt."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "ai_news": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "url": {"type": "string"},
                        "summary": {"type": "string"},
                        "implication": {"type": "string"},
                        "score": {"type": "integer"},
                        "source": {"type": "string"},
                    },
                    "required": ["title", "url", "summary", "score", "source"],
                },
            },
            "stuff_that_affects_my_life": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "url": {"type": "string"},
                        "summary": {"type": "string"},
                        "implication": {"type": "string"},
                        "score": {"type": "integer"},
                        "source": {"type": "string"},
                    },
                    "required": ["title", "url", "summary", "score", "source"],
                },
            },
            "killed": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "url": {"type": "string"},
                        "score": {"type": "integer"},
                        "reason": {"type": "string"},
                        "source": {"type": "string"},
                    },
                    "required": ["title", "url", "score", "reason"],
                },
            },
        },
        "required": ["ai_news", "stuff_that_affects_my_life", "killed"],
    },
}


def _load_prompt() -> str:
    """Compose curation system prompt: base + learned_rules + last-30-day feedback."""
    base = (PROMPTS_DIR / "curation.md").read_text()

    learned_path = PROMPTS_DIR / "learned_rules.md"
    learned = learned_path.read_text() if learned_path.exists() else "(none yet)"

    recent = _recent_feedback_text()

    out = base
    out = out.replace(
        "[Auto-loaded from prompts/learned_rules.md — produced by the weekly consolidation pass.]",
        learned.strip(),
    )
    out = out.replace(
        "[Auto-loaded from brief_feedback table — raw 👍/👎/notes/overrides from inline tuning + ethan-admin.]",
        recent.strip() or "(no feedback yet)",
    )
    return out


def _recent_feedback_text() -> str:
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        return ""
    try:
        from pymongo import MongoClient

        client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        coll = client["ethan-admin"]["brief_feedback"]
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        rows = list(
            coll.find({"created_at": {"$gte": cutoff}}, {"_id": 0}).sort("created_at", -1)
        )
        if not rows:
            return ""
        lines: list[str] = []
        for r in rows:
            verdict = r.get("verdict", "?")
            note = (r.get("note") or "").strip()
            title = (r.get("item_title") or "")[:80]
            line = f"- [{verdict}] {title}"
            if note:
                line += f" — note: {note}"
            lines.append(line)
        return "\n".join(lines)
    except Exception as e:
        log.warning("could not load feedback: %s", e)
        return ""


def curate(candidates: list[Candidate], today_iso: str) -> dict[str, Any]:
    """
    Curate via tool_use — Claude is required to call submit_curation with a typed
    JSON object. No fragile string parsing.
    """
    if not candidates:
        return {"ai_news": [], "stuff_that_affects_my_life": [], "killed": []}

    client = anthropic.Anthropic()

    payload_items = [
        {
            "i": idx,
            "source": c.source,
            "title": c.title,
            "url": c.url,
            "summary": c.summary[:400],
            "section_hint": c.section_hint,
            "published_at": c.published_at,
        }
        for idx, c in enumerate(candidates)
    ]

    user = (
        f"Today is {today_iso}. Score and bucket the following {len(candidates)} candidates "
        "by calling the submit_curation tool. For each kept item, write the summary in "
        "Ethan's voice per the style rules in your system prompt. Return EVERY candidate "
        "into exactly one of the three buckets — anything not kept goes to `killed` so "
        "Ethan can override.\n\n"
        f"{json.dumps(payload_items, ensure_ascii=False)}"
    )

    resp = client.messages.create(
        model=MODEL,
        max_tokens=8192,
        system=_load_prompt(),
        tools=[CURATE_TOOL],
        tool_choice={"type": "tool", "name": "submit_curation"},
        messages=[{"role": "user", "content": user}],
    )

    for block in resp.content:
        if getattr(block, "type", None) == "tool_use" and block.name == "submit_curation":
            data = block.input or {}
            return {
                "ai_news": data.get("ai_news") or [],
                "stuff_that_affects_my_life": data.get("stuff_that_affects_my_life") or [],
                "killed": data.get("killed") or [],
            }

    log.error("curator did not call submit_curation; stop_reason=%s", resp.stop_reason)
    return {"ai_news": [], "stuff_that_affects_my_life": [], "killed": []}
