export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

const GH_TOKEN = process.env.GITHUB_TOKEN!
const GH_USER = 'ethanwilli84'
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!

export const LOCAL_PROJECTS = [
  {
    id: 'local-pirateship', name: 'pirateship-pickup', private: true, language: 'Python',
    languages: ['Python','Shell'], url: null, cloneUrl: null,
    updatedAt: new Date().toISOString(), createdAt: '2025-01-01T00:00:00Z',
    defaultBranch: 'main', lastCommit: null, stars: 0, topics: ['automation','pirateship','ups','launchagent'],
    description: 'Automated UPS pickup scheduler for Las Vegas warehouse',
    summary: 'macOS LaunchAgent that auto-schedules UPS pickups on Pirate Ship for a client warehouse in Las Vegas. Runs Fri/Sat/Sun via LaunchAgent, schedules Mon-Fri pickups using Pirate Ship GraphQL API via Chrome session cookies.',
    domain: null, host: 'macOS LaunchAgent (runs locally)',
    deployCmd: 'launchctl load ~/Library/LaunchAgents/com.sire.pirateship-pickup.plist',
    editInstructions: 'Files at ~/scripts/pirateship-pickup/\n• scheduler.py — main script, edit WAREHOUSE_ID/PACKAGE_COUNT/times\n• com.sire.pirateship-pickup.plist — LaunchAgent config\n• Reload: launchctl unload then load the plist\n• Requires Chrome logged into Pirate Ship for session cookies\n• Logs to scheduler.log',
    localPath: '/Users/ethanwilliams/scripts/pirateship-pickup', isLocal: true,
  },
  {
    id: 'local-imessage-sync', name: 'imessage-issue-sync', private: true, language: 'Python',
    languages: ['Python'], url: null, cloneUrl: null,
    updatedAt: new Date().toISOString(), createdAt: '2025-01-01T00:00:00Z',
    defaultBranch: 'main', lastCommit: null, stars: 0, topics: ['automation','imessage','issues'],
    description: 'iMessage to admin dashboard issue sync',
    summary: 'macOS LaunchAgent reading iMessage SQLite DB every 30min, finding messages with Sire/Alpine keywords, POSTing to ethan-admin for AI classification. Powers the Issues page in the admin.',
    domain: null, host: 'macOS LaunchAgent (runs locally)',
    deployCmd: 'launchctl load ~/Library/LaunchAgents/com.ethan.imessage-sync.plist',
    editInstructions: 'Files at ~/scripts/issue-sync/\n• imessage-sync.py — reads ~/Library/Messages/chat.db via sqlite3\n• Edit KEYWORDS list to add/remove issue triggers\n• Requires Full Disk Access in System Settings > Privacy\n• Reload: launchctl unload then load the plist',
    localPath: '/Users/ethanwilliams/scripts/issue-sync', isLocal: true,
  },
  {
    id: 'local-alpine-api', name: 'alpine-merchant-api', private: true, language: 'TypeScript',
    languages: ['TypeScript','JavaScript'], url: null, cloneUrl: null,
    updatedAt: new Date().toISOString(), createdAt: '2024-01-01T00:00:00Z',
    defaultBranch: 'main', lastCommit: null, stars: 0, topics: ['alpine','bnpl','fintech','api'],
    description: 'Alpine BNPL merchant API backend',
    summary: 'Core backend API for Alpine — the BNPL/consumer lending platform. Nx monorepo with Express + MongoDB. Handles merchant onboarding, session loans, Plaid ACH, Moov payouts, Converge payment processing, and seller-facing checkout API.',
    domain: 'https://api.alpinemerchant.com', host: 'Unknown — check package.json',
    deployCmd: 'Check package.json scripts or Dockerfile for deploy config',
    editInstructions: 'Files at ~/Projects/alpine-merchant-api/\n• Nx monorepo — run: nx serve <app-name>\n• check apps/ folder for individual services\n• Package manager: pnpm (run pnpm install)\n• Env vars: check .env or deployment platform',
    localPath: '/Users/ethanwilliams/Projects/alpine-merchant-api', isLocal: true,
  },
  {
    id: 'local-sms-me', name: 'sms-me', private: true, language: 'JavaScript',
    languages: ['JavaScript'], url: null, cloneUrl: null,
    updatedAt: '2024-01-01T00:00:00Z', createdAt: '2024-01-01T00:00:00Z',
    defaultBranch: 'main', lastCommit: null, stars: 0, topics: ['twilio','sms','notifications'],
    description: 'Twilio SMS notification script',
    summary: 'Node.js Twilio script that sends SMS to phone (+17346645129). Called by other automation scripts to alert when input is needed. Simple single-file utility.',
    domain: null, host: 'Local script — called by other scripts',
    deployCmd: 'node sms-me.js "your message here"',
    editInstructions: 'File at ~/Projects/sms-me.js\n• Edit fromNumber/toNumber at top\n• Install: npm install twilio\n• Usage: node ~/Projects/sms-me.js "message"',
    localPath: '/Users/ethanwilliams/Projects/sms-me.js', isLocal: true,
  },
  {
    id: 'local-mihype', name: 'mihype-scraper', private: true, language: 'Python',
    languages: ['Python'], url: null, cloneUrl: null,
    updatedAt: '2023-01-01T00:00:00Z', createdAt: '2023-01-01T00:00:00Z',
    defaultBranch: 'main', lastCommit: null, stars: 0, topics: ['scraping','selenium'],
    description: 'MiHype account data scraper',
    summary: 'Selenium-based Python scraper for MiHype accounts. Uses ChromeDriver to authenticate and extract account data. Edit target.txt for target accounts.',
    domain: null, host: 'Local script',
    deployCmd: 'python3 scrape.py',
    editInstructions: 'Files at ~/Desktop/MiHype/\n• scrape.py — Selenium scraper, edit target.txt for accounts\n• Install: pip install selenium webdriver-manager requests',
    localPath: '/Users/ethanwilliams/Desktop/MiHype', isLocal: true,
  },
  {
    id: 'local-gvoice', name: 'google-voice-importer', private: true, language: 'Python',
    languages: ['Python'], url: null, cloneUrl: null,
    updatedAt: new Date().toISOString(), createdAt: '2025-01-01T00:00:00Z',
    defaultBranch: 'main', lastCommit: null, stars: 0, topics: ['google-voice','sms','issues'],
    description: 'Google Voice Takeout message importer',
    summary: 'Parses Google Voice Takeout HTML exports to import full SMS threads into the admin issues database. Captures outgoing messages that iMessage sync misses.',
    domain: null, host: 'Local script (run manually after Takeout export)',
    deployCmd: 'python3 google-voice-import.py',
    editInstructions: 'File at ~/scripts/issue-sync/google-voice-import.py\n• Download Google Voice Takeout from takeout.google.com\n• Run script pointing at downloaded HTML files',
    localPath: '/Users/ethanwilliams/scripts/issue-sync/google-voice-import.py', isLocal: true,
  },
]

