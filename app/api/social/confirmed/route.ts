export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

// Tracks dates that have been confirmed scheduled in Meta Business Suite
// Prevents the scheduler from double-booking a date on subsequent 15-day runs

export async function GET(req: NextRequest) {
  const db = await getDb()
  const accountId = req.nextUrl.searchParams.get('accountId')
  const date = req.nextUrl.searchParams.get('date') // YYYY-MM-DD

  if (accountId && date) {
    const exists = await db.collection('social_confirmed_dates').findOne({ accountId, date })
    return NextResponse.json({ ok: true, confirmed: !!exists })
  }

  // List all confirmed dates for an account
  const filter: Record<string, unknown> = {}
  if (accountId) filter.accountId = accountId
  const docs = await db.collection('social_confirmed_dates').find(filter).sort({ date: -1 }).limit(200).toArray()
  return NextResponse.json({ ok: true, confirmed: docs })
}

export async function POST(req: NextRequest) {
  const db = await getDb()
  const body = await req.json()
  const { accountId, type, date, scheduledAt, templateName, variationNum, confirmedAt } = body

  await db.collection('social_confirmed_dates').updateOne(
    { accountId, date, type },
    { $set: { accountId, type, date, scheduledAt, templateName, variationNum, confirmedAt: confirmedAt || new Date().toISOString() } },
    { upsert: true }
  )
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const db = await getDb()
  const { accountId, date, type } = await req.json()
  const filter: Record<string, unknown> = {}
  if (accountId) filter.accountId = accountId
  if (date) filter.date = date
  if (type) filter.type = type
  await db.collection('social_confirmed_dates').deleteMany(filter)
  return NextResponse.json({ ok: true })
}
