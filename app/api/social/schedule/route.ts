export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

const ADVANCE_DAYS = 30

type ContentType = 'reel' | 'story' | 'post'

// Build interleaved order: T1V1, T2V1, T3V1, T4V1, T1V2, T2V2...
function buildInterleavedOrder(templates: Record<string, unknown>[]): Record<string, unknown>[] {
  const sorted = [...templates].sort((a, b) => (a.order as number) - (b.order as number))
  const maxVars = Math.max(...sorted.map(t => (t.variations as unknown[]).length))
  const order: Record<string, unknown>[] = []
  for (let v = 0; v < maxVars; v++) {
    for (const tmpl of sorted) {
      const vars = tmpl.variations as Record<string, unknown>[]
      if (v < vars.length) {
        order.push({
          templateId: String(tmpl._id),
          templateName: tmpl.name,
          variationNum: v + 1,
          url: vars[v].url,
          caption: tmpl.caption,
          title: `${tmpl.name} — V${v + 1}`,
        })
      }
    }
  }
  return order
}

// Get dates matching allowed day-of-week set
function getDates(fromDate: Date, count: number, usedDates: Set<string>, allowedDays: number[]): Date[] {
  const daySet = new Set(allowedDays)
  const dates: Date[] = []
  const cur = new Date(fromDate); cur.setHours(0, 0, 0, 0)
  while (dates.length < count) {
    cur.setDate(cur.getDate() + 1)
    const key = cur.toISOString().split('T')[0]
    if (daySet.has(cur.getDay()) && !usedDates.has(key)) dates.push(new Date(cur))
  }
  return dates
}

