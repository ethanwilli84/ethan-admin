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

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body.name) return cors(NextResponse.json({ error: 'name required' }, { status: 400 }))
    
    const db = await getDb()
    const col = db.collection('investor_access')
    
    await col.insertOne({
      name: body.name,
      portal: body.portal || 'unknown',
      timestamp: new Date(),
      ip: req.headers.get('x-forwarded-for') || 'unknown',
    })
    
    return cors(NextResponse.json({ ok: true }))
  } catch (e) {
    return cors(NextResponse.json({ error: 'failed' }, { status: 500 }))
  }
}

export async function GET() {
  try {
    const db = await getDb()
    const col = db.collection('investor_access')
    const logs = await col.find({}).sort({ timestamp: -1 }).limit(100).toArray()
    return cors(NextResponse.json(logs))
  } catch (e) {
    return cors(NextResponse.json({ error: 'failed' }, { status: 500 }))
  }
}
