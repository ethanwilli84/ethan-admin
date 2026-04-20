// Meta Marketing API v20.0 wrapper
// Token is loaded from DB (ads_credentials collection) at call time
// so rotations don't require redeploys.

import { getDb } from '@/lib/mongodb'

export type MetaCreds = {
  accountId: string
  appId: string
  appSecret: string
  pageId: string
  igUserId: string
  adAccountId: string
  pixelId: string
  userAccessToken: string
  tokenIssuedAt: string
  tokenExpiresAt: string
}

export async function getCreds(accountId = 'sire-ship'): Promise<MetaCreds> {
  const db = await getDb()
  const c = await db.collection('ads_credentials').findOne({ accountId })
  if (!c) throw new Error(`No Meta ads credentials for accountId=${accountId}`)
  return c as unknown as MetaCreds
}
