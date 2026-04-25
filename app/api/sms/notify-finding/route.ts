export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { sendSms, buildSwipeUrl, smsConfigured } from '@/lib/twilio'

const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN || 'https://ethan-admin-hlfdr.ondigitalocean.app'

// POST /api/sms/notify-finding
//   body: { id: string }
//   Sends an SMS pointing Ethan at /swipe to triage the finding. Marks
//   the finding as smsSentAt so we don't double-text.
export async function POST(req: NextRequest) {
  if (!smsConfigured()) {
    return NextResponse.json({ ok: false, error: 'Twilio not configured' }, { status: 500 })
  }
  const body = await req.json()
  if (!body?.id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const db = await getDb()
  const finding = await db.collection('ai_findings').findOne({ _id: new ObjectId(body.id) })
  if (!finding) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  if (finding.smsSentAt) return NextResponse.json({ ok: true, skipped: 'already sent' })

  const url = buildSwipeUrl(ADMIN_ORIGIN, body.id)
  const text = [
    `🤖 AI finding (${finding.relevanceScore}/10, ${finding.riskLevel} risk):`,
    finding.title,
    '',
    'Swipe to triage:',
    url,
  ].join('\n')

  const result = await sendSms(text)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 })
  }

  await db.collection('ai_findings').updateOne(
    { _id: new ObjectId(body.id) },
    { $set: { smsSentAt: new Date(), smsMessageSid: result.sid } }
  )
  return NextResponse.json({ ok: true, sid: result.sid })
}
