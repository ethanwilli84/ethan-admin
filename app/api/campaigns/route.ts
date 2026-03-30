import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

// Seed influence outreach as the default campaign if none exist
const DEFAULT_CAMPAIGN = {
  slug: 'influence-outreach',
  name: 'Influence Outreach',
  description: 'Daily automated outreach to podcasts and speaking panels',
  icon: '🎙️',
  color: '#f97316',
  active: true,
  githubRepo: 'ethanwilli84/influence-outreach',
  githubWorkflow: 'daily_outreach.yml',
  createdAt: new Date(),
}

export async function GET() {
  const db = await getDb()
  let campaigns = await db.collection('campaigns').find({}).toArray()
  if (campaigns.length === 0) {
    await db.collection('campaigns').insertOne(DEFAULT_CAMPAIGN)
    campaigns = await db.collection('campaigns').find({}).toArray()
  }
  return NextResponse.json(campaigns)
}

export async function POST(req: Request) {
  const body = await req.json()
  const db = await getDb()
  const result = await db.collection('campaigns').insertOne({
    ...body,
    active: true,
    createdAt: new Date(),
  })
  return NextResponse.json({ ok: true, id: result.insertedId })
}
