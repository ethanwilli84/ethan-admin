export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

const IG_USER_ID = process.env.IG_USER_ID!
const IG_TOKEN = process.env.IG_ACCESS_TOKEN!
const BASE = 'https://graph.facebook.com/v19.0'

async function igPost(endpoint: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: IG_TOKEN }),
  })
  const d = await res.json()
  if (d.error) throw new Error(d.error.message)
  return d
}

async function waitForContainer(mediaId: string, maxWait = 120000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    const res = await fetch(`${BASE}/${mediaId}?fields=status_code&access_token=${IG_TOKEN}`)
    const d = await res.json()
    if (d.status_code === 'FINISHED') return true
    if (d.status_code === 'ERROR') throw new Error('IG container error')
    await new Promise(r => setTimeout(r, 5000))
  }
  throw new Error('IG container timed out')
}

export async function POST(req: NextRequest) {
  const db = await getDb()
  const { id, today = false } = await req.json()

  // Determine which items to post
  let filter: Record<string, unknown> = { status: 'scheduled' }
  if (id) {
    filter = { _id: new ObjectId(id), status: 'scheduled' }
  } else if (today) {
    const d = new Date()
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString()
    filter = { status: 'scheduled', scheduledDate: { $gte: start, $lt: end } }
  }

  if (!IG_USER_ID || !IG_TOKEN) {
    return NextResponse.json({ ok: false, error: 'IG_USER_ID and IG_ACCESS_TOKEN not configured' }, { status: 400 })
  }

  const items = await db.collection('social_queue').find(filter).sort({ scheduledDate: 1 }).toArray()
  if (!items.length) return NextResponse.json({ ok: true, posted: 0, message: 'Nothing to post' })

  const results = []
  for (const item of items) {
    try {
      // Step 1: Create reel container
      const container = await igPost(`/${IG_USER_ID}/media`, {
        media_type: 'REELS',
        video_url: item.videoUrl,
        caption: item.caption || '',
        share_to_feed: true,
      })

      // Step 2: Wait for Instagram to process the video
      await waitForContainer(container.id)

      // Step 3: Publish
      const published = await igPost(`/${IG_USER_ID}/media_publish`, {
        creation_id: container.id,
      })

      await db.collection('social_queue').updateOne(
        { _id: item._id },
        { $set: { status: 'posted', postedAt: new Date().toISOString(), igMediaId: published.id } }
      )
      results.push({ id: item._id, ok: true, igMediaId: published.id })
    } catch (e: unknown) {
      const msg = (e as Error).message
      await db.collection('social_queue').updateOne(
        { _id: item._id },
        { $set: { status: 'failed', errorMsg: msg } }
      )
      results.push({ id: item._id, ok: false, error: msg })
    }
  }

  return NextResponse.json({ ok: true, posted: results.filter(r => r.ok).length, results })
}
