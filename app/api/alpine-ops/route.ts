export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { MongoClient, ObjectId } from 'mongodb'

const ALPINE_URI = process.env.MONGODB_URI!.replace('/ethan-admin', '/sire-pay')

async function getAlpineDb() {
  const client = new MongoClient(ALPINE_URI)
  await client.connect()
  return { client, db: client.db('sire-pay') }
}

export async function GET(req: NextRequest) {
  const section = req.nextUrl.searchParams.get('section') || 'all'
  const { client, db } = await getAlpineDb()

  try {
    const now = new Date()
    const todayStart = new Date(); todayStart.setHours(0,0,0,0)
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Chargebacks
    const chargebacks = section === 'all' || section === 'chargebacks'
      ? await db.collection('chargebacks').find({}).sort({ disputedAt: -1 }).limit(50).toArray()
      : []

    // Enrich chargebacks with customer + transaction data
    const enrichedChargebacks = await Promise.all(chargebacks.map(async (cb) => {
      const [txn, customer] = await Promise.all([
        cb.transaction ? db.collection('transactions').findOne({ _id: typeof cb.transaction === 'string' ? new ObjectId(cb.transaction) : cb.transaction }) : null,
        cb.customer ? db.collection('customers').findOne({ _id: typeof cb.customer === 'string' ? new ObjectId(cb.customer) : cb.customer }) : null,
      ])
      return {
        _id: cb._id.toString(),
        amount: cb.amount,
        status: cb.status,
        disputedAt: cb.disputedAt,
        company: cb.company,
        customer: customer ? { name: customer.name || customer.firstName + ' ' + customer.lastName, email: customer.email, phone: customer.phoneNumber } : null,
        transaction: txn ? { amount: txn.amount, status: txn.status, createdAt: txn.createdAt } : null,
      }
    }))

    // Recent failed payments (potential defaults)
    const recentFailed = section === 'all' || section === 'failed'
      ? await db.collection('transactions').find({ status: 'FAILED', createdAt: { $gte: weekAgo } })
          .sort({ createdAt: -1 }).limit(30).toArray()
      : []

    // Collector queue — pending session loans
    const collectorQueue = section === 'all' || section === 'collector'
      ? await db.collection('sessionloans').find({ status: 'PENDING' })
          .sort({ dueDate: 1 }).limit(50).toArray()
      : []

    // Enrich collector with customer data
    const enrichedCollector = await Promise.all(collectorQueue.map(async (loan) => {
      const tracker = loan.sessionTracker ? await db.collection('sessiontrackers').findOne({
        _id: typeof loan.sessionTracker === 'string' ? new ObjectId(loan.sessionTracker) : loan.sessionTracker
      }) : null
      return {
        _id: loan._id.toString(),
        amount: loan.amount,
        dueDate: loan.dueDate,
        status: loan.status,
        name: loan.name || tracker?.name,
        phone: loan.phone || tracker?.phone,
        email: loan.email || tracker?.email,
        company: loan.company,
        overdue: loan.dueDate ? new Date(loan.dueDate) < now : false,
      }
    }))

    // Payouts needing attention
    const pendingPayouts = section === 'all' || section === 'payouts'
      ? await db.collection('payouts').find({ status: { $in: [null, 'pending', 'failed'] } })
          .sort({ createdAt: -1 }).limit(30).toArray()
      : []

    // Summary stats
    const stats = {
      chargebacks: { total: chargebacks.length, pending: chargebacks.filter(c => c.status === 'pending').length },
      failed: { today: 0, week: 0 },
      collector: { total: enrichedCollector.length, overdue: enrichedCollector.filter(l => l.overdue).length },
      payouts: { pending: pendingPayouts.length },
    }
    stats.failed.today = await db.collection('transactions').countDocuments({ status: 'FAILED', createdAt: { $gte: todayStart } })
    stats.failed.week = await db.collection('transactions').countDocuments({ status: 'FAILED', createdAt: { $gte: weekAgo } })

    return NextResponse.json({
      ok: true,
      stats,
      chargebacks: enrichedChargebacks,
      recentFailed: recentFailed.map(t => ({
        _id: t._id.toString(), amount: t.amount, status: t.status,
        createdAt: t.createdAt, customer: t.customer, company: t.company
      })),
      collectorQueue: enrichedCollector,
      pendingPayouts: pendingPayouts.map(p => ({
        _id: p._id.toString(), amount: p.amount, status: p.status,
        createdAt: p.createdAt, company: p.company
      })),
    })
  } finally {
    await client.close()
  }
}
