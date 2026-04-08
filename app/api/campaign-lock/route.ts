export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

// Campaign run lock — prevents two runs of the same campaign from overlapping
// Lock auto-expires after 2 hours (in case of crash/timeout)
const LOCK_TTL_MS = 2 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const { action, campaign, runnerPid } = await req.json()
  const db = await getDb()
  const locks = db.collection('campaign_locks')

  if (action === 'acquire') {
    const now = new Date()
    const expiry = new Date(now.getTime() + LOCK_TTL_MS)

    // Check if lock already exists and not expired
    const existing = await locks.findOne({ campaign })
    if (existing) {
      const lockAge = now.getTime() - new Date(existing.acquiredAt).getTime()
      if (lockAge < LOCK_TTL_MS) {
        // Lock is active
        return NextResponse.json({
          acquired: false,
          lockedBy: existing.runnerPid,
          lockedAt: existing.acquiredAt,
          ageMinutes: Math.round(lockAge / 60000),
        })
      }
      // Lock expired — remove it
      await locks.deleteOne({ campaign })
    }

    // Acquire the lock
    await locks.insertOne({
      campaign,
      runnerPid: runnerPid || 'unknown',
      acquiredAt: now,
      expiresAt: expiry,
    })

    return NextResponse.json({ acquired: true, expiresAt: expiry })
  }

  if (action === 'cleanup') {
    // Clear all locks older than 3 hours (stale from crashed runs)
    const staleTime = new Date(Date.now() - 3 * 60 * 60 * 1000)
    const result = await db.collection('campaign_locks').deleteMany({ acquiredAt: { $lt: staleTime } })
    return NextResponse.json({ ok: true, cleared: result.deletedCount })
  }

  if (action === 'release') {
    await locks.deleteOne({ campaign })
    return NextResponse.json({ ok: true, released: campaign })
  }

  if (action === 'status') {
    const allLocks = await locks.find({}).toArray()
    return NextResponse.json({
      locks: allLocks.map(l => ({
        campaign: l.campaign,
        runnerPid: l.runnerPid,
        acquiredAt: l.acquiredAt,
        expiresAt: l.expiresAt,
        ageMinutes: Math.round((Date.now() - new Date(l.acquiredAt).getTime()) / 60000),
      }))
    })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}

export async function GET() {
  const db = await getDb()
  const locks = await db.collection('campaign_locks').find({}).toArray()
  return NextResponse.json({
    activeLocks: locks.map(l => ({
      campaign: l.campaign,
      ageMinutes: Math.round((Date.now() - new Date(l.acquiredAt).getTime()) / 60000),
      expiresAt: l.expiresAt,
    }))
  })
}
