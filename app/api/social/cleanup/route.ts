export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

// NOTE: We intentionally do NOT delete files from DO Spaces.
// Content is recycled — after 80 items the cycle restarts using the same URLs.
// Cleanup here only archives old queue records (marks them as archived, keeps the data).

export async function POST() {
  const db = await getDb()
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) // 60 days

  // Archive posted records older than 60 days — keeps DB lean but never deletes files
  const result = await db.collection('social_queue').updateMany(
    { status: 'posted', postedAt: { $lt: cutoff.toISOString() } },
    { $set: { status: 'archived' } }
  )

  return NextResponse.json({ ok: true, archived: result.modifiedCount, note: 'Files kept in DO Spaces for cycle reuse' })
}

export async function GET() {
  const db = await getDb()
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
  const eligible = await db.collection('social_queue').countDocuments({
    status: 'posted', postedAt: { $lt: cutoff.toISOString() }
  })
  return NextResponse.json({ ok: true, eligible, note: 'Will archive (not delete) these records' })
}
