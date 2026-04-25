import logging
import os

from .base import Candidate, Source, utcnow_iso
from .business_pulse import BusinessPulse
from .fundraising import FundraisingTracker
from .hackernews import HackerNewsTop
from .rss import RSSSource

log = logging.getLogger(__name__)

__all__ = [
    "Candidate",
    "Source",
    "utcnow_iso",
    "BusinessPulse",
    "FundraisingTracker",
    "HackerNewsTop",
    "RSSSource",
    "load_news_sources",
    "default_news_sources",
]


_DEFAULT_RSS = [
    ("anthropic", "https://www.anthropic.com/news/rss.xml", "ai_news"),
    ("openai", "https://openai.com/blog/rss.xml", "ai_news"),
    ("deepmind", "https://deepmind.google/blog/rss.xml", "ai_news"),
    ("techcrunch_ai", "https://techcrunch.com/category/artificial-intelligence/feed/", "ai_news"),
    ("simonw", "https://simonwillison.net/atom/everything/", "ai_news"),
    ("cfpb", "https://www.consumerfinance.gov/about-us/newsroom/feed/", "stuff_that_affects_my_life"),
    ("nyt_business", "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", "stuff_that_affects_my_life"),
]


def default_news_sources() -> list[Source]:
    """Hardcoded fallbacks. Used when Mongo is unreachable or empty."""
    sources: list[Source] = [
        RSSSource(name, url, hint) for (name, url, hint) in _DEFAULT_RSS
    ]
    sources.append(HackerNewsTop(min_score=200, limit=25))
    return sources


def load_news_sources() -> list[Source]:
    """
    Read sources from `brief_sources` Mongo collection (managed via the Brief
    Sources tab). Falls back to hardcoded defaults if Mongo unreachable or
    no rows enabled. HackerNewsTop is always added — it has its own UI down
    the road if needed.
    """
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        return default_news_sources()
    try:
        from pymongo import MongoClient

        client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        rows = list(
            client["ethan-admin"]["brief_sources"].find({"enabled": True})
        )
        if not rows:
            return default_news_sources()
        sources: list[Source] = []
        for r in rows:
            name = r.get("name") or "unknown"
            url = r.get("url")
            hint = r.get("section_hint") or "ai_news"
            if not url:
                continue
            sources.append(RSSSource(name, url, hint))
        sources.append(HackerNewsTop(min_score=200, limit=25))
        log.info("loaded %d sources from mongo", len(sources))
        return sources
    except Exception as e:
        log.warning("could not load sources from mongo, using defaults: %s", e)
        return default_news_sources()
