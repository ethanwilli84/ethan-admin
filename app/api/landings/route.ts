// /api/landings — list of lander sessions for the admin dashboard.
// Reads from `lander_sessions` (rolled-up summary written by /api/lander-track).
//
// Query params:
//   ?variant=A|B    — filter by A/B variant
//   ?from=ISO       — only sessions created at/after this timestamp
//   ?step=N         — only sessions whose highest step rank is >= N (e.g. 7 = reached savings)
//   ?utm_content=…  — filter by attribution.utm_content
//   ?limit=N        — page size (default 100, max 500)

import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500)
  const variant      = url.searchParams.get('variant')
  const fromIso      = url.searchParams.get('from')
  const minStep      = parseInt(url.searchParams.get('step') || '-1', 10)
  const utmContent   = url.searchParams.get('utm_content')

  const db   = await getDb()
  const sess = db.collection('lander_sessions')

  const q: Record<string, unknown> = {}
  // Default: exclude `variant=home` (nurture-page sessions live at /landings/home).
  // Caller can opt back in by explicitly passing variant=home.
  if (variant) q.variant = variant
  else         q.variant = { $ne: 'home' }
  if (fromIso)    q.createdAt = { $gte: new Date(fromIso) }
  if (minStep > -1) q.highestStepRank = { $gte: minStep }
  if (utmContent) q['attribution.utm_content'] = utmContent

  // Same default exclusion applies to the totals — otherwise nurture sessions
  // inflate the "all" count even though they have no funnel signal.
  const totalsFilter = { variant: { $ne: 'home' } }

  const [sessions, totalAll, totalSavings, totalTier, totalCardOpen, totalCardSubmit, totalTrial, byStep, byVariant] =
    await Promise.all([
      sess.find(q).sort({ lastSeenAt: -1 }).limit(limit).toArray(),
      sess.countDocuments(totalsFilter),
      sess.countDocuments({ ...totalsFilter, reachedSavings: true }),
      sess.countDocuments({ ...totalsFilter, reachedTierSelect: true }),
      sess.countDocuments({ ...totalsFilter, cardPopupOpened: true }),
      sess.countDocuments({ ...totalsFilter, cardSubmitted: true }),
      sess.countDocuments({ ...totalsFilter, trialStarted: true }),
      sess.aggregate([
        { $match: totalsFilter },
        { $group: { _id: '$highestStepName', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),
      sess.aggregate([
        { $match: totalsFilter },
        { $group: {
            _id: '$variant',
            sessions: { $sum: 1 },
            reachedSavings: { $sum: { $cond: ['$reachedSavings', 1, 0] } },
            reachedTier:    { $sum: { $cond: ['$reachedTierSelect', 1, 0] } },
            cardOpened:     { $sum: { $cond: ['$cardPopupOpened', 1, 0] } },
            cardSubmitted:  { $sum: { $cond: ['$cardSubmitted', 1, 0] } },
            trialStarted:   { $sum: { $cond: ['$trialStarted', 1, 0] } },
          } },
        { $sort: { sessions: -1 } },
      ]).toArray(),
    ])

  return NextResponse.json({
    sessions,
    totals: {
      all:           totalAll,
      reachedSavings:  totalSavings,
      reachedTier:     totalTier,
      cardOpened:      totalCardOpen,
      cardSubmitted:   totalCardSubmit,
      trialStarted:    totalTrial,
    },
    byStep,
    byVariant,
  })
}
