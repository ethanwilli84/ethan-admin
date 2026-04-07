export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

const TIMEOUT_MS = 10000

const SERVICES = [
  { id: 'alpine-checkout',  name: 'Alpine Checkout',        url: 'https://checkout.1alp.com',                           critical: true,  category: 'alpine' },
  { id: 'alpine-api',       name: 'Alpine Merchant API',    url: 'https://merchant-api.1alp.com',                       critical: true,  category: 'alpine' },
  { id: 'alpine-merchant',  name: 'Alpine Merchant Portal', url: 'https://merchant.1alp.com',                           critical: true,  category: 'alpine' },
  { id: 'alpine-consumer',  name: 'Alpine Consumer App',    url: 'https://alpine-consumer-app-opmvi.ondigitalocean.app', critical: false, category: 'alpine' },
  { id: 'sire-app',         name: 'Sire App',               url: 'https://jellyfish-app-99wxa.ondigitalocean.app',       critical: true,  category: 'sire'   },
]

interface ServiceResult {
  id: string; name: string; url: string; status: 'up'|'down'|'slow'
  httpCode: number|null; responseMs: number; critical: boolean; category: string; error?: string; checkedAt: Date
}

async function checkService(svc: typeof SERVICES[0]): Promise<ServiceResult> {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const res = await fetch(svc.url, { signal: controller.signal, redirect: 'follow' })
    clearTimeout(timer)
    const ms = Date.now() - start
    return { ...svc, status: !res.ok ? 'down' : ms > 5000 ? 'slow' : 'up', httpCode: res.status, responseMs: ms, checkedAt: new Date() }
  } catch (e: unknown) {
    return { ...svc, status: 'down', httpCode: null, responseMs: Date.now() - start, error: (e as Error).message, checkedAt: new Date() }
  }
}

async function getBusinessMetrics(db: Awaited<ReturnType<typeof getDb>>) {
  try {
    const { MongoClient } = await import('mongodb')
    const alpineClient = new MongoClient(process.env.MONGODB_URI!.replace('/ethan-admin', '/sire-pay'))
    await alpineClient.connect()
    const alpine = alpineClient.db('sire-pay')

    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000)
    const todayStart = new Date(); todayStart.setHours(0,0,0,0)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const [failedToday, failedWeek, openChargebacks, pendingSessionLoans, pendingPayouts, newLoansToday] = await Promise.all([
      alpine.collection('transactions').countDocuments({ status: 'FAILED', createdAt: { $gte: todayStart } }).catch(() => 0),
      alpine.collection('transactions').countDocuments({ status: 'FAILED', createdAt: { $gte: weekAgo } }).catch(() => 0),
      alpine.collection('chargebacks').countDocuments({ status: 'pending' }).catch(() => 0),
      alpine.collection('sessionloans').countDocuments({ status: 'PENDING' }).catch(() => 0),
      alpine.collection('payouts').countDocuments({ status: { $in: [null, 'pending'] }, updatedAt: { $lt: fourHoursAgo } }).catch(() => 0),
      alpine.collection('transactions').countDocuments({ status: 'SUCCESS', createdAt: { $gte: todayStart } }).catch(() => 0),
    ])

    // Plaid bank monitoring — check for unusual transactions and data staleness
    let plaidLastSync: string | null = null
    let plaidDuplicates = 0
    let plaidLargeUnusual = 0
    try {
      const latestPlaid = await alpine.collection('plaidtransactions').findOne(
        { phoneNumber: '+17346645129' }, { sort: { date: -1 } }
      )
      if (latestPlaid?.date) plaidLastSync = new Date(latestPlaid.date).toISOString().split('T')[0]

      // Check for large unexpected positive (outbound) transactions > $50k in last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      plaidLargeUnusual = await alpine.collection('plaidtransactions').countDocuments({
        phoneNumber: '+17346645129',
        amount: { $gt: 50000 },
        date: { $gte: thirtyDaysAgo }
      }).catch(() => 0)
    } catch {}

    await alpineClient.close()
    return { failedToday, failedWeek, openChargebacks, pendingSessionLoans, pendingPayouts, newLoansToday, plaidLastSync, plaidDuplicates, plaidLargeUnusual, ok: true }
  } catch (e: unknown) {
    return { failedToday: 0, failedWeek: 0, openChargebacks: 0, pendingSessionLoans: 0, pendingPayouts: 0, newLoansToday: 0, ok: false, error: (e as Error).message }
  }
}

export async function GET(req: NextRequest) {
  const db = await getDb()
  const save = req.nextUrl.searchParams.get('save') !== 'false'

  const [results, metrics] = await Promise.all([
    Promise.all(SERVICES.map(checkService)),
    getBusinessMetrics(db),
  ])

  const failures = results.filter(r => r.status === 'down')
  const slow = results.filter(r => r.status === 'slow')
  const criticalDown = failures.filter(r => r.critical)
  const allClear = failures.length === 0 && (metrics.openChargebacks || 0) === 0 && (metrics.failedToday || 0) <= 15

  const payload = {
    checkedAt: new Date(),
    results: results.map(r => ({ id: r.id, name: r.name, status: r.status, httpCode: r.httpCode, responseMs: r.responseMs, critical: r.critical, category: r.category, error: r.error })),
    metrics,
    summary: { allClear, criticalDown: criticalDown.length, totalDown: failures.length, totalSlow: slow.length, totalUp: results.filter(r => r.status === 'up').length }
  }

  // Save check to MongoDB for history
  if (save) {
    await db.collection('monitor_checks').insertOne(payload)
    // Keep only last 500 checks
    const count = await db.collection('monitor_checks').countDocuments()
    if (count > 500) {
      const oldest = await db.collection('monitor_checks').find().sort({ checkedAt: 1 }).limit(count - 500).toArray()
      await db.collection('monitor_checks').deleteMany({ _id: { $in: oldest.map(d => d._id) } })
    }
  }

  return NextResponse.json({ ok: true, ...payload })
}

// GET history for the status page charts
export async function POST(req: NextRequest) {
  const db = await getDb()
  const { hours = 24 } = await req.json().catch(() => ({}))
  const since = new Date(Date.now() - hours * 60 * 60 * 1000)

  const history = await db.collection('monitor_checks')
    .find({ checkedAt: { $gte: since } })
    .sort({ checkedAt: -1 })
    .limit(200)
    .toArray()

  return NextResponse.json({ ok: true, history })
}
