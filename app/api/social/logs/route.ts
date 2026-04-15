export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export interface BotRun {
  _id?: string
  type: 'reel' | 'story'
  startedAt: string
  finishedAt?: string
  durationMs?: number
  status: 'running' | 'success' | 'failed' | 'partial'
  itemsAttempted: number
  itemsPosted: number
  itemsFailed: number
  details: { file: string; ok: boolean; error?: string; igMediaId?: string; scheduledFor?: string }[]
  errorMsg?: string
  scriptVersion?: string
}

export async function GET(req: NextRequest) {
  const db = await getDb()
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '30')
  const type = req.nextUrl.searchParams.get('type')
  const filter: Record<string, unknown> = {}
  if (type) filter.type = type
  const logs = await db.collection<BotRun>('social_bot_logs')
    .find(filter).sort({ startedAt: -1 }).limit(limit).toArray()
  return NextResponse.json({ ok: true, logs })
}

export async function POST(req: NextRequest) {
  const db = await getDb()
  const body = await req.json()
  const result = await db.collection('social_bot_logs').insertOne({
    ...body,
    startedAt: body.startedAt || new Date().toISOString(),
  })
  return NextResponse.json({ ok: true, id: result.insertedId })
}

export async function PATCH(req: NextRequest) {
  const db = await getDb()
  const { id, ...update } = await req.json()
  const { ObjectId } = await import('mongodb')
  await db.collection('social_bot_logs').updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...update, finishedAt: new Date().toISOString() } }
  )
  return NextResponse.json({ ok: true })
}
