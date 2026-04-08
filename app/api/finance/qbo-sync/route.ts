export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

const BASE_URL = 'https://quickbooks.api.intuit.com'
// For sandbox: const BASE_URL = 'https://sandbox-quickbooks.api.intuit.com'

async function getAccessToken(refreshToken: string, realmId: string) {
  const clientId = process.env.QBO_CLIENT_ID!
  const clientSecret = process.env.QBO_CLIENT_SECRET!
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`)

  // Save new tokens back to DB
  const db = await getDb()
  await db.collection('qbo_credentials').updateOne(
    { _id: 'sire' as unknown as import('mongodb').ObjectId },
    { $set: { accessToken: data.access_token, refreshToken: data.refresh_token || refreshToken, updatedAt: new Date() } }
  )
  return data.access_token
}

async function qboFetch(path: string, accessToken: string, realmId: string) {
  const res = await fetch(`${BASE_URL}/v3/company/${realmId}${path}?minorversion=73`, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
  })
  if (!res.ok) throw new Error(`QBO API error ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function GET() {
  const db = await getDb()

  // Get stored credentials
  const creds = await db.collection('qbo_credentials').findOne({ _id: 'sire' as unknown as import('mongodb').ObjectId })
  if (!creds) return NextResponse.json({ ok: false, error: 'No QBO credentials. Visit /api/finance/qbo-auth to connect.' })

  const realmId = process.env.QBO_REALM_ID || creds.realmId
  const refreshToken = process.env.QBO_REFRESH_TOKEN || creds.refreshToken

  try {
    const accessToken = await getAccessToken(refreshToken, realmId)
    const today = new Date().toISOString().split('T')[0]
    const yearStart = `${new Date().getFullYear()}-01-01`

    // Fetch P&L report
    const plRes = await fetch(
      `${BASE_URL}/v3/company/${realmId}/reports/ProfitAndLoss?start_date=${yearStart}&end_date=${today}&minorversion=73`,
      { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } }
    )
    const plData = plRes.ok ? await plRes.json() : null

    // Fetch recent transactions (last 90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const txQuery = `SELECT * FROM Transaction WHERE TxnDate >= '${ninetyDaysAgo}' ORDERBY TxnDate DESC MAXRESULTS 100`
    const txData = await qboFetch(`/query?query=${encodeURIComponent(txQuery)}`, accessToken, realmId)

    // Fetch balance sheet
    const bsRes = await fetch(
      `${BASE_URL}/v3/company/${realmId}/reports/BalanceSheet?start_date=${yearStart}&end_date=${today}&minorversion=73`,
      { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } }
    )
    const bsData = bsRes.ok ? await bsRes.json() : null

    // Parse P&L summary
    const summary = parsePLSummary(plData)
    const transactions = parseTransactions(txData)

    // Detect anomalies
    const anomalies = detectAnomalies(transactions)

    // Save to MongoDB for Finance Monitor
    const syncData = {
      syncedAt: new Date(),
      period: { start: yearStart, end: today },
      summary,
      transactions: transactions.slice(0, 50), // store last 50
      anomalies,
      realmId,
    }
    await db.collection('qbo_daily_sync').insertOne(syncData)

    // Keep only last 30 syncs
    const count = await db.collection('qbo_daily_sync').countDocuments()
    if (count > 30) {
      const oldest = await db.collection('qbo_daily_sync').find().sort({ syncedAt: 1 }).limit(count - 30).toArray()
      await db.collection('qbo_daily_sync').deleteMany({ _id: { $in: oldest.map(d => d._id) } })
    }

    return NextResponse.json({ ok: true, syncedAt: new Date(), summary, anomalies, transactionCount: transactions.length })

  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

function parsePLSummary(plData: Record<string, unknown> | null) {
  if (!plData) return null
  try {
    const rows = (plData.Rows as Record<string, unknown>)?.Row as Record<string, unknown>[] || []
    let income = 0, expenses = 0, netIncome = 0

    for (const row of rows) {
      const summary = (row.Summary as Record<string, unknown>) || {}
      const colData = (summary.ColData as Record<string, unknown>[]) || []
      const label = colData[0]?.value as string || ''
      const amount = parseFloat(colData[1]?.value as string || '0')

      if (label.includes('Total Income') || label.includes('Total Revenue')) income = amount
      if (label.includes('Total Expenses')) expenses = amount
      if (label.includes('Net Income') || label.includes('Net Loss')) netIncome = amount
    }

    return { income, expenses, netIncome, period: plData.Header }
  } catch { return null }
}

function parseTransactions(txData: Record<string, unknown>) {
  try {
    const entities = (txData.QueryResponse as Record<string, unknown>) || {}
    const txns: Record<string, unknown>[] = []

    for (const [type, items] of Object.entries(entities)) {
      if (!Array.isArray(items)) continue
      for (const item of items) {
        txns.push({
          type,
          id: item.Id,
          date: item.TxnDate,
          amount: parseFloat(item.TotalAmt || item.Amount || '0'),
          description: item.PrivateNote || item.Memo || item.PaymentRefNum || type,
          vendor: item.EntityRef?.name || item.VendorRef?.name || null,
        })
      }
    }

    return txns.sort((a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime())
  } catch { return [] }
}

function detectAnomalies(txns: Record<string, unknown>[]) {
  const anomalies: { type: string; description: string; severity: string; date: string }[] = []

  // Large transactions > $10k
  for (const t of txns) {
    const amt = Math.abs(t.amount as number)
    if (amt > 10000) {
      anomalies.push({ type: 'large', description: `$${amt.toLocaleString()} — ${t.description}`, severity: 'high', date: t.date as string })
    }
  }

  // Duplicate detection (same amount + same day)
  const seen = new Map<string, number>()
  for (const t of txns) {
    const key = `${t.date}|${t.amount}`
    seen.set(key, (seen.get(key) || 0) + 1)
  }
  for (const [key, count] of seen.entries()) {
    if (count > 1) {
      const [date, amount] = key.split('|')
      anomalies.push({ type: 'duplicate', description: `$${parseFloat(amount).toLocaleString()} appears ${count}x on ${date}`, severity: 'medium', date })
    }
  }

  return anomalies.slice(0, 10)
}
