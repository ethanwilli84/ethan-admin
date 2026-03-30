export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export async function GET(req: NextRequest) {
  const campaign = req.nextUrl.searchParams.get('campaign') || 'influence-outreach'
  const db = await getDb()
  const records = await db.collection('outreach_records')
    .find({ campaign })
    .sort({ createdAt: -1 })
    .limit(500)
    .toArray()
  return NextResponse.json(records)
}

export async function PATCH(req: NextRequest) {
  const { id, status, note } = await req.json()
  const { ObjectId } = await import('mongodb')
  const db = await getDb()
  await db.collection('outreach_records').updateOne(
    { _id: new ObjectId(id) },
    { $set: { status, note, updatedAt: new Date() } }
  )
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 })
  const { ObjectId } = await import('mongodb')
  const db = await getDb()
  await db.collection('outreach_records').deleteOne({ _id: new ObjectId(id) })
  return NextResponse.json({ ok: true })
}
