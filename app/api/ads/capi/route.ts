import { NextRequest, NextResponse } from 'next/server'
import { sendCapiEvent, type CapiEvent } from '@/lib/meta-ads/capi'
import { getDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// POST /api/ads/capi
// Body mirrors the CapiEvent type. Called from your funnel/app backend
// when a user completes an action (waitlist signup, install, purchase, etc.).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as CapiEvent & { accountId?: string }
    const accountId = body.accountId ?? 'sire-ship'

    const event: CapiEvent = {
      event_name: body.event_name,
      event_time: body.event_time ?? Math.floor(Date.now() / 1000),
      event_id: body.event_id,
      event_source_url: body.event_source_url,
      action_source: body.action_source ?? 'website',
      user_data: body.user_data ?? {},
      custom_data: body.custom_data,
    }

    const result = await sendCapiEvent(event)

    const db = await getDb()
    await db.collection('ads_events').insertOne({
      accountId,
      event_name: event.event_name,
      event_time: new Date(event.event_time * 1000).toISOString(),
      event_source_url: event.event_source_url,
      event_id: event.event_id,
      ok: result.ok,
      received: result.events_received ?? 0,
      error: result.error,
      createdAt: new Date().toISOString(),
    })

    return NextResponse.json(result, { status: result.ok ? 200 : 500 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
