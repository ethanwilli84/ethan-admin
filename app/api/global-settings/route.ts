export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

// Global settings: email accounts, dedup rules, channel configs
const DEFAULTS = {
  emailAccounts: [
    { id: 'default', email: 'ethan@sireapp.io', label: 'Ethan (Sire)', active: true, type: 'gmail' }
  ],
  dedupWindowDays: 90,         // Don't re-contact same email within 90 days
  dedupCrossChannel: true,      // Check across all channels (email, instagram, etc)
  dedupCrossCampaign: true,     // Check across all campaigns
  channels: {
    email: { enabled: true },
    instagram: { enabled: false, accounts: [] },
    facebook: { enabled: false, accounts: [] },
  },
  globalPause: false,
}

export async function GET() {
  const db = await getDb()
  const doc = await db.collection('global_settings').findOne({ key: 'config' })
  return NextResponse.json({ ...DEFAULTS, ...(doc?.value ?? {}) })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const db = await getDb()
  const existing = await db.collection('global_settings').findOne({ key: 'config' })
  const merged = { ...(existing?.value ?? {}), ...body }
  await db.collection('global_settings').updateOne(
    { key: 'config' },
    { $set: { key: 'config', value: merged, updatedAt: new Date() } },
    { upsert: true }
  )
  return NextResponse.json({ ok: true })
}
