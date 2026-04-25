export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/mongodb'

const VALID_SECTIONS = new Set(['ai_news', 'stuff_that_affects_my_life'])

export async function GET() {
  const db = await getDb()
  const rows = await db.collection('brief_sources').find({}).sort({ name: 1 }).toArray()
  return NextResponse.json({
    sources: rows.map((r) => ({ ...r, _id: String(r._id) })),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const name = String(body.name || '').trim().slice(0, 80)
  const url = String(body.url || '').trim().slice(0, 500)
  const section_hint = String(body.section_hint || 'ai_news')

  if (!name || !url) {
    return NextResponse.json({ ok: false, error: 'name and url required' }, { status: 400 })
  }
  if (!VALID_SECTIONS.has(section_hint)) {
    return NextResponse.json({ ok: false, error: 'invalid section_hint' }, { status: 400 })
  }
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ ok: false, error: 'url must be http(s)' }, { status: 400 })
  }

  const db = await getDb()
  await db.collection('brief_sources').insertOne({
    name,
    url,
    section_hint,
    enabled: body.enabled !== false,
    created_at: new Date(),
  })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const id = String(body.id || '')
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })
  }
  const update: Record<string, unknown> = {}
  if (typeof body.enabled === 'boolean') update.enabled = body.enabled
  const db = await getDb()
  await db
    .collection('brief_sources')
    .updateOne({ _id: new ObjectId(id) }, { $set: update })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })
  }
  const db = await getDb()
  await db.collection('brief_sources').deleteOne({ _id: new ObjectId(id) })
  return NextResponse.json({ ok: true })
}
