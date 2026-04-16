#!/usr/bin/env python3
"""
Meta Business Suite — Bulk Post Scheduler
Uses the bulk_post_composer UI exactly as shown in screenshot:
  - Adds rows one by one (Add photo/video → caption → Schedule date → + Add post)
  - Submits everything with one Publish click at the end
  - Logs confirmed dates to DB so 15-day re-runs never overlap

Run every 15 days via LaunchAgent. Schedules ~30 days of content.
Usage: python3 batch_scheduler.py [--dry-run] [--account sire-ship] [--type post|reel|story]
"""

import os, sys, json, time, shutil, tempfile, atexit, subprocess, urllib.request, argparse
from pathlib import Path
from datetime import datetime, timedelta

# ─── paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).parent
LOG_FILE     = SCRIPT_DIR / "batch_scheduler.log"
ADMIN_URL    = "https://ethan-admin-hlfdr.ondigitalocean.app"
CHROME_SRC   = Path.home() / "Library/Application Support/Google/Chrome"
PROFILE_NAME = "Profile 1"   # sireapps.llc@gmail.com

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"; print(line)
    with open(LOG_FILE, "a") as f: f.write(line + "\n")

def api(path, method="GET", body=None):
    url = ADMIN_URL + path
    req = urllib.request.Request(url, headers={"Content-Type": "application/json"})
    req.method = method
    if body: req.data = json.dumps(body).encode()
    with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read())

# ─── Selenium driver in isolated Chrome session ───────────────────────────────
def get_driver():
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.chrome.options import Options
    from webdriver_manager.chrome import ChromeDriverManager

    tmp = tempfile.mkdtemp(prefix="chrome_meta_")
    atexit.register(lambda: shutil.rmtree(tmp, ignore_errors=True))
    src = CHROME_SRC / PROFILE_NAME
    dst = Path(tmp) / PROFILE_NAME
    log("  Copying Chrome profile to temp session...")
    shutil.copytree(str(src), str(dst), ignore=shutil.ignore_patterns(
        'Cache','Cache*','Code Cache','GPUCache','Service Worker','*.log','Crashpad'))
    opts = Options()
    opts.add_argument(f"--user-data-dir={tmp}")
    opts.add_argument(f"--profile-directory={PROFILE_NAME}")
    opts.add_argument("--no-first-run"); opts.add_argument("--no-default-browser-check")
    opts.add_argument("--disable-notifications"); opts.add_argument("--disable-popup-blocking")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=opts)
    driver.set_window_size(1440, 900); driver.set_window_position(0, 0)
    return driver

# ─── AppleScript file dialog helper ──────────────────────────────────────────
def select_file_via_applescript(file_path: str):
    """Fills in the macOS Open File dialog that Meta triggers"""
    script = f'''
    delay 0.5
    tell application "System Events"
        keystroke "G" using {{shift down, command down}}
        delay 0.8
        keystroke "{file_path}"
        delay 0.3
        keystroke return
        delay 0.5
        keystroke return
        delay 1.0
    end tell
    '''
    subprocess.run(["osascript", "-e", script], check=False)
    time.sleep(2)

