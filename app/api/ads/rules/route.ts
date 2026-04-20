import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { setStatus, updateAdSetBudget } from '@/lib/meta-ads/entities'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Nightly cron /api/ads/rules kills losers + scales winners.
// Rules (editable via ads_rules collection, defaults below):
//   killIfCacAbove: $X before pausing
//   killIfFrequencyAbove: 3.5  (creative fatigue)
//   scaleWinnersPct: +20%/day if CAC < target
//   minSpendBeforeJudgement: $10  (dont kill an ad that only spent $2)
//
// Only affects ACTIVE ads — paused ones are left alone.

type Rule = {
  accountId: string
  killIfCacAboveCents?: number
  targetCacCents?: number
  killIfFrequencyAbove?: number
  scaleWinnersPct?: number
  minSpendBeforeJudgementCents?: number
}

const DEFAULTS: Required<Omit<Rule, 'accountId'>> = {
  killIfCacAboveCents:       6000,   // $60
  targetCacCents:            3000,   // $30
  killIfFrequencyAbove:      3.5,
  scaleWinnersPct:           20,
  minSpendBeforeJudgementCents: 1000, // $10
}

async function getRules(accountId: string): Promise<Required<Rule>> {
  const db = await getDb()
  const saved = await db.collection('ads_rules').findOne({ accountId }) as Partial<Rule> | null
  return {
    accountId,
    killIfCacAboveCents:         saved?.killIfCacAboveCents          ?? DEFAULTS.killIfCacAboveCents,
    targetCacCents:              saved?.targetCacCents               ?? DEFAULTS.targetCacCents,
    killIfFrequencyAbove:        saved?.killIfFrequencyAbove         ?? DEFAULTS.killIfFrequencyAbove,
    scaleWinnersPct:             saved?.scaleWinnersPct              ?? DEFAULTS.scaleWinnersPct,
    minSpendBeforeJudgementCents:saved?.minSpendBeforeJudgementCents ?? DEFAULTS.minSpendBeforeJudgementCents,
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const accountId = body.accountId || 'sire-ship'
  const dryRun = !!body.dryRun

  const db = await getDb()
  const rules = await getRules(accountId)

  // Aggregate last-7d metrics per ad to smooth hourly noise
  const since = new Date(Date.now() - 7 * 86400000).toISOString()
  const aggregation = await db.collection('ads_metrics_hourly').aggregate([
    { $match: { accountId, level: 'ad', hour: { $gte: since } } },
    { $group: {
        _id: '$metaId',
        spend:       { $sum: '$spend' },
        impressions: { $sum: '$impressions' },
        leads:       { $sum: '$leads' },
        regs:        { $sum: '$regs' },
        purchases:   { $sum: '$purchases' },
        avgFrequency:{ $avg: '$frequency' },
    }},
  ]).toArray()

  const actions: Array<{ metaId: string; action: string; reason: string; dryRun: boolean }> = []

  for (const m of aggregation) {
    const spendCents = Math.round((m.spend as number) * 100)
    if (spendCents < rules.minSpendBeforeJudgementCents) continue

    const conversions = (m.leads as number) + (m.regs as number) + (m.purchases as number)
    const cacCents = conversions > 0 ? Math.round(spendCents / conversions) : Infinity

    const ad = await db.collection('ads_ads').findOne({ metaId: m._id })
    if (!ad || ad.status !== 'ACTIVE') continue

    // Rule 1 — kill if CAC too high
    if (cacCents > rules.killIfCacAboveCents) {
      if (!dryRun) {
        await setStatus(ad.metaId as string, 'PAUSED')
        await db.collection('ads_ads').updateOne({ _id: ad._id }, { $set: { status: 'PAUSED', pausedBy: 'rules', pausedReason: `CAC $${(cacCents/100).toFixed(2)} > threshold $${(rules.killIfCacAboveCents/100).toFixed(2)}`, pausedAt: new Date().toISOString() } })
      }
      actions.push({ metaId: ad.metaId as string, action: 'paused', reason: `CAC $${(cacCents/100).toFixed(2)} > $${(rules.killIfCacAboveCents/100).toFixed(2)}`, dryRun })
      continue
    }

    // Rule 2 — kill if creative fatigued
    if ((m.avgFrequency as number) > rules.killIfFrequencyAbove) {
      if (!dryRun) {
        await setStatus(ad.metaId as string, 'PAUSED')
        await db.collection('ads_ads').updateOne({ _id: ad._id }, { $set: { status: 'PAUSED', pausedBy: 'rules', pausedReason: `Frequency ${(m.avgFrequency as number).toFixed(2)} > ${rules.killIfFrequencyAbove} (fatigued)`, pausedAt: new Date().toISOString() } })
      }
      actions.push({ metaId: ad.metaId as string, action: 'paused', reason: `Frequency ${(m.avgFrequency as number).toFixed(2)} fatigued`, dryRun })
      continue
    }

    // Rule 3 — scale winners (ad set level)
    if (conversions >= 2 && cacCents < rules.targetCacCents) {
      const adset = await db.collection('ads_adsets').findOne({ metaId: ad.adsetMetaId })
      if (adset && adset.status === 'ACTIVE') {
        const currentBudget = Number(adset.dailyBudgetCents)
        const newBudget = Math.round(currentBudget * (1 + rules.scaleWinnersPct / 100))
        if (!dryRun) {
          await updateAdSetBudget(adset.metaId as string, newBudget)
          await db.collection('ads_adsets').updateOne({ _id: adset._id }, { $set: { dailyBudgetCents: newBudget, lastScaledAt: new Date().toISOString() } })
        }
        actions.push({ metaId: adset.metaId as string, action: 'scaled', reason: `CAC $${(cacCents/100).toFixed(2)} < target $${(rules.targetCacCents/100).toFixed(2)}, budget ${currentBudget}¢ → ${newBudget}¢`, dryRun })
      }
    }
  }

  return NextResponse.json({ ok: true, dryRun, actions, rulesUsed: rules })
}
