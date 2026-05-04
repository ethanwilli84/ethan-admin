// /api/lander-track
//
// Server-side fallback for landing-page tracking on waitroom.sireapp.io/checkout.
// Browser pixel calls to connect.facebook.net are unreliable inside Instagram /
// Facebook in-app webviews (Meta's webview anti-tracking strips them silently).
// This endpoint fires Meta CAPI PageView + ViewContent events from the server
// using the attribution data the lander sends along, so Meta gets a definitive
// "user landed" signal regardless of whether the browser pixel made it through.
//
// The lander hits this on initial load with all the captured attribution
// (fbc, fbp, fbclid, UTMs, IP, UA, landing URL). Server hashes PII, calls
// Meta CAPI, returns 204 quickly so the lander render isn't blocked.
//
// Dedup strategy: each call gets a deterministic event_id of
// `lander_pv_{session_id}_{event}` so retries are safe and any matching
// browser pixel events get deduplicated by Meta.
//
// CORS: explicit origin allowlist for waitroom.sireapp.io.

import { NextRequest, NextResponse } from 'next/server'
import { sendCapiEvent } from '@/lib/meta-ads/capi'

export const dynamic     = 'force-dynamic'
export const maxDuration = 10

const ALLOWED_ORIGINS = new Set([
  'https://waitroom.sireapp.io',
  'http://waitroom.sireapp.io',
  // Local dev convenience — comment out before going public-facing only
  'http://localhost:3000',
  'http://localhost:8080',
])

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://waitroom.sireapp.io'
  return {
    'Access-Control-Allow-Origin':  allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

type Payload = {
  // Attribution
  fbc?:        string
  fbp?:        string
  fbclid?:     string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_creative?: string
  utm_placement?: string
  utm_site?:   string
  utm_adset?:  string
  // Identity (rare on first load — usually empty until OTP step)
  phone?:      string
  email?:      string
  // Session + variant
  session_id?: string
  variant?:    string
  // URL the user landed on
  landing_url?: string
  // Event flavor — defaults to 'PageView'. Lander can also fire 'ViewContent'
  // for sub-page tracking (quiz step views) without needing the browser pixel.
  event?:      'PageView' | 'ViewContent' | 'Lead' | 'InitiateCheckout' | 'AddToCart'
  content_name?: string
  step?:       string
  value?:      number
  // Optional explicit event_id (for dedup with browser pixel that fired the
  // same event_id). If omitted, server derives one from session + event.
  event_id?:   string
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)

  let body: Payload = {}
  try {
    body = (await req.json()) as Payload
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers })
  }

  const eventName = body.event || 'PageView'

  // Pull client IP + UA from headers — most accurate when set by Cloudflare
  // / DO load balancer. Fall back to req-level fields.
  const clientIp =
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    undefined
  const clientUa = req.headers.get('user-agent') || undefined

  const sessionId = body.session_id || `anon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const stepKey   = body.step || body.content_name || eventName.toLowerCase()
  const eventId   = body.event_id || `lander_${eventName.toLowerCase()}_${sessionId}_${stepKey}`

  // Build CAPI custom_data only with fields Meta accepts. Map our funnel
  // metadata into a content_name + content_category so it's filterable in
  // Meta Events Manager.
  const customData: Record<string, unknown> = {}
  if (body.value)        customData.value         = body.value
  if (body.content_name) customData.content_name  = body.content_name
  if (body.utm_campaign) customData.content_category = body.utm_campaign
  if (body.utm_content)  customData.content_ids   = [body.utm_content]
  customData.currency = 'USD'

  const event_source_url = body.landing_url
    || (origin === 'https://waitroom.sireapp.io' ? 'https://waitroom.sireapp.io/checkout/' : undefined)

  try {
    const result = await sendCapiEvent({
      event_name:    eventName,
      event_time:    Math.floor(Date.now() / 1000),
      event_id:      eventId,
      action_source: 'website',
      event_source_url,
      user_data: {
        em:                body.email,
        ph:                body.phone,
        fbc:               body.fbc,
        fbp:               body.fbp,
        client_ip_address: clientIp,
        client_user_agent: clientUa,
        external_id:       sessionId,
      },
      custom_data: Object.keys(customData).length > 0 ? customData : undefined,
    })

    if (!result.ok) {
      // Don't 500 the lander on CAPI failures — log and 204
      console.warn('[lander-track] CAPI failed:', result.error)
      return new NextResponse(null, { status: 204, headers })
    }
    return new NextResponse(null, { status: 204, headers })
  } catch (e) {
    console.error('[lander-track] threw:', e)
    return new NextResponse(null, { status: 204, headers })
  }
}

// Allow GET for one-off testing in browser
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  return NextResponse.json(
    { ok: true, route: 'lander-track', method: 'POST expected' },
    { headers: corsHeaders(origin) },
  )
}
