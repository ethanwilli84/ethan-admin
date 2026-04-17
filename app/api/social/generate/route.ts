export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

// Day mapping: Sun=0 Mon=1 Tue=2 Wed=3 Thu=4 Fri=5 Sat=6
// JS Date.getDay(): Sun=0 Mon=1 ... Sat=6  ← same convention

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

function getETOffsetMin(d: Date): number {
  // Returns ET UTC offset in minutes: EDT=-240, EST=-300
  // Can't use getTimezoneOffset() on UTC server — use explicit DST rules instead
  // US DST: starts 2nd Sunday in March, ends 1st Sunday in November
  const year = d.getFullYear()
  // 2nd Sunday in March
  const march = new Date(year, 2, 1)
  const dstStart = new Date(year, 2, (14 - march.getDay()) % 7 + 8)
  dstStart.setHours(2, 0, 0, 0)
  // 1st Sunday in November
  const nov = new Date(year, 10, 1)
  const dstEnd = new Date(year, 10, (7 - nov.getDay()) % 7 + 1)
  dstEnd.setHours(2, 0, 0, 0)
  // Is the date in EDT (DST active)?
  const isDST = d >= dstStart && d < dstEnd
  return isDST ? -240 : -300
}

function toET(d: Date, timeStr: string, randomRange?: { enabled: boolean; from: string; to: string }): Date {
  let localH: number, localM: number
  if (randomRange?.enabled) {
    const [fh, fm] = randomRange.from.split(':').map(Number)
    const [th, tm] = randomRange.to.split(':').map(Number)
    const fromMins = fh * 60 + fm
    const toMins   = th * 60 + tm
    const range    = Math.max(1, toMins - fromMins)
    // True random, fully distributed across range
    const rand = typeof crypto !== 'undefined'
      ? crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF
      : Math.random()
    const mins = Math.floor(fromMins + rand * range)
    localH = Math.floor(mins / 60); localM = mins % 60
  } else {
    const parts = timeStr.split(':').map(Number)
    localH = parts[0]; localM = parts[1]
  }
  // Convert ET local → UTC
  // ET is UTC-4 (EDT) or UTC-5 (EST), so UTC = ET_local + abs(offset)
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate(), localH, localM, 0)
  const etOffsetMin = getETOffsetMin(base)  // returns -240 (EDT) or -300 (EST)
  return new Date(base.getTime() + Math.abs(etOffsetMin) * 60000)
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
    const rr = settings.randomRange?.[type] as { enabled: boolean; from: string; to: string } | undefined

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
      const utcDt = toET(pd, time, rr?.enabled ? rr : undefined)
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
