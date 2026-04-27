export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

function cors(res: NextResponse) {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return res
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 200 }))
}

// GET /api/ups → returns all feedback state keyed by itemId
export async function GET() {
  try {
    const db = await getDb()
    const docs = await db.collection('ups_negotiation').find({}).toArray()
    const map: Record<string, {
      feedback: string
      submittedToUps: boolean
      submittedDate: string | null
      lastUpdated: string
    }> = {}
    for (const d of docs) {
      map[String(d._id)] = {
        feedback: d.feedback || '',
        submittedToUps: !!d.submittedToUps,
        submittedDate: d.submittedDate ? new Date(d.submittedDate).toISOString() : null,
        lastUpdated: d.lastUpdated ? new Date(d.lastUpdated).toISOString() : new Date().toISOString(),
      }
    }
    return cors(NextResponse.json(map))
  } catch (e) {
    console.error('GET /api/ups failed', e)
    return cors(NextResponse.json({ error: 'failed' }, { status: 500 }))
  }
}

// POST /api/ups { itemId, feedback?, submittedToUps? } → upsert
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { itemId, feedback, submittedToUps } = body
    if (!itemId || typeof itemId !== 'string') {
      return cors(NextResponse.json({ error: 'itemId required' }, { status: 400 }))
    }

    const db = await getDb()
    const col = db.collection('ups_negotiation')

    const update: Record<string, unknown> = { lastUpdated: new Date() }
    if (typeof feedback === 'string') update.feedback = feedback
    if (typeof submittedToUps === 'boolean') {
      update.submittedToUps = submittedToUps
      update.submittedDate = submittedToUps ? new Date() : null
    }

    await col.updateOne(
      { _id: itemId as never },
      { $set: update },
      { upsert: true }
    )

    return cors(NextResponse.json({ ok: true }))
  } catch (e) {
    console.error('POST /api/ups failed', e)
    return cors(NextResponse.json({ error: 'failed' }, { status: 500 }))
  }
}
