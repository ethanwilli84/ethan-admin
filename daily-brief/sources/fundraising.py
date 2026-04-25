from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .base import utcnow_iso

log = logging.getLogger(__name__)


class FundraisingTracker:
    """Reads fundraising_log.json (maintained in ethan-admin) and surfaces overdue items."""

    name = "fundraising"

    def __init__(self, log_path: str | None = None):
        self.log_path = Path(
            log_path
            or os.environ.get(
                "FUNDRAISING_LOG_PATH",
                str(Path(__file__).resolve().parents[2] / "fundraising_log.json"),
            )
        )

    def fetch(self) -> dict[str, Any]:
        if not self.log_path.exists():
            return {"items": [], "missing_log": True, "generated_at": utcnow_iso()}

        try:
            data = json.loads(self.log_path.read_text())
        except Exception as e:
            log.warning("could not parse fundraising_log.json: %s", e)
            return {"items": [], "error": str(e), "generated_at": utcnow_iso()}

        now = datetime.now(timezone.utc)
        items: list[dict[str, Any]] = []
        for entry in data.get("entries", []):
            last_touch_str = entry.get("last_touch")
            days_since: int | None = None
            try:
                if last_touch_str:
                    last = datetime.fromisoformat(last_touch_str.replace("Z", "+00:00"))
                    if last.tzinfo is None:
                        last = last.replace(tzinfo=timezone.utc)
                    days_since = (now - last).days
            except Exception:
                pass

            overdue_after = entry.get("overdue_after_days", 5)
            is_overdue = days_since is not None and days_since > overdue_after

            items.append(
                {
                    "investor": entry.get("investor"),
                    "stage": entry.get("stage"),
                    "last_touch": last_touch_str,
                    "next_action": entry.get("next_action"),
                    "owner": entry.get("owner"),
                    "days_since_last_touch": days_since,
                    "is_overdue": is_overdue,
                }
            )

        items.sort(
            key=lambda i: (not i["is_overdue"], -(i["days_since_last_touch"] or 0))
        )
        return {"items": items, "generated_at": utcnow_iso()}
