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
import { sendCapiEvent, type CapiEvent } from '@/lib/meta-ads/capi'
import { getDb } from '@/lib/mongodb'

export const dynamic     = 'force-dynamic'
export const maxDuration = 10

// Standard Meta events we mirror to CAPI. Anything else (QuizAnswer,
// CardManualSubmitted, etc.) is logged to Mongo only — those are useful
// for our funnel analytics but Meta wouldn't optimize on them.
const META_STANDARD = new Set<CapiEvent['event_name']>([
  'PageView', 'ViewContent', 'Lead', 'InitiateCheckout',
  'AddToCart', 'AddPaymentInfo', 'StartTrial',
  'CompleteRegistration', 'Purchase', 'Subscribe', 'Search', 'Contact',
])

const STEP_RANK: Record<string, number> = {
  splash:           0,
  q1_avg_weight:    1,
  q2_business_type: 2,
  q3_volume:        3,
  q4_label_cost:    4,
  calculating:      5,
  social_proof:     6,
  savings_reveal:   7,
  tier_select:      8,
  checkout_form:    9,
  card_popup_opened: 10,
  paid_trial_started: 11,
}

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
  // Event flavor — defaults to 'PageView'. Any non-standard Meta event still
  // gets persisted to Mongo (just not mirrored to Meta CAPI).
  event?:      string
  content_name?: string
  step?:       string
  step_number?: number
  value?:      number
  // Quiz-specific fields when event = 'QuizAnswer'
  question?:   string
  answer?:     string | number
  // Tier-specific fields when event = 'AddToCart' on tier_confirm
  tier?:       string
  // Funnel timing
  funnel_elapsed?: number
  // Optional explicit event_id for browser/server CAPI dedup
  event_id?:   string
}

type LanderSession = {
  sessionId:        string
  variant:          string
  createdAt:        Date
  lastSeenAt:       Date
  totalEvents:      number
  highestStepRank:  number
  highestStepName:  string
  completed:        boolean
  // Attribution snapshot — first non-null value wins
  attribution: {
    fbc?:           string
    fbp?:           string
    fbclid?:        string
    utm_source?:    string
    utm_medium?:    string
    utm_campaign?:  string
    utm_content?:   string
    utm_creative?:  string
    utm_placement?: string
    utm_site?:      string
    utm_adset?:     string
    landingUrl?:    string
    clientIp?:      string
    clientUserAgent?: string
  }
  // Quiz answers, keyed by question slug (q1_avg_weight → 'under_1lb')
  quizAnswers: Record<string, string | number>
  // Tier picked on step 8
  tierPicked?:      string
  // Step milestones (boolean flags so dashboards can do simple counts)
  reachedSavings?:  boolean
  reachedTierSelect?: boolean
  cardPopupOpened?: boolean
  cardSubmitted?:   boolean
  trialStarted?:    boolean
  identity?: {
    phone?:    string
    email?:    string
  }
}

