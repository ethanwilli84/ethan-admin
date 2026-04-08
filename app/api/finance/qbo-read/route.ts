export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export async function GET() {
  const db = await getDb()
  const latest = await db.collection('qbo_daily_sync').findOne({}, { sort: { syncedAt: -1 } })
  const creds = await db.collection('qbo_credentials').findOne({})
  return NextResponse.json({ ok: true, latest, connected: !!creds })
}
