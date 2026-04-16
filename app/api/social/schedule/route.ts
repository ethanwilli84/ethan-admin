export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

// Reel + Feed Post days: Mon=1, Wed=3, Thu=4, Sun=0
const REEL_DAYS = new Set([1, 3, 4, 0])
const POST_DAYS = new Set([1, 3, 4, 0])  // same as reels, different time (+1hr)
const ADVANCE_DAYS = 30       // schedule this many days ahead
const SCHEDULE_INTERVAL = 14  // re-run scheduler every N days

type ContentType = 'reel' | 'story' | 'post'

interface ScheduleState {
  accountId: string
  contentType: ContentType
  nextItemIndex: number  // where we are in the interleaved list (wraps around)
  cycleNum: number
  lastScheduledDate: string  // ISO date string of last item scheduled
  lastRunAt: string
}

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

// Get dates for reel schedule (Mon/Wed/Thu/Sun only)
function getReelDates(fromDate: Date, count: number, usedDates: Set<string>): Date[] {
  const dates: Date[] = []
  const cur = new Date(fromDate)
  cur.setHours(0, 0, 0, 0)
  while (dates.length < count) {
    cur.setDate(cur.getDate() + 1)
    if (REEL_DAYS.has(cur.getDay()) && !usedDates.has(cur.toISOString().split('T')[0])) {
      dates.push(new Date(cur))
    }
  }
  return dates
}

// Get feed post dates (Mon/Wed/Thu/Sun — same days as reels but tracked separately)
function getPostDates(fromDate: Date, count: number, usedDates: Set<string>): Date[] {
  const dates: Date[] = []
  const cur = new Date(fromDate)
  cur.setHours(0, 0, 0, 0)
  while (dates.length < count) {
    cur.setDate(cur.getDate() + 1)
    if (POST_DAYS.has(cur.getDay()) && !usedDates.has(cur.toISOString().split('T')[0])) {
      dates.push(new Date(cur))
    }
  }
  return dates
}

// Get daily dates for stories (every day)
function getStoryDates(fromDate: Date, count: number, usedDates: Set<string>): Date[] {
  const dates: Date[] = []
  const cur = new Date(fromDate)
  cur.setHours(0, 0, 0, 0)
  while (dates.length < count) {
    cur.setDate(cur.getDate() + 1)
    if (!usedDates.has(cur.toISOString().split('T')[0])) {
      dates.push(new Date(cur))
    }
  }
  return dates
}

