'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Sync {
  syncedAt: string
  period: { start: string; end: string }
  summary: { income: number; expenses: number; netIncome: number } | null
  transactions: { type: string; date: string; amount: number; description: string; vendor: string | null }[]
  anomalies: { type: string; description: string; severity: string; date: string }[]
}

export default function FinancePage() {
  const [sync, setSync] = useState<Sync | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  useEffect(() => {
    fetch('/api/finance/qbo-read').then(r => r.json()).then(d => {
      if (d.ok) setSync(d.latest)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function runSync() {
    setSyncing(true); setSyncMsg('')
    const res = await fetch('/api/finance/qbo-sync')
    const d = await res.json()
    if (d.ok) setSyncMsg('✓ Synced successfully')
    else setSyncMsg(`✗ ${d.error}`)
    setSyncing(false)
    // Reload
    const r2 = await fetch('/api/finance/qbo-read').then(r => r.json())
    if (r2.ok) setSync(r2.latest)
  }

  const SEV = { high: 'var(--red)', medium: '#f59e0b', low: 'var(--green)' }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <Link href="/" style={{ color: 'var(--text-3)', fontSize: 13, textDecoration: 'none' }}>← Admin</Link>
          <div style={{ fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 22, marginTop: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
            💰 Finance Monitor
            <span style={{ fontSize: 11, background: 'rgba(0,200,150,0.1)', color: 'var(--green)', border: '1px solid rgba(0,200,150,0.3)', borderRadius: 20, padding: '2px 10px', fontFamily: 'var(--font-dm-mono)' }}>
              QuickBooks Online
            </span>
          </div>
          {sync && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, fontFamily: 'var(--font-dm-mono)' }}>
            Last sync: {new Date(sync.syncedAt).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
          </div>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {syncMsg && <span style={{ fontSize: 12, color: syncMsg.includes('✓') ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-dm-mono)' }}>{syncMsg}</span>}
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={runSync} disabled={syncing}>
            {syncing ? '◌ Syncing...' : '↺ Sync Now'}
          </button>
          <Link href="/finance-setup" style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text-2)' }}>
            ⚙ Setup
          </Link>
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)' }}>◌ Loading...</div>}

      {!loading && !sync && (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
          <div style={{ fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Connect QuickBooks</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>No sync data yet. Connect your QBO account to start pulling live financial data.</div>
          <Link href="/finance-setup" className="btn-primary" style={{ textDecoration: 'none', padding: '10px 24px' }}>
            Connect QuickBooks →
          </Link>
        </div>
      )}

      {sync && (
        <>
          {/* P&L Summary */}
          {sync.summary && (
            <div className="card-grid card-grid-4" style={{ marginBottom: 20 }}>
              {[
                { label: 'Revenue (YTD)', value: `$${sync.summary.income.toLocaleString()}`, color: 'var(--green)' },
                { label: 'Expenses (YTD)', value: `$${sync.summary.expenses.toLocaleString()}`, color: 'var(--red)' },
                { label: 'Net Income (YTD)', value: `$${sync.summary.netIncome.toLocaleString()}`, color: sync.summary.netIncome >= 0 ? 'var(--green)' : 'var(--red)' },
                { label: 'Transactions (90d)', value: String(sync.transactions.length), color: 'var(--text)' },
              ].map(card => (
                <div key={card.label} className="card" style={{ padding: '16px 18px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{card.label}</div>
                  <div style={{ fontSize: 26, fontFamily: 'var(--font-syne)', fontWeight: 700, color: card.color }}>{card.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Anomalies */}
          {sync.anomalies.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="section-label" style={{ marginBottom: 12 }}>⚠ Flagged Transactions</div>
              {sync.anomalies.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 14 }}>{a.severity === 'high' ? '🔴' : a.severity === 'medium' ? '🟡' : '🔵'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{a.description}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.type} · {a.date}</div>
                  </div>
                  <span style={{ fontSize: 10, color: (SEV as Record<string, string>)[a.severity] || 'var(--text-3)', fontFamily: 'var(--font-dm-mono)', fontWeight: 600 }}>{a.severity.toUpperCase()}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recent transactions */}
          <div className="card">
            <div className="section-label" style={{ marginBottom: 12 }}>Recent Transactions (90 days)</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Description', 'Type', 'Amount'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sync.transactions.slice(0, 25).map((t, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 10px', fontSize: 11, color: 'var(--text-3)' }}>{t.date}</td>
                    <td style={{ padding: '7px 10px' }}>{t.description || t.vendor || '—'}</td>
                    <td style={{ padding: '7px 10px', fontSize: 11, color: 'var(--text-3)' }}>{t.type}</td>
                    <td style={{ padding: '7px 10px', fontFamily: 'var(--font-dm-mono)', fontWeight: 600, color: t.amount > 0 ? 'var(--green)' : 'var(--text)' }}>
                      {t.amount > 0 ? '+' : ''}{t.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
