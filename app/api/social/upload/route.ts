export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const REGION = process.env.DO_SPACES_REGION || 'nyc3'
const BUCKET = process.env.DO_SPACES_BUCKET || 'ethan-social'
const ENDPOINT = `https://${REGION}.digitaloceanspaces.com`

function getS3() {
  return new S3Client({
    endpoint: ENDPOINT,
    region: REGION,
    credentials: {
      accessKeyId: process.env.DO_SPACES_KEY!,
      secretAccessKey: process.env.DO_SPACES_SECRET!,
    },
    forcePathStyle: false,
  })
}

// GET /api/social/upload?filename=reel.mp4&type=video/mp4
// Returns a presigned URL the client uploads to directly (bypasses 4MB Next.js limit)
export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get('filename') || 'reel.mp4'
  const contentType = req.nextUrl.searchParams.get('type') || 'video/mp4'
  const key = `reels/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  try {
    const s3 = getS3()
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
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
