export const dynamic = 'force-dynamic'
export const maxDuration = 60
import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getDb } from '@/lib/mongodb'

const SPACES_KEY    = 'DO801HU3FAMAY8LEP2EM'
const SPACES_SECRET = 'fJ7DNvfXnL7Vx+72FwZe8GgYUHBeBkoDLWJEwZ6ZG+w'
const SPACES_REGION = process.env.DO_SPACES_REGION || 'nyc3'
const BUCKET        = process.env.DO_SPACES_BUCKET || 'ethan-social'
const CDN           = process.env.DO_SPACES_CDN    || 'https://ethan-social.nyc3.cdn.digitaloceanspaces.com'

const s3 = new S3Client({
  endpoint: `https://${SPACES_REGION}.digitaloceanspaces.com`,
  region: SPACES_REGION,
  credentials: { accessKeyId: SPACES_KEY, secretAccessKey: SPACES_SECRET },
  forcePathStyle: false,
})

export async function POST(req: NextRequest) {
  try {
    const url = req.nextUrl
    const name     = url.searchParams.get('name')     || `creative_${Date.now()}`
    const filename = url.searchParams.get('filename') || `creative_${Date.now()}.png`
    const hook     = url.searchParams.get('hook')     || ''
    const angle    = url.searchParams.get('angle')    || ''
    const variant  = url.searchParams.get('variant')  || ''
    const tagsRaw  = url.searchParams.get('tags')     || ''
    const tags     = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : []
    const accountId = url.searchParams.get('accountId') || 'sire-ship'

    const buffer = Buffer.from(await req.arrayBuffer())
    if (buffer.length === 0) {
      return NextResponse.json({ ok: false, error: 'empty body' }, { status: 400 })
    }

    const ext = filename.split('.').pop()?.toLowerCase() || 'png'
    const contentType =
      ext === 'png'  ? 'image/png' :
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
      ext === 'gif'  ? 'image/gif' :
      ext === 'mp4'  ? 'video/mp4' :
      ext === 'mov'  ? 'video/quicktime' :
                       'application/octet-stream'

    const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 60)
    const key = `ads/${accountId}/${safeName}/${Date.now()}_${filename}`

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: key, Body: buffer,
      ContentType: contentType, ACL: 'public-read',
    }))
    const imageUrl = `${CDN}/${key}`

    const db = await getDb()
    const now = new Date().toISOString()
    const doc = {
      accountId, name, imageUrl,
      hook, angle, variant, tags,
      metaImageHash: null,
      stats: { timesUsedInAds: 0 },
      mediaType: contentType.startsWith('video/') ? 'video' : 'image',
      createdAt: now, updatedAt: now,
    }
    const r = await db.collection('ads_creatives').insertOne(doc)

    return NextResponse.json({
      ok: true,
      id: r.insertedId.toString(),
      url: imageUrl,
      creative: { ...doc, _id: r.insertedId },
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
