export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export async function GET(req: NextRequest) {
  const db = await getDb()
  const accountId = req.nextUrl.searchParams.get('accountId') || 'sire-ship'
  const settings = await db.collection('social_settings').findOne({ accountId })
  return NextResponse.json({ ok: true, settings: settings || {} })
}

export async function POST(req: NextRequest) {
  const db = await getDb()
  const body = await req.json()
  const { accountId = 'sire-ship', ...updates } = body
  await db.collection('social_settings').updateOne(
    { accountId },
    { $set: { ...updates, accountId, updatedAt: new Date().toISOString() } },
    { upsert: true }
  )
  return NextResponse.json({ ok: true })
}
