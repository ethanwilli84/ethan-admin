export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

const GH_TOKEN = process.env.GITHUB_TOKEN!
const REPO = 'ethanwilli84/influence-outreach'
const ghHeaders = () => ({ 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' })

export async function GET(req: NextRequest) {
  const campaign = req.nextUrl.searchParams.get('campaign') || ''

  try {
    // Get latest runs
    const runsRes = await fetch(`https://api.github.com/repos/${REPO}/actions/runs?per_page=5`, { headers: ghHeaders() })
    const runsData = await runsRes.json()
    const runs = runsData.workflow_runs || []

    // Find latest run (in_progress first, then most recent completed)
    const activeRun = runs.find((r: {status: string}) => r.status === 'in_progress') || runs[0]
    if (!activeRun) return NextResponse.json({ ok: true, status: 'idle', lines: [], runId: null })

    const runStatus = activeRun.status // in_progress | completed | queued
    const runConclusion = activeRun.conclusion // success | failure | null
    const createdAt = activeRun.created_at

    // Get job for this run
    const jobsRes = await fetch(`https://api.github.com/repos/${REPO}/actions/runs/${activeRun.id}/jobs`, { headers: ghHeaders() })
    const jobsData = await jobsRes.json()
    const job = jobsData.jobs?.[0]
    if (!job) return NextResponse.json({ ok: true, status: runStatus, lines: [], runId: activeRun.id })

    // Get logs (only available for completed jobs — for in_progress we parse what's available)
    let lines: string[] = []
    try {
      const logsRes = await fetch(`https://api.github.com/repos/${REPO}/actions/jobs/${job.id}/logs`, { headers: ghHeaders() })
      if (logsRes.ok) {
        const rawLogs = await logsRes.text()
        lines = rawLogs
          .split('\n')
          // Strip timestamps
          .map(l => l.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z /, '').trim())
          // Filter noise
          .filter(l => l && !l.startsWith('[command]') && !l.includes('git config') && !l.includes('git submodule')
            && !l.includes('PKG_CONFIG') && !l.includes('Downloading') && !l.includes('Collecting ')
            && !l.includes('Installing collected') && !l.includes('Successfully installed')
            && !l.includes('##[') && !l.includes('safe.directory') && !l.includes('gc.auto'))
          .slice(-80) // Last 80 meaningful lines
      }
    } catch {}

    // Filter to campaign-specific lines if requested
    let filteredLines = lines
    if (campaign) {
      // Find the section for this campaign
      const campaignIdx = lines.findIndex(l => l.includes(campaign) || l.includes('Campaign Orchestrator'))
      if (campaignIdx >= 0) filteredLines = lines.slice(Math.max(0, campaignIdx - 2))
    }

    return NextResponse.json({
      ok: true,
      status: runStatus,
      conclusion: runConclusion,
      runId: activeRun.id,
      jobId: job.id,
      startedAt: createdAt,
      lines: filteredLines,
    })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message })
  }
}
