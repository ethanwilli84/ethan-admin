from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx

from .base import Candidate, Source

log = logging.getLogger(__name__)

API = "https://hacker-news.firebaseio.com/v0"


class HackerNewsTop(Source):
    """HN top stories above a score threshold. Curator further filters by topic."""

    name = "hackernews"

    def __init__(self, min_score: int = 200, limit: int = 30):
        self.min_score = min_score
        self.limit = limit

    def fetch(self) -> list[Candidate]:
        try:
            with httpx.Client(timeout=15) as c:
                ids = c.get(f"{API}/topstories.json").json()[: self.limit * 3]
                out: list[Candidate] = []
                for sid in ids:
                    if len(out) >= self.limit:
                        break
                    item = c.get(f"{API}/item/{sid}.json").json() or {}
                    if item.get("score", 0) < self.min_score:
                        continue
                    if not item.get("url"):
                        continue
                    ts = item.get("time")
                    published = (
                        datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else None
                    )
                    out.append(
                        Candidate(
                            source="hackernews",
                            title=item.get("title", "").strip(),
                            url=item["url"],
                            summary=f"{item.get('score', 0)} pts · {item.get('descendants', 0)} comments",
                            published_at=published,
                            section_hint="ai_news",
                            raw={"id": sid, "score": item.get("score")},
                        )
                    )
                return out
        except Exception as e:
            log.warning("HN fetch failed: %s", e)
            return []
