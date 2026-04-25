from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from time import mktime

import feedparser

from .base import Candidate, Source

log = logging.getLogger(__name__)


class RSSSource(Source):
    """Generic RSS/Atom source. One per feed URL."""

    def __init__(
        self,
        name: str,
        url: str,
        section_hint: str = "ai_news",
        max_age_hours: int = 96,  # 4 days — slow blogs (Anthropic, CFPB, YC) often miss a 36h window
        max_items: int = 25,
    ):
        self.name = name
        self.url = url
        self.section_hint = section_hint
        self.max_age = timedelta(hours=max_age_hours)
        self.max_items = max_items

    def fetch(self) -> list[Candidate]:
        try:
            parsed = feedparser.parse(self.url)
        except Exception as e:
            log.warning("rss fetch failed for %s: %s", self.url, e)
            return []

        cutoff = datetime.now(timezone.utc) - self.max_age
        out: list[Candidate] = []
        for entry in parsed.entries[: self.max_items]:
            published = None
            if getattr(entry, "published_parsed", None):
                try:
                    published = datetime.fromtimestamp(
                        mktime(entry.published_parsed), tz=timezone.utc
                    )
                except Exception:
                    published = None
            if published and published < cutoff:
                continue
            out.append(
                Candidate(
                    source=self.name,
                    title=entry.get("title", "").strip(),
                    url=entry.get("link", ""),
                    summary=(entry.get("summary") or entry.get("description") or "")[:600],
                    published_at=published.isoformat() if published else None,
                    section_hint=self.section_hint,
                    raw={"id": entry.get("id"), "author": entry.get("author")},
                )
            )
        return out
