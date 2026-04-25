export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { validateSwipeToken } from '@/lib/twilio'

// GET /api/swipe?t=<token>&id=<findingId?>
//   Returns the next finding to triage. If `id` is given, returns that one
//   first; otherwise returns the highest-scoring unresolved finding.
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t')
  if (!validateSwipeToken(t)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const db = await getDb()
  const requestedId = req.nextUrl.searchParams.get('id')
  let finding = null
  if (requestedId) {
    try {
      finding = await db.collection('ai_findings').findOne({
        _id: new ObjectId(requestedId),
        status: { $in: ['new', 'accepted'] },
      })
    } catch {
      // bad id — fall through
    }
  }
  if (!finding) {
    finding = await db
      .collection('ai_findings')
      .find({ status: 'new' })
      .sort({ relevanceScore: -1, createdAt: -1 })
      .limit(1)
      .next()
  }

  // Count remaining
  const remaining = await db.collection('ai_findings').countDocuments({ status: 'new' })
  return NextResponse.json({ ok: true, finding, remaining })
}

// POST /api/swipe
//   body: { id, action: 'accept'|'reject', reason?: string, t: token }
//   Accept → status='accepted' (auto-queues for apply worker if eligible)
//   Reject → status='rejected', captures reason for the feedback loop
export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!validateSwipeToken(body?.t)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  if (!body?.id || !body?.action) {
    return NextResponse.json({ ok: false, error: 'id + action required' }, { status: 400 })
  }
  const db = await getDb()

  if (body.action === 'accept') {
    const f = await db.collection('ai_findings').findOne({ _id: new ObjectId(body.id) })
    if (!f) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })

    // Auto-queue if eligible: low risk + score >= 7. claude_skill findings
    // get auto-shipped via the Mac LaunchAgent installer separately, so
    // accepting them just marks accepted; the installer picks them up.
    const autoQueue = f.riskLevel === 'low' && (f.relevanceScore || 0) >= 7 && f.category !== 'claude_skill'
    await db.collection('ai_findings').updateOne(
      { _id: new ObjectId(body.id) },
      { $set: { status: autoQueue ? 'queued' : 'accepted', updatedAt: new Date(), swipedAt: new Date() } }
    )
    return NextResponse.json({ ok: true, queued: autoQueue })
  }

  if (body.action === 'reject') {
    await db.collection('ai_findings').updateOne(
      { _id: new ObjectId(body.id) },
      {
        $set: {
          status: 'rejected',
          outcome: body.reason || '',
          updatedAt: new Date(),
          swipedAt: new Date(),
        },
      }
    )
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 })
}
