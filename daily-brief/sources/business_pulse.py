from __future__ import annotations

import logging
import os
import statistics
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId
from pymongo import MongoClient

from .base import utcnow_iso

log = logging.getLogger(__name__)


@dataclass
class Metric:
    label: str
    value: float
    yesterday_value: float | None
    trailing_7d_avg: float
    trailing_7d_std: float
    is_anomaly: bool
    direction: str  # "up" | "down" | "flat"
    unit: str = ""

    def to_dict(self) -> dict[str, Any]:
        return self.__dict__


def _zscore(value: float, mean: float, std: float) -> float:
    if std == 0:
        return 0.0
    return (value - mean) / std


def _make_metric(label: str, today: float, history: list[float], unit: str = "") -> Metric:
    mean = statistics.mean(history) if history else 0.0
    std = statistics.pstdev(history) if len(history) >= 2 else 0.0
    yday = history[-1] if history else None
    z = _zscore(today, mean, std)
    direction = "up" if today > mean else "down" if today < mean else "flat"
    return Metric(
        label=label,
        value=today,
        yesterday_value=yday,
        trailing_7d_avg=mean,
        trailing_7d_std=std,
        is_anomaly=abs(z) >= 2.0,
        direction=direction,
        unit=unit,
    )


def _oid_for_date(dt: datetime) -> ObjectId:
    """ObjectId at exact UTC datetime — for $gte/$lt range queries on _id."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return ObjectId.from_datetime(dt)


class BusinessPulse:
    """
    Pulls Sire + Alpine pulse metrics directly from Mongo. Returns a structured
    dict the renderer consumes — not Candidates, this is a pinned section.

    Schema notes (verified 2026-04-25 against prod):
      - `sire.shipments` has NO top-level createdAt. Filter by _id (ObjectId
        encodes creation time). Statuses: CREATED, PRINT, VOIDED.
      - `sire.invoices` has top-level createdAt + isPaid + totalCost.
      - `sire-pay.sessiontrackers` is the parent of a loan application.
        status='success' = originated. Has top-level createdAt + amount.
      - `sire-pay.sessionloans` is one installment per row.
        Statuses: PAID, PENDING, SUCCESS, PARTIAL, FAILED, CHARGEBACK, REFUNDED.
        Has top-level dueDate + createdAt + amount.
    """

    name = "business_pulse"

    def __init__(self, mongo_uri: str | None = None):
        self.mongo_uri = mongo_uri or os.environ["MONGODB_URI"]

    def fetch(self) -> dict[str, Any]:
        try:
            client = MongoClient(self.mongo_uri, serverSelectionTimeoutMS=10000)
            now = datetime.now(timezone.utc)
            day_starts = [
                (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
                for i in range(0, 9)
            ]
            yesterday_start = day_starts[1]  # full day [yesterday 00:00, today 00:00)
            yesterday_end = day_starts[0]

            sire_metrics = self._sire_metrics(client["sire"], day_starts, yesterday_start, yesterday_end)
            alpine_metrics = self._alpine_metrics(
                client["sire-pay"], day_starts, yesterday_start, yesterday_end
            )

            return {
                "generated_at": utcnow_iso(),
                "sire": sire_metrics,
                "alpine": alpine_metrics,
            }
        except Exception as e:
            log.exception("business_pulse failed: %s", e)
            return {"error": str(e), "generated_at": utcnow_iso()}

    # ── Sire ────────────────────────────────────────────────────────────
    def _sire_metrics(self, db, day_starts, yesterday_start, yesterday_end) -> dict[str, Any]:
        shipments = db["shipments"]
        invoices = db["invoices"]

        # 7 prior full days of label counts (oldest→newest, NOT including yesterday)
        label_history: list[float] = []
        revenue_history: list[float] = []
        for i in range(8, 1, -1):  # day_starts[8]..[2] → 7 prior days before yesterday
            start = day_starts[i]
            end = day_starts[i - 1]
            try:
                lc = shipments.count_documents(
                    {
                        "_id": {"$gte": _oid_for_date(start), "$lt": _oid_for_date(end)},
                        "status": {"$in": ["CREATED", "PRINT"]},
                    }
                )
            except Exception:
                lc = 0
            label_history.append(float(lc))

            try:
                agg = list(
                    invoices.aggregate(
                        [
                            {"$match": {"createdAt": {"$gte": start, "$lt": end}, "isPaid": True}},
                            {"$group": {"_id": None, "t": {"$sum": "$totalCost"}}},
                        ]
                    )
                )
                rev = float(agg[0]["t"]) if agg else 0.0
            except Exception:
                rev = 0.0
            revenue_history.append(rev)

        try:
            yday_labels = float(
                shipments.count_documents(
                    {
                        "_id": {
                            "$gte": _oid_for_date(yesterday_start),
                            "$lt": _oid_for_date(yesterday_end),
                        },
                        "status": {"$in": ["CREATED", "PRINT"]},
                    }
                )
            )
        except Exception:
            yday_labels = 0.0

        try:
            agg = list(
                invoices.aggregate(
                    [
                        {
                            "$match": {
                                "createdAt": {"$gte": yesterday_start, "$lt": yesterday_end},
                                "isPaid": True,
                            }
                        },
                        {"$group": {"_id": None, "t": {"$sum": "$totalCost"}}},
                    ]
                )
            )
            yday_revenue = float(agg[0]["t"]) if agg else 0.0
        except Exception:
            yday_revenue = 0.0

        # Top 5 merchants by yesterday's label volume (group by `account`)
        top_merchants: list[dict[str, Any]] = []
        try:
            top_merchants = list(
                shipments.aggregate(
                    [
                        {
                            "$match": {
                                "_id": {
                                    "$gte": _oid_for_date(yesterday_start),
                                    "$lt": _oid_for_date(yesterday_end),
                                },
                                "status": {"$in": ["CREATED", "PRINT"]},
                            }
                        },
                        {"$group": {"_id": "$account", "count": {"$sum": 1}}},
                        {"$sort": {"count": -1}},
                        {"$limit": 5},
                    ]
                )
            )
        except Exception:
            pass

        return {
            "labels_yday": _make_metric(
                "Labels yesterday", yday_labels, label_history, unit="labels"
            ).to_dict(),
            "revenue_yday": _make_metric(
                "Paid invoices yesterday", yday_revenue, revenue_history, unit="$"
            ).to_dict(),
            "top_merchants": [
                {"merchant_id": str(m.get("_id")), "labels": m.get("count", 0)}
                for m in top_merchants
            ],
        }

    # ── Alpine ──────────────────────────────────────────────────────────
    def _alpine_metrics(self, db, day_starts, yesterday_start, yesterday_end) -> dict[str, Any]:
        trackers = db["sessiontrackers"]
        loans = db["sessionloans"]

        # Originations $ — successful sessiontrackers per day
        origination_history: list[float] = []
        for i in range(8, 1, -1):
            start = day_starts[i]
            end = day_starts[i - 1]
            try:
                agg = list(
                    trackers.aggregate(
                        [
                            {
                                "$match": {
                                    "status": "success",
                                    "createdAt": {"$gte": start, "$lt": end},
                                }
                            },
                            {"$group": {"_id": None, "t": {"$sum": "$amount"}}},
                        ]
                    )
                )
                total = float(agg[0]["t"]) if agg else 0.0
            except Exception:
                total = 0.0
            origination_history.append(total)

        try:
            agg = list(
                trackers.aggregate(
                    [
                        {
                            "$match": {
                                "status": "success",
                                "createdAt": {"$gte": yesterday_start, "$lt": yesterday_end},
                            }
                        },
                        {"$group": {"_id": None, "t": {"$sum": "$amount"}, "n": {"$sum": 1}}},
                    ]
                )
            )
            yday_originations = float(agg[0]["t"]) if agg else 0.0
            yday_origination_count = int(agg[0]["n"]) if agg else 0
        except Exception:
            yday_originations = 0.0
            yday_origination_count = 0

        # Delinquency — installments past due that haven't paid out
        now = datetime.now(timezone.utc)
        delinquent = 0
        active_outstanding = 0
        try:
            delinquent = loans.count_documents(
                {
                    "status": {"$in": ["FAILED", "CHARGEBACK"]},
                    "dueDate": {"$lt": now},
                }
            )
            active_outstanding = loans.count_documents(
                {"status": {"$in": ["PENDING", "PARTIAL", "FAILED", "CHARGEBACK"]}}
            )
        except Exception:
            pass
        delinquency_rate = (delinquent / active_outstanding * 100) if active_outstanding else 0.0

        # Newly failed/chargeback installments today
        flipped_today: list[dict[str, Any]] = []
        try:
            flipped_today = list(
                loans.find(
                    {
                        "status": {"$in": ["FAILED", "CHARGEBACK"]},
                        "updatedAt": {"$gte": yesterday_start},
                    },
                    {"_id": 1, "name": 1, "amount": 1, "status": 1, "dueDate": 1},
                ).limit(10)
            )
        except Exception:
            pass

        return {
            "originations_yday": _make_metric(
                "Originations yesterday", yday_originations, origination_history, unit="$"
            ).to_dict(),
            "originations_count_yday": yday_origination_count,
            "delinquency_rate_pct": round(delinquency_rate, 2),
            "delinquent_installments": delinquent,
            "active_installments": active_outstanding,
            "flipped_today": [
                {
                    "id": str(loan.get("_id")),
                    "borrower": loan.get("name", "—"),
                    "amount": float(loan.get("amount", 0)),
                    "status": loan.get("status"),
                }
                for loan in flipped_today
            ],
        }
