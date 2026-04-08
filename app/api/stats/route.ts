export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export async function GET(req: NextRequest) {
  const campaign = req.nextUrl.searchParams.get('campaign') || 'influence-outreach'
  const db = await getDb()
  const col = db.collection('outreach_records')

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]

  const [totalRecords, sentPlatforms, replied, byCategory, recentWeek, byStatus, sentToday] = await Promise.all([
    col.countDocuments({ campaign }),                                    // all records
    col.countDocuments({ campaign, status: 'Sent' }),                   // platforms actually reached
    col.countDocuments({ campaign, status: 'Replied' }),
    col.aggregate([
      { $match: { campaign } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]).toArray(),
    col.countDocuments({ campaign, status: 'Sent', date: { $gte: weekAgo } }),  // Sent platforms only
    col.aggregate([
      { $match: { campaign } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray(),
    col.countDocuments({ campaign, status: 'Sent', date: today }),
  ])

  // Count total individual email addresses sent (platforms can get 1-5 emails each)
  const sentDocs = await col.find({ campaign, status: 'Sent' }, { projection: { emailsSent: 1 } }).toArray()
  const totalEmailsSent = sentDocs.reduce((acc, doc) => {
    const emails = (doc.emailsSent || '').split(',').filter((e: string) => e.trim() && e.includes('@'))
    return acc + emails.length
  }, 0)

  return NextResponse.json({
    total: sentPlatforms,           // FIX: "total" now = platforms actually reached (Sent status)
    totalRecords,                   // all records including failures
    replied,
    responseRate: sentPlatforms > 0 ? Math.round((replied / sentPlatforms) * 100) : 0,
    recentWeek,
    sentToday,
    totalEmailsSent,                // NEW: actual email addresses contacted
    byCategory,
    byStatus,
  })
}
