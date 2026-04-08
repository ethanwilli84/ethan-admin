export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!
const GMAIL_USER = process.env.GMAIL_USER!
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD_IMAP!
const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN || ''

// ── AI classifier — called only for unclassified records in background ────────
async function classifyMessage(text: string, source: string) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: `You classify messages for two businesses. Flag anything needing attention.
- Sire Apps: B2B shipping for sneaker resellers
- Alpine: BNPL/financing for coaching & education sellers
Respond ONLY with compact JSON, no markdown.`,
        messages: [{ role: 'user', content: `Source: ${source}\nMessage: ${text.substring(0, 500)}\n\nReturn: {"isIssue":bool,"title":"short title","product":"sire|alpine|unknown","category":"checkout|payout|plaid|chargeback|shipping|login|bug|other","severity":"critical|high|medium|low"}` }]
      })
    })
    const d = await res.json()
    return JSON.parse(d.content?.[0]?.text?.trim() || '{}')
  } catch { return null }
}

// ── Gmail sync — fast, no AI during ingest ────────────────────────────────────
async function syncGmail(hoursBack = 24): Promise<number> {
  const db = await getDb()
  let count = 0
  try {
    const { ImapFlow } = await import('imapflow')
    const imap = new ImapFlow({
      host: 'imap.gmail.com', port: 993, secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_PASS }, logger: false,
    })
    await Promise.race([
      imap.connect(),
      new Promise((_, r) => setTimeout(() => r(new Error('IMAP connect timeout')), 10000))
    ])
    let lock
    try {
      lock = await imap.getMailboxLock('INBOX')
      const since = new Date(Date.now() - hoursBack * 3600000)
      const uids = await imap.search({ since })
      if (!Array.isArray(uids)) { lock.release(); return 0 }

      for (const uid of uids.slice(-50)) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const msg: any = await imap.fetchOne(String(uid), { envelope: true })
          if (!msg?.envelope) continue
          const from = msg.envelope.from?.[0]?.address || ''
          const subject = msg.envelope.subject || ''
          const date = msg.envelope.date || new Date()
          const msgId = msg.envelope.messageId || `email_${uid}`
          const channelRef = `email_${msgId}`

          if (await db.collection('issues').findOne({ channelRef })) continue

          // Save immediately, classify=pending (AI runs separately)
          await db.collection('issues').insertOne({
            title: subject.substring(0, 100),
            description: subject,
            channel: 'email_sire', channelRef, from, fromRaw: from,
            product: 'unknown', category: 'other', severity: 'medium',
            status: 'open', classified: false,
            rawMessage: subject,
            syncedAt: new Date(), createdAt: date, updatedAt: date,
          })
          count++
        } catch {}
      }
    } finally { try { lock?.release() } catch {} }
    await imap.logout()
  } catch (e: unknown) { console.error('Gmail sync error:', (e as Error).message) }
  return count
}

// ── Slack sync — fast, no AI during ingest ───────────────────────────────────
async function syncSlack(hoursBack = 24): Promise<number> {
  const db = await getDb()
  let count = 0
  try {
    const since = Math.floor(Date.now() / 1000 - hoursBack * 3600)
    const chRes = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200', {
      headers: { 'Authorization': `Bearer ${SLACK_TOKEN}` }
    })
    const chData = await chRes.json()
    const channels = (chData.channels || []).filter((c: { name: string; is_archived: boolean }) =>
      c.name.startsWith('alpine-') && !c.is_archived
    )

    for (const channel of channels.slice(0, 20)) {
      try {
        const msgRes = await fetch(
          `https://slack.com/api/conversations.history?channel=${channel.id}&oldest=${since}&limit=30`,
          { headers: { 'Authorization': `Bearer ${SLACK_TOKEN}` } }
        )
        const msgData = await msgRes.json()
        for (const msg of (msgData.messages || [])) {
          if (!msg.text || msg.text.length < 10 || msg.bot_id || msg.subtype) continue
          const channelRef = `slack_${channel.id}_${msg.ts}`
          if (await db.collection('issues').findOne({ channelRef })) continue

          await db.collection('issues').insertOne({
            title: msg.text.substring(0, 80),
            description: msg.text,
            channel: 'slack', channelRef,
            from: `#${channel.name}`, fromRaw: `${channel.id}::${msg.ts}`,
            product: 'alpine', category: 'other', severity: 'medium',
            status: 'open', classified: false,
            rawMessage: msg.text,
            syncedAt: new Date(),
            createdAt: new Date(parseFloat(msg.ts) * 1000),
            updatedAt: new Date(parseFloat(msg.ts) * 1000),
          })
          count++
        }
      } catch {}
    }
  } catch (e: unknown) { console.error('Slack sync error:', (e as Error).message) }
  return count
}

