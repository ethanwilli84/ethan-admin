'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type Resp = {
  sinceDays: number
  totals: {
    sessions: number
    scroll25: number
    scroll50: number
    scroll75: number
    avgTimeOnPageMs: number
    avgEventsPerSession: number
  }
  scrollFunnel: Array<{ milestone: string; count: number; pct: number }>
  videos: Array<{ id: string; plays: number }>
  daily: Array<{ date: string; sessions: number }>
  recentSessions: Array<{
    sessionId: string
    createdAt: string
    lastSeenAt: string
    totalEvents: number
    attribution?: { clientUserAgent?: string; landingUrl?: string }
    identity?: { phone?: string; email?: string }
  }>
}

function fmtDuration(ms: number) {
  if (!ms || ms < 0) return '-'
  const s = Math.round(ms / 1000)
  if (s < 60) return s + 's'
  return Math.floor(s/60) + 'm ' + (s%60) + 's'
}

function timeAgo(d: string) {
  const ms = Date.now() - new Date(d).getTime()
  if (ms < 60_000)      return Math.floor(ms/1000) + 's ago'
  if (ms < 3_600_000)   return Math.floor(ms/60_000) + 'm ago'
  if (ms < 86_400_000)  return Math.floor(ms/3_600_000) + 'h ago'
  return Math.floor(ms/86_400_000) + 'd ago'
}

const td: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }
const th: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }
const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }

export default function NurturePage() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState('30')

  useEffect(() => {
    setLoading(true)
    fetch('/api/landings/home?days=' + days)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [days])

  return (
    <div style={{ padding: '32px 28px', maxWidth: 1400, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>Nurture engagement</h1>
          <p style={{ fontSize: 13, color: '#666', margin: '4px 0 0' }}>
            Scroll depth, video plays, and time on page for waitroom.sireapp.io/ (the waitlist nurture page — not the /checkout quiz funnel).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/landings" style={{ fontSize: 13, color: '#555', textDecoration: 'none', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6 }}>
            → Quiz funnel
          </Link>
          <select value={days} onChange={e => setDays(e.target.value)}
                  style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
            <option value="7">Last 7d</option>
            <option value="14">Last 14d</option>
            <option value="30">Last 30d</option>
            <option value="90">Last 90d</option>
          </select>
        </div>
      </header>

      {loading ? <p style={{ color: '#666' }}>Loading…</p> : !data ? <p style={{ color: '#c00' }}>Failed to load</p> : (
        <>
          {/* Top-line metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            <div style={card}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Sessions</div>
              <div style={{ fontSize: 28, fontWeight: 600 }}>{data.totals.sessions.toLocaleString()}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Avg time on page</div>
              <div style={{ fontSize: 28, fontWeight: 600 }}>{fmtDuration(data.totals.avgTimeOnPageMs)}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Avg events / session</div>
              <div style={{ fontSize: 28, fontWeight: 600 }}>{data.totals.avgEventsPerSession}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Reached 75% scroll</div>
              <div style={{ fontSize: 28, fontWeight: 600 }}>
                {data.totals.scroll75}
                <span style={{ fontSize: 14, color: '#666', marginLeft: 6 }}>
                  ({data.totals.sessions ? Math.round(data.totals.scroll75/data.totals.sessions*100) : 0}%)
                </span>
              </div>
            </div>
          </div>

          {/* Scroll depth funnel */}
          <div style={{ ...card, marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 14px' }}>Scroll depth funnel</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.scrollFunnel.map(row => (
                <div key={row.milestone} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 200, fontSize: 13 }}>{row.milestone}</div>
                  <div style={{ flex: 1, height: 22, background: 'var(--surface-2, #f5f5f5)', borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
                    <div style={{
                      width: Math.min(row.pct, 100) + '%',
                      height: '100%',
                      background: row.milestone.includes('75') ? '#4f46e5' : row.milestone.includes('50') ? '#7c8ce6' : row.milestone.includes('25') ? '#a5b4eb' : '#c8d0f0',
                      transition: 'width 200ms',
                    }} />
                  </div>
                  <div style={{ width: 100, fontSize: 13, textAlign: 'right' }}>
                    {row.count}<span style={{ color: '#666', marginLeft: 4 }}>· {row.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Video plays + daily volume side-by-side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div style={card}>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 14px' }}>Video plays</h3>
              {data.videos.length === 0 ? (
                <p style={{ fontSize: 13, color: '#666' }}>No video plays yet.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>Reel</th>
                      <th style={{ ...th, textAlign: 'right' }}>Plays</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.videos.map(v => (
                      <tr key={v.id}>
                        <td style={td}>{v.id}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 500 }}>{v.plays}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={card}>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 14px' }}>Sessions by day</h3>
              {data.daily.length === 0 ? (
                <p style={{ fontSize: 13, color: '#666' }}>No sessions yet.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>Date</th>
                      <th style={{ ...th, textAlign: 'right' }}>Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily.map(d => (
                      <tr key={d.date}>
                        <td style={td}>{d.date}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 500 }}>{d.sessions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Recent sessions table */}
          <div style={card}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 14px' }}>Recent sessions ({data.recentSessions.length})</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>When</th>
                  <th style={th}>Duration</th>
                  <th style={th}>Events</th>
                  <th style={th}>Device</th>
                  <th style={th}>Session</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSessions.map(s => {
                  const ua = s.attribution?.clientUserAgent || ''
                  const device = /Instagram/i.test(ua) ? '📱 IG' : /iPhone/i.test(ua) ? '🍎 iPhone' : /Android/i.test(ua) ? '🤖 Android' : '💻'
                  const dur = new Date(s.lastSeenAt).getTime() - new Date(s.createdAt).getTime()
                  return (
                    <tr key={s.sessionId}>
                      <td style={td}>{timeAgo(s.createdAt)}</td>
                      <td style={td}>{fmtDuration(dur)}</td>
                      <td style={td}>{s.totalEvents}</td>
                      <td style={td}>{device}</td>
                      <td style={{ ...td, fontSize: 11, color: '#666' }}>
                        <Link href={'/landings/' + s.sessionId} style={{ color: '#4f46e5', textDecoration: 'none' }}>
                          {s.sessionId.slice(0, 30)}…
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
