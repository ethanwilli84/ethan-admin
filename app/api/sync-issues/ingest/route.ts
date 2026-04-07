export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

// Keyword-based fallback classifier — no AI needed
// If AI fails or is slow, this catches obvious issues
const SIRE_KEYWORDS = ['sire', 'label', 'shipment', 'pirate ship', 'ups', 'fedex', 'usps', 'surcharge', 'shipping rate']
const ALPINE_KEYWORDS = ['alpine', 'plaid', 'checkout', 'payout', 'chargeback', 'loan', 'installment', 'payment link', '1alp']
const ISSUE_KEYWORDS = ['not working', 'broken', 'issue', 'problem', 'error', 'failed', 'bug', 'glitch', 'cant', 'stuck', 'declined', 'denied', 'help', 'support', 'fix']

function keywordClassify(text: string): { isIssue: boolean; product: string; severity: string; category: string; title: string } {
  const lower = text.toLowerCase()
  const isSire = SIRE_KEYWORDS.some(k => lower.includes(k))
  const isAlpine = ALPINE_KEYWORDS.some(k => lower.includes(k))
  const isIssue = ISSUE_KEYWORDS.some(k => lower.includes(k)) || isSire || isAlpine

  const product = isSire && isAlpine ? 'both' : isSire ? 'sire' : isAlpine ? 'alpine' : 'unknown'
  const severity = lower.includes('live') || lower.includes('lost') || lower.includes('broke') ? 'high'
    : lower.includes('not working') || lower.includes('plaid') || lower.includes('checkout') ? 'high'
    : lower.includes('issue') || lower.includes('problem') ? 'medium' : 'low'
  const category = lower.includes('plaid') || lower.includes('bank') ? 'plaid'
    : lower.includes('checkout') || lower.includes('payment') ? 'checkout'
    : lower.includes('payout') ? 'payout'
    : lower.includes('label') || lower.includes('shipping') || lower.includes('usps') || lower.includes('ups') || lower.includes('fedex') ? 'label'
    : lower.includes('chargeback') ? 'chargeback'
    : lower.includes('login') || lower.includes('access') ? 'account'
    : 'other'

  return { isIssue, product, severity, category, title: text.substring(0, 70) }
}

async function classifyWithAI(text: string, source: string) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 200,
        system: 'Classify support messages for Sire Apps (shipping) and Alpine (BNPL). Reply ONLY with JSON, no markdown.',
        messages: [{ role: 'user', content: `Source: ${source}\nMessage: ${text.substring(0, 600)}\n\nReply with ONLY: {"isIssue":true/false,"title":"short title","product":"sire|alpine|both|unknown","category":"checkout|payout|label|plaid|chargeback|account|shipping|default|login|bug|other","severity":"critical|high|medium|low"}` }]
      })
    })
    const d = await res.json()
    const raw = d.content?.[0]?.text?.trim() || ''
    // Strip markdown if present
    const clean = raw.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch { return null }
}

export async function POST(req: NextRequest) {
  const db = await getDb()
  const body = await req.json()
  const { messages, source, secret } = body

  if (secret !== process.env.INGEST_SECRET && secret !== 'sire-alpine-ingest-2024') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!Array.isArray(messages)) return NextResponse.json({ error: 'messages must be array' }, { status: 400 })

  let saved = 0; let skipped = 0; const errors: string[] = []

  for (const msg of messages) {
    const { text, contact, timestamp, msgId, channel = 'imessage' } = msg
    if (!text || text.length < 15) { skipped++; continue }

    const channelRef = `${channel}_${msgId}`
    const existing = await db.collection('issues').findOne({ channelRef })
    if (existing) { skipped++; continue }

    // Try AI first, fall back to keyword classifier
    let classification = await classifyWithAI(text, `${channel} from ${contact}`)
    if (!classification) {
      classification = keywordClassify(text)
    }

    // Only skip if both AI and keywords say it's not an issue
    const kwResult = keywordClassify(text)
    if (!classification?.isIssue && !kwResult.isIssue) { skipped++; continue }

    // Merge: use AI title if available, else keyword
    const finalClass = {
      isIssue: true,
      title: classification?.title || kwResult.title,
      product: classification?.product || kwResult.product,
      category: classification?.category || kwResult.category,
      severity: classification?.severity || kwResult.severity,
    }

    try {
      await db.collection('issues').insertOne({
        title: finalClass.title,
        description: text,
        channel,
        channelRef,
        from: contact,
        fromRaw: contact,
        product: finalClass.product,
        category: finalClass.category,
        severity: finalClass.severity,
        status: 'open',
        rawMessage: text,
        syncedAt: new Date(),
        createdAt: new Date(timestamp || Date.now()),
        updatedAt: new Date(timestamp || Date.now()),
      })
      saved++
    } catch (e: unknown) {
      errors.push((e as Error).message)
    }
  }

  return NextResponse.json({ ok: true, saved, skipped, errors, source })
}
