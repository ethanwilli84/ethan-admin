export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

// Central contact database - tracks every contact across all campaigns and channels
// Prevents duplicate outreach to same person from different campaigns

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')
  const campaign = req.nextUrl.searchParams.get('campaign')
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '100')
  const db = await getDb()

  const filter: Record<string, unknown> = {}
  if (email) filter.email = { $regex: email, $options: 'i' }
  if (campaign) filter.campaign = campaign

  const contacts = await db.collection('contacted_contacts')
    .find(filter)
    .sort({ contactedAt: -1 })
    .limit(limit)
    .toArray()

  return NextResponse.json(contacts)
}

export async function POST(req: NextRequest) {
  // Check if contact was already reached out to (dedup check)
  const { action, email, channel, campaign, platformName, dedupWindowDays } = await req.json()
  const db = await getDb()

  if (action === 'check') {
    const windowDays = dedupWindowDays ?? 90
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    const existing = await db.collection('contacted_contacts').findOne({
      email: email.toLowerCase().trim(),
      contactedAt: { $gte: since },
    })
    return NextResponse.json({
      alreadyContacted: !!existing,
      lastContact: existing ? {
        campaign: existing.campaign,
        platform: existing.platformName,
        channel: existing.channel,
        date: existing.contactedAt,
      } : null
    })
  }

  if (action === 'record') {
    await db.collection('contacted_contacts').insertOne({
      email: email.toLowerCase().trim(),
      channel: channel || 'email',
      campaign,
      platformName,
      contactedAt: new Date(),
    })
    return NextResponse.json({ ok: true })
  }

  if (action === 'bulk_record') {
    const { contacts } = await req.json()
    if (contacts?.length) {
      await db.collection('contacted_contacts').insertMany(
        contacts.map((c: { email: string; channel?: string; campaign: string; platformName: string }) => ({
          email: c.email.toLowerCase().trim(),
          channel: c.channel || 'email',
          campaign: c.campaign,
          platformName: c.platformName,
          contactedAt: new Date(),
        }))
      )
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
