# Deploying daily-brief

Everything runs server-side on **DO App Platform** — no droplet needed,
no dependency on your laptop being on. Briefs are stored in MongoDB and
served by ethan-admin's Next.js app at `/brief/<slug>`.

## Architecture

```
┌─────────────────────────┐                ┌──────────────────────┐
│ DO App Platform App     │                │ MongoDB (existing)   │
│  ethan-admin-hlfdr      │                │  ethan-admin         │
│                         │                │   .briefs            │
│  • Service: Next.js     │  ─── reads ──▶ │   .brief_feedback    │
│      (existing)         │                │   .brief_sources     │
│                         │                │                      │
│  • Job (CRON):          │  ─── writes ──▶│  sire (read-only)    │
│      daily-brief        │                │  sire-pay (read-only)│
│      14:00 UTC daily    │                │                      │
│                         │                └──────────────────────┘
│  • Job (CRON):          │
│      daily-brief-       │
│      consolidate        │
│      Mon 03:00 UTC      │
└─────────────────────────┘
                │
                └─── Twilio API → SMS to Ethan
```

## One-time setup

### 1. Push the code

The new code is in `daily-brief/`, plus new Next.js routes/pages, plus
sidebar entries. Commit and push:

```bash
git -C ~/influence-admin add .
git -C ~/influence-admin commit -m "feat: daily-brief system"
git -C ~/influence-admin push origin main
```

App Platform auto-deploys the Next.js Service on push.

### 2. Add the Cron Job components to the App Platform spec

```bash
# Pull current spec
doctl apps spec get 40dc1fb0-f772-428d-84d6-67097b5ac703 > /tmp/app.yaml

# Open /tmp/app.yaml and add the two `jobs:` entries from
#   daily-brief/do-app-component.yaml
# (or replace the file's `jobs:` section with that block)

# Apply
doctl apps update 40dc1fb0-f772-428d-84d6-67097b5ac703 --spec /tmp/app.yaml
```

### 3. Set the secrets in App Platform

The job spec references SECRET-typed env vars. Set them in the DO console
or via doctl:

```bash
# In DO console: App → Settings → daily-brief job → Edit env
# Set (or inherit from app-level shared envs):
#   ANTHROPIC_API_KEY     (same as the Next.js Service uses)
#   MONGODB_URI           (same)
#   TWILIO_ACCOUNT_SID    (live SID from Twilio console)
#   TWILIO_AUTH_TOKEN     (auth token — keep secret, rotate periodically)
#   BRIEF_SECRET          (copied from daily-brief/.env on your laptop)
```

`BRIEF_SECRET` was already generated and is in your local
`daily-brief/.env`. Use the same value in App Platform so slug hashes
match between local dry-runs and production.

### 4. Seed the news sources (one-time)

```bash
cd ~/influence-admin
python3 -m venv daily-brief/.venv
daily-brief/.venv/bin/pip install -r daily-brief/requirements.txt
daily-brief/.venv/bin/python daily-brief/seed_sources.py
```

Adds 16 RSS feeds (AI labs, X accounts via RSSHub, BNPL/CFPB, sneakers,
NYC, YC) to the `brief_sources` Mongo collection. Edit later from
`/brief-sources` in ethan-admin.

### 5. Local dry run

To preview the brief without sending SMS:

```bash
daily-brief/.venv/bin/python daily-brief/run.py --dry-run
```

This pulls all sources, runs the Claude curation, renders the HTML, and
writes to Mongo `briefs` collection. Open
`https://ethan-admin-hlfdr.ondigitalocean.app/brief/<slug>` (slug printed
in stdout) to inspect.

### 6. Trigger the first real run from App Platform

After dry-run looks good:

```bash
# Trigger the cron job manually (instead of waiting for 14:00 UTC)
doctl apps create-deployment 40dc1fb0-f772-428d-84d6-67097b5ac703
# Or in the DO console: App → daily-brief job → Run now
```

You'll get an SMS within ~60s.

## Schedule

DO App Platform CRON syntax is **UTC** and does not honor timezone.
Implications:

- `0 14 * * *` (14:00 UTC) → 10:00 EDT (Mar–Nov) / 9:00 EST (Nov–Mar)
- `0 3 * * 1` (Mondays 03:00 UTC) → Sun 23:00 EDT / Sun 22:00 EST

If you want exactly 10am ET year-round, switch to `0 14 * * *` Mar–Oct
and `0 15 * * *` Nov–Feb (manually update twice a year — annoying), OR
switch to `0 14,15 * * *` and have `run.py` skip the second run if it
already wrote a brief for today (cleaner — let me know if you want this).

## Optional: self-host RSSHub

The seeded X-account sources point to `https://rsshub.app`, the public
instance. It's free but rate-limited and occasionally down. If reliability
matters, self-host RSSHub as another component in the same App Platform app:

```yaml
# Append to your app.yaml services:
  - name: rsshub
    image:
      registry_type: DOCKER_HUB
      registry: diygod
      repository: rsshub
      tag: latest
    instance_size_slug: basic-xxs
    instance_count: 1
    http_port: 1200
    internal_ports: [1200]
```

Then set `RSSHUB_BASE=http://rsshub:1200` in the daily-brief job env, and
update existing X sources via the Brief Sources tab. ~$5/mo.

## Updating

Push to `main`. App Platform redeploys both the Next.js service AND the
cron jobs (`deploy_on_push: true` is set in the job component). The
next scheduled run uses the new code.

## Logs

```bash
# Tail recent runs
doctl apps logs 40dc1fb0-f772-428d-84d6-67097b5ac703 --component daily-brief --tail

# Or in the DO console: App → daily-brief job → Logs
```

Per-run output is also stored in Mongo `briefs.<slug>.run_log`. Visible
from `/brief-tuning` in ethan-admin.