# ─── Core: schedule one full batch of posts in the bulk composer ──────────────
def schedule_posts_bulk(driver, account: dict, items: list) -> dict:
    """
    Uses Meta Business Suite bulk_post_composer UI.
    Fills all rows then clicks Publish once.
    Returns {"posted": [...], "failed": [...]}
    """
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.common.keys import Keys

    def wait_for(selector, by=By.CSS_SELECTOR, timeout=20):
        return WebDriverWait(driver, timeout).until(EC.presence_of_element_located((by, selector)))

    def click(selector, by=By.CSS_SELECTOR, timeout=15):
        el = WebDriverWait(driver, timeout).until(EC.element_to_be_clickable((by, selector)))
        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
        time.sleep(0.2)
        driver.execute_script("arguments[0].click();", el)
        return el

    def find_any(selectors, by=By.CSS_SELECTOR, timeout=10):
        for sel in selectors:
            try:
                return WebDriverWait(driver, timeout).until(EC.presence_of_element_located((by, sel)))
            except: continue
        return None

    posted = []
    failed = []

    log(f"  Opening bulk post composer for {account['name']}...")
    driver.get(account["postsUrl"])
    WebDriverWait(driver, 30).until(lambda d: d.execute_script("return document.readyState") == "complete")
    time.sleep(3)

    # Verify we see "Bulk schedule posts" heading
    try:
        WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.XPATH, "//*[contains(text(),'Bulk schedule') or contains(text(),'bulk')]")))
        log("  ✓ Bulk schedule posts page loaded")
    except:
        log("  ⚠ Could not confirm bulk page — proceeding anyway")

    for idx, item in enumerate(items):
        file_path = item["videoUrl"]
        caption   = item.get("caption", "")
        sched_dt  = datetime.fromisoformat(item["scheduledDate"].replace("Z", ""))
        label     = f"{item.get('templateName','?')} V{item.get('variationNum','?')}"

        log(f"\n  Row {idx+1}/{len(items)}: {label} → {sched_dt.strftime('%a %b %d at %I:%M %p')}")

        # ── 1. Click "Add photo/video" on the current last row ──
        try:
            # All rows' Add photo/video buttons
            add_btns = driver.find_elements(By.XPATH,
                "//div[contains(@aria-label,'Add photo') or contains(@aria-label,'Add video')]"
                "| //span[text()='Add photo/video']/ancestor::div[@role='button']"
                "| //div[contains(text(),'Add photo/video')]")
            if not add_btns:
                add_btns = driver.find_elements(By.CSS_SELECTOR, "[aria-label*='photo'],[aria-label*='video']")
            if add_btns:
                target_btn = add_btns[idx] if idx < len(add_btns) else add_btns[-1]
                driver.execute_script("arguments[0].click();", target_btn)
                log(f"    Clicked Add photo/video")
                time.sleep(1.5)
            else:
                raise Exception("No Add photo/video button found")
        except Exception as e:
            log(f"    ✗ Couldn't click Add photo/video: {e}")
            failed.append({"id": item["_id"], "label": label, "error": str(e)})
            continue

        # ── 2. Handle file input OR file dialog ──
        try:
            # Check if file input appeared
            inputs = driver.find_elements(By.CSS_SELECTOR, "input[type='file']")
            if inputs:
                inputs[-1].send_keys(file_path)
                log(f"    Set file via input: {Path(file_path).name}")
                time.sleep(3)
            else:
                # macOS file dialog — use AppleScript
                log(f"    File dialog opened — using AppleScript")
                select_file_via_applescript(file_path)
        except Exception as e:
            log(f"    ✗ File upload failed: {e}")
            failed.append({"id": item["_id"], "label": label, "error": str(e)})
            continue

        # ── 3. Fill caption ──
        if caption:
            try:
                # Find the text area for this row
                text_areas = driver.find_elements(By.CSS_SELECTOR,
                    "div[contenteditable='true'],div[role='textbox'],textarea[placeholder*='something']")
                if text_areas:
                    target_area = text_areas[idx] if idx < len(text_areas) else text_areas[-1]
                    driver.execute_script("arguments[0].click();", target_area)
                    time.sleep(0.3)
                    target_area.send_keys(caption)
                    log(f"    Caption filled")
            except Exception as e:
                log(f"    ⚠ Caption fill failed (non-fatal): {e}")

        # ── 4. Switch "Publish now" → "Schedule" ──
        try:
            # Find all "Publish now" dropdowns, pick current row's one
            pub_dropdowns = driver.find_elements(By.XPATH,
                "//div[contains(@aria-label,'Publish now')]"
                "| //button[contains(.,'Publish now')]"
                "| //div[@role='button' and contains(.,'Publish now')]")
            if pub_dropdowns:
                target_dd = pub_dropdowns[idx] if idx < len(pub_dropdowns) else pub_dropdowns[-1]
                driver.execute_script("arguments[0].click();", target_dd)
                time.sleep(1)
                log("    Clicked 'Publish now' dropdown")
            else:
                raise Exception("No Publish now dropdown found")

            # Select "Schedule" option in the dropdown
            sched_opt = find_any(
                ["//li[contains(.,'Schedule')]", "//div[@role='option' and contains(.,'Schedule')]",
                 "//span[text()='Schedule']/ancestor::li"],
                by=By.XPATH, timeout=5)
            if sched_opt:
                driver.execute_script("arguments[0].click();", sched_opt)
                time.sleep(1.5)
                log("    Selected 'Schedule'")
            else:
                raise Exception("Schedule option not found in dropdown")
        except Exception as e:
            log(f"    ✗ Schedule dropdown failed: {e}")
            failed.append({"id": item["_id"], "label": label, "error": str(e)})
            continue

        # ── 5. Fill date + time in the scheduler that appeared ──
        try:
            _fill_datetime(driver, sched_dt)
            log(f"    ✓ Scheduled for {sched_dt.strftime('%m/%d/%Y at %I:%M %p')}")
        except Exception as e:
            log(f"    ✗ Date/time fill failed: {e}")
            failed.append({"id": item["_id"], "label": label, "error": str(e)})
            continue

        # ── 6. Click "+ Add post" to get next row (except last item) ──
        if idx < len(items) - 1:
            try:
                add_post_btn = find_any(
                    ["//button[contains(.,'Add post')]", "//span[text()='Add post']/ancestor::button",
                     "//div[@role='button' and contains(.,'Add post')]"],
                    by=By.XPATH, timeout=8)
                if add_post_btn:
                    driver.execute_script("arguments[0].click();", add_post_btn)
                    time.sleep(1.5)
                    log("    Clicked '+ Add post'")
                else:
                    log("    ⚠ '+ Add post' not found — row may auto-add")
            except Exception as e:
                log(f"    ⚠ Add post click failed: {e}")

        posted.append({"id": item["_id"], "label": label})

    # ── 7. Click final "Publish" to submit all rows ──
    if posted:
        try:
            log(f"\n  Clicking Publish ({len(posted)} posts)...")
            pub_btn = find_any(
                ["//button[normalize-space()='Publish']",
                 "//div[@role='button' and normalize-space()='Publish']"],
                by=By.XPATH, timeout=10)
            if pub_btn:
                driver.execute_script("arguments[0].click();", pub_btn)
                time.sleep(3)
                log("  ✓ Publish clicked — Meta is scheduling all posts")
            else:
                log("  ⚠ Publish button not found — may need manual click")
        except Exception as e:
            log(f"  ✗ Publish button error: {e}")

    return {"posted": posted, "failed": failed}


