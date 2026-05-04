// /api/capi/sync-trial-purchases
//
// Pulls Sire users that came through the /checkout paid lander
// (platformTrial: true) and fires a Meta CAPI Purchase event for each one
// that hasn't been sent yet. Marks `metaCapiPurchaseSentAt` on the user
// doc so the same user is never double-fired.
//
// Run by cron (DO App Platform job, every 15 min) or hit manually:
//   curl -X POST https://ethan-admin.ondigitalocean.app/api/capi/sync-trial-purchases?dry=1
//
// ?dry=1   — log what WOULD send, don't fire anything (no DB writes)
// ?limit=N — cap how many to send this run (default 200)

import { NextRequest, NextResponse } from 'next/server'
import { sendCapiEvent } from '@/lib/meta-ads/capi'
import { getSireDb } from '@/lib/sire-mongo'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

// Lander tier prices. If the user doc carries `platformTrialTier` (Amine
// would need to capture this from URL `?tier=` on direct-access signup),
// we use that. Otherwise we fall back to growth ($49) — it's the default
// pre-selected tier and the most common pick.
const TIER_PRICE: Record<string, number> = { starter: 19, growth: 49, pro: 99 }
const FALLBACK_TIER  = 'growth'
const FALLBACK_VALUE = TIER_PRICE[FALLBACK_TIER]

type SireUser = {
  _id: { toString(): string }
  phone?: string
  email?: string
  name?: string
  createdAt?: Date | string
  platformTrial?: boolean
  platformTrialTier?: string
  metaCapiPurchaseSentAt?: Date
  attribution?: {
    fbc?: string
    fbp?: string
    fbclid?: string
    utm_source?: string
    utm_campaign?: string
    utm_content?: string
    landingUrl?: string
    clientUserAgent?: string
    clientIp?: string
  }
}

function splitName(full?: string): { fn?: string; ln?: string } {
  if (!full) return {}
  const parts = full.trim().split(/\s+/)
  return { fn: parts[0], ln: parts.slice(1).join(' ') || undefined }
}

export async function POST(req: NextRequest) {
  return runSync(req)
}
// Allow GET too so DO cron / manual browser hits work without curl
export async function GET(req: NextRequest) {
  return runSync(req)
}

async function runSync(req: NextRequest) {
  const url   = new URL(req.url)

  // Auth: require ?key=... matching CAPI_CRON_SECRET env. Keeps random hits
  // from triggering Meta events. Cron-job.org and DO Jobs both support
  // appending the key to the URL.
  const key      = url.searchParams.get('key') || ''
  const expected = process.env.CAPI_CRON_SECRET || ''
  if (!expected || key !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const dry   = url.searchParams.has('dry')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 1000)

  const db    = await getSireDb()
  const users = db.collection<SireUser>('users')

  // Find platformTrial users we haven't fired CAPI for yet.
  // Cap at `limit` per run to keep the cron tick predictable.
  const pending = await users
    .find({
      platformTrial: true,
      metaCapiPurchaseSentAt: { $exists: false },
    })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray()

  const summary = {
    found:     pending.length,
    sent:      0,
    failed:    0,
    skipped:   0,
    dry,
    errors:    [] as Array<{ userId: string; reason: string }>,
    sentItems: [] as Array<{ userId: string; tier: string; value: number; eventId: string }>,
  }

  for (const u of pending as SireUser[]) {
    const userId = String(u._id)

    // Skip records with no phone/email — CAPI requires at least one identifier
    if (!u.phone && !u.email) {
      summary.skipped++
      summary.errors.push({ userId, reason: 'no phone or email' })
      continue
    }

    const tier  = u.platformTrialTier && TIER_PRICE[u.platformTrialTier]
      ? u.platformTrialTier
      : FALLBACK_TIER
    const value = TIER_PRICE[tier] ?? FALLBACK_VALUE
    // Deterministic event_id so re-runs of the same user de-dup at Meta's end
    const eventId = `trial_${userId}`
    const { fn, ln } = splitName(u.name)

    if (dry) {
      summary.sentItems.push({ userId, tier, value, eventId })
      continue
    }

    try {
      const ts = u.createdAt
        ? Math.floor(new Date(u.createdAt).getTime() / 1000)
        : Math.floor(Date.now() / 1000)

      const result = await sendCapiEvent({
        event_name:    'Purchase',
        event_time:    ts,
        event_id:      eventId,
        action_source: 'website',
        event_source_url: u.attribution?.landingUrl || 'https://waitroom.sireapp.io/checkout/',
        user_data: {
          ph:                 u.phone,
          em:                 u.email,
          fn,
          ln,
          external_id:        userId,
          fbc:                u.attribution?.fbc,
          fbp:                u.attribution?.fbp,
          client_ip_address:  u.attribution?.clientIp,
          client_user_agent:  u.attribution?.clientUserAgent,
        },
        custom_data: {
          value,
          currency:      'USD',
          content_name:  `sire_subscription_${tier}`,
          content_ids:   [tier],
          content_category: 'subscription',
        },
      })

      if (!result.ok) {
        summary.failed++
        summary.errors.push({ userId, reason: result.error || 'unknown CAPI failure' })
        continue
      }

      // Mark as sent so we never double-fire
      await users.updateOne(
        { _id: u._id as unknown as object },
        { $set: { metaCapiPurchaseSentAt: new Date(), metaCapiPurchaseEventId: eventId, metaCapiPurchaseValue: value } },
      )
      summary.sent++
      summary.sentItems.push({ userId, tier, value, eventId })
    } catch (e) {
      summary.failed++
      summary.errors.push({ userId, reason: (e as Error).message })
    }
  }

  return NextResponse.json(summary)
}
