export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { readFileSync } from 'fs'
import { extname } from 'path'

const CREDS = {
  pageToken:  process.env.META_PAGE_TOKEN!,
  pageId:     process.env.META_PAGE_ID!,
  igUserId:   process.env.META_IG_USER_ID!,
  spacesKey:  process.env.DO_SPACES_KEY!,
  spacesSecret: process.env.DO_SPACES_SECRET!,
  spacesBucket: process.env.DO_SPACES_BUCKET || 'ethan-social',
  spacesRegion: process.env.DO_SPACES_REGION || 'nyc3',
  spacesCdn:  process.env.DO_SPACES_CDN || 'https://ethan-social.nyc3.cdn.digitaloceanspaces.com',
}

const MIN_DAYS_OUT = 7
const LOOKAHEAD_DAYS = 32

// ── DO Spaces upload ──────────────────────────────────────────────────────────
async function uploadToSpaces(localPath: string): Promise<string> {
  const s3 = new S3Client({
    endpoint: `https://${CREDS.spacesRegion}.digitaloceanspaces.com`,
    region: CREDS.spacesRegion,
    credentials: { accessKeyId: CREDS.spacesKey, secretAccessKey: CREDS.spacesSecret },
    forcePathStyle: false,
  })
  const ext = extname(localPath).toLowerCase()
  const contentType = ext === '.png' ? 'image/png' : ext === '.mp4' ? 'video/mp4' : 'image/jpeg'
  const key = `social/${localPath.split('/').pop()}_${Date.now()}${ext}`
  const body = readFileSync(localPath)
  await s3.send(new PutObjectCommand({
    Bucket: CREDS.spacesBucket, Key: key, Body: body,
    ContentType: contentType, ACL: 'public-read',
  }))
  return `${CREDS.spacesCdn}/${key}`
}

// ── Meta Graph API helpers ────────────────────────────────────────────────────
async function metaPost(path: string, params: Record<string, string>) {
  const body = new URLSearchParams({ ...params, access_token: CREDS.pageToken })
  const r = await fetch(`https://graph.facebook.com/v19.0${path}`, {
    method: 'POST', body,
  })
  const d = await r.json()
  if (d.error) throw new Error(`Meta API: ${d.error.message}`)
  return d
}

async function waitForContainer(containerId: string, maxAttempts = 10): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const r = await fetch(`https://graph.facebook.com/v19.0/${containerId}?fields=status_code&access_token=${CREDS.pageToken}`)
    const d = await r.json()
    if (d.status_code === 'FINISHED') return
    if (d.status_code === 'ERROR' || d.status_code === 'EXPIRED')
      throw new Error(`Container ${containerId} status: ${d.status_code}`)
  }
  throw new Error('Container timed out')
}

async function scheduleFbPost(imageUrl: string, caption: string, scheduledTs: number) {
  return metaPost(`/${CREDS.pageId}/photos`, {
    url: imageUrl, caption,
    scheduled_publish_time: String(scheduledTs),
    published: 'false',
  })
}

async function scheduleIgPost(imageUrl: string, caption: string, scheduledTs: number) {
  const container = await metaPost(`/${CREDS.igUserId}/media`, {
    image_url: imageUrl, caption,
    media_type: 'IMAGE',
    published: 'false',
    scheduled_publish_time: String(scheduledTs),
  })
  await waitForContainer(container.id)
  return { id: container.id, scheduled: true, scheduled_publish_time: scheduledTs }
}

async function postIgStory(imageUrl: string) {
  const container = await metaPost(`/${CREDS.igUserId}/media`, {
    image_url: imageUrl, media_type: 'STORIES',
  })
  await waitForContainer(container.id)
  return metaPost(`/${CREDS.igUserId}/media_publish`, { creation_id: container.id })
}