const KNOWN_HOSTING: Record<string, { domain?: string; host?: string; deployCmd?: string; editInstructions?: string }> = {
  'ethan-admin': {
    domain: 'https://ethan-admin-hlfdr.ondigitalocean.app',
    host: 'DigitalOcean App Platform',
    deployCmd: 'git push origin main → auto-deploys via DO',
    editInstructions: 'Clone repo, run npm install && npm run dev, push to main to deploy. DO App ID: 40dc1fb0-f772-428d-84d6-67097b5ac703',
  },
  'influence-outreach': {
    host: 'GitHub Actions (cron)',
    deployCmd: 'git push origin main → runs via GH Actions daily_outreach.yml at 10 AM EDT',
    editInstructions: 'Clone repo, edit main.py or src/ files, push to main. Secrets in repo Settings > Secrets.',
  },
  'alpine-slack-bot': {
    host: 'Unknown — check for Dockerfile or deploy config in repo',
  },
  'slack-seller-report': {
    host: 'GitHub Actions (cron)',
    deployCmd: 'git push origin main → GH Actions cron',
    editInstructions: 'Clone repo, edit JS files, push to main. Check .github/workflows/ for schedule.',
  },
  'sire-access-landing': {
    host: 'Vercel',
    editInstructions: 'Clone repo, edit HTML directly (fully static). Push to main → Vercel auto-deploys.',
  },
  'investor-portal': {
    host: 'Unknown — private repo',
  },
  'v': {
    host: 'Remotion / local video rendering',
    editInstructions: 'Clone repo, run npm install && npx remotion studio. Render: npx remotion render',
  },
}