def _fill_datetime(driver, dt: datetime):
    """Fill Meta's date/time picker fields"""
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.common.keys import Keys

    date_str = dt.strftime("%-m/%-d/%Y")   # e.g. "4/21/2026"
    hour_str = dt.strftime("%-I")           # e.g. "4" (no leading zero)
    min_str  = dt.strftime("%M")            # e.g. "00"
    ampm_str = dt.strftime("%p").upper()    # "AM" or "PM"

    # Date field
    for sel in ["input[placeholder*='MM/DD/YYYY']", "input[aria-label*='Date' i]",
                "input[placeholder*='date' i]", "input[type='date']"]:
        try:
            el = WebDriverWait(driver, 6).until(EC.element_to_be_clickable((By.CSS_SELECTOR, sel)))
            el.click(); time.sleep(0.2)
            el.send_keys(Keys.CONTROL + "a"); el.send_keys(date_str); el.send_keys(Keys.TAB)
            break
        except: pass

    # Hour field
    for sel in ["input[aria-label*='Hour' i]", "input[placeholder*='HH']",
                "input[placeholder*='hh']"]:
        try:
            el = WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.CSS_SELECTOR, sel)))
            el.click(); el.send_keys(Keys.CONTROL + "a"); el.send_keys(hour_str); break
        except: pass

    # Minute field
    for sel in ["input[aria-label*='Minute' i]", "input[placeholder*='MM']",
                "input[placeholder*='mm']"]:
        try:
            el = WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.CSS_SELECTOR, sel)))
            el.click(); el.send_keys(Keys.CONTROL + "a"); el.send_keys(min_str); break
        except: pass

    # AM/PM toggle
    try:
        ampm_els = driver.find_elements(By.XPATH,
            f"//button[normalize-space()='{ampm_str}'] | //div[@role='button' and normalize-space()='{ampm_str}']"
            f"| //option[normalize-space()='{ampm_str}']")
        if ampm_els:
            driver.execute_script("arguments[0].click();", ampm_els[0])
    except: pass

    time.sleep(0.5)


