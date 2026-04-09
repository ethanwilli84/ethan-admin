export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

// GET — query lead pool for a campaign
export async function GET(req: NextRequest) {
  const db = await getDb()
  const campaign = req.nextUrl.searchParams.get('campaign')
  const status = req.nextUrl.searchParams.get('status') || 'pending'
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50')
  const source = req.nextUrl.searchParams.get('source')

  const query: Record<string, unknown> = {}
  if (campaign) query.campaigns = campaign  // array field — $in match
  if (status !== 'all') query.status = status
  if (source) query.source = source

  const leads = await db.collection('lead_pool')
    .find(query)
    .sort({ score: -1, createdAt: 1 })
    .limit(limit)
    .toArray()

  const totalByStatus = await db.collection('lead_pool').aggregate([
    { $match: campaign ? { campaigns: campaign } : {} },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]).toArray()

  const bySource = await db.collection('lead_pool').aggregate([
    { $match: campaign ? { campaigns: campaign } : {} },
    { $group: { _id: '$source', count: { $sum: 1 } } }
  ]).toArray()

  return NextResponse.json({ ok: true, leads, totalByStatus, bySource, count: leads.length })
}

// POST — add leads to pool (from any source)
export async function POST(req: NextRequest) {
  const db = await getDb()
  const { leads, source, campaigns: targetCampaigns } = await req.json()

  if (!Array.isArray(leads) || leads.length === 0) {
    return NextResponse.json({ ok: false, error: 'leads array required' }, { status: 400 })
  }

  let inserted = 0, dupes = 0

  for (const lead of leads) {
    const name = (lead.name || '').trim()
    const website = (lead.website || lead.domain || '').trim().toLowerCase().replace(/\/$/, '')
    if (!name) continue

    // Dedup by name + website
    const existing = await db.collection('lead_pool').findOne({
      $or: [
        { name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        ...(website ? [{ website }] : [])
      ]
    })

    if (existing) {
      // Update campaigns list if not already there
      if (targetCampaigns?.length) {
        await db.collection('lead_pool').updateOne(
          { _id: existing._id },
          { $addToSet: { campaigns: { $each: targetCampaigns } }, $set: { updatedAt: new Date() } }
        )
      }
      dupes++
      continue
    }

    await db.collection('lead_pool').insertOne({
      name,
      website,
      category: lead.category || lead.type || 'unknown',
      description: lead.description || lead.bio || '',
      email: lead.email || null,
      contactPage: lead.contactPage || lead.contact_page || null,
      phone: lead.phone || null,
      location: lead.location || lead.city || null,
      source,
      campaigns: targetCampaigns || [],
      status: 'pending',    // pending | contacted | replied | converted | skip
      score: lead.score || 50,  // 0-100 relevance score
      metadata: lead.metadata || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    inserted++
  }

  return NextResponse.json({ ok: true, inserted, dupes, total: inserted + dupes })
}

// PATCH — update lead status (called after outreach sends)
export async function PATCH(req: NextRequest) {
  const { name, website, status, contactedBy } = await req.json()
  const db = await getDb()
  const { ObjectId } = await import('mongodb')

  const query = name ? { name } : website ? { website } : null
  if (!query) return NextResponse.json({ ok: false, error: 'name or website required' })

  await db.collection('lead_pool').updateMany(
    query,
    { $set: { status, contactedBy, contactedAt: new Date(), updatedAt: new Date() } }
  )
  return NextResponse.json({ ok: true })
}

// DELETE — remove leads
export async function DELETE(req: NextRequest) {
  const { ids } = await req.json()
  const db = await getDb()
  const { ObjectId } = await import('mongodb')
  await db.collection('lead_pool').deleteMany({
    _id: { $in: ids.map((id: string) => new ObjectId(id)) }
  })
  return NextResponse.json({ ok: true })
}