async function ghFetch(path: string) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `token ${GH_TOKEN}`, Accept: 'application/vnd.github.v3+json' }
  })
  if (!res.ok) return null
  return res.json()
}

async function generateSummary(repo: Record<string, unknown>, readme: string): Promise<string> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 120,
        messages: [{ role: 'user', content: `2-3 sentence summary of this GitHub repo for a personal admin dashboard. What does it do, why does it exist, what problem does it solve?\nRepo: ${repo.name}\nLanguage: ${repo.language}\nDescription: ${repo.description || 'none'}\nREADME: ${readme.substring(0, 600)}\nReturn only the summary.` }]
      })
    })
    const d = await res.json()
    return d.content?.[0]?.text?.trim() || (repo.description as string) || 'No description.'
  } catch { return (repo.description as string) || 'No description.' }
}

export async function GET(req: NextRequest) {
  const db = await getDb()
  const forceRefresh = req.nextUrl.searchParams.get('refresh') === '1'

  if (!forceRefresh) {
    const cached = await db.collection('projects_cache').findOne({ _id: 'github' as unknown as import('mongodb').ObjectId })
    if (cached && (Date.now() - new Date(cached.cachedAt).getTime()) < 6 * 60 * 60 * 1000) {
      return NextResponse.json({ ok: true, projects: [...cached.projects, ...LOCAL_PROJECTS], cachedAt: cached.cachedAt, fromCache: true })
    }
  }

  const repos = await ghFetch(`/user/repos?per_page=100&sort=updated&type=owner`) || []
  const projects = []

  for (const repo of repos) {
    let readme = ''
    try {
      const rm = await ghFetch(`/repos/${GH_USER}/${repo.name}/readme`)
      if (rm?.content) readme = Buffer.from(rm.content, 'base64').toString('utf-8').substring(0, 800)
    } catch {}

    let lastCommit = null
    try {
      const commits = await ghFetch(`/repos/${GH_USER}/${repo.name}/commits?per_page=1`)
      if (commits?.[0]) lastCommit = { sha: commits[0].sha?.substring(0, 7), message: commits[0].commit?.message?.split('\n')[0]?.substring(0, 80), date: commits[0].commit?.author?.date, author: commits[0].commit?.author?.name }
    } catch {}

    let languages: Record<string, number> = {}
    try { languages = await ghFetch(`/repos/${GH_USER}/${repo.name}/languages`) || {} } catch {}

    const summary = await generateSummary(repo, readme)
    const hosting = KNOWN_HOSTING[repo.name] || {}

    projects.push({
      id: repo.id, name: repo.name, fullName: repo.full_name, description: repo.description || '',
      summary, url: repo.html_url, cloneUrl: repo.clone_url, private: repo.private,
      language: repo.language, languages: Object.keys(languages).slice(0, 4),
      stars: repo.stargazers_count, updatedAt: repo.updated_at, createdAt: repo.created_at,
      defaultBranch: repo.default_branch, lastCommit,
      domain: hosting.domain || null, host: hosting.host || null,
      deployCmd: hosting.deployCmd || null, editInstructions: hosting.editInstructions || null,
      topics: repo.topics || [], isLocal: false,
    })
  }

  await db.collection('projects_cache').updateOne(
    { _id: 'github' as unknown as import('mongodb').ObjectId },
    { $set: { projects, cachedAt: new Date() } },
    { upsert: true }
  )

  return NextResponse.json({ ok: true, projects: [...projects, ...LOCAL_PROJECTS], cachedAt: new Date(), fromCache: false })
}

export async function PATCH(req: NextRequest) {
  const { name, domain, host, deployCmd, editInstructions } = await req.json()
  const db = await getDb()
  await db.collection('projects_overrides').updateOne(
    { name }, { $set: { name, domain, host, deployCmd, editInstructions, updatedAt: new Date() } }, { upsert: true }
  )
  return NextResponse.json({ ok: true })
}