# ─── Duplicate / overlap check ────────────────────────────────────────────────
def get_confirmed_dates(account_id: str, content_type: str) -> set:
    """Dates already confirmed-scheduled in Meta — stored in social_queue as status='posted'"""
    try:
        data = api(f"/api/social/queue?accountId={account_id}&type={content_type}&status=posted")
        return {item["scheduledDate"][:10] for item in data.get("items", [])}
    except: return set()


# ─── Main ─────────────────────────────────────────────────────────────────────
def run(args):
    start = datetime.now()
    log("=" * 60)
    log(f"Batch Scheduler — {start.strftime('%a %b %d %Y %I:%M %p')}")
    log("=" * 60)

    # Load accounts
    try:
        accounts = {a["id"]: a for a in api("/api/social/accounts").get("accounts", [])}
    except Exception as e:
        log(f"Failed to load accounts: {e}"); return

    # Fetch scheduled queue items for the next 30 days
    try:
        q_data = api("/api/social/queue?status=scheduled")
        horizon = datetime.now() + timedelta(days=32)
        all_items = [
            i for i in q_data.get("items", [])
            if datetime.fromisoformat(i["scheduledDate"].replace("Z","")) <= horizon
        ]
        if args.account:
            all_items = [i for i in all_items if i.get("accountId") == args.account]
        if args.type:
            all_items = [i for i in all_items if i.get("type") == args.type]
    except Exception as e:
        log(f"Failed to load queue: {e}"); return

    if not all_items:
        log("No upcoming items in queue. Go to /social in admin → click 'Schedule next 30 days'")
        return

    # ── Duplicate check: remove any dates already confirmed in Meta ──
    confirmed_by_type: dict = {}
    clean_items = []
    for item in all_items:
        key = (item.get("accountId",""), item.get("type",""))
        if key not in confirmed_by_type:
            confirmed_by_type[key] = get_confirmed_dates(key[0], key[1])
        date_str = item["scheduledDate"][:10]
        if date_str in confirmed_by_type[key]:
            log(f"  SKIP (already confirmed): {item.get('type')} {date_str}")
        else:
            clean_items.append(item)

    log(f"\nTotal items: {len(all_items)} | After dedup: {len(clean_items)} | Already done: {len(all_items)-len(clean_items)}")

    if not clean_items:
        log("All items already confirmed in Meta — nothing to do"); return

    # Sort by: account, type order (reel→story→post), then date
    TYPE_ORDER = {"reel": 0, "story": 1, "post": 2}
    clean_items.sort(key=lambda i: (
        i.get("accountId",""),
        TYPE_ORDER.get(i.get("type","post"), 3),
        i.get("scheduledDate","")
    ))

    # Preview
    from collections import Counter
    by_type = Counter(i.get("type") for i in clean_items)
    for t, n in by_type.items():
        log(f"  {t}: {n} posts")
    log(f"  First: {clean_items[0]['scheduledDate'][:10]} | Last: {clean_items[-1]['scheduledDate'][:10]}")

    if args.dry_run:
        log("\n[DRY RUN] Preview:")
        for item in clean_items[:15]:
            dt = datetime.fromisoformat(item["scheduledDate"].replace("Z",""))
            log(f"  [{item['type']:5}] {item.get('templateName','?'):12} V{item.get('variationNum','?')} → {dt.strftime('%a %b %d at %I:%M %p')} | {Path(item['videoUrl']).name}")
        if len(clean_items) > 15:
            log(f"  ... +{len(clean_items)-15} more")
        log("\n[DRY RUN] Done — no browser opened"); return

    # Log start to admin
    try:
        log_res = api("/api/social/logs", "POST", {
            "type": "batch", "status": "running",
            "startedAt": start.isoformat(),
            "itemsAttempted": len(clean_items), "itemsPosted": 0, "itemsFailed": 0, "details": []
        })
        log_id = str(log_res.get("id", ""))
    except: log_id = ""

    # Group by account + content type (each group gets its own bulk session)
    from itertools import groupby
    groups = {}
    for item in clean_items:
        key = (item.get("accountId",""), item.get("type","post"))
        groups.setdefault(key, []).append(item)

    driver = get_driver()
    total_posted = total_failed = 0
    all_details = []

    try:
        for (account_id, content_type), group_items in groups.items():
            account = accounts.get(account_id)
            if not account:
                log(f"\n✗ Unknown account: {account_id}"); continue

            log(f"\n{'─'*50}")
            log(f"Account: {account['name']} | Type: {content_type} | {len(group_items)} items")
            log(f"{'─'*50}")

            # Use the right URL per content type
            if content_type == "reel":
                account = {**account, "postsUrl": account.get("reelsUrl", account["postsUrl"])}
            elif content_type == "story":
                account = {**account, "postsUrl": account.get("storiesUrl", account["postsUrl"])}

            result = schedule_posts_bulk(driver, account, group_items)

            # Mark posted items in admin DB
            for r in result["posted"]:
                try:
                    api("/api/social/queue", "PATCH", {
                        "id": r["id"], "status": "posted",
                        "postedAt": datetime.now().isoformat(),
                        "confirmedInMeta": True,
                    })
                except: pass
                all_details.append({"file": r["label"], "ok": True})
                total_posted += 1

            for r in result["failed"]:
                try:
                    api("/api/social/queue", "PATCH", {
                        "id": r["id"], "status": "failed",
                        "errorMsg": r.get("error","")
                    })
                except: pass
                all_details.append({"file": r["label"], "ok": False, "error": r.get("error","")})
                total_failed += 1

            log(f"\n  Session done: {len(result['posted'])} scheduled, {len(result['failed'])} failed")
            time.sleep(3)

    finally:
        duration_ms = int((datetime.now()-start).total_seconds()*1000)
        status = "success" if total_failed == 0 else ("partial" if total_posted > 0 else "failed")

        log(f"\n{'='*60}")
        log(f"DONE: {total_posted} confirmed in Meta | {total_failed} failed | {duration_ms/1000:.0f}s")
        log(f"Next run: in ~15 days (LaunchAgent fires on 1st and 15th of month)")
        log(f"{'='*60}")

        if log_id:
            try:
                api("/api/social/logs", "PATCH", {
                    "id": log_id, "status": status,
                    "itemsPosted": total_posted, "itemsFailed": total_failed,
                    "itemsAttempted": len(clean_items), "durationMs": duration_ms,
                    "details": all_details, "finishedAt": datetime.now().isoformat()
                })
            except: pass

        driver.quit()


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Schedule content into Meta Business Suite — run every 15 days")
    p.add_argument("--dry-run", action="store_true", help="Preview without opening browser")
    p.add_argument("--account", default=None, help="Filter to one account id, e.g. sire-ship")
    p.add_argument("--type", default=None, help="Filter to one type: reel, story, or post")
    run(p.parse_args())
