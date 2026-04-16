export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export async function GET(req: NextRequest) {
  const db = await getDb()
  const status = req.nextUrl.searchParams.get('status')
  const accountId = req.nextUrl.searchParams.get('accountId')
  const type = req.nextUrl.searchParams.get('type')
  const today = req.nextUrl.searchParams.get('today')
  const filter: Record<string, unknown> = {}
  if (status && status !== 'all') filter.status = status
  if (accountId) filter.accountId = accountId
  if (type) filter.type = type
  if (today) {
    const d = new Date()
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString()
    filter.scheduledDate = { $gte: start, $lt: end }
  }
  const items = await db.collection('social_queue')
    .find(filter).sort({ scheduledDate: 1, order: 1 }).toArray()
  return NextResponse.json({ ok: true, items })
}

export async function POST(req: NextRequest) {
  const db = await getDb()
  const { items } = await req.json()
  if (!items?.length) return NextResponse.json({ ok: false, error: 'No items' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await db.collection('social_queue').insertMany(
    items.map((item: Record<string, unknown>) => ({ ...item, createdAt: new Date().toISOString() })) as any
  )
  return NextResponse.json({ ok: true, inserted: result.insertedCount })
}

export async function PATCH(req: NextRequest) {
  const db = await getDb()
  const { id, ...update } = await req.json()
  await db.collection('social_queue').updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...update, updatedAt: new Date().toISOString() } }
  )
  return NextResponse.json({ ok: true })
}

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
