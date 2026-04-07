export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

const QBO_MCP_URL = 'https://ai-inc.quickbooks.intuit.com/v1/mcp'

// Proxy requests to QuickBooks MCP through the admin API
// This allows the Finance Monitor page to pull live QBO data
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  try {
    if (action === 'profit_loss') {
      // Call QBO profit-loss endpoint via MCP
      const res = await fetch(`${QBO_MCP_URL}/profit-loss-quickbooks-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodStart: body.periodStart || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
          periodEnd: body.periodEnd || new Date().toISOString().split('T')[0],
        })
      })
      const data = await res.json()
      return NextResponse.json({ ok: true, type: 'profit_loss', data })
    }

    if (action === 'cash_flow') {
      const res = await fetch(`${QBO_MCP_URL}/cash-flow-quickbooks-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodStart: body.periodStart || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
          periodEnd: body.periodEnd || new Date().toISOString().split('T')[0],
        })
      })
      const data = await res.json()
      return NextResponse.json({ ok: true, type: 'cash_flow', data })
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
