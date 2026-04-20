import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { setStatus, updateAdSetBudget, type CampaignStatus } from '@/lib/meta-ads/entities'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// GET /api/ads/campaigns?accountId=sire-ship
// Returns joined view: campaigns + their adsets + ads
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('accountId') || 'sire-ship'
  const db = await getDb()

  const campaigns = await db.collection('ads_campaigns').find({ accountId }).sort({ createdAt: -1 }).toArray()
  const adsets = await db.collection('ads_adsets').find({ accountId }).toArray()
  const ads = await db.collection('ads_ads').find({ accountId }).toArray()

  // Attach metrics (latest hour) for each ad
  const latestByAd = await db.collection('ads_metrics_hourly').aggregate([
    { $match: { accountId, level: 'ad' } },
    { $sort: { hour: -1 } },
    { $group: { _id: '$metaId', latest: { $first: '$$ROOT' } } },
  ]).toArray()
  const metricsByAd = new Map(latestByAd.map(m => [m._id, m.latest]))

  const campaignView = campaigns.map(c => ({
    ...c,
    adsets: adsets.filter(s => s.campaignMetaId === c.metaId).map(s => ({
      ...s,
      ads: ads.filter(a => a.adsetMetaId === s.metaId).map(a => ({
        ...a, metrics: metricsByAd.get(a.metaId) || null,
      })),
    })),
  }))

  return NextResponse.json({ ok: true, campaigns: campaignView })
}

// POST  { action: 'set_status' | 'set_budget', metaId, status?, budgetCents? }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const db = await getDb()

  if (body.action === 'set_status') {
    const status = body.status as CampaignStatus
    await setStatus(body.metaId, status)
    await db.collection('ads_campaigns').updateOne({ metaId: body.metaId }, { $set: { status } })
    await db.collection('ads_adsets').updateOne({ metaId: body.metaId }, { $set: { status } })
    await db.collection('ads_ads').updateOne({ metaId: body.metaId }, { $set: { status } })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'set_budget') {
    await updateAdSetBudget(body.metaId, body.budgetCents)
    await db.collection('ads_adsets').updateOne({ metaId: body.metaId }, { $set: { dailyBudgetCents: body.budgetCents } })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 })
}
