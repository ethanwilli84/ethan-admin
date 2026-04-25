export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getDb } from '@/lib/mongodb'

// Reads a brief from the `briefs` Mongo collection (written by the
// daily-brief Python cron job). Returned as a raw HTML response so the
// ethan-admin sidebar layout doesn't wrap it.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  if (!/^\d{4}-\d{2}-\d{2}-[a-f0-9]{4}$/i.test(slug)) {
    return new Response('not found', { status: 404 })
  }

  const db = await getDb()
  const doc = await db.collection('briefs').findOne({ slug })

  if (!doc?.html) {
    return new Response('not found', { status: 404 })
  }

  return new Response(doc.html as string, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, max-age=300',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
