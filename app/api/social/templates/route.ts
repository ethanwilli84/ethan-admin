export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export interface TemplateVariation {
  variationNum: number
  url: string
  title: string
  uploadedAt: string
}

export interface ContentTemplate {
  _id?: string
  accountId: string
  contentType: 'reel' | 'story' | 'post'
  name: string          // "Template 1"
  caption: string       // same for all variations
  order: number         // 1–4 — determines interleave order
  variations: TemplateVariation[]
  variationCount: number
  createdAt: string
  updatedAt: string
}

export async function GET(req: NextRequest) {
  const db = await getDb()
  const accountId = req.nextUrl.searchParams.get('accountId')
  const contentType = req.nextUrl.searchParams.get('contentType')
  const filter: Record<string, unknown> = {}
  if (accountId) filter.accountId = accountId
  if (contentType) filter.contentType = contentType
  const templates = await db.collection<ContentTemplate>('social_templates')
    .find(filter).sort({ accountId: 1, contentType: 1, order: 1 }).toArray()
  return NextResponse.json({ ok: true, templates })
}

// POST — create template or add variation
export async function POST(req: NextRequest) {
  const db = await getDb()
  const body = await req.json()
  const { accountId, contentType, name, caption, order, variation } = body

  if (variation) {
    // Adding a variation to existing template
    const { templateId, variationNum, url, title } = variation
    const v: TemplateVariation = { variationNum, url, title, uploadedAt: new Date().toISOString() }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.collection('social_templates') as any).updateOne(
      { _id: new ObjectId(templateId) },
      { $push: { variations: v }, $inc: { variationCount: 1 }, $set: { updatedAt: new Date().toISOString() } }
    )
    return NextResponse.json({ ok: true, added: true })
  }

  // Create new template
  const template: ContentTemplate = {
    accountId, contentType, name, caption: caption || '', order: order || 1,
    variations: [], variationCount: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }
  const result = await db.collection('social_templates').insertOne(
    template as unknown as import('mongodb').OptionalId<import('mongodb').Document>
  )
  return NextResponse.json({ ok: true, id: result.insertedId })
}

// PATCH — update caption/name/order on a template, or replace all variations
export async function PATCH(req: NextRequest) {
  const db = await getDb()
  const { id, variations, ...update } = await req.json()
  const set: Record<string, unknown> = { ...update, updatedAt: new Date().toISOString() }
  if (variations !== undefined) {
    set.variations = variations
    set.variationCount = variations.length
  }
  await db.collection('social_templates').updateOne({ _id: new ObjectId(id) }, { $set: set })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const db = await getDb()
  const { id } = await req.json()
  await db.collection('social_templates').deleteOne({ _id: new ObjectId(id) })
  return NextResponse.json({ ok: true })
}
