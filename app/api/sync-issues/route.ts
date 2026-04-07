export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!
const GMAIL_USER = process.env.GMAIL_USER!
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD_IMAP!
const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN || ''

// AI classifier — determines if a message is a real issue and extracts metadata
async function classifyMessage(text: string, source: string): Promise<{
  isIssue: boolean; title?: string; product?: string; category?: string; severity?: string; summary?: string
} | null> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: `You classify customer support messages for two businesses:
- Sire Apps: B2B shipping platform for sneaker resellers (UPS/FedEx labels, inventory)
- Alpine: BNPL fintech for coaching/education sellers (checkout, Plaid bank connections, payouts, defaults, chargebacks)

Respond ONLY with JSON, no other text. No markdown.`,
        messages: [{
          role: 'user',
          content: `Source: ${source}\nMessage: ${text.substring(0, 800)}\n\nClassify: {"isIssue":bool,"title":"short title if issue","product":"sire|alpine|both|unknown","category":"checkout|payout|label|plaid|chargeback|account|shipping|default|login|bug|other","severity":"critical|high|medium|low","summary":"1 sentence if issue"}`
        }]
      })
    })
    const d = await res.json()
    const raw = d.content?.[0]?.text?.trim() || '{}'
    return JSON.parse(raw)
  } catch { return null }
}

// ── iMessage sync ─────────────────────────────────────────────────────────────
// iMessage lives on local Mac only — data is POSTed here by the macOS LaunchAgent
// See /scripts/imessage-sync.py for the local script
async function syncIMessages(_hoursBack = 48): Promise<number> {
  return 0 // No-op on server — handled by local Mac agent posting to /api/sync-issues/ingest
}

// ── Gmail sync (ethan@sireapp.io + sireapps.llc) ────────────────────────────
async function syncGmail(hoursBack = 48): Promise<number> {
  const db = await getDb()
  let count = 0
  try {
    const { ImapFlow } = await import('imapflow')
    const client = new ImapFlow({
      host: 'imap.gmail.com', port: 993, secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_PASS }, logger: false,
    })
    await client.connect()
    let lock
    try {
      lock = await client.getMailboxLock('INBOX')
      const since = new Date(Date.now() - hoursBack * 3600000)
      const uids = await client.search({ since })
      if (!Array.isArray(uids)) { lock.release(); return 0 }

      for (const uid of uids.slice(-100)) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
const msg: any = await client.fetchOne(String(uid), { envelope: true })
          if (!msg?.envelope) continue
          const from = msg.envelope.from?.[0]?.address || ''
          const subject = msg.envelope.subject || ''
          const date = msg.envelope.date || new Date()
          const msgId = msg.envelope.messageId || `email_${uid}`
          const channelRef = `email_${msgId}`

          const existing = await db.collection('issues').findOne({ channelRef })
          if (existing) continue

          // Classify based on subject (quick — avoids fetching full body)
          const classification = await classifyMessage(subject, `Email from ${from}`)
          if (!classification?.isIssue) continue

          await db.collection('issues').insertOne({
            title: classification.title || subject,
            description: subject,
            channel: 'email_sire',
            channelRef,
            from: from,
            fromRaw: from,
            product: classification.product || 'unknown',
            category: classification.category || 'other',
            severity: classification.severity || 'medium',
            status: 'open',
            rawMessage: subject,
            syncedAt: new Date(),
            createdAt: date,
            updatedAt: date,
          })
          count++
        } catch {}
      }
    } finally { try { lock?.release() } catch {} }
    await client.logout()
  } catch (e: unknown) { console.error('Gmail sync error:', (e as Error).message) }
  return count
}

