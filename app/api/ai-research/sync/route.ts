export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/mongodb'
import { sendSms, buildSwipeUrl, smsConfigured } from '@/lib/twilio'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN || 'https://ethan-admin-hlfdr.ondigitalocean.app'

// Threshold for SMS notification — only text findings worth deciding on.
// Below this score they sit silently in /ai-research for batch review.
const SMS_NOTIFY_MIN_SCORE = 7

// ── Search topics — what we want surfaced every day ──────────────────────────
// Tuned to ethan-admin's actual stack: Next.js, MongoDB, Anthropic API, Meta
// Graph API, GitHub Actions crons, outreach/social/issues domain.
const SEARCH_QUERIES = [
  'new Anthropic Claude API features prompt caching tool use',
  'OpenAI API new features developer tools',
  'AI agent frameworks github trending',
  'AI coding agents new releases',
  'Meta Marketing API Instagram Graph API updates',
  'Next.js MongoDB performance patterns 2026',
  'AI outreach personalization tools cold email automation',
  'AI web scraping tools Exa Firecrawl alternatives',
  'AI cost optimization LLM caching latency',
  'AI agent observability evaluation tools',
  'Claude Code skills plugins marketplace github',
  'Claude Code slash commands community repos',
  'Claude Agent SDK examples tool use coding agents',
]

type FeedbackDoc = { title?: string }

// ── Feedback-loop fuel: pull last 30 days of accepted/rejected findings to
// teach the relevance scorer Ethan's preferences. ────────────────────────────
async function getFeedbackExamples(): Promise<{ accepted: FeedbackDoc[]; rejected: FeedbackDoc[] }> {
  const db = await getDb()
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000)
  const accepted = (await db.collection('ai_findings')
    .find({ status: { $in: ['accepted', 'shipped'] }, createdAt: { $gte: since } })
    .sort({ createdAt: -1 }).limit(10).toArray()) as unknown as FeedbackDoc[]
  const rejected = (await db.collection('ai_findings')
    .find({ status: 'rejected', createdAt: { $gte: since } })
    .sort({ createdAt: -1 }).limit(10).toArray()) as unknown as FeedbackDoc[]
  return { accepted, rejected }
}

