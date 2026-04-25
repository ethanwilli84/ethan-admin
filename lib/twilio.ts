// Tiny Twilio REST helper — no SDK, just fetch.
// Required env vars (set in DO App Platform):
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM_NUMBER  (e.g. +17345550101 — must be a Twilio-owned number or verified caller ID)
//   ETHAN_PHONE_NUMBER  (target — Ethan's phone, +17346645129)
//   SWIPE_TOKEN         (random secret used in deep links)

const SID = process.env.TWILIO_ACCOUNT_SID
const TOKEN = process.env.TWILIO_AUTH_TOKEN
const FROM = process.env.TWILIO_FROM_NUMBER
const TO = process.env.ETHAN_PHONE_NUMBER
const SWIPE_TOKEN = process.env.SWIPE_TOKEN

export function smsConfigured(): boolean {
  return !!(SID && TOKEN && FROM && TO)
}

export function buildSwipeUrl(base: string, findingId?: string) {
  const url = new URL(base.replace(/\/$/, '') + '/swipe')
  if (SWIPE_TOKEN) url.searchParams.set('t', SWIPE_TOKEN)
  if (findingId) url.searchParams.set('f', findingId)
  return url.toString()
}

export async function sendSms(body: string, to?: string): Promise<{ ok: boolean; sid?: string; error?: string }> {
  if (!smsConfigured()) return { ok: false, error: 'Twilio not configured' }
  const target = to || TO!
  try {
    const auth = Buffer.from(`${SID}:${TOKEN}`).toString('base64')
    const params = new URLSearchParams({ From: FROM!, To: target, Body: body.slice(0, 1500) })
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    )
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.message || `HTTP ${res.status}` }
    return { ok: true, sid: data.sid }
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }
}

// Check the swipe-link token against env. We don't bother signing/expiring
// because the token is only ever sent to Ethan's phone via Twilio. Rotate
// SWIPE_TOKEN env var if compromised.
export function validateSwipeToken(token: string | null): boolean {
  if (!SWIPE_TOKEN) return true // fail-open if not configured (dev/local)
  return token === SWIPE_TOKEN
}