// ── Slack sync — all alpine-* channels ───────────────────────────────────────
async function syncSlack(hoursBack = 48): Promise<number> {
  const db = await getDb()
  let count = 0
  try {
    const since = Math.floor(Date.now()/1000 - hoursBack * 3600)

    // Get all alpine channels
    const chRes = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200', {
      headers: { 'Authorization': `Bearer ${SLACK_TOKEN}` }
    })
    const chData = await chRes.json()
    const channels = (chData.channels || []).filter((c: {name:string;is_archived:boolean}) =>
      c.name.startsWith('alpine-') && !c.is_archived
    )

    for (const channel of channels.slice(0, 40)) {
      try {
        const msgRes = await fetch(
          `https://slack.com/api/conversations.history?channel=${channel.id}&oldest=${since}&limit=20`,
          { headers: { 'Authorization': `Bearer ${SLACK_TOKEN}` } }
        )
        const msgData = await msgRes.json()
        const messages = msgData.messages || []

        for (const msg of messages) {
          if (!msg.text || msg.text.length < 20 || msg.bot_id || msg.subtype) continue
          const channelRef = `slack_${channel.id}_${msg.ts}`
          const existing = await db.collection('issues').findOne({ channelRef })
          if (existing) continue

          const classification = await classifyMessage(msg.text, `Slack #${channel.name}`)
          if (!classification?.isIssue) continue

          await db.collection('issues').insertOne({
            title: classification.title || msg.text.substring(0, 60),
            description: msg.text,
            channel: 'slack',
            channelRef,
            from: `#${channel.name}`,
            fromRaw: `${channel.id}::${msg.ts}`,
            product: classification.product || 'alpine',
            category: classification.category || 'other',
            severity: classification.severity || 'medium',
            status: 'open',
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

// ── Resolution detector — check if issues got replied to ─────────────────────
async function detectResolutions(): Promise<number> {
  const db = await getDb()
  let resolved = 0
  try {
    const openIssues = await db.collection('issues').find({ status: 'open' }).toArray()

    for (const issue of openIssues) {
      // iMessage: check if we replied after the issue was created
      if (issue.channel === 'imessage') {
        const contact = issue.fromRaw
        const issueTime = new Date(issue.createdAt).getTime()
        const appleNano = (Math.floor(issueTime/1000) - 978307200 + 3600) * 1000000000 // 1h after issue

        try {
          const { execSync } = await import('child_process')
          const sql = `SELECT COUNT(*) FROM message m JOIN handle h ON m.handle_id = h.rowid WHERE h.id = '${contact}' AND m.is_from_me = 1 AND m.date > ${appleNano}`
          const result = execSync(`sqlite3 ~/Library/Messages/chat.db "${sql}"`, { encoding: 'utf8', timeout: 5000 }).trim()
          if (parseInt(result) > 0) {
            await db.collection('issues').updateOne(
              { _id: issue._id },
              { $set: { status: 'resolved', resolvedBy: 'imessage_reply', resolvedAt: new Date(), resolution: 'Replied via iMessage', updatedAt: new Date() } }
            )
            resolved++
          }
        } catch {}
      }

      // Slack: check if there's a reply in the thread
      if (issue.channel === 'slack' && issue.fromRaw?.includes('::')) {
        const [channelId, ts] = issue.fromRaw.split('::')
        try {
          const res = await fetch(`https://slack.com/api/conversations.replies?channel=${channelId}&ts=${ts}&limit=10`, {
            headers: { 'Authorization': `Bearer ${SLACK_TOKEN}` }
          })
          const d = await res.json()
          const replies = (d.messages || []).slice(1) // Skip parent message
          if (replies.length > 0) {
            await db.collection('issues').updateOne(
              { _id: issue._id },
              { $set: { status: 'resolved', resolvedBy: 'slack_reply', resolvedAt: new Date(), resolution: `${replies.length} reply(s) in thread`, updatedAt: new Date() } }
            )
            resolved++
          }
        } catch {}
      }
    }
  } catch (e: unknown) { console.error('Resolution detection error:', (e as Error).message) }
  return resolved
}

export async function GET(req: NextRequest) {
  const channels = req.nextUrl.searchParams.get('channels')?.split(',') || ['imessage','slack','email']
  const hours = parseInt(req.nextUrl.searchParams.get('hours') || '48')
  const results: Record<string, number> = {}

  if (channels.includes('imessage')) results.imessage = await syncIMessages(hours)
  if (channels.includes('email')) results.email = await syncGmail(hours)
  if (channels.includes('slack')) results.slack = await syncSlack(hours)

  const resolved = await detectResolutions()
  results.autoResolved = resolved

  const db = await getDb()
  const openCount = await db.collection('issues').countDocuments({ status: 'open' })

  return NextResponse.json({ ok: true, synced: results, openIssues: openCount })
}
