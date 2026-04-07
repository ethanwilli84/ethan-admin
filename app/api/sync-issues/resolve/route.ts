export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

// Receives outgoing iMessage replies from local Mac agent
// Marks any open issues from that contact as resolved
export async function POST(req: NextRequest) {
  const { replies, secret } = await req.json()
  if (secret !== process.env.INGEST_SECRET && secret !== 'sire-alpine-ingest-2024') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const db = await getDb()
  let resolved = 0
  for (const reply of replies || []) {
    const contact = reply.contact
    if (!contact) continue
    const result = await db.collection('issues').updateMany(
      { fromRaw: contact, status: 'open', channel: 'imessage' },
      { $set: { status: 'resolved', resolvedBy: 'imessage_reply', resolvedAt: new Date(), resolution: 'Replied via iMessage', updatedAt: new Date() } }
    )
    resolved += result.modifiedCount
  }
  return NextResponse.json({ ok: true, resolved })
}
