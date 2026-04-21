export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    
    const db = await getDb()
    const col = db.collection('investor_access')
    
    await col.insertOne({
      name: body.name,
      portal: body.portal || 'unknown',
      timestamp: new Date(),
      ip: req.headers.get('x-forwarded-for') || 'unknown',
    })
    
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const db = await getDb()
    const col = db.collection('investor_access')
    const logs = await col.find({}).sort({ timestamp: -1 }).limit(100).toArray()
    return NextResponse.json(logs)
  } catch (e) {
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