type LanderEvent = {
  sessionId:    string
  variant:      string
  event:        string
  step?:        string
  stepRank?:    number
  contentName?: string
  question?:    string
  answer?:      string | number
  tier?:        string
  value?:       number
  funnelElapsed?: number
  ts:           Date
  // Compact raw payload for debugging without bloating individual events
  raw?:         Record<string, unknown>
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

  // ──────────────────────────────────────────────────────────────────────
  // 1) PERSIST to ethan-admin Mongo — every event gets logged regardless of
  //    whether we mirror to Meta CAPI. Two collections:
  //    - lander_events: granular timeline (one doc per event)
  //    - lander_sessions: rolling summary (upserted, single doc per session)
  //    We do this BEFORE CAPI so a slow/failing Meta call can't drop our log.
  // ──────────────────────────────────────────────────────────────────────
  try {
    const db    = await getDb()
    const evColl   = db.collection<LanderEvent>('lander_events')
    const sessColl = db.collection<LanderSession>('lander_sessions')
    const now      = new Date()
    const stepName = body.step || body.content_name || ''
    const stepRank = STEP_RANK[stepName] ?? -1

    // Per-event row
    const evDoc: LanderEvent = {
      sessionId,
      variant:       body.variant || 'control',
      event:         eventName,
      step:          stepName || undefined,
      stepRank:      stepRank >= 0 ? stepRank : undefined,
      contentName:   body.content_name,
      question:      body.question,
      answer:        body.answer,
      tier:          body.tier,
      value:         body.value,
      funnelElapsed: body.funnel_elapsed,
      ts:            now,
      raw:           body as unknown as Record<string, unknown>,
    }
    await evColl.insertOne(evDoc).catch(e => console.warn('[lander-track] event insert failed', e))

    // Session summary upsert. Use $setOnInsert for things that lock at first
    // sight (createdAt, attribution snapshot, variant), $set for things that
    // always reflect the latest seen value (lastSeenAt), and $max for the
    // step-rank watermark so we always have the deepest step the user got to.
    const setOnInsert: Partial<LanderSession> = {
      sessionId,
      variant:    body.variant || 'control',
      createdAt:  now,
      attribution: {
        fbc:             body.fbc,
        fbp:             body.fbp,
        fbclid:          body.fbclid,
        utm_source:      body.utm_source,
        utm_medium:      body.utm_medium,
        utm_campaign:    body.utm_campaign,
        utm_content:     body.utm_content,
        utm_creative:    body.utm_creative,
        utm_placement:   body.utm_placement,
        utm_site:        body.utm_site,
        utm_adset:       body.utm_adset,
        landingUrl:      body.landing_url,
        clientIp,
        clientUserAgent: clientUa,
      },
      quizAnswers: {},
    }
    const set: Record<string, unknown> = { lastSeenAt: now }
    const setStepName: Record<string, unknown> = {}
    if (stepRank >= 0) {
      setStepName.highestStepName = stepName
    }
    const inc: Record<string, number> = { totalEvents: 1 }
    const max: Record<string, number> = {}
    if (stepRank >= 0) max.highestStepRank = stepRank

    // Funnel-milestone flags
    if (eventName === 'Lead' || stepName === 'savings_reveal')      set.reachedSavings = true
    if (stepName === 'tier_select')                                  set.reachedTierSelect = true
    if (eventName === 'AddPaymentInfo' || stepName === 'card_popup_opened') set.cardPopupOpened = true
    if (eventName === 'CardManualSubmitted' || eventName === 'StartTrial')  set.cardSubmitted = true
    if (eventName === 'StartTrial')                                  set.trialStarted = true
    if (eventName === 'CompleteRegistration')                        set.completed = true

    // Identity capture (when phone/email provided on later steps)
    if (body.phone) set['identity.phone'] = body.phone
    if (body.email) set['identity.email'] = body.email

    // Tier picked
    if (body.tier && (eventName === 'AddToCart' || stepName === 'tier_confirm')) {
      set.tierPicked = body.tier
    }

    // Quiz-answer capture: store under quizAnswers.<question>
    const quizSet: Record<string, unknown> = {}
    if (eventName === 'QuizAnswer' && body.question && body.answer !== undefined) {
      quizSet[`quizAnswers.${body.question}`] = body.answer
    }

    await sessColl.updateOne(
      { sessionId },
      {
        $setOnInsert: setOnInsert,
        $set:         { ...set, ...setStepName, ...quizSet },
        $inc:         inc,
        $max:         Object.keys(max).length ? max : { highestStepRank: stepRank >= 0 ? stepRank : 0 },
      },
      { upsert: true },
    ).catch(e => console.warn('[lander-track] session upsert failed', e))
  } catch (e) {
    console.warn('[lander-track] mongo logging failed', e)
  }

  // ──────────────────────────────────────────────────────────────────────
  // 2) MIRROR to Meta CAPI — only for events Meta knows about + has utility
  //    for optimization. Custom events stay Mongo-only.
  // ──────────────────────────────────────────────────────────────────────
  const isMetaStandard = META_STANDARD.has(eventName as CapiEvent['event_name'])
  if (!isMetaStandard) {
    return new NextResponse(null, { status: 204, headers })
  }

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
      event_name:    eventName as CapiEvent['event_name'],
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
