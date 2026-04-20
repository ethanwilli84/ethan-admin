import { getCreds } from './client'

const API_VERSION = 'v20.0'
const BASE = `https://graph.facebook.com/${API_VERSION}`

type QueryParams = Record<string, string | number | boolean | undefined>

async function request<T = unknown>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params: QueryParams = {},
  body?: Record<string, unknown>,
): Promise<T> {
  const creds = await getCreds()
  const qs = new URLSearchParams()
  qs.set('access_token', creds.userAccessToken)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v))
  }

  const url = `${BASE}${path}?${qs.toString()}`
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body && method !== 'GET') init.body = JSON.stringify(body)

  const r = await fetch(url, init)
  const text = await r.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { json = { raw: text } }

  if (!r.ok) {
    const err = (json as { error?: { message?: string } })?.error
    throw new Error(`Meta API ${r.status}: ${err?.message || text.slice(0, 300)}`)
  }
  return json as T
}

export const meta = {
  get:    <T = unknown>(path: string, params?: QueryParams) => request<T>('GET',    path, params),
  post:   <T = unknown>(path: string, params?: QueryParams, body?: Record<string, unknown>) =>
            request<T>('POST',   path, params, body),
  delete: <T = unknown>(path: string, params?: QueryParams) => request<T>('DELETE', path, params),
}

// Convenience builders for the ad account path prefix
export const adAccountPath = async () => {
  const c = await getCreds()
  return `/act_${c.adAccountId}`
}
