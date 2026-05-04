// /api/landings/[sessionId] — drill-down view: full event timeline + session
// summary for one user's funnel.

import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const db = await getDb()

  const [session, events] = await Promise.all([
    db.collection('lander_sessions').findOne({ sessionId }),
    db.collection('lander_events').find({ sessionId }).sort({ ts: 1 }).limit(500).toArray(),
  ])

  if (!session) {
    return NextResponse.json({ error: 'session_not_found' }, { status: 404 })
  }
  return NextResponse.json({ session, events })
}