// ── AI classify unprocessed issues (separate step, max 20 per run) ────────────
async function classifyPending(): Promise<number> {
  const db = await getDb()
  let classified = 0
  const pending = await db.collection('issues').find({ classified: false }).limit(20).toArray()

  for (const issue of pending) {
    const result = await classifyMessage(issue.rawMessage || issue.description || '', issue.channel)
    if (result) {
      await db.collection('issues').updateOne(
        { _id: issue._id },
        { $set: {
          title: result.title || issue.title,
          product: result.product || issue.product,
          category: result.category || issue.category,
          severity: result.severity || issue.severity,
          classified: true,
          // Remove obvious non-issues
          status: result.isIssue === false ? 'dismissed' : issue.status,
          updatedAt: new Date()
        }}
      )
      classified++
    }
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 200))
  }
  return classified
}

// ── Resolution detector ───────────────────────────────────────────────────────
async function detectResolutions(): Promise<number> {
  const db = await getDb()
  let resolved = 0
  const openSlack = await db.collection('issues').find({ channel: 'slack', status: 'open' }).limit(30).toArray()

  for (const issue of openSlack) {
    if (!issue.fromRaw?.includes('::')) continue
    const [channelId, ts] = issue.fromRaw.split('::')
    try {
      const res = await fetch(`https://slack.com/api/conversations.replies?channel=${channelId}&ts=${ts}&limit=5`, {
        headers: { 'Authorization': `Bearer ${SLACK_TOKEN}` }
      })
      const d = await res.json()
      const replies = (d.messages || []).slice(1)
      if (replies.length > 0) {
        await db.collection('issues').updateOne(
          { _id: issue._id },
          { $set: { status: 'resolved', resolvedBy: 'slack_reply', resolvedAt: new Date(), resolution: `${replies.length} reply(s) in thread`, updatedAt: new Date() } }
        )
        resolved++
      }
    } catch {}
  }
  return resolved
}

export async function GET(req: NextRequest) {
  const startTime = Date.now()
  const channels = req.nextUrl.searchParams.get('channels')?.split(',') || ['slack', 'email']
  const hours = parseInt(req.nextUrl.searchParams.get('hours') || '24')
  const results: Record<string, number> = {}

  // Fast ingest — no AI, just save raw messages
  if (channels.includes('email')) results.email = await syncGmail(hours)
  if (channels.includes('slack')) results.slack = await syncSlack(hours)

  // Classify pending (max 20, ~4s)
  results.classified = await classifyPending()

  // Auto-resolve (Slack threads only, fast)
  results.autoResolved = await detectResolutions()

  const db = await getDb()
  const openCount = await db.collection('issues').countDocuments({ status: 'open' })
  const pendingClassify = await db.collection('issues').countDocuments({ classified: false })
  const elapsed = Math.round((Date.now() - startTime) / 1000)

  return NextResponse.json({ ok: true, synced: results, openIssues: openCount, pendingClassify, elapsedSeconds: elapsed })
}
