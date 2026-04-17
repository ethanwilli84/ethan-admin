export const dynamic = 'force-dynamic'
export const maxDuration = 60
import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/mongodb'

const s3 = new S3Client({
  endpoint: `https://${process.env.DO_SPACES_REGION || 'nyc3'}.digitaloceanspaces.com`,
  region: process.env.DO_SPACES_REGION || 'nyc3',
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY!,
    secretAccessKey: process.env.DO_SPACES_SECRET!,
  },
})

const BUCKET = process.env.DO_SPACES_BUCKET || 'ethan-social'
const CDN    = process.env.DO_SPACES_CDN    || 'https://ethan-social.nyc3.cdn.digitaloceanspaces.com'

export async function POST(req: NextRequest) {
  const url = req.nextUrl
  const templateId  = url.searchParams.get('templateId')
  const variationNum = parseInt(url.searchParams.get('variationNum') || '0')
  const templateName = url.searchParams.get('templateName') || 'template'
  const contentType  = url.searchParams.get('contentType') || 'post'
  const filename     = url.searchParams.get('filename') || `upload_${Date.now()}.png`

  const bytes = await req.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const ext = filename.split('.').pop()?.toLowerCase() || 'png'
  const ct = ext === 'mp4' ? 'video/mp4' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'

  const slug = templateName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const key  = `social/templates/${slug}/V${variationNum}.${ext}`

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key,
    Body: buffer, ContentType: ct,
    ACL: 'public-read' as const,
  }))

  const cdnUrl = `${CDN}/${key}`

  // If templateId + variationNum provided, update the DB variation URL
  if (templateId && variationNum) {
    const db = await getDb()
    const tmpl = await db.collection('social_templates').findOne({ _id: new ObjectId(templateId) })
    if (tmpl) {
      const newVars = (tmpl.variations || []).map((v: Record<string,unknown>) =>
        v.variationNum === variationNum ? { ...v, url: cdnUrl, uploadedAt: new Date().toISOString() } : v
      )
      await db.collection('social_templates').updateOne(
        { _id: tmpl._id },
        { $set: { variations: newVars } }
      )
      // Update matching queue items too
      await db.collection('social_queue').updateMany(
        { templateId, variationNum, status: 'scheduled' },
        { $set: { videoUrl: cdnUrl } }
      )
    }
  }

  return NextResponse.json({ ok: true, url: cdnUrl, key })
}
