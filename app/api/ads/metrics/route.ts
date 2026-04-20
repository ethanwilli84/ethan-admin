import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

// GET /api/ads/metrics?accountId=sire-ship&level=ad|adset|campaign&metaId=xxx&windowHours=168
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const accountId = q.get('accountId') || 'sire-ship'
  const level = q.get('level') || 'ad'
  const metaId = q.get('metaId')
  const windowHours = Number(q.get('windowHours') || '168')

  const db = await getDb()
  const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString()
  const filter: Record<string, unknown> = { accountId, level, hour: { $gte: since } }
  if (metaId) filter.metaId = metaId

  const rows = await db.collection('ads_metrics_hourly')
    .find(filter).sort({ hour: 1 }).toArray()

  // Totals
  const totals = rows.reduce((acc, r) => {
    acc.spend       += Number(r.spend || 0)
    acc.impressions += Number(r.impressions || 0)
    acc.clicks      += Number(r.clicks || 0)
    acc.leads       += Number(r.leads || 0)
    acc.regs        += Number(r.regs || 0)
    acc.purchases   += Number(r.purchases || 0)
    return acc
  }, { spend: 0, impressions: 0, clicks: 0, leads: 0, regs: 0, purchases: 0 })

  const conv = totals.leads + totals.regs + totals.purchases
  const derived = {
    ctr: totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0,
    cpm: totals.impressions ? (totals.spend / totals.impressions) * 1000 : 0,
    cpc: totals.clicks ? totals.spend / totals.clicks : 0,
    cac: conv ? totals.spend / conv : 0,
    conversions: conv,
  }

  return NextResponse.json({ ok: true, totals, derived, rows })
}