export async function POST(req: NextRequest) {
  const db = await getDb()
  const body = await req.json()
  const { accountId, contentType, reelTime = '20:00', storyTime = '09:00', postTime = '21:00', force = false } = body

  if (!accountId || !contentType) {
    return NextResponse.json({ ok: false, error: 'accountId and contentType required' }, { status: 400 })
  }

  // Load templates for this account + type
  const templates = await db.collection('social_templates')
    .find({ accountId, contentType }).sort({ order: 1 }).toArray()

  if (!templates.length) {
    return NextResponse.json({ ok: false, error: `No ${contentType} templates found for ${accountId}` })
  }

  const interleaved = buildInterleavedOrder(templates as unknown as Record<string, unknown>[])
  const totalItems = interleaved.length

  // Load schedule state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let state = await db.collection('social_schedule_state').findOne({ accountId, contentType }) as any
  if (!state) {
    state = { accountId, contentType, nextItemIndex: 0, cycleNum: 1, lastScheduledDate: new Date().toISOString().split('T')[0], lastRunAt: new Date().toISOString() }
  }

  // Check if we need to run (only if last run was >13 days ago, unless force)
  if (!force && state.lastRunAt) {
    const daysSinceRun = (Date.now() - new Date(state.lastRunAt).getTime()) / 86400000
    if (daysSinceRun < SCHEDULE_INTERVAL - 1) {
      return NextResponse.json({ ok: true, skipped: true, message: `Last run ${daysSinceRun.toFixed(1)} days ago — next run in ${(SCHEDULE_INTERVAL - daysSinceRun).toFixed(1)} days` })
    }
  }

  // Find all future scheduled dates for this account+type (to avoid overlap)
  const futureScheduled = await db.collection('social_queue').find({
    accountId, type: contentType, status: 'scheduled',
    scheduledDate: { $gt: new Date().toISOString() },
  }).toArray()

  const usedDates = new Set(futureScheduled.map(i => i.scheduledDate.substring(0, 10)))
  const lastScheduledDate = futureScheduled.length > 0
    ? new Date(Math.max(...futureScheduled.map(i => new Date(i.scheduledDate).getTime())))
    : new Date()

  // Also find story dates to avoid overlap with reels (and vice versa within same day)
  // Stories and reels can coexist on same day (different times), but no two reels same day, no two stories same day
  const horizon = new Date()
  horizon.setDate(horizon.getDate() + ADVANCE_DAYS)

  // How many slots are available up to the 30-day horizon?
  const today = new Date(); today.setHours(0, 0, 0, 0)
  let slotsNeeded = 0
  if (contentType === 'reel' || contentType === 'post') {
    // Count Mon/Wed/Thu/Sun days from tomorrow to horizon that aren't already used
    const daySet = contentType === 'reel' ? REEL_DAYS : POST_DAYS
    const tmp = new Date(today); tmp.setDate(tmp.getDate() + 1)
    while (tmp <= horizon) {
      if (daySet.has(tmp.getDay()) && !usedDates.has(tmp.toISOString().split('T')[0])) slotsNeeded++
      tmp.setDate(tmp.getDate() + 1)
    }
  } else {
    // Daily — count all days from tomorrow to horizon that aren't used
    const tmp = new Date(today); tmp.setDate(tmp.getDate() + 1)
    while (tmp <= horizon) {
      if (!usedDates.has(tmp.toISOString().split('T')[0])) slotsNeeded++
      tmp.setDate(tmp.getDate() + 1)
    }
  }

  if (slotsNeeded === 0) {
    return NextResponse.json({ ok: true, scheduled: 0, message: 'Already fully scheduled through 30-day horizon' })
  }

  // Generate dates for the slots we need
  const startFrom = lastScheduledDate < today ? today : lastScheduledDate
  const newDates = contentType === 'reel'
    ? getReelDates(startFrom, slotsNeeded, usedDates)
    : contentType === 'post'
    ? getPostDates(startFrom, slotsNeeded, usedDates)
    : getStoryDates(startFrom, slotsNeeded, usedDates)

  // Build queue items, cycling through interleaved order
  const scheduleTime = contentType === 'reel' ? reelTime : contentType === 'story' ? storyTime : postTime
  const batchId = `auto_${accountId}_${contentType}_${Date.now()}`
  const newItems: Record<string, unknown>[] = []
  let currentIndex = state.nextItemIndex % totalItems
  let cycleNum = state.cycleNum

  for (let i = 0; i < newDates.length; i++) {
    const item = interleaved[currentIndex]
    const d = newDates[i]
    const [h, m] = scheduleTime.split(':').map(Number)
    d.setHours(h, m, 0, 0)

    newItems.push({
      accountId, type: contentType,
      templateId: item.templateId,
      templateName: item.templateName,
      variationNum: item.variationNum,
      title: item.title,
      caption: item.caption,
      videoUrl: item.url,
      scheduledDate: d.toISOString(),
      status: 'scheduled',
      order: i + 1,
      batchId,
      cycleNum,
      platform: 'instagram',
      createdAt: new Date().toISOString(),
    })

    currentIndex = (currentIndex + 1) % totalItems
    if (currentIndex === 0) cycleNum++ // wrapped around = new cycle
  }

  if (newItems.length > 0) {
    await db.collection('social_queue').insertMany(newItems as import('mongodb').OptionalId<import('mongodb').Document>[])
  }

  // Update schedule state
  await db.collection('social_schedule_state').updateOne(
    { accountId, contentType },
    {
      $set: {
        accountId, contentType,
        nextItemIndex: currentIndex,
        cycleNum,
        lastScheduledDate: newDates[newDates.length - 1]?.toISOString().split('T')[0] || state.lastScheduledDate,
        lastRunAt: new Date().toISOString(),
      }
    },
    { upsert: true }
  )

  return NextResponse.json({
    ok: true,
    scheduled: newItems.length,
    nextItemIndex: currentIndex,
    cycleNum,
    horizon: horizon.toISOString().split('T')[0],
    firstScheduled: newItems[0]?.scheduledDate,
    lastScheduled: newItems[newItems.length - 1]?.scheduledDate,
    totalTemplateItems: totalItems,
  })
}

// GET — return schedule state + what's coming up
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
  }).sort({ scheduledDate: 1 }).limit(10).toArray()
  return NextResponse.json({ ok: true, states, upcoming })
}