// ── Main publish handler ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const db = await getDb()
  const { mode = 'scheduled', accountId = 'sire-ship', dryRun = false } = await req.json().catch(() => ({}))
  // mode: 'scheduled' = posts+reels, 'stories' = today's stories

  const now = new Date()
  const horizon = new Date(now.getTime() + LOOKAHEAD_DAYS * 86400 * 1000)

  // Fetch queue items
  const typeFilter = mode === 'stories' ? 'story' : { $in: ['post', 'reel'] }
  const items = await db.collection('social_queue').find({
    accountId, status: 'scheduled', type: typeFilter,
    scheduledDate: {
      $lte: mode === 'stories'
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()
        : horizon.toISOString(),
      ...(mode === 'stories' ? { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString() } : {}),
    }
  }).sort({ scheduledDate: 1 }).toArray()

  if (!items.length) return NextResponse.json({ ok: true, scheduled: 0, message: 'Nothing to schedule' })

  // Dedup — skip already confirmed
  const fresh = []
  for (const item of items) {
    const dt = new Date(item.scheduledDate)
    const existing = await db.collection('social_confirmed_dates').findOne({
      accountId, type: item.type, date: dt.toISOString().split('T')[0]
    })
    if (!existing) fresh.push(item)
  }

  if (dryRun) return NextResponse.json({ ok: true, dryRun: true, would_schedule: fresh.length, items: fresh.map(i => ({ type: i.type, templateName: i.templateName, scheduledDate: i.scheduledDate })) })

  const results: Record<string, unknown>[] = []
  let successCount = 0

  for (const item of fresh) {
    const dt = new Date(item.scheduledDate)
    const daysOut = Math.floor((dt.getTime() - now.getTime()) / 86400000)
    const label = `${item.templateName} V${item.variationNum}`

    // Safety check for scheduled posts
    if (item.type !== 'story' && daysOut < MIN_DAYS_OUT) {
      results.push({ label, ok: false, error: `too_soon:${daysOut}d` }); continue
    }

    try {
      // Upload local file to DO Spaces
      const publicUrl = await uploadToSpaces(item.videoUrl)
      const scheduledTs = Math.floor(dt.getTime() / 1000)

      let fbResult, igResult
      if (item.type === 'story') {
        igResult = await postIgStory(publicUrl)
      } else {
        fbResult = await scheduleFbPost(publicUrl, item.caption || '', scheduledTs)
        igResult = await scheduleIgPost(publicUrl, item.caption || '', scheduledTs)
      }

      // Mark confirmed
      await db.collection('social_confirmed_dates').updateOne(
        { accountId, type: item.type, date: dt.toISOString().split('T')[0] },
        { $set: { accountId, type: item.type, date: dt.toISOString().split('T')[0], scheduledAt: dt.toISOString(), templateName: item.templateName, variationNum: item.variationNum, confirmedAt: new Date().toISOString(), fbId: fbResult?.id, igId: igResult?.id } },
        { upsert: true }
      )
      await db.collection('social_queue').updateOne(
        { _id: item._id },
        { $set: { status: 'posted', postedAt: new Date().toISOString() } }
      )

      successCount++
      results.push({ label, ok: true, fb: fbResult?.id, ig: igResult?.id, scheduledFor: item.scheduledDate })
    } catch (e: unknown) {
      const msg = (e as Error).message
      results.push({ label, ok: false, error: msg })
      await db.collection('social_queue').updateOne({ _id: item._id }, { $set: { status: 'failed', errorMsg: msg } })
    }
  }

  return NextResponse.json({ ok: true, mode, scheduled: successCount, failed: fresh.length - successCount, results })
}

// GET — check what would be scheduled next
export async function GET(req: NextRequest) {
  const db = await getDb()
  const mode = req.nextUrl.searchParams.get('mode') || 'scheduled'
  const accountId = req.nextUrl.searchParams.get('accountId') || 'sire-ship'
  const now = new Date()
  const horizon = new Date(now.getTime() + LOOKAHEAD_DAYS * 86400 * 1000)
  const typeFilter = mode === 'stories' ? 'story' : { $in: ['post', 'reel'] }
  const items = await db.collection('social_queue').find({
    accountId, status: 'scheduled', type: typeFilter,
    scheduledDate: { $lte: horizon.toISOString() }
  }).sort({ scheduledDate: 1 }).limit(10).toArray()
  return NextResponse.json({ ok: true, upcoming: items.length, items })
}
