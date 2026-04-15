export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export interface QueueItem {
  _id?: string
  title: string
  caption: string
  videoUrl: string       // public CDN URL on DO Spaces
  thumbnailUrl?: string  // first frame, optional
  platform: 'instagram'
  type: 'reel'
  scheduledDate: string  // ISO date string
  status: 'scheduled' | 'posted' | 'failed' | 'skipped'
  postedAt?: string
  igMediaId?: string
  errorMsg?: string
  order: number          // position in the queue (1-based)
  batchId: string        // links items from same upload session
  createdAt: string
}

// GET /api/social/queue — list all items, optionally filter by status/date
export async function GET(req: NextRequest) {
  const db = await getDb()
  const status = req.nextUrl.searchParams.get('status')
  const today = req.nextUrl.searchParams.get('today')
  const filter: Record<string, unknown> = {}
  if (status) filter.status = status
  if (today) {
    const d = new Date()
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString()
    filter.scheduledDate = { $gte: start, $lt: end }
  }
  const items = await db.collection<QueueItem>('social_queue')
    .find(filter).sort({ scheduledDate: 1, order: 1 }).toArray()
  return NextResponse.json({ ok: true, items })
}

// POST /api/social/queue — create queue items (bulk from one upload session)
export async function POST(req: NextRequest) {
  const db = await getDb()
  const body = await req.json()
  const { items } = body as { items: QueueItem[] }
  if (!items?.length) return NextResponse.json({ ok: false, error: 'No items' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await db.collection('social_queue').insertMany(
    items.map(item => ({ ...item, createdAt: new Date().toISOString() })) as any
  )
  return NextResponse.json({ ok: true, inserted: result.insertedCount })
}

// PATCH /api/social/queue — update one item (status, caption, date)
export async function PATCH(req: NextRequest) {
  const db = await getDb()
  const { id, ...update } = await req.json()
  await db.collection('social_queue').updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...update, updatedAt: new Date().toISOString() } }
  )
  return NextResponse.json({ ok: true })
}

// DELETE /api/social/queue — delete one or all items in a batch
export async function DELETE(req: NextRequest) {
  const db = await getDb()
  const { id, batchId } = await req.json()
  if (batchId) {
    await db.collection('social_queue').deleteMany({ batchId, status: 'scheduled' })
  } else if (id) {
    await db.collection('social_queue').deleteOne({ _id: new ObjectId(id) })
  }
  return NextResponse.json({ ok: true })
}
