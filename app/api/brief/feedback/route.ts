export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

const VALID_VERDICTS = new Set(['up', 'down', 'less', 'override', 'note'])

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }

  const verdict = String(body.verdict || '')
  if (!VALID_VERDICTS.has(verdict)) {
    return NextResponse.json({ ok: false, error: 'invalid verdict' }, { status: 400 })
  }

  const token = String(body.token || '')
  if (!token || token.length > 128) {
    return NextResponse.json({ ok: false, error: 'invalid token' }, { status: 400 })
  }

  const db = await getDb()
  await db.collection('brief_feedback').insertOne({
    token,
    slug: String(body.slug || '').slice(0, 64),
    verdict,
    item_title: String(body.item_title || '').slice(0, 300),
    item_url: String(body.item_url || '').slice(0, 1000),
    item_source: String(body.item_source || '').slice(0, 80),
    note: String(body.note || '').slice(0, 500),
    created_at: new Date(),
    user_agent: req.headers.get('user-agent')?.slice(0, 200) || '',
  })

  return NextResponse.json({ ok: true })
}
