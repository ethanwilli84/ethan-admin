export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { message, history } = await req.json()

  // Fetch live ops status
  const opsRes = await fetch(`${process.env.NEXT_PUBLIC_URL || 'https://ethan-admin-hlfdr.ondigitalocean.app'}/api/ops-status`)
  const ops = await opsRes.json()

  const systemPrompt = `You are an ops assistant for Ethan Williams' outreach system. You have live data about all campaigns right now.

LIVE SYSTEM DATA (fetched ${new Date().toLocaleString('en-US', {timeZone: 'America/New_York'})} ET):

CAMPAIGNS:
${ops.campaigns.map((c: Record<string,unknown>) => `- ${c.name} (${c.slug})
    Status: ${c.runStatus} | Paused: ${c.paused} | perSession: ${c.perSession} | sendTime: ${c.sendTime}
    Today: ${c.sentToday} sent, ${c.failedToday} failed | Total ever: ${c.totalSent}`).join('\n')}

CURRENT RUN:
${ops.activeRun ? `- Job ${(ops.activeRun as Record<string,unknown>).id}: ${(ops.activeRun as Record<string,unknown>).status} (started ${(ops.activeRun as Record<string,unknown>).createdAt})` : 'No active run'}
${ops.activeLock ? `- Active lock: ${(ops.activeLock as Record<string,unknown>).campaign} (acquired ${(ops.activeLock as Record<string,unknown>).acquiredAt})` : '- No active lock'}

RECENT LOG LINES (last 30):
${(ops.liveLogLines as string[]).slice(-30).join('\n')}

CRON: ${ops.cronInfo.schedule}
Next run: ${new Date(ops.cronInfo.nextRunUTC).toLocaleString('en-US', {timeZone: 'America/New_York'})} ET

SUMMARY: ${ops.summary.totalSentToday} total sent today | Running: ${ops.summary.anyRunning} | Queued: ${ops.summary.anyQueued}

Answer Ethan's questions about what's happening with his outreach campaigns. Be direct, specific, and use the live data above. Format numbers clearly. If something looks wrong, flag it.`

  const messages = [
    ...(history || []),
    { role: 'user', content: message }
  ]

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    })
  })

  const d = await res.json()
  const reply = d.content?.[0]?.text || 'Error getting response'
  return NextResponse.json({ ok: true, reply, opsSnapshot: ops.summary })
}
