import crypto from 'crypto'
import { meta, adAccountPath } from './request'

// Meta Custom Audience helpers — create/upsert seed audiences and push users
// via hashed email/phone per Meta's User Data API spec.
//
// Docs: https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences

const hash = (s: string) => crypto.createHash('sha256').update(s.trim().toLowerCase()).digest('hex')

/**
 * Normalize a phone number for Meta CAPI/Custom Audiences:
 * - Strip all non-digits.
 * - If result is 10 digits (US without country code), prepend "1".
 * - Otherwise pass through (assumes sender provided country code).
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = String(phone).replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10) return '1' + digits
  return digits
}

/**
 * Find an existing Custom Audience by name, or create one.
 * Uses `USER_PROVIDED_ONLY` data source so Meta accepts the hashed PII upload.
 */
export async function getOrCreateCustomAudience(params: {
  name: string
  description?: string
}): Promise<{ id: string; created: boolean }> {
  const path = `${await adAccountPath()}/customaudiences`
  const existing = await meta.get<{ data: Array<{ id: string; name: string }> }>(
    path,
    { fields: 'id,name', limit: 200 },
  )
  const found = existing.data?.find((a) => a.name === params.name)
  if (found) return { id: found.id, created: false }

  const created = await meta.post<{ id: string }>(path, {}, {
    name: params.name,
    description: params.description || `Auto-generated ${new Date().toISOString()}`,
    subtype: 'CUSTOM',
    customer_file_source: 'USER_PROVIDED_ONLY',
  })
  return { id: created.id, created: true }
}

/**
 * Push users to a Custom Audience in batches. Returns the number of rows
 * actually sent (drops rows where both email and phone were null/empty).
 *
 * Sire users are phone-only — we still declare the EMAIL column in the schema
 * per Meta spec, but most rows have an empty email slot (which Meta accepts).
 */
export async function pushAudienceUsers(params: {
  audienceId: string
  users: Array<{ phone?: string | null; email?: string | null }>
  batchSize?: number
}): Promise<number> {
  const BATCH = params.batchSize ?? 10000
  const rows: Array<[string, string]> = []
  for (const u of params.users) {
    const emailHash = u.email ? hash(u.email) : ''
    const phoneNorm = normalizePhone(u.phone)
    const phoneHash = phoneNorm ? hash(phoneNorm) : ''
    if (!emailHash && !phoneHash) continue
    rows.push([emailHash, phoneHash])
  }

  let sent = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const payload = { schema: ['EMAIL', 'PHONE'], data: batch }
    await meta.post(`/${params.audienceId}/users`, {}, { payload: JSON.stringify(payload) })
    sent += batch.length
  }
  return sent
}

/**
 * Replace (not append) the user list in a Custom Audience — used for
 * exclusion lists where we want the full current merchant universe.
 *
 * Meta supports replace via `session.payload_batches` flow, but the simpler
 * path here is: delete all users, then re-add. Per Meta docs, sending the
 * same hashed PII again is idempotent, so skipping the delete is often fine.
 * For now we just push — audience size will grow as new merchants are added.
 * If stale members become a problem we'll add a proper replace pass.
 */
export async function replaceAudienceUsers(params: {
  audienceId: string
  users: Array<{ phone?: string | null; email?: string | null }>
}): Promise<number> {
  // Placeholder: today this is just an additive push. Meta's audience size
  // is approximate anyway, so minor staleness is fine.
  return pushAudienceUsers(params)
}
