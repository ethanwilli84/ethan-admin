from __future__ import annotations

import logging
import os
import time

log = logging.getLogger(__name__)


def send_sms(body: str) -> dict:
    """Send via Twilio. Retries 3x with backoff. Falls back to plain failure SMS on persistent failure."""
    sid = os.environ["TWILIO_ACCOUNT_SID"]
    token = os.environ["TWILIO_AUTH_TOKEN"]
    from_num = os.environ["TWILIO_FROM_NUMBER"]
    to_num = os.environ.get("BRIEF_TO_NUMBER", "+17346645129")

    from twilio.rest import Client

    client = Client(sid, token)
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            msg = client.messages.create(body=body, from_=from_num, to=to_num)
            return {"sid": msg.sid, "status": msg.status, "attempt": attempt + 1}
        except Exception as e:
            last_err = e
            log.warning("twilio send attempt %s failed: %s", attempt + 1, e)
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Twilio send failed after 3 attempts: {last_err}")


def send_failure_sms(reason: str) -> None:
    try:
        send_sms(f"brief failed: {reason[:140]}")
    except Exception as e:
        log.error("could not send failure SMS: %s", e)


def build_teaser(curated: dict, business_pulse: dict, fundraising: dict, brief_url: str) -> str:
    """3-5 line teaser. Keep under ~320 chars (2 SMS segments)."""
    lines: list[str] = ["📰 Daily brief"]

    # The one thing surface
    one = _derive_one_thing(business_pulse, fundraising, curated)
    if one:
        lines.append(f"• {one}")

    ai = curated.get("ai_news") or []
    if ai:
        lines.append(f"• AI: {ai[0]['title'][:80]}")

    life = curated.get("stuff_that_affects_my_life") or []
    if life:
        lines.append(f"• {life[0]['title'][:80]}")

    lines.append(brief_url)
    return "\n".join(lines)


def _derive_one_thing(business_pulse: dict, fundraising: dict, curated: dict) -> str | None:
    # Priority: overdue fundraising > biz anomaly > top news
    for it in (fundraising or {}).get("items", []):
        if it.get("is_overdue"):
            return f"Follow up {it['investor']} ({it['days_since_last_touch']}d cold)"

    alp = (business_pulse or {}).get("alpine") or {}
    if alp.get("flipped_to_30dpd_today"):
        n = len(alp["flipped_to_30dpd_today"])
        return f"{n} Alpine loan{'s' if n > 1 else ''} flipped 30+ DPD"

    sire = (business_pulse or {}).get("sire") or {}
    labels = sire.get("labels_yday") or {}
    if labels.get("is_anomaly"):
        return f"Sire labels {labels['direction']} vs avg ({int(labels['value']):,})"

    ai = curated.get("ai_news") or []
    if ai:
        return ai[0]["title"][:90]

    return None
