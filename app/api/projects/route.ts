export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

const GH_TOKEN = process.env.GITHUB_TOKEN!
const GH_USER = 'ethanwilli84'
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!

// Known hosting/domain info for each repo
const KNOWN_HOSTING: Record<string, { domain?: string; host?: string; deployCmd?: string; editInstructions?: string }> = {
  'ethan-admin': {
    domain: 'https://ethan-admin-hlfdr.ondigitalocean.app',
    host: 'DigitalOcean App Platform',
    deployCmd: 'git push origin main → auto-deploys via DO',
    editInstructions: 'Clone repo, run `npm install && npm run dev`, push to main to deploy. DO App ID: 40dc1fb0-f772-428d-84d6-67097b5ac703',
  },
  'influence-outreach': {
    host: 'GitHub Actions (cron)',
    deployCmd: 'git push origin main → runs via GH Actions daily_outreach.yml',
    editInstructions: 'Clone repo, edit main.py / src/ files, push to main. Cron triggers daily at 10 AM EDT. Secrets set in repo Settings > Secrets.',
  },
  'alpine-slack-bot': {
    host: 'Unknown / likely DigitalOcean or Railway',
    editInstructions: 'Clone repo, check package.json for deploy scripts. Look for .env or Dockerfile for hosting clues.',
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
    editInstructions: 'Clone repo, check for hosting config files (vercel.json, Dockerfile, etc).',
  },
  'v': {
    host: 'Remotion / local video rendering',
    editInstructions: 'Clone repo, run `npm install && npx remotion studio`. Render with `npx remotion render`.',
  },
  'supportchattt': {
    host: 'Unknown — Python project',
    editInstructions: 'Clone repo, run `pip install -r requirements.txt && python main.py`.',
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
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Write a 2-3 sentence summary of this GitHub repo for a personal admin dashboard. Be specific and practical — what does it do, why does it exist, what problem does it solve?

Repo: ${repo.name}
Language: ${repo.language}
Description: ${repo.description || 'none'}
README: ${readme.substring(0, 600)}

Return only the summary, no quotes or extra text.`
        }]
      })
    })
    const d = await res.json()
    return d.content?.[0]?.text?.trim() || (repo.description as string) || 'No description available.'
  } catch { return (repo.description as string) || 'No description available.' }
}

export async function GET(req: NextRequest) {
  const db = await getDb()
  const forceRefresh = req.nextUrl.searchParams.get('refresh') === '1'

  // Check cache (refresh every 6 hours or on demand)
  if (!forceRefresh) {
    const cached = await db.collection('projects_cache').findOne({ _id: 'github' as unknown as import('mongodb').ObjectId })
    if (cached && (Date.now() - new Date(cached.cachedAt).getTime()) < 6 * 60 * 60 * 1000) {
      return NextResponse.json({ ok: true, projects: cached.projects, cachedAt: cached.cachedAt, fromCache: true })
    }
  }

  // Fetch all repos
  const repos = await ghFetch(`/user/repos?per_page=100&sort=updated&type=owner`) || []

  const projects = []
  for (const repo of repos) {
    // Get README
    let readme = ''
    try {
      const rm = await ghFetch(`/repos/${GH_USER}/${repo.name}/readme`)
      if (rm?.content) {
        readme = Buffer.from(rm.content, 'base64').toString('utf-8').substring(0, 800)
      }
    } catch {}

    // Get latest commit
    let lastCommit = null
    try {
      const commits = await ghFetch(`/repos/${GH_USER}/${repo.name}/commits?per_page=1`)
      if (commits?.[0]) {
        lastCommit = {
          sha: commits[0].sha?.substring(0, 7),
          message: commits[0].commit?.message?.split('\n')[0]?.substring(0, 80),
          date: commits[0].commit?.author?.date,
          author: commits[0].commit?.author?.name,
        }
      }
    } catch {}

    // Get languages
    let languages: Record<string, number> = {}
    try {
      languages = await ghFetch(`/repos/${GH_USER}/${repo.name}/languages`) || {}
    } catch {}

    // Generate AI summary
    const summary = await generateSummary(repo, readme)

    const hosting = KNOWN_HOSTING[repo.name] || {}

    projects.push({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description || '',
      summary,
      url: repo.html_url,
      cloneUrl: repo.clone_url,
      private: repo.private,
      language: repo.language,
      languages: Object.keys(languages).slice(0, 4),
      stars: repo.stargazers_count,
      updatedAt: repo.updated_at,
      createdAt: repo.created_at,
      defaultBranch: repo.default_branch,
      lastCommit,
      domain: hosting.domain || null,
      host: hosting.host || null,
      deployCmd: hosting.deployCmd || null,
      editInstructions: hosting.editInstructions || null,
      topics: repo.topics || [],
    })
  }

  // Cache to DB
  await db.collection('projects_cache').updateOne(
    { _id: 'github' as unknown as import('mongodb').ObjectId },
    { $set: { projects, cachedAt: new Date() } },
    { upsert: true }
  )

  return NextResponse.json({ ok: true, projects, cachedAt: new Date(), fromCache: false })
}

// PATCH — update hosting info for a specific project
export async function PATCH(req: NextRequest) {
  const { name, domain, host, deployCmd, editInstructions } = await req.json()
  const db = await getDb()

  await db.collection('projects_overrides').updateOne(
    { name },
    { $set: { name, domain, host, deployCmd, editInstructions, updatedAt: new Date() } },
    { upsert: true }
  )

  return NextResponse.json({ ok: true })
}
