import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/mongodb'
import { getSireDb } from '@/lib/sire-mongo'
import { getOrCreateCustomAudience, pushAudienceUsers } from '@/lib/meta-ads/audiences'

export const dynamic = 'force-dynamic'
export const maxDuration = 300  // 5 minutes — aggregation + Meta pushes

// POST /api/ads/audiences/refresh
//
// Builds Sire's 5 Meta Custom Audience seeds from live shipments data
// and pushes them to Meta. Designed to be called daily by GitHub Actions.
//
// IMPORTANT: We aggregate directly from the shipments collection — the
// user.profit / user.spent / user.numberOfShipments fields on the user doc
// are known to be stale/race-conditional and are NOT read here.
//
// The 5 seeds:
//   sire_active_21d_top_quartile   — 21d active, top 25% profit, 5+ ships
//   sire_active_21d_all            — 21d active, 5+ ships
//   sire_alltime_top_quartile      — top 25% profit all-time, 5+ ships
//   sire_historical_ad_converters  — past users from ad referrals (referral/knowUs)
//   sire_all_merchants_EXCLUSION   — anyone with 1+ shipment (to suppress in prospecting)

type ShipAgg = {
  _id: unknown  // ObjectId — the user who owns these shipments
  profit: number
  spent: number
  numberOfShipments: number
  firstLabelPurchase: Date
  mostRecentLabelPurchase: Date
}

type SireUser = {
  _id: unknown
  phone?: string
  email?: string
  referral?: string
  knowUs?: { howDoYouHeadFromUs?: string }
}

type Enriched = ShipAgg & { user: SireUser }

