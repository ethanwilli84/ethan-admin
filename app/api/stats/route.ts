export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export async function GET(req: NextRequest) {
  const campaign = req.nextUrl.searchParams.get('campaign') || 'influence-outreach'
  const db = await getDb()
  const col = db.collection('outreach_records')

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]

  const [total, replied, byCategory, recentWeek, byStatus, sentToday] = await Promise.all([
    col.countDocuments({ campaign }),
    col.countDocuments({ campaign, status: 'Replied' }),
    col.aggregate([
      { $match: { campaign } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]).toArray(),
    col.countDocuments({ campaign, date: { $gte: weekAgo } }),
    col.aggregate([
      { $match: { campaign } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray(),
    col.countDocuments({ campaign, status: 'Sent', date: today }),
  ])

  return NextResponse.json({ total, replied, responseRate: total > 0 ? Math.round((replied / total) * 100) : 0, recentWeek, sentToday, byCategory, byStatus })
}
