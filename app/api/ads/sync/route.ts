import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getInsights } from '@/lib/meta-ads/insights'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// POST /api/ads/sync
// Pulls today's metrics for every active ad, adset, campaign and snapshots them hourly.
// Designed to be called every hour by cron-job.org (same pattern as social publisher).
export async function POST(req: NextRequest) {
  const db = await getDb()
  const body = await req.json().catch(() => ({}))
  const accountId = body.accountId || 'sire-ship'

  const campaigns = await db.collection('ads_campaigns').find({ accountId }).toArray()
  const adsets    = await db.collection('ads_adsets').find({ accountId }).toArray()
  const ads       = await db.collection('ads_ads').find({ accountId }).toArray()

  const hour = new Date()
  hour.setMinutes(0, 0, 0)
  const hourIso = hour.toISOString()

  let writes = 0
  const failures: Array<{ level: string; metaId: string; error: string }> = []

  async function snapshot(level: 'campaign' | 'adset' | 'ad', metaId: string) {
    try {
      const r = await getInsights({ object_id: metaId, level, date_preset: 'today' })
      const row = r.data?.[0]
      if (!row) return

      // Extract conversion count from actions array
      const actions = (row.actions as Array<{ action_type: string; value: string }> | undefined) ?? []
      const leads        = Number(actions.find(a => a.action_type === 'lead')?.value ?? 0)
      const regs         = Number(actions.find(a => a.action_type === 'complete_registration')?.value ?? 0)
      const purchases    = Number(actions.find(a => a.action_type === 'purchase')?.value ?? 0)
      const linkClicks   = Number(actions.find(a => a.action_type === 'link_click')?.value ?? 0)

      const doc = {
        accountId, level, metaId, hour: hourIso,
        spend:       Number(row.spend ?? 0),
        impressions: Number(row.impressions ?? 0),
        reach:       Number(row.reach ?? 0),
        clicks:      Number(row.clicks ?? 0),
        linkClicks, leads, regs, purchases,
        ctr:         Number(row.ctr ?? 0),
        cpc:         Number(row.cpc ?? 0),
        cpm:         Number(row.cpm ?? 0),
        frequency:   Number(row.frequency ?? 0),
        snappedAt: new Date().toISOString(),
      }
      await db.collection('ads_metrics_hourly').updateOne(
        { accountId, level, metaId, hour: hourIso },
        { $set: doc },
        { upsert: true },
      )
      writes++
    } catch (e) {
      failures.push({ level, metaId, error: (e as Error).message })
    }
  }

  for (const c of campaigns) await snapshot('campaign', c.metaId as string)
  for (const s of adsets)    await snapshot('adset',    s.metaId as string)
  for (const a of ads)       await snapshot('ad',       a.metaId as string)

  return NextResponse.json({ ok: true, writes, failures })
}
