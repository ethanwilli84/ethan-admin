export const dynamic = 'force-dynamic'
export const maxDuration = 30
import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/mongodb'

const s3 = new S3Client({
  endpoint: `https://${process.env.DO_SPACES_REGION || 'nyc3'}.digitaloceanspaces.com`,
  region: process.env.DO_SPACES_REGION || 'nyc3',
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY!,
    secretAccessKey: process.env.DO_SPACES_SECRET!,
  },
  forcePathStyle: false,
})

const BUCKET = process.env.DO_SPACES_BUCKET || 'ethan-social'
const CDN    = process.env.DO_SPACES_CDN    || 'https://ethan-social.nyc3.cdn.digitaloceanspaces.com'

// GET — returns a presigned URL for direct browser → DO Spaces upload
export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const filename    = url.searchParams.get('filename') || `upload_${Date.now()}.png`
  const contentType = url.searchParams.get('contentType') || 'post'
  const templateName = url.searchParams.get('templateName') || 'template'
  const variationNum = url.searchParams.get('variationNum') || '1'
  const mimeType    = url.searchParams.get('mimeType') || 'image/png'

  const ext  = filename.split('.').pop()?.toLowerCase() || 'png'
  const slug = templateName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const key  = `social/templates/${contentType}/${slug}/V${variationNum}.${ext}`

  const command = new PutObjectCommand({
    Bucket: BUCKET, Key: key,
    ContentType: mimeType,
    ACL: 'public-read' as const,
  })

  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 300 })
  const cdnUrl = `${CDN}/${key}`

  return NextResponse.json({ ok: true, presignedUrl, cdnUrl, key })
}

// POST — called after direct upload completes, updates DB with new URL
export async function POST(req: NextRequest) {
  const { templateId, variationNum, cdnUrl } = await req.json()
  if (!templateId || !variationNum || !cdnUrl) {
    return NextResponse.json({ ok: false, error: 'Missing params' }, { status: 400 })
  }
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
  return NextResponse.json({ ok: true, url: cdnUrl })
}
