export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const db = await getDb()
    const col = db.collection('outreach_records')

    // Prevent duplicate entries for same name + date
    const existing = await col.findOne({
      name: body.name,
      date: body.date,
      campaign: body.campaign,
    })
    if (existing) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'duplicate' })
    }

    await col.insertOne({
      ...body,
      createdAt: new Date(),
    })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Log error:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, message: 'Log endpoint live' })
}
