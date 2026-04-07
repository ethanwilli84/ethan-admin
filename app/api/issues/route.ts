export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export interface Issue {
  _id?: ObjectId
  title: string
  description: string
  channel: 'imessage'|'slack'|'email_sire'|'email_sireapps'|'whatsapp'|'google_voice'
  channelRef: string        // thread ID, Slack ts, message ID etc.
  from: string              // contact name/number/email
  fromRaw: string           // raw identifier
  product: 'sire'|'alpine'|'both'|'unknown'
  category: string          // checkout, payout, label, account, plaid, chargeback, etc.
  severity: 'critical'|'high'|'medium'|'low'
  status: 'open'|'in_progress'|'resolved'|'dismissed'
  resolution?: string
  resolvedAt?: Date
  resolvedBy?: string       // 'code_commit'|'slack_reply'|'email_reply'|'imessage_reply'|'manual'
  linkedIssueIds?: string[] // same person across channels
  notes?: string[]
  rawMessage: string
  syncedAt: Date
  createdAt: Date
  updatedAt: Date
}

// GET /api/issues — list issues with filters
export async function GET(req: NextRequest) {
  const db = await getDb()
  const url = req.nextUrl
  const status = url.searchParams.get('status') || 'open'
  const channel = url.searchParams.get('channel')
  const product = url.searchParams.get('product')
  const severity = url.searchParams.get('severity')
  const limit = parseInt(url.searchParams.get('limit') || '50')

  const query: Record<string, unknown> = {}
  if (status !== 'all') query.status = status
  if (channel) query.channel = channel
  if (product) query.product = product
  if (severity) query.severity = severity

  const issues = await db.collection('issues')
    .find(query)
    .sort({ severity: 1, createdAt: -1 })
    .limit(limit)
    .toArray()

  const counts = await db.collection('issues').aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]).toArray()

  return NextResponse.json({ ok: true, issues, counts })
}

// POST /api/issues — create or upsert issue
export async function POST(req: NextRequest) {
  const db = await getDb()
  const body = await req.json()
  const { action } = body

  if (action === 'resolve') {
    await db.collection('issues').updateOne(
      { _id: new ObjectId(body.id) },
      { $set: { status: 'resolved', resolution: body.resolution, resolvedAt: new Date(), resolvedBy: 'manual', updatedAt: new Date() } }
    )
    return NextResponse.json({ ok: true })
  }

  if (action === 'dismiss') {
    await db.collection('issues').updateOne(
      { _id: new ObjectId(body.id) },
      { $set: { status: 'dismissed', updatedAt: new Date() } }
    )
    return NextResponse.json({ ok: true })
  }

  if (action === 'note') {
    await db.collection('issues').updateOne(
      { _id: new ObjectId(body.id) },
      { $push: { notes: body.note }, $set: { updatedAt: new Date() } }
    )
    return NextResponse.json({ ok: true })
  }

  if (action === 'link') {
    // Link two issues as related (same person, different channels)
    await db.collection('issues').updateOne(
      { _id: new ObjectId(body.id) },
      { $addToSet: { linkedIssueIds: body.linkId }, $set: { updatedAt: new Date() } }
    )
    await db.collection('issues').updateOne(
      { _id: new ObjectId(body.linkId) },
      { $addToSet: { linkedIssueIds: body.id }, $set: { updatedAt: new Date() } }
    )
    return NextResponse.json({ ok: true })
  }

  // Upsert by channelRef to avoid duplicates
  const issue: Partial<Issue> = {
    ...body.issue,
    updatedAt: new Date(),
    syncedAt: new Date(),
  }
  if (!issue.createdAt) issue.createdAt = new Date()

  const result = await db.collection('issues').findOneAndUpdate(
    { channelRef: issue.channelRef },
    { $set: issue, $setOnInsert: { createdAt: new Date() } },
    { upsert: true, returnDocument: 'after' }
  )

  return NextResponse.json({ ok: true, issue: result })
}
