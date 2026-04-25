export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export interface AiFinding {
  _id?: ObjectId
  title: string
  summary: string
  url: string
  source: string                  // 'anthropic'|'openai'|'github'|'hn'|'producthunt'|'web'|'other'
  category: 'prompt_improvement'|'new_data_source'|'new_api_unlock'|'cost_reduction'|'architecture_pattern'|'tool_or_library'|'claude_skill'|'other'
  relevanceScore: number          // 0-10, how applicable to ethan-admin
  riskLevel: 'low'|'medium'|'high' // governs auto-PR vs issue vs Slack-only
  proposedAction: string          // concrete what-to-do
  proposedFiles: string[]         // candidate files in ethan-admin to touch
  rationale: string               // why this matters for Ethan's stack
  status: 'new'|'reviewed'|'accepted'|'rejected'|'queued'|'applying'|'shipped'|'apply_failed'|'archived'
  prNumber?: number               // populated after apply worker opens PR
  prUrl?: string
  applyError?: string             // populated if gates failed
  outcome?: string                // free text after action taken
  outcomeMetric?: string          // optional metric link (reply rate, cost, etc)
  notes?: string[]
  searchQuery?: string            // which query surfaced it
  rawSnippet?: string
  createdAt: Date
  updatedAt: Date
}

// GET /api/ai-research — list findings with filters
export async function GET(req: NextRequest) {
  const db = await getDb()
  const url = req.nextUrl
  const status = url.searchParams.get('status') || 'new'
  const category = url.searchParams.get('category')
  const minScore = parseInt(url.searchParams.get('minScore') || '0')
  const limit = parseInt(url.searchParams.get('limit') || '100')

  const query: Record<string, unknown> = {}
  if (status !== 'all') query.status = status
  if (category) query.category = category
  if (minScore > 0) query.relevanceScore = { $gte: minScore }

  const findings = await db.collection('ai_findings')
    .find(query)
    .sort({ relevanceScore: -1, createdAt: -1 })
    .limit(limit)
    .toArray()

  const counts = await db.collection('ai_findings').aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]).toArray()

  const lastSync = await db.collection('ai_findings')
    .find({}).sort({ createdAt: -1 }).limit(1).toArray()

  return NextResponse.json({
    ok: true,
    findings,
    counts,
    lastSyncedAt: lastSync[0]?.createdAt || null,
  })
}

// POST /api/ai-research — mutations (review/accept/reject/note/feedback-loop)
export async function POST(req: NextRequest) {
  const db = await getDb()
  const body = await req.json()
  const { action } = body

  if (action === 'accept') {
    await db.collection('ai_findings').updateOne(
      { _id: new ObjectId(body.id) },
      { $set: { status: 'accepted', updatedAt: new Date() } }
    )
    return NextResponse.json({ ok: true })
  }

  if (action === 'reject') {
    await db.collection('ai_findings').updateOne(
      { _id: new ObjectId(body.id) },
      { $set: { status: 'rejected', outcome: body.reason || '', updatedAt: new Date() } }
    )
    return NextResponse.json({ ok: true })
  }

  if (action === 'archive') {
    await db.collection('ai_findings').updateOne(
      { _id: new ObjectId(body.id) },
      { $set: { status: 'archived', updatedAt: new Date() } }
    )
    return NextResponse.json({ ok: true })
  }

  if (action === 'mark_shipped') {
    await db.collection('ai_findings').updateOne(
      { _id: new ObjectId(body.id) },
      { $set: { status: 'shipped', outcome: body.outcome || '', outcomeMetric: body.metric || '', updatedAt: new Date() } }
    )
    return NextResponse.json({ ok: true })
  }

  // Queue an accepted finding for the auto-apply worker.
  if (action === 'queue_for_apply') {
    await db.collection('ai_findings').updateOne(
      { _id: new ObjectId(body.id) },
      { $set: { status: 'queued', updatedAt: new Date() } }
    )
    return NextResponse.json({ ok: true })
  }

  // Cancel a queued finding (move back to accepted).
  if (action === 'cancel_apply') {
    await db.collection('ai_findings').updateOne(
      { _id: new ObjectId(body.id) },
      { $set: { status: 'accepted', updatedAt: new Date() } }
    )
    return NextResponse.json({ ok: true })
  }

  // Worker-only: report apply outcome (success → shipped, fail → apply_failed).
  if (action === 'report_apply') {
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (body.success) {
      set.status = 'shipped'
      set.prNumber = body.prNumber
      set.prUrl = body.prUrl
      set.outcome = body.outcome || `auto-merged PR #${body.prNumber}`
    } else {
      set.status = 'apply_failed'
      set.applyError = body.error || 'unknown'
      if (body.prNumber) set.prNumber = body.prNumber
      if (body.prUrl) set.prUrl = body.prUrl
    }
    await db.collection('ai_findings').updateOne(
      { _id: new ObjectId(body.id) },
      { $set: set }
    )
    return NextResponse.json({ ok: true })
  }

  // Worker-only: mark a queued finding as in-progress so two runs don't collide.
  if (action === 'mark_applying') {
    await db.collection('ai_findings').updateOne(
      { _id: new ObjectId(body.id) },
      { $set: { status: 'applying', updatedAt: new Date() } }
    )
    return NextResponse.json({ ok: true })
  }

  if (action === 'note') {
    await db.collection('ai_findings').updateOne(
      { _id: new ObjectId(body.id) },
      { $push: { notes: body.note }, $set: { updatedAt: new Date() } }
    )
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 })
}
