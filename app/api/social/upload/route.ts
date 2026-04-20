export const dynamic = 'force-dynamic'
export const maxDuration = 60
import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/mongodb'

// Hardcoded — DO App env var stuck on wrong key
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

// POST — browser sends file here, server uploads to Spaces (no CORS issues)
export async function POST(req: NextRequest) {
  try {
    const url = req.nextUrl
    const templateId   = url.searchParams.get('templateId')
    const variationNum = parseInt(url.searchParams.get('variationNum') || '0')
    const templateName = url.searchParams.get('templateName') || 'template'
    const contentType  = url.searchParams.get('contentType') || 'post'
    const filename     = url.searchParams.get('filename') || `upload_${Date.now()}.png`

    let buffer: Buffer = Buffer.from(await req.arrayBuffer())

    // Auto-pad square images to 9:16 for stories (so IG doesn't fullscreen/zoom)
    if (contentType === 'story') {
      try {
        // Dynamic import sharp only when needed
        const sharp = (await import('sharp')).default
        const meta = await sharp(buffer).metadata()
        if (meta.width && meta.height && Math.abs(meta.width - meta.height) < 10) {
          // Square image — pad to 1080x1920
          const targetW = 1080, targetH = 1920
          const scale = targetW / meta.width
          const newH = Math.round(meta.height * scale)
          const yOffset = Math.floor((targetH - newH) / 2)
          buffer = (await sharp(buffer)
            .resize(targetW, newH)
            .extend({
              top: yOffset,
              bottom: targetH - newH - yOffset,
              left: 0, right: 0,
              background: { r: 0, g: 0, b: 0, alpha: 1 }
            })
            .jpeg({ quality: 90 })
            .toBuffer()) as Buffer
          console.log(`Padded ${meta.width}x${meta.height} story to 1080x1920`)
        }
      } catch (padErr) {
        console.warn('Story padding failed, using original:', padErr)
      }
    }

    const ext  = filename.split('.').pop()?.toLowerCase() || 'png'
    const ct   = ext === 'mp4' ? 'video/mp4' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
    const slug = templateName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const key  = `social/templates/${contentType}/${slug}/V${variationNum}_${Date.now()}.${ext}`

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: key,
      Body: buffer, ContentType: ct,
      ACL: 'public-read' as const,
    }))

    const cdnUrl = `${CDN}/${key}`

    // Update DB if templateId provided
    if (templateId && variationNum) {
      const db = await getDb()
      const tmpl = await db.collection('social_templates').findOne({ _id: new ObjectId(templateId) })
      if (tmpl) {
        const newVars = (tmpl.variations || []).map((v: Record<string,unknown>) =>
          v.variationNum === variationNum ? { ...v, url: cdnUrl, uploadedAt: new Date().toISOString() } : v
        )
        await db.collection('social_templates').updateOne({ _id: tmpl._id }, { $set: { variations: newVars } })
        await db.collection('social_queue').updateMany(
          { templateId, variationNum, status: 'scheduled' },
          { $set: { videoUrl: cdnUrl } }
        )
      }
    }

    return NextResponse.json({ ok: true, url: cdnUrl, key })
  } catch (e: unknown) {
    console.error('Upload error:', e)
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

// GET — kept for backwards compat, now just returns a dummy presigned-style response
export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: true, note: 'use POST to upload directly' })
}
