export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

const REGION = process.env.DO_SPACES_REGION || 'nyc3'
const BUCKET  = process.env.DO_SPACES_BUCKET  || 'ethan-social'

async function getS3() {
  const { S3Client } = await import('@aws-sdk/client-s3')
  return new S3Client({
    endpoint: `https://${REGION}.digitaloceanspaces.com`,
    region: REGION,
    credentials: {
      accessKeyId: process.env.DO_SPACES_KEY!,
      secretAccessKey: process.env.DO_SPACES_SECRET!,
    },
    forcePathStyle: false,
  })
}

// GET — returns a presigned PUT URL the browser uploads to directly
export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get('filename') || 'upload'
  const contentType = req.nextUrl.searchParams.get('type') || 'video/mp4'
  const key = `social/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  const key_env = process.env.DO_SPACES_KEY
  const secret_env = process.env.DO_SPACES_SECRET

  if (!key_env || !secret_env) {
    return NextResponse.json({
      ok: false,
      error: 'DO_SPACES_KEY and DO_SPACES_SECRET not configured in app env vars'
    }, { status: 500 })
  }

  try {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')
    const { PutObjectCommand } = await import('@aws-sdk/client-s3')
    const s3 = await getS3()

    const cmd = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      ACL: 'public-read',
    })
    const presignedUrl = await getSignedUrl(s3, cmd, { expiresIn: 3600 })
    const publicUrl = `https://${BUCKET}.${REGION}.digitaloceanspaces.com/${key}`
    return NextResponse.json({ ok: true, presignedUrl, publicUrl, key })
  } catch (e: unknown) {
    const msg = (e as Error).message
    // Give a clear actionable error
    const isNotExist = msg.includes('NoSuchBucket') || msg.includes('does not exist')
    const errorMsg = isNotExist
      ? `Bucket "${BUCKET}" does not exist. Create it at cloud.digitalocean.com → Spaces → Create Space → name "${BUCKET}", region "${REGION}"`
      : msg
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 })
  }
}

// POST — multipart fallback: browser uploads file body directly to this route,
// server streams it to DO Spaces. Slower but works when presigned URLs fail.
export async function POST(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get('filename') || 'upload'
  const contentType = req.headers.get('content-type') || 'video/mp4'
  const key = `social/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  try {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3')
    const s3 = await getS3()
    const body = Buffer.from(await req.arrayBuffer())

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: 'public-read',
    }))

    const publicUrl = `https://${BUCKET}.${REGION}.digitaloceanspaces.com/${key}`
    return NextResponse.json({ ok: true, publicUrl, key })
  } catch (e: unknown) {
    const msg = (e as Error).message
    const isNotExist = msg.includes('NoSuchBucket') || msg.includes('does not exist')
    const errorMsg = isNotExist
      ? `Bucket "${BUCKET}" does not exist — create it at cloud.digitalocean.com → Spaces → name "${BUCKET}", region "${REGION}"`
      : msg
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 })
  }
}
