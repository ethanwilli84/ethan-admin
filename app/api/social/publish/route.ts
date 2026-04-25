export const dynamic = 'force-dynamic'
export const maxDuration = 300  // 5 min for multi-post batches with 20s delays
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const CREDS = {
  // Hardcoded — DO env var has old expired token, this is the never-expires one
  pageToken:    'EAALDZBoAESkMBRbZAcTjGm0sgQO3Wt8m34zDkJYLSA8hijWRbqz0Csx2ZCm76b7g3P6vZB2Y9h021PBdOk8Nte1gmDPV63FZBzNn9WsvLYYPbZA2uwoA5NNEquS3NaPaGoVtLcyWmZAZC7UWxh0se9nsuERTFCeQ7FYEw4wbTSXkbdZCm1ywKXDjVWOtcpyvXMwP89YZAtJdqfwnAWQMx4sXsZD',
  pageId:       process.env.META_PAGE_ID  || '162845390237140',
  igUserId:     process.env.META_IG_USER_ID || '17841461321106563',
  spacesKey:    process.env.DO_SPACES_KEY!,
  spacesSecret: process.env.DO_SPACES_SECRET!,
  spacesBucket: process.env.DO_SPACES_BUCKET || 'ethan-social',
  spacesRegion: process.env.DO_SPACES_REGION || 'nyc3',
  spacesCdn:    process.env.DO_SPACES_CDN    || 'https://ethan-social.nyc3.cdn.digitaloceanspaces.com',
}

const LOOKBACK_MIN = 30    // catch items missed by delayed GH Actions runs (can be 15-20min late)
const LOOKAHEAD_MIN = 5    // small forward window — don't post too early

async function ensurePublicUrl(storedUrl: string): Promise<string> {
  if (storedUrl?.includes('digitaloceanspaces.com')) return storedUrl
  const { readFileSync } = await import('fs')
  const { extname, basename } = await import('path')
  const s3 = new S3Client({
    endpoint: `https://${CREDS.spacesRegion}.digitaloceanspaces.com`,
    region: CREDS.spacesRegion,
    credentials: { accessKeyId: CREDS.spacesKey, secretAccessKey: CREDS.spacesSecret },
  })
  const ext = extname(storedUrl).toLowerCase()
  const key = `social/${basename(storedUrl, ext)}_${Date.now()}${ext}`
  const ct = ext === '.png' ? 'image/png' : ext === '.mp4' ? 'video/mp4' : 'image/jpeg'
  await s3.send(new PutObjectCommand({
    Bucket: CREDS.spacesBucket, Key: key,
    Body: readFileSync(storedUrl), ContentType: ct, ACL: 'public-read' as const,
  }))
  return `${CREDS.spacesCdn}/${key}`
}

async function metaPost(path: string, params: Record<string, string>) {
  const body = new URLSearchParams({ ...params, access_token: CREDS.pageToken })
  const r = await fetch(`https://graph.facebook.com/v19.0${path}`, { method: 'POST', body })
  const d = await r.json()
  if (d.error) throw new Error(`Meta: ${d.error.message}`)
  return d
}

async function waitForContainer(id: string): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const r = await fetch(`https://graph.facebook.com/v19.0/${id}?fields=status_code&access_token=${CREDS.pageToken}`)
    const d = await r.json()
    if (d.status_code === 'FINISHED') return
    if (['ERROR','EXPIRED'].includes(d.status_code)) throw new Error(`Container ${id}: ${d.status_code}`)
  }
  throw new Error('Container processing timed out')
}

async function postFbNow(imageUrl: string, caption: string) {
  return metaPost(`/${CREDS.pageId}/photos`, { url: imageUrl, caption, published: 'true' })
}

async function postIgNow(imageUrl: string, caption: string) {
  const c = await metaPost(`/${CREDS.igUserId}/media`, { image_url: imageUrl, caption, media_type: 'IMAGE' })
  await waitForContainer(c.id)
  return metaPost(`/${CREDS.igUserId}/media_publish`, { creation_id: c.id })
}

async function postIgStory(imageUrl: string) {
  const c = await metaPost(`/${CREDS.igUserId}/media`, { image_url: imageUrl, media_type: 'STORIES' })
  await waitForContainer(c.id)
  return metaPost(`/${CREDS.igUserId}/media_publish`, { creation_id: c.id })
}

// Post a single item to Meta. Returns { fbId, igId }. Throws on Meta error.
// Centralized so retry logic wraps the same call cleanly for both post and story types.
async function postItem(item: { type: string; videoUrl: string; caption?: string }):
    Promise<{ fbId: string | null; igId: string }> {
  const imageUrl = await ensurePublicUrl(item.videoUrl)
  const caption = item.caption || ''
  if (item.type === 'story') {
    const r = await postIgStory(imageUrl) as { id: string }
    return { fbId: null, igId: r.id }
  }
  const [fb, ig] = await Promise.allSettled([postFbNow(imageUrl, caption), postIgNow(imageUrl, caption)])
  if (fb.status === 'rejected') throw new Error(`FB: ${(fb.reason as Error).message}`)
  if (ig.status === 'rejected') throw new Error(`IG: ${(ig.reason as Error).message}`)
  return {
    fbId: (fb.value as { id: string }).id,
    igId: (ig.value as { id: string }).id,
  }
}

