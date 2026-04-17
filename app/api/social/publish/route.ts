export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const CREDS = {
  pageToken:    process.env.META_PAGE_TOKEN!,
  pageId:       process.env.META_PAGE_ID!,
  igUserId:     process.env.META_IG_USER_ID!,
  spacesKey:    process.env.DO_SPACES_KEY!,
  spacesSecret: process.env.DO_SPACES_SECRET!,
  spacesBucket: process.env.DO_SPACES_BUCKET || 'ethan-social',
  spacesRegion: process.env.DO_SPACES_REGION || 'nyc3',
  spacesCdn:    process.env.DO_SPACES_CDN    || 'https://ethan-social.nyc3.cdn.digitaloceanspaces.com',
}

const MATCH_WINDOW_MINUTES = 15

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

export async function POST(req: NextRequest) {
  const db = await getDb()
  const body = await req.json().catch(() => ({}))
  const { mode = 'post', accountId = 'sire-ship', dryRun = false, windowMinutes = MATCH_WINDOW_MINUTES } = body

  const now = new Date()
  const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000)
  const windowEnd   = new Date(now.getTime() + windowMinutes * 60 * 1000)

  // mode='all' checks posts, reels, AND stories
  const typeFilter = mode === 'all' ? { $in: ['post', 'reel', 'story'] } : mode
  const items = await db.collection('social_queue').find({
    accountId, status: 'scheduled', type: typeFilter,
    scheduledDate: { $gte: windowStart.toISOString(), $lte: windowEnd.toISOString() },
  }).sort({ scheduledDate: 1 }).toArray()

  if (!items.length) return NextResponse.json({ ok: true, posted: 0, message: `Nothing due for mode=${mode}` })

  const fresh = []
  for (const item of items) {
    const dateStr = new Date(item.scheduledDate).toISOString().split('T')[0]
    const exists = await db.collection('social_confirmed_dates').findOne({ accountId, type: item.type, date: dateStr })
    if (!exists) fresh.push(item)
  }

  if (!fresh.length) return NextResponse.json({ ok: true, posted: 0, message: 'Already posted' })

  if (dryRun) return NextResponse.json({ ok: true, dryRun: true, would_post: fresh.length,
    items: fresh.map(i => ({ type: i.type, templateName: i.templateName, variationNum: i.variationNum, scheduledDate: i.scheduledDate })) })

  const results: Record<string, unknown>[] = []
  let success = 0

  for (const item of fresh) {
    const dt = new Date(item.scheduledDate)
    const label = `${item.templateName} V${item.variationNum}`
    try {
      const imageUrl = await ensurePublicUrl(item.videoUrl)
      const caption = item.caption || ''
      let fbId = null, igId = null

      if (item.type === 'story') {
        const r = await postIgStory(imageUrl)
        igId = r.id
      } else {
        const [fb, ig] = await Promise.allSettled([postFbNow(imageUrl, caption), postIgNow(imageUrl, caption)])
        if (fb.status === 'rejected') throw new Error(`FB: ${(fb.reason as Error).message}`)
        if (ig.status === 'rejected') throw new Error(`IG: ${(ig.reason as Error).message}`)
        fbId = (fb.value as {id:string}).id
        igId = (ig.value as {id:string}).id
      }

      const dateStr = dt.toISOString().split('T')[0]
      await db.collection('social_confirmed_dates').updateOne(
        { accountId, type: item.type, date: dateStr },
        { $set: { accountId, type: item.type, date: dateStr, postedAt: now.toISOString(), templateName: item.templateName, variationNum: item.variationNum, fbId, igId } },
        { upsert: true }
      )
      await db.collection('social_queue').updateOne(
        { _id: item._id }, { $set: { status: 'posted', postedAt: now.toISOString(), fbId, igId } }
      )
      success++
      results.push({ label, ok: true, fbId, igId, type: item.type })
    } catch (e: unknown) {
      const msg = (e as Error).message
      results.push({ label, ok: false, error: msg })
      await db.collection('social_queue').updateOne({ _id: item._id }, { $set: { status: 'failed', errorMsg: msg } })
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
