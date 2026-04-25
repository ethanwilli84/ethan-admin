# daily-brief

Daily SMS+web brief for Ethan. Runs on the DO droplet via systemd timer, renders an HTML brief served by ethan-admin's Next.js app at `/brief/<slug>`, and texts Ethan a teaser + link.

## Architecture

```
daily-brief/                        # Python generator, lives in ethan-admin repo
├── run.py                          # orchestrator
├── sources/                        # one file per source, common Source interface
├── prompts/curation.md             # editable system prompt
├── prompts/learned_rules.md        # produced by weekly consolidation pass
├── templates/brief.html.j2         # Jinja2 template
├── runs/YYYY-MM-DD.json            # full run log (candidates, scores, decisions)
└── systemd/                        # unit + timer files for the DO droplet
```

The Python generator writes rendered HTML + PDF to `/var/www/brief/` on the
droplet. ethan-admin's Next.js app serves them at `/brief/<slug>` (HTML) and
`/brief/<slug>.pdf` (PDF), plus `/brief/` index and `/api/brief/feedback`.

Inline 👍/👎/note feedback POSTs to `/api/brief/feedback` and is written to
the `brief_feedback` Mongo collection. The curation module reads the last
30 days of feedback at run time. A weekly consolidation Claude pass
produces `prompts/learned_rules.md` to keep the prompt coherent forever.

## Schedule

- Daily brief: `OnCalendar=*-*-* 10:00:00`, `Timezone=America/New_York`
- Weekly consolidation: Sundays 23:00 America/New_York

## Env (in `/etc/daily-brief/.env` on the droplet)

- `ANTHROPIC_API_KEY`
- `MONGODB_URI` (read-write, `ethan-admin` and `sire` DBs)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `BRIEF_TO_NUMBER` (defaults to +17346645129)
- `BRIEF_BASE_URL` (e.g. `https://admin.<host>`)
- `SLACK_FAILURE_WEBHOOK`
- `BRIEF_OUTPUT_DIR` (defaults to `/var/www/brief`)
