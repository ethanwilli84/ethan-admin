export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export interface IGAccount {
  _id?: string
  id: string           // slug: "sire-ship"
  name: string         // "Sire Ship"
  assetId: string      // "162845390237140" from Meta URL
  igHandle?: string    // "@sireship"
  active: boolean
  // Derived URLs
  reelsUrl: string     // bulk_upload_composer?asset_id=...
  storiesUrl: string   // story_composer?asset_id=...
  postsUrl: string     // posts/create?asset_id=...
  createdAt: string
}

function buildUrls(assetId: string) {
  return {
    reelsUrl: `https://business.facebook.com/latest/bulk_upload_composer?asset_id=${assetId}`,
    storiesUrl: `https://business.facebook.com/latest/story_composer/?ref=biz_web_home_stories&asset_id=${assetId}&context_ref=HOME`,
    postsUrl: `https://business.facebook.com/latest/posts/create?asset_id=${assetId}`,
  }
}

export async function GET() {
  const db = await getDb()
  const accounts = await db.collection<IGAccount>('social_accounts').find({}).sort({ name: 1 }).toArray()
  return NextResponse.json({ ok: true, accounts })
}

export async function POST(req: NextRequest) {
  const db = await getDb()
  const body = await req.json()
  const { name, assetId, igHandle } = body
  if (!name || !assetId) return NextResponse.json({ ok: false, error: 'name and assetId required' }, { status: 400 })
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const account: IGAccount = {
    id, name, assetId, igHandle: igHandle || '',
    active: true,
    ...buildUrls(assetId),
    createdAt: new Date().toISOString(),
  }
  const exists = await db.collection('social_accounts').findOne({ id })
  if (exists) {
    await db.collection('social_accounts').updateOne({ id }, { $set: { ...account } })
    return NextResponse.json({ ok: true, updated: true })
  }
  await db.collection('social_accounts').insertOne(account as unknown as import('mongodb').OptionalId<import('mongodb').Document>)
  return NextResponse.json({ ok: true, created: true, id })
}

export async function PATCH(req: NextRequest) {
  const db = await getDb()
  const { id, ...update } = await req.json()
  if (update.assetId) Object.assign(update, buildUrls(update.assetId))
  await db.collection('social_accounts').updateOne({ id }, { $set: update })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const db = await getDb()
  const { id } = await req.json()
  await db.collection('social_accounts').deleteOne({ id })
  return NextResponse.json({ ok: true })
}