// POST — generate/refresh scheduled queue for next 30 days
export async function POST(req: NextRequest) {
  const db = await getDb()
  const body = await req.json()
  const {
    accountId, contentType,
    postDays,       // array of JS day numbers: 0=Sun,1=Mon...
    postTime = '20:00',
    perDayTimes,    // { 1: '20:00', 3: '19:00', ... } — per-day overrides
    randomRange,    // { enabled: bool, from: 'HH:MM', to: 'HH:MM' }
    force = false,
    preview = false,
  } = body

  if (!accountId || !contentType) {
    return NextResponse.json({ ok: false, error: 'accountId and contentType required' }, { status: 400 })
  }

  // Default days if not specified
  const activeDays: number[] = postDays && postDays.length > 0
    ? postDays
    : contentType === 'story' ? [0,1,2,3,4,5,6] : [1,3,4,0]

  const templates = await db.collection('social_templates')
    .find({ accountId, contentType }).sort({ order: 1 }).toArray()
  if (!templates.length) {
    return NextResponse.json({ ok: false, error: `No ${contentType} templates found for ${accountId}` })
  }

  const interleaved = buildInterleavedOrder(templates as unknown as Record<string, unknown>[])
  const totalItems = interleaved.length

  // Load existing schedule state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let state = await db.collection('social_schedule_state').findOne({ accountId, contentType }) as any
  if (!state) {
    state = { accountId, contentType, nextItemIndex: 0, cycleNum: 1,
      lastScheduledDate: new Date().toISOString().split('T')[0], lastRunAt: new Date().toISOString() }
  }

  if (!force && !preview && state.lastRunAt) {
    const daysSince = (Date.now() - new Date(state.lastRunAt).getTime()) / 86400000
    if (daysSince < 13) {
      return NextResponse.json({ ok: true, skipped: true,
        message: `Last run ${daysSince.toFixed(1)} days ago — next in ${(14-daysSince).toFixed(1)} days` })
    }
  }

  // Find already-scheduled dates to avoid overlap
  const future = await db.collection('social_queue').find({
    accountId, type: contentType, status: 'scheduled',
    scheduledDate: { $gt: new Date().toISOString() },
  }).toArray()
  const usedDates = new Set(future.map((i: Record<string, unknown>) => (i.scheduledDate as string).substring(0, 10)))
  const lastDt = future.length > 0
    ? new Date(Math.max(...future.map((i: Record<string, unknown>) => new Date(i.scheduledDate as string).getTime())))
    : new Date()

  // Count available slots up to horizon
  const horizon = new Date(); horizon.setDate(horizon.getDate() + ADVANCE_DAYS)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  let slotsNeeded = 0
  const tmp = new Date(today); tmp.setDate(tmp.getDate() + 1)
  const daySet = new Set(activeDays)
  while (tmp <= horizon) {
    if (daySet.has(tmp.getDay()) && !usedDates.has(tmp.toISOString().split('T')[0])) slotsNeeded++
    tmp.setDate(tmp.getDate() + 1)
  }

  if (slotsNeeded === 0) {
    return NextResponse.json({ ok: true, scheduled: 0, message: 'Already fully scheduled through 30-day horizon' })
  }

  const startFrom = lastDt < today ? today : lastDt
  const newDates = getDates(startFrom, slotsNeeded, usedDates, activeDays)

  // ET UTC offset: EDT=-240min, EST=-300min
  function getETOffset(d: Date): number {
    const jan = new Date(d.getFullYear(), 0, 1); const jul = new Date(d.getFullYear(), 6, 1)
    const stdOff = Math.max(-jan.getTimezoneOffset(), -jul.getTimezoneOffset())
    return -d.getTimezoneOffset() > stdOff ? -240 : -300
  }

  function getTimeForDate(d: Date): Date {
    let localH: number, localM: number
    if (randomRange?.enabled) {
      const [fh, fm] = ((randomRange as Record<string,string>).from || '08:00').split(':').map(Number)
      const [th, tm] = ((randomRange as Record<string,string>).to   || '22:00').split(':').map(Number)
      const fromMins = fh * 60 + fm
      const toMins   = th * 60 + tm
      const range    = Math.max(1, toMins - fromMins)
      // True random using crypto — fully spread across the range
      const rand = typeof crypto !== 'undefined'
        ? crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF
        : Math.random()
      const mins = Math.floor(fromMins + rand * range)
      localH = Math.floor(mins / 60); localM = mins % 60
    } else {
      const dayTime: string = (perDayTimes && (perDayTimes as Record<number,string>)[d.getDay()])
        ? (perDayTimes as Record<number,string>)[d.getDay()]
        : (postTime || '12:00')
      const parts = dayTime.split(':').map(Number)
      localH = parts[0]; localM = parts[1]
    }
    // Convert ET local → UTC: ET is UTC-4/UTC-5, so add abs(offset)
    const etOffsetMin = getETOffset(d)  // -240 (EDT) or -300 (EST)
    const etMs = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), localH, localM, 0)
    const utcMs = etMs + Math.abs(etOffsetMin) * 60000
    return new Date(utcMs)
  }
  const batchId = `auto_${accountId}_${contentType}_${Date.now()}`
  const newItems: Record<string, unknown>[] = []
  let currentIndex = state.nextItemIndex % totalItems
  let cycleNum = state.cycleNum

  for (let i = 0; i < newDates.length; i++) {
    const item = interleaved[currentIndex]
    const rawD = newDates[i]; const scheduledDt = getTimeForDate(rawD)
    newItems.push({
      accountId, type: contentType,
      templateId: item.templateId, templateName: item.templateName,
      variationNum: item.variationNum, title: item.title,
      caption: item.caption, videoUrl: item.url,
      scheduledDate: scheduledDt.toISOString(), status: 'scheduled',
      order: i + 1, batchId, cycleNum, platform: 'instagram',
      createdAt: new Date().toISOString(),
    })
    currentIndex = (currentIndex + 1) % totalItems
    if (currentIndex === 0) cycleNum++
  }

  // Preview mode — return what would be scheduled without writing
  if (preview) {
    return NextResponse.json({ ok: true, preview: true, items: newItems,
      scheduled: newItems.length, nextItemIndex: currentIndex, cycleNum,
      horizon: horizon.toISOString().split('T')[0] })
  }

  if (newItems.length > 0) {
    await db.collection('social_queue').insertMany(
      newItems as import('mongodb').OptionalId<import('mongodb').Document>[]
    )
  }

  await db.collection('social_schedule_state').updateOne(
    { accountId, contentType },
    { $set: { accountId, contentType, nextItemIndex: currentIndex, cycleNum,
        lastScheduledDate: newDates[newDates.length - 1]?.toISOString().split('T')[0] || state.lastScheduledDate,
        lastRunAt: new Date().toISOString(), postDays: activeDays, postTime, perDayTimes: perDayTimes || {}, randomRange: randomRange || {} } },
    { upsert: true }
  )

  return NextResponse.json({ ok: true, scheduled: newItems.length,
    nextItemIndex: currentIndex, cycleNum, horizon: horizon.toISOString().split('T')[0],
    firstScheduled: newItems[0]?.scheduledDate, lastScheduled: newItems[newItems.length - 1]?.scheduledDate,
    totalTemplateItems: totalItems })
}

export async function GET(req: NextRequest) {
  const db = await getDb()
  const accountId = req.nextUrl.searchParams.get('accountId')
  const contentType = req.nextUrl.searchParams.get('contentType')
  const filter: Record<string, unknown> = {}
  if (accountId) filter.accountId = accountId
  if (contentType) filter.contentType = contentType
  const states = await db.collection('social_schedule_state').find(filter).toArray()
  const upcoming = await db.collection('social_queue').find({
    ...filter, status: 'scheduled', scheduledDate: { $gt: new Date().toISOString() }
  }).sort({ scheduledDate: 1 }).limit(14).toArray()
  return NextResponse.json({ ok: true, states, upcoming })
}
