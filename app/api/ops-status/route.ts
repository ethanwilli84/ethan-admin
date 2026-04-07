export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

const GH_TOKEN = process.env.GITHUB_TOKEN!
const REPO = 'ethanwilli84/influence-outreach'
const gh = (path: string) => fetch(`https://api.github.com${path}`, {
  headers: { Authorization: `token ${GH_TOKEN}`, Accept: 'application/vnd.github.v3+json' }
})

export async function GET() {
  const db = await getDb()
  const today = new Date().toISOString().split('T')[0]
  const now = new Date()

  // Campaigns
  const campaigns = await db.collection('campaigns').find({}).toArray()

  // Today's records per campaign
  const todayPipeline = [
    { $match: { date: today } },
    { $group: { _id: { campaign: '$campaign', status: '$status' }, count: { $sum: 1 } } }
  ]
  const todayRecords = await db.collection('outreach_records').aggregate(todayPipeline).toArray()
  const todayMap: Record<string, Record<string, number>> = {}
  for (const r of todayRecords) {
    const { campaign, status } = r._id
    if (!todayMap[campaign]) todayMap[campaign] = {}
    todayMap[campaign][status] = r.count
  }

  // Settings per campaign
  const settingsDocs = await db.collection('campaign_settings').find({}).toArray()
  const settingsMap: Record<string, Record<string, unknown>> = {}
  for (const s of settingsDocs) {
    if (s.key === 'config' && s.value) settingsMap[s.campaign] = s.value as Record<string, unknown>
  }

  // Active locks
  const locks = await db.collection('campaign_locks').find({}).toArray()
  const activeLock = locks[0] || null

  // GitHub Actions — latest runs
  let runs: unknown[] = [], activeRun = null, activeJobLogs: string[] = []
  try {
    const runsRes = await gh(`/repos/${REPO}/actions/runs?per_page=8`)
    const runsData = await runsRes.json()
    runs = (runsData.workflow_runs || []).map((r: Record<string, unknown>) => ({
      id: r.id, status: r.status, conclusion: r.conclusion,
      createdAt: r.created_at, updatedAt: r.updated_at,
      event: r.event, displayTitle: r.display_title
    }))

    // Get live log lines from most recent run
    activeRun = runs.find((r: unknown) => (r as Record<string, unknown>).status === 'in_progress') || runs[0]
    if (activeRun) {
      const ar = activeRun as Record<string, unknown>
      const jobsRes = await gh(`/repos/${REPO}/actions/runs/${ar.id}/jobs`)
      const jobsData = await jobsRes.json()
      const job = jobsData.jobs?.[0]
      if (job) {
        const logsRes = await gh(`/repos/${REPO}/actions/jobs/${job.id}/logs`)
        if (logsRes.ok) {
          const raw = await logsRes.text()
          activeJobLogs = raw.split('\n')
            .map((l: string) => l.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z /, '').trim())
            .filter((l: string) => l && !l.startsWith('[command]') && !l.includes('##[') && !l.includes('git config') && !l.includes('Collecting ') && !l.includes('Installing '))
            .slice(-60)
        }
      }
    }
  } catch {}

  // Build per-campaign status
  const campaignStatus = campaigns.map(c => {
    const slug = c.slug as string
    const settings = settingsMap[slug] || {}
    const today_stats = todayMap[slug] || {}
    const lock = locks.find(l => l.campaign === slug)
    const runAge = (activeRun as Record<string,unknown>)?.createdAt
      ? (now.getTime() - new Date((activeRun as Record<string,unknown>).createdAt as string).getTime()) / 1000
      : 0

    // Determine if this campaign is currently running
    const isLocked = !!lock
    const logMentions = activeJobLogs.some(l => l.includes(`Running: ${slug}`))
    const logDone = activeJobLogs.filter(l => l.includes(`Running: ${slug}`))[0]
      ? activeJobLogs.findIndex(l => l.includes('Done.')) > activeJobLogs.findIndex(l => l.includes(`Running: ${slug}`))
      : false

    let runStatus = 'idle'
    if ((activeRun as Record<string,unknown>)?.status === 'in_progress') {
      if (isLocked) runStatus = 'running'
      else if (logMentions && logDone) runStatus = 'done_today'
      else if (logMentions) runStatus = 'running'
      else if (runAge < 300) runStatus = 'queued'
      else runStatus = 'not_in_run'
    } else if ((activeRun as Record<string,unknown>)?.status === 'completed') {
      if (logMentions) runStatus = 'done_today'
    }

    return {
      slug, name: c.name, icon: c.icon, active: c.active,
      perSession: (settings.perSession as number) || 15,
      sendTime: (settings.sendTime as string) || '14:00',
      paused: (settings.paused as boolean) || false,
      sentToday: today_stats['Sent'] || 0,
      failedToday: today_stats['Send Failed'] || 0,
      noContactToday: today_stats['No Contact Found'] || 0,
      totalSent: 0, // filled below
      runStatus,
      lockedSince: lock?.acquiredAt || null,
    }
  })

  // Total sent per campaign
  for (const cs of campaignStatus) {
    cs.totalSent = await db.collection('outreach_records').countDocuments({ campaign: cs.slug, status: 'Sent' })
  }

  // Cron schedule
  const cronInfo = {
    schedule: 'Daily at 10:00 AM EDT (14:00 UTC)',
    nextRunUTC: (() => {
      const next = new Date(now)
      next.setUTCHours(14, 0, 0, 0)
      if (next <= now) next.setDate(next.getDate() + 1)
      return next.toISOString()
    })(),
    sequentialOrder: campaigns.map(c => c.slug),
    estimatedDuration: '45-90 minutes total',
  }

  return NextResponse.json({
    ok: true, fetchedAt: now.toISOString(),
    campaigns: campaignStatus,
    activeLock,
    runs: runs.slice(0, 5),
    activeRun,
    liveLogLines: activeJobLogs,
    cronInfo,
    summary: {
      totalSentToday: campaignStatus.reduce((a, c) => a + c.sentToday, 0),
      anyRunning: campaignStatus.some(c => c.runStatus === 'running'),
      anyQueued: campaignStatus.some(c => c.runStatus === 'queued'),
    }
  })
}
