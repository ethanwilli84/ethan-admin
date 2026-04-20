import { getDb } from '../mongodb'
import { getCreds } from './client'

const API_VERSION = 'v20.0'

// Meta user tokens max out at ~60 days.
// We refresh proactively at day 50 by exchanging the current long-lived token
// for a new long-lived token using the fb_exchange_token grant.

export async function refreshUserToken(): Promise<{
  refreshed: boolean
  oldExpiresAt?: string
  newExpiresAt?: string
  error?: string
}> {
  const db = await getDb()
  const creds = await getCreds()

  const url = `https://graph.facebook.com/${API_VERSION}/oauth/access_token`
    + `?grant_type=fb_exchange_token`
    + `&client_id=${creds.appId}`
    + `&client_secret=${creds.appSecret}`
    + `&fb_exchange_token=${encodeURIComponent(creds.userAccessToken)}`

  const r = await fetch(url)
  if (!r.ok) {
    const body = await r.text()
    return { refreshed: false, error: `${r.status}: ${body.slice(0, 200)}` }
  }
  const data = await r.json() as { access_token: string; expires_in?: number }
  const newToken = data.access_token
  const now = new Date()
  const newExpiresAt = new Date(now.getTime() + (data.expires_in ?? 60 * 86400) * 1000)

  await db.collection('ads_credentials').updateOne(
    { accountId: creds.accountId },
    { $set: {
        userAccessToken: newToken,
        tokenIssuedAt: now.toISOString(),
        tokenExpiresAt: newExpiresAt.toISOString(),
        updatedAt: now.toISOString(),
    } },
  )

  return {
    refreshed: true,
    oldExpiresAt: creds.tokenExpiresAt,
    newExpiresAt: newExpiresAt.toISOString(),
  }
}

// Health check: is the current token valid? If within 10 days of expiry, refresh it.
export async function checkAndMaybeRefresh(): Promise<{
  status: 'valid' | 'refreshed' | 'error'
  daysUntilExpiry?: number
  error?: string
}> {
  const creds = await getCreds()
  const expiresAt = new Date(creds.tokenExpiresAt).getTime()
  const daysLeft = Math.round((expiresAt - Date.now()) / 86400000)

  if (daysLeft <= 10) {
    const r = await refreshUserToken()
    if (r.refreshed) return { status: 'refreshed', daysUntilExpiry: daysLeft }
    return { status: 'error', error: r.error }
  }
  return { status: 'valid', daysUntilExpiry: daysLeft }
}
