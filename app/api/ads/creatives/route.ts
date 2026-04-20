import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// GET /api/ads/creatives?accountId=sire-ship
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('accountId') || 'sire-ship'
  const db = await getDb()
  const items = await db.collection('ads_creatives')
    .find({ accountId })
    .sort({ createdAt: -1 })
    .toArray()
  return NextResponse.json({ ok: true, creatives: items })
}

// POST  body: { accountId, name, imageUrl, hook?, angle?, variant?, tags? }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { accountId = 'sire-ship', name, imageUrl, hook, angle, variant, tags = [] } = body
  if (!name || !imageUrl) {
    return NextResponse.json({ ok: false, error: 'name + imageUrl required' }, { status: 400 })
  }

  const db = await getDb()
  const now = new Date().toISOString()
  const doc = {
    accountId, name, imageUrl,
    hook: hook || '', angle: angle || '', variant: variant || '',
    tags,
    metaImageHash: null,   // populated lazily when we create an ad from it
    stats: { timesUsedInAds: 0 },
    createdAt: now, updatedAt: now,
  }
  const r = await db.collection('ads_creatives').insertOne(doc)
  return NextResponse.json({ ok: true, id: r.insertedId.toString(), creative: { ...doc, _id: r.insertedId } })
}

// DELETE  /api/ads/creatives?id=xxx
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
  const db = await getDb()
  await db.collection('ads_creatives').deleteOne({ _id: new ObjectId(id) })
  return NextResponse.json({ ok: true })
}
