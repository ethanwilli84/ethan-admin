from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any


@dataclass
class Candidate:
    """A single content item pulled from a source. Fed to the curator."""

    source: str
    title: str
    url: str
    summary: str = ""
    published_at: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)
    section_hint: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class Source:
    """Common interface every source implements."""

    name: str = "unknown"

    def fetch(self) -> list[Candidate]:
        raise NotImplementedError


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
