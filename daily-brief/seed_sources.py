#!/usr/bin/env python3
"""
One-shot script to populate the `brief_sources` Mongo collection with
default RSS feeds + a few X accounts via RSSHub.

Run once locally:
    python daily-brief/seed_sources.py

Idempotent — won't duplicate names. After this, manage from the
Brief Sources tab in ethan-admin.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env", override=False)
load_dotenv(ROOT.parent / ".env.local", override=False)

# Public RSSHub instance. If rate-limited, swap to a self-hosted one
# (see DEPLOY.md → "Optional: self-host RSSHub").
RSSHUB = os.environ.get("RSSHUB_BASE", "https://rsshub.app")

DEFAULTS = [
    # AI labs
    ("anthropic", "https://www.anthropic.com/news/rss.xml", "ai_news"),
    ("openai", "https://openai.com/blog/rss.xml", "ai_news"),
    ("deepmind", "https://deepmind.google/blog/rss.xml", "ai_news"),
    ("simonw", "https://simonwillison.net/atom/everything/", "ai_news"),
    ("techcrunch_ai", "https://techcrunch.com/category/artificial-intelligence/feed/", "ai_news"),
    # X accounts via RSSHub (operator + AI)
    (f"x_swyx", f"{RSSHUB}/twitter/user/swyx", "ai_news"),
    (f"x_simonw", f"{RSSHUB}/twitter/user/simonw", "ai_news"),
    (f"x_sama", f"{RSSHUB}/twitter/user/sama", "ai_news"),
    (f"x_dario", f"{RSSHUB}/twitter/user/DarioAmodei", "ai_news"),
    (f"x_levie", f"{RSSHUB}/twitter/user/levie", "ai_news"),
    # BNPL / consumer credit / fintech regulation
    ("cfpb", "https://www.consumerfinance.gov/about-us/newsroom/feed/", "stuff_that_affects_my_life"),
    ("americanbanker_creditrisk", "https://www.americanbanker.com/feed?rss=true", "stuff_that_affects_my_life"),
    # Sneaker / streetwear
    ("complex_sneakers", "https://www.complex.com/sneakers/rss", "stuff_that_affects_my_life"),
    ("hypebeast_sneakers", "https://hypebeast.com/footwear/feed", "stuff_that_affects_my_life"),
    # NYC
    ("curbed_nyc", "https://ny.curbed.com/rss/index.xml", "stuff_that_affects_my_life"),
    # Founder community
    ("ycombinator_blog", "https://www.ycombinator.com/blog/rss.xml", "stuff_that_affects_my_life"),
]


def main() -> int:
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        print("error: MONGODB_URI not set", file=sys.stderr)
        return 1

    client = MongoClient(uri, serverSelectionTimeoutMS=10000)
    coll = client["ethan-admin"]["brief_sources"]

    inserted = 0
    skipped = 0
    for name, url, hint in DEFAULTS:
        existing = coll.find_one({"name": name})
        if existing:
            skipped += 1
            continue
        coll.insert_one(
            {
                "name": name,
                "url": url,
                "section_hint": hint,
                "enabled": True,
                "created_at": __import__("datetime").datetime.utcnow(),
            }
        )
        inserted += 1

    print(f"inserted {inserted}, skipped {skipped} existing")
    print(f"\nView/edit at: {os.environ.get('BRIEF_BASE_URL', '')}/brief-sources")
    return 0


if __name__ == "__main__":
    sys.exit(main())