const INCLUDE_STATUSES = ['CREATED', 'PRINTED', 'DELIVERED', 'IN_TRANSIT']
const MIN_SHIPMENTS = 5
const ACTIVE_WINDOW_DAYS = 21

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const dryRun = Boolean(body.dryRun)
  const accountId = body.accountId || 'sire-ship'

  const sireDb = await getSireDb()
  const ethanDb = await getDb()
  const startedAt = new Date()

  // ---- Step 1: aggregate shipments by owner ------------------------------
  const pipeline = [
    { $match: {
        cost: { $gt: 0 },
        status: { $in: INCLUDE_STATUSES },
        owner: { $exists: true, $ne: null },
    }},
    { $group: {
        _id: '$owner',
        profit: { $sum: { $add: [
          { $subtract: ['$cost', { $ifNull: ['$mRate', 0] }] },
          { $cond: ['$haveProtection', { $ifNull: ['$insurance', 0] }, 0] },
        ]}},
        spent: { $sum: { $add: [
          '$cost',
          { $cond: ['$haveProtection', { $ifNull: ['$insurance', 0] }, 0] },
        ]}},
        numberOfShipments: { $sum: 1 },
        firstLabelPurchase: { $min: '$createdAt' },
        mostRecentLabelPurchase: { $max: '$createdAt' },
    }},
  ]
  const shipStats = await sireDb.collection('shipments').aggregate<ShipAgg>(pipeline).toArray()

  // ---- Step 2: join with users, filter internal/demo/employee accounts ---
  const ownerIds = shipStats.map((s) => s._id)
  const users = (await sireDb.collection('users').find({
    _id: { $in: ownerIds as ObjectId[] },
    phone: { $exists: true, $nin: [null, ''] },
    isDemo: { $ne: true },
    isAPI: { $ne: true },
    employer: { $exists: false },
  }, {
    projection: { _id: 1, phone: 1, email: 1, referral: 1, knowUs: 1 },
  }).toArray()) as unknown as SireUser[]
  const userById = new Map<string, SireUser>(users.map((u) => [String(u._id), u]))

  const enriched: Enriched[] = shipStats
    .filter((s) => userById.has(String(s._id)))
    .map((s) => ({ ...s, user: userById.get(String(s._id))! }))
    .filter((s) => s.numberOfShipments >= MIN_SHIPMENTS)

  // ---- Step 3: bucket into seeds ----------------------------------------
  const activeCutoff = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 86400 * 1000)
  const active21d = enriched.filter((s) => new Date(s.mostRecentLabelPurchase) >= activeCutoff)
  const active21dSortedByProfit = [...active21d].sort((a, b) => b.profit - a.profit)
  const active21dTopQuartile = active21dSortedByProfit.slice(
    0, Math.max(1, Math.ceil(active21dSortedByProfit.length * 0.25)),
  )

  const alltimeSortedByProfit = [...enriched].sort((a, b) => b.profit - a.profit)
  const alltimeTopQuartile = alltimeSortedByProfit.slice(
    0, Math.max(1, Math.ceil(alltimeSortedByProfit.length * 0.25)),
  )

  // Historical ad converters — by referral or knowUs, independent of shipment filter
  const adConverterUsers = (await sireDb.collection('users').find({
    phone: { $exists: true, $nin: [null, ''] },
    isDemo: { $ne: true },
    isAPI: { $ne: true },
    $or: [
      { referral: { $regex: /fb|facebook|meta|insta|tiktok|^ad/i } },
      { 'knowUs.howDoYouHeadFromUs': { $in: ['Instagram ads', 'Facebook ads', 'Instagram dms'] } },
    ],
  }, {
    projection: { _id: 1, phone: 1, email: 1 },
  }).toArray()) as unknown as SireUser[]

  // Exclusion: anyone in the enriched pool (any merchant with 1+ real shipment)
  // We lower the min-ships filter to 1 for the exclusion list — we want to
  // suppress prospecting to anyone who's ever paid us.
  const allMerchantOwnerIds = shipStats.map((s) => s._id)
  const allMerchantUsers = (await sireDb.collection('users').find({
    _id: { $in: allMerchantOwnerIds as ObjectId[] },
    phone: { $exists: true, $nin: [null, ''] },
  }, {
    projection: { _id: 1, phone: 1, email: 1 },
  }).toArray()) as unknown as SireUser[]

  // Rate-checked-but-never-shipped (retargeting pool)
  // Aggregates from shipmentsessionrates collection — source of truth rather
  // than the cached `askedRateButNeverBought` flag (which lags).
  // These users signed up AND engaged (checked rates) but never converted.
  const rateCheckerAgg = await sireDb
    .collection('shipmentsessionrates')
    .aggregate([{ $group: { _id: '$owner' } }])
    .toArray()
  const rateCheckerIds = rateCheckerAgg.map((r) => r._id)
  const shipperStringSet = new Set(allMerchantOwnerIds.map((id) => String(id)))
  const nonShipperRateCheckerIds = rateCheckerIds
    .filter((id) => !shipperStringSet.has(String(id)))
  const rateCheckNoPurchaseUsers = (await sireDb.collection('users').find({
    _id: { $in: nonShipperRateCheckerIds as ObjectId[] },
    phone: { $exists: true, $nin: [null, ''] },
    isDemo: { $ne: true },
    isAPI: { $ne: true },
  }, {
    projection: { _id: 1, phone: 1, email: 1 },
  }).toArray()) as unknown as SireUser[]

  // ---- Step 4: push to Meta --------------------------------------------
  const seeds = [
    {
      name: 'sire_active_21d_top_quartile',
      description: `Top 25% of 21-day active merchants by profit (5+ ships). Built ${startedAt.toISOString()}.`,
      users: active21dTopQuartile.map((e) => ({ phone: e.user.phone, email: e.user.email })),
    },
    {
      name: 'sire_active_21d_all',
      description: `All merchants active in last 21 days with 5+ shipments. Built ${startedAt.toISOString()}.`,
      users: active21d.map((e) => ({ phone: e.user.phone, email: e.user.email })),
    },
    {
      name: 'sire_alltime_top_quartile',
      description: `Top 25% of all-time merchants by profit (5+ ships, ignores recency). Built ${startedAt.toISOString()}.`,
      users: alltimeTopQuartile.map((e) => ({ phone: e.user.phone, email: e.user.email })),
    },
    {
      name: 'sire_historical_ad_converters',
      description: `Past users whose referral or knowUs indicates they came from Meta ads. Built ${startedAt.toISOString()}.`,
      users: adConverterUsers.map((u) => ({ phone: u.phone, email: u.email })),
    },
    {
      name: 'sire_ratecheck_no_purchase',
      description: `Users who checked rates (have shipmentSessionRates) but never shipped. Retargeting pool. Built ${startedAt.toISOString()}.`,
      users: rateCheckNoPurchaseUsers.map((u) => ({ phone: u.phone, email: u.email })),
    },
    {
      name: 'sire_all_merchants_EXCLUSION',
      description: `All merchants with at least one shipment. Use as prospecting EXCLUSION. Built ${startedAt.toISOString()}.`,
      users: allMerchantUsers.map((u) => ({ phone: u.phone, email: u.email })),
    },
  ]

  const results: Array<{
    name: string
    userCount: number
    audienceId?: string
    created?: boolean
    pushed?: number
    skipped?: boolean
    error?: string
  }> = []

  for (const seed of seeds) {
    const row: (typeof results)[number] = { name: seed.name, userCount: seed.users.length }
    if (dryRun) {
      row.skipped = true
      results.push(row)
      continue
    }
    try {
      const audience = await getOrCreateCustomAudience({
        name: seed.name,
        description: seed.description,
      })
      row.audienceId = audience.id
      row.created = audience.created
      if (seed.users.length > 0) {
        row.pushed = await pushAudienceUsers({
          audienceId: audience.id,
          users: seed.users,
        })
      } else {
        row.pushed = 0
      }
    } catch (e) {
      row.error = (e as Error).message
    }
    results.push(row)
  }

  // ---- Log run -----------------------------------------------------------
  const finishedAt = new Date()
  const runDoc = {
    accountId,
    startedAt,
    finishedAt,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    dryRun,
    shipStatsCount: shipStats.length,
    enrichedCount: enriched.length,
    active21dCount: active21d.length,
    rateCheckNoPurchaseCount: rateCheckNoPurchaseUsers.length,
    seeds: results,
  }
  await ethanDb.collection('ads_audience_runs').insertOne(runDoc)

  return NextResponse.json({ ok: true, ...runDoc })
}

export async function GET() {
  const ethanDb = await getDb()
  const recent = await ethanDb.collection('ads_audience_runs')
    .find({})
    .sort({ startedAt: -1 })
    .limit(10)
    .toArray()
  return NextResponse.json({ ok: true, recent })
}
