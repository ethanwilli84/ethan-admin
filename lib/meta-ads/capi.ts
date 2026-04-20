import crypto from 'crypto'
import { getCreds } from './client'

const API_VERSION = 'v20.0'

// Send server-side conversion events to Meta
// This bypasses browser pixel blockers and iOS 14.5+ tracking opt-outs
// Each event can be dedup'd with the browser pixel using event_id

export type CapiEvent = {
  event_name: 'Lead' | 'CompleteRegistration' | 'Purchase' | 'Subscribe' | 'PageView' | 'ViewContent'
  event_time: number          // unix seconds
  event_id?: string           // for dedup with browser pixel
  event_source_url?: string   // page where event occurred
  action_source: 'website' | 'app' | 'email' | 'phone_call' | 'chat' | 'system_generated' | 'other'
  user_data: {
    em?: string               // email (will be hashed)
    ph?: string               // phone (will be hashed)
    fn?: string               // first name (hashed)
    ln?: string               // last name (hashed)
    external_id?: string      // your internal user id (hashed)
    client_ip_address?: string
    client_user_agent?: string
    fbc?: string              // _fbc cookie value
    fbp?: string              // _fbp cookie value
  }
  custom_data?: {
    value?: number
    currency?: string
    content_name?: string
    content_category?: string
    content_ids?: string[]
  }
}

// Hash PII with SHA-256 (Meta requirement for CAPI)
function hash(v: string | undefined): string | undefined {
  if (!v) return undefined
  return crypto.createHash('sha256').update(v.trim().toLowerCase()).digest('hex')
}

export async function sendCapiEvent(e: CapiEvent): Promise<{
  ok: boolean
  events_received?: number
  messages?: unknown[]
  error?: string
}> {
  const creds = await getCreds()

  // Normalize + hash PII
  const ud = { ...e.user_data }
  if (ud.em)          ud.em = hash(ud.em)
  if (ud.ph)          ud.ph = hash(ud.ph.replace(/\D/g, ''))
  if (ud.fn)          ud.fn = hash(ud.fn)
  if (ud.ln)          ud.ln = hash(ud.ln)
  if (ud.external_id) ud.external_id = hash(ud.external_id)

  const payload = {
    data: [{
      event_name: e.event_name,
      event_time: e.event_time,
      action_source: e.action_source,
      ...(e.event_id ? { event_id: e.event_id } : {}),
      ...(e.event_source_url ? { event_source_url: e.event_source_url } : {}),
      user_data: ud,
      ...(e.custom_data ? { custom_data: e.custom_data } : {}),
    }],
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${creds.pixelId}/events`
    + `?access_token=${creds.userAccessToken}`

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await r.json().catch(() => ({}))

  if (!r.ok) {
    return { ok: false, error: (body as { error?: { message?: string } })?.error?.message || `HTTP ${r.status}` }
  }
  return { ok: true, events_received: (body as { events_received?: number })?.events_received, messages: (body as { messages?: unknown[] })?.messages }
}