// Retry-once wrapper. Most Meta API failures are transient — token glitches,
// rate-limit edges, fetch hiccups, spurious "Only photo or video can be accepted
// as media type" errors. Retrying once after 30s recovers ~95% of these without
// human intervention. Only the second consecutive failure marks the item failed.
const RETRY_DELAY_MS = 30000
async function postItemWithRetry(item: { type: string; videoUrl: string; caption?: string },
    label: string): Promise<{ fbId: string | null; igId: string; attempts: number; firstError?: string }> {
  try {
    const r = await postItem(item)
    return { ...r, attempts: 1 }
  } catch (e1) {
    const firstError = (e1 as Error).message
    console.warn(`[publish] ${label} attempt 1 failed: ${firstError} — retrying in ${RETRY_DELAY_MS}ms`)
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
    const r = await postItem(item)
    console.log(`[publish] ${label} succeeded on retry`)
    return { ...r, attempts: 2, firstError }
  }
}

export async function POST(req: NextRequest) {
  const db = await getDb()
  const body = await req.json().catch(() => ({}))
  const { mode = 'post', accountId = 'sire-ship', dryRun = false } = body

  const now = new Date()

  // Safety: release any item stuck in 'processing' for >10 min (likely a crashed run)
  const stuckCutoff = new Date(now.getTime() - 10 * 60 * 1000)
  await db.collection('social_queue').updateMany(
    { status: 'processing', claimedAt: { $lt: stuckCutoff.toISOString() } },
    { $set: { status: 'scheduled' }, $unset: { claimedAt: '' } }
  )

  const windowStart = new Date(now.getTime() - LOOKBACK_MIN   * 60 * 1000)
  const windowEnd   = new Date(now.getTime() + LOOKAHEAD_MIN  * 60 * 1000)

  // mode='all' checks posts, reels, AND stories
  const typeFilter = mode === 'all' ? { $in: ['post', 'reel', 'story'] } : mode
  const items = await db.collection('social_queue').find({
    accountId, status: 'scheduled', type: typeFilter,
    scheduledDate: { $gte: windowStart.toISOString(), $lte: windowEnd.toISOString() },
  }).sort({ scheduledDate: 1 }).toArray()

  if (!items.length) return NextResponse.json({ ok: true, posted: 0, message: `Nothing due for mode=${mode}` })

  // Atomic claim — mark each item 'processing' so a concurrent cron run can't grab them
  const fresh = []
  for (const item of items) {
    const claimed = await db.collection('social_queue').findOneAndUpdate(
      { _id: item._id, status: 'scheduled' },
      { $set: { status: 'processing', claimedAt: now.toISOString() } },
      { returnDocument: 'after' }
    )
    if (claimed) fresh.push(claimed)
  }
  if (!fresh.length) return NextResponse.json({ ok: true, posted: 0, message: 'Nothing to post (or already claimed by another run)' })

  if (dryRun) return NextResponse.json({ ok: true, dryRun: true, would_post: fresh.length,
    items: fresh.map(i => ({ type: i.type, templateName: i.templateName, variationNum: i.variationNum, scheduledDate: i.scheduledDate })) })

  const results: Record<string, unknown>[] = []
  let success = 0

  for (const item of fresh) {
    void item.scheduledDate  // legacy field — kept for downstream consumers
    const label = `${item.templateName} V${item.variationNum}`
    try {
      const r = await postItemWithRetry(
        { type: item.type, videoUrl: item.videoUrl, caption: item.caption },
        label,
      )
      const update: Record<string, unknown> = {
        status: 'posted', postedAt: now.toISOString(), fbId: r.fbId, igId: r.igId, attempts: r.attempts,
      }
      if (r.firstError) update.firstError = r.firstError
      await db.collection('social_queue').updateOne({ _id: item._id }, { $set: update })
      success++
      results.push({ label, ok: true, fbId: r.fbId, igId: r.igId, type: item.type, attempts: r.attempts })
    } catch (e: unknown) {
      // Failed BOTH attempts — mark failed for human review.
      const msg = (e as Error).message
      results.push({ label, ok: false, error: msg, attempts: 2 })
      await db.collection('social_queue').updateOne(
        { _id: item._id }, { $set: { status: 'failed', errorMsg: msg, attempts: 2 } }
      )
    }

    // 20s delay between posts in same run — avoids Meta rate limits on back-to-back stories
    if (fresh.indexOf(item) < fresh.length - 1) {
      await new Promise(r => setTimeout(r, 20000))
    }
  }

  return NextResponse.json({ ok: true, mode, posted: success, failed: fresh.length - success, results })
}

export async function GET(req: NextRequest) {
  const db = await getDb()
  const accountId = req.nextUrl.searchParams.get('accountId') || 'sire-ship'
  const now = new Date()
  const next7days = new Date(now.getTime() + 7 * 86400 * 1000)
  const upcoming = await db.collection('social_queue').find({
    accountId, status: 'scheduled',
    scheduledDate: { $gte: now.toISOString(), $lte: next7days.toISOString() },
  }).sort({ scheduledDate: 1 }).limit(20).toArray()
  return NextResponse.json({ ok: true, upcoming: upcoming.length, items: upcoming.map(i => ({ type: i.type, templateName: i.templateName, variationNum: i.variationNum, scheduledDate: i.scheduledDate })) })
}