// ── Single Claude call: web_search + relevance scoring + categorization ─────
// Uses Claude's web_search tool (server-side fetch, no Exa key needed).
// Returns up to 5 findings per query.
async function searchAndScore(query: string, feedback: { accepted: FeedbackDoc[]; rejected: FeedbackDoc[] }) {
  const acceptedTitles = feedback.accepted.slice(0, 6).map((f) => `- ${f.title}`).join('\n') || '(none yet)'
  const rejectedTitles = feedback.rejected.slice(0, 6).map((f) => `- ${f.title}`).join('\n') || '(none yet)'

  const systemPrompt = `You are scouting AI/automation news for Ethan, a 20-year-old founder running:
- Sire Apps (B2B shipping for sneaker resellers, ~$3M/yr)
- Alpine (BNPL for high-ticket coaching, $367K originated)
- ethan-admin: Next.js 16 + MongoDB dashboard that runs outreach campaigns, social scheduling, issue tracking, Meta Ads, finance sync. Heavy Anthropic API usage (Haiku for classification, Sonnet for research).

Your job: search the web for the query, then return 0-5 *concrete, actionable* findings — things Ethan can ship into ethan-admin or his Sire/Alpine stack. Skip generic "X company announces" hype. Skip stuff requiring infra rewrites.

CRITICAL CONSTRAINT — Ethan strongly prefers FREE solutions and hates managing new subscriptions. When scoring:
- A free or already-paid-for tool: score normally
- A freemium tool with a usable free tier: -1 from score
- A paid tool requiring a NEW account/subscription: -2 from score (and only include if truly drop-in valuable)
- If you can't determine cost, search again to find out — do not guess

Score each 0-10 (after the cost adjustment above):
- 9-10: drop-in unlock for an open thread, free or already-paid
- 7-8: clear improvement to existing system, free or trivial cost
- 5-6: nice-to-have, requires non-trivial work or a paid signup
- 0-4: skip (don't return anything below 5)

Risk levels:
- low: prompt tweak inside an existing string literal, new fallback source added to an array, model name swap, new SEARCH_QUERIES entry → safe to auto-PR + auto-merge
- medium: new API integration, new collection schema, new file → PR opens, manual merge
- high: arch shift, cost/security/auth, anything touching auth/payments/secrets → flag only, no auto-action

Categories include "claude_skill" for community Claude Code skills, plugins, or slash-command repos on GitHub that Ethan might want to install locally. For these, the proposedAction should be the install command (e.g. "/plugin marketplace add owner/repo" then "/plugin install <name>"). Mark as low risk (install only — Ethan reviews before invoking).

WRITING STYLE — Ethan reads these on his phone via SMS-triggered swipe cards. Bullets, not paragraphs. Each bullet ≤ 12 words. No marketing-speak. Be terse and concrete.

Recent ACCEPTED findings (Ethan likes these patterns):
${acceptedTitles}

Recent REJECTED findings (Ethan does NOT want more of these):
${rejectedTitles}

Return ONLY a JSON array, no markdown, no prose. Schema:
[{
  "title": "short, specific (≤ 60 chars)",
  "summaryBullets": ["≤12 words", "≤12 words", "≤12 words"],
  "url": "best canonical link",
  "source": "anthropic|openai|github|hn|producthunt|web|other",
  "category": "prompt_improvement|new_data_source|new_api_unlock|cost_reduction|architecture_pattern|tool_or_library|claude_skill|other",
  "relevanceScore": 0-10,
  "riskLevel": "low|medium|high",
  "cost": "free|freemium|paid|unknown",
  "costDetail": "specific: 'free' OR '$X/mo' OR 'free up to N req/mo, then $X' OR 'free for personal use, $X for commercial'",
  "requiresNewAccount": true/false,
  "accountSignupUrl": "https://... (only if requiresNewAccount=true)",
  "proposedAction": "single line: what file/feature to change",
  "actionBullets": ["step 1 in ≤12 words", "step 2 in ≤12 words"],
  "proposedFiles": ["app/api/...", "lib/..."],
  "rationale": "single line: why this matters for Ethan",
  "rationaleBullets": ["≤12 words", "≤12 words"]
}]
If nothing meets bar 5+, return [].`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
        system: systemPrompt,
        messages: [{ role: 'user', content: `Search query: ${query}\n\nReturn the JSON array.` }],
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      console.error(`searchAndScore error for "${query}":`, data)
      return []
    }
    // Find the text block in the response (web_search tool calls produce
    // multiple content blocks; the final one is the model's text output)
    const blocks = data.content || []
    const textBlock = [...blocks].reverse().find((b: { type: string }) => b.type === 'text')
    const text = textBlock?.text?.trim() || ''
    // Strip markdown fences if any sneak through
    const cleaned = text.replace(/^```json\n?/i, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed) ? parsed : []
  } catch (e: unknown) {
    console.error(`searchAndScore parse error for "${query}":`, (e as Error).message)
    return []
  }
}

// ── Main sync — iterate queries, dedup by URL, store findings ────────────────
export async function POST(req: NextRequest) {
  return runSync(req)
}
export async function GET(req: NextRequest) {
  return runSync(req)
}

async function runSync(req: NextRequest) {
  const startTime = Date.now()
  const db = await getDb()
  const url = req.nextUrl
  // Allow narrowing for testing — ?queries=2 runs only first 2 queries
  const limitQueries = parseInt(url.searchParams.get('queries') || '0')
  const queries = limitQueries > 0 ? SEARCH_QUERIES.slice(0, limitQueries) : SEARCH_QUERIES
  // ?noSms=1 disables SMS for this run (used during development/testing)
  const skipSms = url.searchParams.get('noSms') === '1'

  const feedback = await getFeedbackExamples()
  let total = 0
  let kept = 0
  const errors: string[] = []
  // Aggregate notified-worthy findings to send ONE summary SMS at end of run.
  const smsBatch: { id: string; title: string; score: number; risk: string }[] = []

  for (const q of queries) {
    try {
      const findings = await searchAndScore(q, feedback)
      total += findings.length

      for (const f of findings) {
        // Skip below threshold
        if (typeof f.relevanceScore !== 'number' || f.relevanceScore < 5) continue
        if (!f.url || !f.title) continue

        // Dedup by URL — if we've already surfaced this finding, skip
        const exists = await db.collection('ai_findings').findOne({ url: f.url })
        if (exists) continue

        const score = Math.max(0, Math.min(10, Number(f.relevanceScore)))
        const cleanBullets = (arr: unknown): string[] => {
          if (!Array.isArray(arr)) return []
          return arr
            .map((s) => String(s || '').trim())
            .filter((s) => s.length > 0)
            .slice(0, 5)
            .map((s) => s.slice(0, 120))
        }
        const insertResult = await db.collection('ai_findings').insertOne({
          title: String(f.title).slice(0, 200),
          // Keep prose fields as fallback for old-format consumers (apply worker)
          summary: String(f.summary || (Array.isArray(f.summaryBullets) ? f.summaryBullets.join(' · ') : '')).slice(0, 1000),
          summaryBullets: cleanBullets(f.summaryBullets),
          url: String(f.url).slice(0, 500),
          source: f.source || 'web',
          category: f.category || 'other',
          relevanceScore: score,
          riskLevel: ['low', 'medium', 'high'].includes(f.riskLevel) ? f.riskLevel : 'medium',
          cost: ['free', 'freemium', 'paid', 'unknown'].includes(f.cost) ? f.cost : 'unknown',
          costDetail: String(f.costDetail || '').slice(0, 200),
          requiresNewAccount: Boolean(f.requiresNewAccount),
          accountSignupUrl: f.accountSignupUrl ? String(f.accountSignupUrl).slice(0, 500) : undefined,
          proposedAction: String(f.proposedAction || '').slice(0, 800),
          actionBullets: cleanBullets(f.actionBullets),
          proposedFiles: Array.isArray(f.proposedFiles) ? f.proposedFiles.slice(0, 10) : [],
          rationale: String(f.rationale || '').slice(0, 500),
          rationaleBullets: cleanBullets(f.rationaleBullets),
          status: 'new',
          searchQuery: q,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        kept++

        // Queue for the end-of-run summary SMS. We send ONE SMS per sync,
        // not one per finding — Ethan got tired of his phone buzzing.
        if (score >= SMS_NOTIFY_MIN_SCORE) {
          smsBatch.push({
            id: insertResult.insertedId.toString(),
            title: String(f.title).slice(0, 80),
            score,
            risk: String(f.riskLevel || 'medium'),
          })
        }
      }
      // Pace requests so we don't burn rate limit
      await new Promise((r) => setTimeout(r, 500))
    } catch (e: unknown) {
      errors.push(`${q}: ${(e as Error).message}`)
    }
  }

  // ── ONE summary SMS per run ────────────────────────────────────────────
  // Format: "🤖 5 new findings (2 score≥9, 3 score≥7) — top: <title>"
  // Single link to /swipe, no finding ID — highest-scored loads first.
  let smsSent = false
  if (!skipSms && smsBatch.length > 0 && smsConfigured()) {
    smsBatch.sort((a, b) => b.score - a.score)
    const top = smsBatch[0]
    const high = smsBatch.filter((x) => x.score >= 9).length
    const breakdown =
      high > 0
        ? `${smsBatch.length} new (${high} score≥9, ${smsBatch.length - high} score≥${SMS_NOTIFY_MIN_SCORE})`
        : `${smsBatch.length} new findings (score≥${SMS_NOTIFY_MIN_SCORE})`
    const text = [
      `🤖 ${breakdown}`,
      ``,
      `Top: ${top.title} (${top.score}/10)`,
      ``,
      `Swipe through all: ${buildSwipeUrl(ADMIN_ORIGIN)}`,
    ].join('\n')
    try {
      const r = await sendSms(text)
      smsSent = !!r.ok
      if (r.ok) {
        // Mark all included findings as having been notified in this batch
        await db.collection('ai_findings').updateMany(
          { _id: { $in: smsBatch.map((x) => new ObjectId(x.id)) } },
          { $set: { smsSentAt: new Date(), smsMessageSid: r.sid } }
        )
      }
    } catch {
      /* swallow — non-fatal */
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000)
  return NextResponse.json({
    ok: true,
    queriesRun: queries.length,
    findingsSurfaced: total,
    findingsKept: kept,
    smsBatchedCount: smsBatch.length,
    smsSent,
    errors,
    elapsedSeconds: elapsed,
  })
}
