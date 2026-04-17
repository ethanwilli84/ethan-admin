export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

// Day mapping: Sun=0 Mon=1 Tue=2 Wed=3 Thu=4 Fri=5 Sat=6
// JS Date.getDay(): Sun=0 Mon=1 ... Sat=6  ← same convention

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

function toET(d: Date, timeStr: string): Date {
  // Build a date string in ET and parse it
  const [h, m] = timeStr.split(':').map(Number)
  // Use Intl to figure out ET offset
  const etStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0))

  // etStr is like "04/20/2026, 20:00:00" — convert back to UTC
  const localDate = new Date(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`)
  // Get the UTC offset for ET on that date
  const utcOffset = getETOffset(localDate)
  return new Date(localDate.getTime() - utcOffset * 60000)
}

function getETOffset(d: Date): number {
  // Returns ET UTC offset in minutes (EST=-300, EDT=-240)
  const jan = new Date(d.getFullYear(), 0, 1)
  const jul = new Date(d.getFullYear(), 6, 1)
  const stdOffset = Math.max(
    -jan.getTimezoneOffset(),
    -jul.getTimezoneOffset()
  )
  const isDST = -d.getTimezoneOffset() > stdOffset
  return isDST ? -240 : -300  // EDT or EST offset from UTC
}

export async function POST(req: NextRequest) {
  const db = await getDb()
  const { accountId = 'sire-ship', types = ['post', 'reel', 'story'], yearsAhead = 3 } = await req.json().catch(() => ({}))

  const settings = await db.collection('social_settings').findOne({ accountId })
  if (!settings) return NextResponse.json({ ok: false, error: 'No settings found' }, { status: 400 })

  const results: Record<string, number> = {}

  for (const type of types as string[]) {
    const days: number[]  = type === 'story' ? (settings.storyDays || [0,1,2,3,4,5,6]) : (settings.postDays || [0,1,3,4])
    const time: string    = type === 'story' ? (settings.storyTime || '09:00') : (settings.postTime || '20:00')

    // Load templates for this type
    const templates = await db.collection('social_templates')
      .find({ accountId, type })
      .sort({ order: 1 })
      .toArray()

    if (!templates.length) {
      results[type] = 0
      continue
    }

    // Build interleaved sequence: T1V1, T2V1, T3V1, T1V2, T2V2...
    const maxVar = Math.max(...templates.map((t) => (t.variations || []).length))
    const sequence: { templateId: string; templateName: string; variationNum: number; videoUrl: string; caption: string }[] = []
    for (let vi = 0; vi < maxVar; vi++) {
      for (const tmpl of templates) {
        const vs = tmpl.variations || []
        if (vi < vs.length) {
          sequence.push({
            templateId: tmpl._id.toString(),
            templateName: tmpl.name,
            variationNum: vs[vi].variationNum ?? vi + 1,
            videoUrl: vs[vi].url || '',
            caption: tmpl.caption || '',
          })
        }
      }
    }

    // Generate all dates from tomorrow to yearsAhead years out
    const startDate = addDays(new Date(), 1)
    const endDate   = addDays(new Date(), yearsAhead * 365)
    const postDates: Date[] = []
    let d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
    while (d <= endDate) {
      if (days.includes(d.getDay())) postDates.push(new Date(d))
      d = addDays(d, 1)
    }

    // Delete old scheduled (not yet posted) items for this type
    await db.collection('social_queue').deleteMany({ accountId, type, status: 'scheduled' })

    // Build and insert new queue
    const toInsert = postDates.map((pd, i) => {
      const s = sequence[i % sequence.length]
      const utcDt = toET(pd, time)
      return {
        accountId, type, status: 'scheduled',
        scheduledDate: utcDt.toISOString(),
        templateId: s.templateId,
        templateName: s.templateName,
        variationNum: s.variationNum,
        videoUrl: s.videoUrl,
        caption: s.caption,
        createdAt: new Date().toISOString(),
      }
    })

    if (toInsert.length) await db.collection('social_queue').insertMany(toInsert)
    results[type] = toInsert.length
  }

  return NextResponse.json({ ok: true, generated: results })
}
