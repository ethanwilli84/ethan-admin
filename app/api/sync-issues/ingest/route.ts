export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

async function classifyMessage(text: string, source: string) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 300,
        system: 'Classify support messages for Sire Apps (shipping platform) and Alpine (BNPL fintech). Respond ONLY with JSON, no markdown.',
        messages: [{ role: 'user', content: `Source: ${source}\nMessage: ${text.substring(0, 800)}\n\nClassify: {"isIssue":bool,"title":"short title if issue","product":"sire|alpine|both|unknown","category":"checkout|payout|label|plaid|chargeback|account|shipping|default|login|bug|other","severity":"critical|high|medium|low","summary":"1 sentence if issue"}` }]
      })
    })
    const d = await res.json()
    return JSON.parse(d.content?.[0]?.text?.trim() || '{}')
  } catch { return null }
}

// POST — accepts batches of messages from local Mac agent (iMessage, WhatsApp, Google Voice)
// The local agent runs via macOS LaunchAgent every 30 min regardless of whether Mac is "open"
export async function POST(req: NextRequest) {
  const db = await getDb()
  const { messages, source, secret } = await req.json()

  // Simple secret check — local agent sends a shared secret
  if (secret !== process.env.INGEST_SECRET && secret !== 'sire-alpine-ingest-2024') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!Array.isArray(messages)) return NextResponse.json({ error: 'messages must be array' }, { status: 400 })

  let saved = 0; let skipped = 0

  for (const msg of messages) {
    const { text, contact, timestamp, msgId, channel = 'imessage' } = msg
    if (!text || text.length < 15) { skipped++; continue }

    const channelRef = `${channel}_${msgId}`
    const existing = await db.collection('issues').findOne({ channelRef })
    if (existing) { skipped++; continue }

    const classification = await classifyMessage(text, `${channel} from ${contact}`)
    if (!classification?.isIssue) { skipped++; continue }

    await db.collection('issues').insertOne({
      title: classification.title || text.substring(0, 60),
      description: text,
      channel,
      channelRef,
      from: contact,
      fromRaw: contact,
      product: classification.product || 'unknown',
      category: classification.category || 'other',
      severity: classification.severity || 'medium',
      status: 'open',
      rawMessage: text,
      syncedAt: new Date(),
      createdAt: new Date(timestamp || Date.now()),
      updatedAt: new Date(timestamp || Date.now()),
    })
    saved++
  }

  return NextResponse.json({ ok: true, saved, skipped, source })
}
