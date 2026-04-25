#!/usr/bin/env python3
"""
Daily brief orchestrator. Runs once per day at 10:00 America/New_York via
DO App Platform Cron Job (component: cron.daily-brief, schedule from
daily-brief/do-app-component.yaml).

Writes the rendered HTML + run log to MongoDB `ethan-admin.briefs`.
The Next.js app reads from there and serves at /brief/<slug>.
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import os
import sys
import traceback
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).parent))

from curate import curate  # noqa: E402
from render import render_html  # noqa: E402
from sms import build_teaser, send_failure_sms, send_sms  # noqa: E402
from sources import (  # noqa: E402
    BusinessPulse,
    FundraisingTracker,
    load_news_sources,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("daily-brief")

ROOT = Path(__file__).parent


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true", help="generate but don't text")
    p.add_argument("--force", action="store_true", help="bypass the 10am-ET hour guard")
    args = p.parse_args()

    # override=True so local .env beats any empty/stale values in the shell
    # (e.g. ANTHROPIC_API_KEY="" set by some terminal harnesses).
    load_dotenv(ROOT / ".env", override=True)
    load_dotenv(ROOT.parent / ".env.local", override=False)

    tz = ZoneInfo("America/New_York")
    today = datetime.now(tz)

    # DO App Platform crons run on UTC, no Timezone= directive available.
    # We schedule `0 14,15 * * *` (UTC) so the job fires at 14:00 AND 15:00 UTC
    # daily. Exactly one of those is 10:00 America/New_York year-round:
    #   • Summer (EDT, UTC-4): 14:00 UTC = 10:00 ET → run
    #   • Winter (EST, UTC-5): 15:00 UTC = 10:00 ET → run
    # Skip the wrong-hour invocation. --force bypasses for manual runs.
    if not args.dry_run and not args.force and today.hour != 10:
        log.info("not 10am ET (currently %s) — skipping this invocation", today.strftime("%H:%M %Z"))
        return 0

    iso_date = today.strftime("%Y-%m-%d")
    slug_hash = hashlib.sha256(
        (iso_date + os.environ.get("BRIEF_SECRET", "salt")).encode()
    ).hexdigest()[:4]
    slug = f"{iso_date}-{slug_hash}"
    base_url = os.environ.get("BRIEF_BASE_URL", "")
    brief_url = f"{base_url}/brief/{slug}" if base_url else f"/brief/{slug}"

    mongo_uri = os.environ["MONGODB_URI"]
    mongo = MongoClient(mongo_uri, serverSelectionTimeoutMS=10000)
    briefs_coll = mongo["ethan-admin"]["briefs"]

    run_log: dict = {
        "slug": slug,
        "started_at": today.isoformat(),
        "errors": [],
    }

    try:
        log.info("pulling business pulse")
        try:
            business_pulse = BusinessPulse(mongo_uri).fetch()
        except Exception as e:
            log.exception("business_pulse failed")
            business_pulse = {"error": str(e)}
            run_log["errors"].append({"section": "business_pulse", "error": str(e)})

        log.info("pulling fundraising tracker")
        try:
            fundraising = FundraisingTracker().fetch()
        except Exception as e:
            log.exception("fundraising failed")
            fundraising = {"items": [], "error": str(e)}
            run_log["errors"].append({"section": "fundraising", "error": str(e)})

        candidates = []
        for src in load_news_sources():
            try:
                got = src.fetch()
                log.info("source %s returned %d", src.name, len(got))
                candidates.extend(got)
            except Exception as e:
                log.warning("source %s failed: %s", src.name, e)
                run_log["errors"].append({"source": src.name, "error": str(e)})

        run_log["candidate_count"] = len(candidates)

        log.info("curating %d candidates", len(candidates))
        try:
            curated = curate(candidates, iso_date)
        except Exception as e:
            log.exception("curation failed")
            curated = {"ai_news": [], "stuff_that_affects_my_life": [], "killed": []}
            run_log["errors"].append({"section": "curation", "error": str(e)})

        kept = len(curated.get("ai_news", [])) + len(curated.get("stuff_that_affects_my_life", []))
        run_log["kept_count"] = kept
        run_log["short_warning"] = kept < 3

        one_thing = _derive_one_thing(business_pulse, fundraising, curated)
        ctx = {
            "slug": slug,
            "date_human": today.strftime("%A · %B %-d, %Y"),
            "generated_at_human": today.strftime("%-I:%M %p ET"),
            "one_thing": one_thing,
            "business_pulse": business_pulse,
            "fundraising": fundraising,
            "curated": curated,
        }
        html = render_html(ctx)

        # Persist to Mongo. Next.js reads from here.
        briefs_coll.update_one(
            {"slug": slug},
            {
                "$set": {
                    "slug": slug,
                    "date": iso_date,
                    "html": html,
                    "one_thing": one_thing,
                    "business_pulse": business_pulse,
                    "fundraising": fundraising,
                    "curated": curated,
                    "candidate_count": len(candidates),
                    "kept_count": kept,
                    "errors": run_log["errors"],
                    "generated_at": datetime.now(tz),
                    "candidates": [c.to_dict() for c in candidates],
                }
            },
            upsert=True,
        )
        log.info("wrote brief to mongo: %s", slug)

        teaser = build_teaser(curated, business_pulse, fundraising, brief_url)
        if args.dry_run:
            log.info("DRY RUN — would have sent:\n%s", teaser)
            run_log["sms"] = {"dry_run": True, "teaser": teaser}
        else:
            try:
                sms_result = send_sms(teaser)
                run_log["sms"] = sms_result
            except Exception as e:
                log.exception("twilio send failed terminally")
                run_log["sms"] = {"error": str(e)}
                send_failure_sms(str(e))

        run_log["finished_at"] = datetime.now(tz).isoformat()
        briefs_coll.update_one({"slug": slug}, {"$set": {"run_log": run_log}})
        return 0

    except Exception as e:
        log.exception("unhandled failure")
        try:
            if not args.dry_run:
                send_failure_sms(str(e))
        except Exception:
            pass
        # Still persist what we have so the failure is visible in /brief-tuning
        try:
            briefs_coll.update_one(
                {"slug": slug},
                {
                    "$set": {
                        "slug": slug,
                        "date": iso_date,
                        "errors": run_log.get("errors", []) + [
                            {"unhandled": str(e), "trace": traceback.format_exc()[:2000]}
                        ],
                        "generated_at": datetime.now(tz),
                    }
                },
                upsert=True,
            )
        except Exception:
            pass
        return 1


def _derive_one_thing(business_pulse, fundraising, curated):
    for it in (fundraising or {}).get("items", []):
        if it.get("is_overdue"):
            return f"Follow up with {it['investor']} — {it['days_since_last_touch']} days cold. Next: {it.get('next_action') or '—'}"
    alp = (business_pulse or {}).get("alpine") or {}
    if alp.get("flipped_today"):
        n = len(alp["flipped_today"])
        return f"{n} Alpine installment{'s' if n > 1 else ''} flipped to FAILED/CHARGEBACK overnight. Worth a look at the cohort before noon."
    sire = (business_pulse or {}).get("sire") or {}
    labels = (sire.get("labels_yday") or {})
    if labels.get("is_anomaly"):
        delta = abs(labels.get("value", 0) - labels.get("trailing_7d_avg", 0))
        return f"Sire labels {labels['direction']} {delta:.0f} from 7d avg yesterday. Check what changed."
    ai = curated.get("ai_news") or []
    if ai:
        return ai[0].get("implication") or ai[0]["title"]
    return None


if __name__ == "__main__":
    sys.exit(main())
