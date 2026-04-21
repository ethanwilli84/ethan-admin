'use client'
import { useState, useEffect } from 'react'

interface AccessLog {
  _id: string
  name: string
  portal: string
  timestamp: string
  ip?: string
}

export default function InvestorAccessPage() {
  const [logs, setLogs] = useState<AccessLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/investor-access')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setLogs(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const unique = new Set(logs.map(l => l.name)).size
  const today = logs.filter(l => {
    const d = new Date(l.timestamp)
    const now = new Date()
    return d.toDateString() === now.toDateString()
  }).length

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Investor Access</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>Who viewed the investor portals</p>
        </div>
        <button
          onClick={() => { setLoading(true); fetch('/api/investor-access').then(r => r.json()).then(d => { if (Array.isArray(d)) setLogs(d); setLoading(false) }) }}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer' }}
        >
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total views</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-dm-mono)' }}>{logs.length}</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Unique visitors</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-dm-mono)' }}>{unique}</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Today</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--green, #22c55e)', fontFamily: 'var(--font-dm-mono)' }}>{today}</div>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: 'var(--text-3)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: 'var(--text-3)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Portal</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: 'var(--text-3)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date & Time</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={3} style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>No access logs yet</td></tr>
            ) : logs.map((log, i) => (
              <tr key={log._id || i} style={{ borderBottom: i < logs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <td style={{ padding: '12px 16px', color: 'var(--text-1)', fontWeight: 500 }}>{log.name}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    padding: '3px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    background: log.portal?.includes('invest.') ? 'rgba(34,197,94,0.12)' : 'rgba(91,79,233,0.12)',
                    color: log.portal?.includes('invest.') ? '#22c55e' : 'var(--accent)',
                  }}>
                    {log.portal?.includes('invest.') ? 'invest' : 'investor'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--text-2)', fontFamily: 'var(--font-dm-mono)', fontSize: 12 }}>
                  {new Date(log.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(log.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
