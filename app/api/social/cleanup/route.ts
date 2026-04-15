export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

const REGION = process.env.DO_SPACES_REGION || 'nyc3'
const BUCKET  = process.env.DO_SPACES_BUCKET  || 'ethan-social'

function getS3() {
  return new S3Client({
    endpoint: `https://${REGION}.digitaloceanspaces.com`,
    region: REGION,
    credentials: {
      accessKeyId: process.env.DO_SPACES_KEY!,
      secretAccessKey: process.env.DO_SPACES_SECRET!,
    },
  })
}

// POST /api/social/cleanup — delete files older than 30 days from Spaces + DB
export async function POST(req: NextRequest) {
  const db = await getDb()
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // Find posted items older than 30 days
  const old = await db.collection('social_queue').find({
    status: 'posted',
    postedAt: { $lt: cutoff.toISOString() },
  }).toArray()

  const deleted: string[] = []
  const errors: string[] = []

  const s3 = getS3()
  for (const item of old) {
    // Extract key from URL
    const url = item.videoUrl as string
    if (!url) continue
    try {
      const key = url.split('.digitaloceanspaces.com/').pop()
      if (key) {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
        deleted.push(key)
      }
      // Null out the videoUrl to save space but keep the queue record
      await db.collection('social_queue').updateOne(
        { _id: item._id },
        { $set: { videoUrl: null, cleanedAt: new Date().toISOString() } }
      )
    } catch (e: unknown) {
      errors.push(`${item._id}: ${(e as Error).message}`)
    }
  }

  return NextResponse.json({ ok: true, deleted: deleted.length, errors, items: old.length })
}

// GET /api/social/cleanup — show what would be cleaned
export async function GET() {
  const db = await getDb()
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const count = await db.collection('social_queue').countDocuments({
    status: 'posted', postedAt: { $lt: cutoff.toISOString() }
  })
  return NextResponse.json({ ok: true, eligible: count, cutoffDate: cutoff.toISOString() })
}
