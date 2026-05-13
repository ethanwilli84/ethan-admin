// /api/landings/home — nurture-page (waitroom.sireapp.io/) engagement aggregates.
// Distinct from the quiz funnel (/checkout). Scroll depth, video plays, time on page.

import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const days = parseInt(url.searchParams.get('days') || '30', 10)
  const since = new Date(Date.now() - days * 24 * 3600 * 1000)

  const db = await getDb()
  const sess = db.collection('lander_sessions')
  const evs  = db.collection('lander_events')

  const baseFilter = { variant: 'home', createdAt: { $gte: since } }

  const [
    totalSessions,
    scroll25, scroll50, scroll75,
    videoPlayAgg,
    timingAgg,
    recentSessions,
    dailyAgg,
  ] = await Promise.all([
    sess.countDocuments(baseFilter),
    evs.countDocuments({ variant: 'home', ts: { $gte: since }, step: 'home_scroll_25' }),
    evs.countDocuments({ variant: 'home', ts: { $gte: since }, step: 'home_scroll_50' }),
    evs.countDocuments({ variant: 'home', ts: { $gte: since }, step: 'home_scroll_75' }),
    evs.aggregate([
      { $match: { variant: 'home', ts: { $gte: since }, event: 'ViewContent', step: 'home_video_play' } },
      { $group: { _id: '$contentName', plays: { $sum: 1 } } },
      { $sort: { plays: -1 } },
    ]).toArray(),
    sess.aggregate([
      { $match: baseFilter },
      { $project: {
          durationMs: { $subtract: ['$lastSeenAt', '$createdAt'] },
          totalEvents: 1,
        } },
      { $group: {
          _id: null,
          avgMs: { $avg: '$durationMs' },
          medianEvents: { $avg: '$totalEvents' },
          count: { $sum: 1 },
        } },
    ]).toArray(),
    sess.find(baseFilter).sort({ lastSeenAt: -1 }).limit(50).project({
      sessionId: 1, createdAt: 1, lastSeenAt: 1, totalEvents: 1,
      attribution: 1, identity: 1,
    }).toArray(),
    sess.aggregate([
      { $match: baseFilter },
      { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          sessions: { $sum: 1 },
        } },
      { $sort: { _id: -1 } },
      { $limit: 14 },
    ]).toArray(),
  ])

  // Compute per-session avg time on page from event timeline (more accurate than lastSeenAt - createdAt)
  // For each recent session, use first PageView -> last SessionEnd (or last event)
  const avgMs = timingAgg[0]?.avgMs || 0

  return NextResponse.json({
    sinceDays: days,
    totals: {
      sessions:  totalSessions,
      scroll25:  scroll25,
      scroll50:  scroll50,
      scroll75:  scroll75,
      avgTimeOnPageMs: Math.round(avgMs),
      avgEventsPerSession: Number((timingAgg[0]?.medianEvents || 0).toFixed(1)),
    },
    scrollFunnel: [
      { milestone: 'Landed (PageView)',  count: totalSessions, pct: 100 },
      { milestone: 'Scrolled past 25%',  count: scroll25, pct: totalSessions ? +(scroll25/totalSessions*100).toFixed(1) : 0 },
      { milestone: 'Scrolled past 50%',  count: scroll50, pct: totalSessions ? +(scroll50/totalSessions*100).toFixed(1) : 0 },
      { milestone: 'Scrolled past 75%',  count: scroll75, pct: totalSessions ? +(scroll75/totalSessions*100).toFixed(1) : 0 },
    ],
    videos: videoPlayAgg.map(v => ({ id: v._id || '(unknown)', plays: v.plays })),
    daily:  dailyAgg.map(d => ({ date: d._id, sessions: d.sessions })),
    recentSessions,
  })
}
