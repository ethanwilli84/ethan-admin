'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type Session = {
  _id: string
  sessionId: string
  variant: string
  createdAt: string
  lastSeenAt: string
  totalEvents: number
  highestStepRank: number
  highestStepName?: string
  reachedSavings?: boolean
  reachedTierSelect?: boolean
  cardPopupOpened?: boolean
  cardSubmitted?: boolean
  trialStarted?: boolean
  tierPicked?: string
  quizAnswers?: Record<string, string | number>
  attribution?: {
    fbclid?: string
    utm_source?: string
    utm_campaign?: string
    utm_content?: string
    utm_creative?: string
    utm_placement?: string
    landingUrl?: string
    clientUserAgent?: string
  }
  identity?: { phone?: string; email?: string }
}

type ApiResponse = {
  sessions: Session[]
  totals: {
    all: number
    reachedSavings: number
    reachedTier: number
    cardOpened: number
    cardSubmitted: number
    trialStarted: number
  }
  byStep: Array<{ _id: string; count: number }>
  byVariant: Array<{
    _id: string
    sessions: number
    reachedSavings: number
    reachedTier: number
    cardOpened: number
    cardSubmitted: number
    trialStarted: number
  }>
}

const STEP_NAMES: Record<number, string> = {
  0: 'splash',
  1: 'q1 weight',
  2: 'q2 type',
  3: 'q3 volume',
  4: 'q4 cost',
  5: 'calculating',
  6: 'social proof',
  7: 'savings reveal',
  8: 'tier select',
  9: 'card form',
  10: 'card popup opened',
  11: 'paid trial',
}

function fmtTime(d: string) {
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function timeAgo(d: string) {
  const ms = Date.now() - new Date(d).getTime()
  if (ms < 60_000)         return Math.floor(ms / 1000) + 's ago'
  if (ms < 3_600_000)      return Math.floor(ms / 60_000) + 'm ago'
  if (ms < 86_400_000)     return Math.floor(ms / 3_600_000) + 'h ago'
  return Math.floor(ms / 86_400_000) + 'd ago'
}

export default function LandingsPage() {
  const [data, setData]       = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [variant, setVariant] = useState('')
  const [minStep, setMinStep] = useState('')

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (variant) qs.set('variant', variant)
    if (minStep) qs.set('step', minStep)
    qs.set('limit', '200')
    fetch('/api/landings?' + qs.toString())
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [variant, minStep])

  return (
    <div style={{ padding: '32px 28px', maxWidth: 1400, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>Lander funnel</h1>
          <p style={{ fontSize: 13, color: '#666', margin: '4px 0 0' }}>
            Per-session quiz answers, step depth, attribution, and conversion signals from waitroom.sireapp.io/checkout.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={variant} onChange={e => setVariant(e.target.value)}
                  style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
            <option value="">All variants</option>
            <option value="A">A (control)</option>
            <option value="B">B (treatment)</option>
            <option value="control">control</option>
          </select>
          <select value={minStep} onChange={e => setMinStep(e.target.value)}
                  style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
            <option value="">Any step</option>
            <option value="1">Reached q1+</option>
            <option value="6">Reached step 6+</option>
            <option value="7">Reached savings reveal+</option>
            <option value="8">Reached tier select+</option>
            <option value="10">Opened card popup+</option>
            <option value="11">Started trial</option>
          </select>
        </div>
      </header>

      {loading && <div style={{ color: '#666' }}>Loading…</div>}
      {!loading && data && (
        <>
          {/* Funnel summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 28 }}>
            <FunnelCard label="Total sessions" value={data.totals.all} />
            <FunnelCard label="Reached savings" value={data.totals.reachedSavings} pct={data.totals.all ? data.totals.reachedSavings / data.totals.all : 0} />
            <FunnelCard label="Reached tier select" value={data.totals.reachedTier} pct={data.totals.all ? data.totals.reachedTier / data.totals.all : 0} />
            <FunnelCard label="Opened card popup" value={data.totals.cardOpened} pct={data.totals.all ? data.totals.cardOpened / data.totals.all : 0} />
            <FunnelCard label="Submitted card" value={data.totals.cardSubmitted} pct={data.totals.all ? data.totals.cardSubmitted / data.totals.all : 0} />
            <FunnelCard label="Started trial" value={data.totals.trialStarted} pct={data.totals.all ? data.totals.trialStarted / data.totals.all : 0} highlight />
          </div>

          {/* By-variant comparison */}
          {data.byVariant.length > 1 && (
            <section style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>A/B comparison</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2, #f7f7f7)' }}>
                    <th style={th}>Variant</th>
                    <th style={th}>Sessions</th>
                    <th style={th}>→ Savings</th>
                    <th style={th}>→ Tier</th>
                    <th style={th}>→ Card open</th>
                    <th style={th}>→ Card submit</th>
                    <th style={th}>→ Trial</th>
                    <th style={th}>Conv. rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byVariant.map(v => (
                    <tr key={v._id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={td}><strong>{v._id}</strong></td>
                      <td style={td}>{v.sessions}</td>
                      <td style={td}>{v.reachedSavings} <span style={pctSpan}>({pct(v.reachedSavings, v.sessions)})</span></td>
                      <td style={td}>{v.reachedTier} <span style={pctSpan}>({pct(v.reachedTier, v.sessions)})</span></td>
                      <td style={td}>{v.cardOpened} <span style={pctSpan}>({pct(v.cardOpened, v.sessions)})</span></td>
                      <td style={td}>{v.cardSubmitted} <span style={pctSpan}>({pct(v.cardSubmitted, v.sessions)})</span></td>
                      <td style={td}>{v.trialStarted} <span style={pctSpan}>({pct(v.trialStarted, v.sessions)})</span></td>
                      <td style={td}><strong>{pct(v.trialStarted, v.sessions)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Drop-off by step */}
          <section style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Where users drop off (highest step reached)</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {data.byStep.map(s => (
                <div key={s._id || 'unknown'} style={{ background: 'var(--surface-2, #f7f7f7)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12 }}>
                  <strong>{s._id || '(none)'}</strong> · {s.count}
                </div>
              ))}
            </div>
          </section>

          {/* Sessions table */}
          <section>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Recent sessions ({data.sessions.length})</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2, #f7f7f7)' }}>
                  <th style={th}>When</th>
                  <th style={th}>Variant</th>
                  <th style={th}>Step reached</th>
                  <th style={th}>Tier</th>
                  <th style={th}>Q1</th>
                  <th style={th}>Q2</th>
                  <th style={th}>Q3</th>
                  <th style={th}>Creative / Placement</th>
                  <th style={th}>Phone</th>
                  <th style={th}>Events</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map(s => (
                  <tr key={s.sessionId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}>
                      <Link href={`/landings/${encodeURIComponent(s.sessionId)}`} style={{ color: 'inherit' }}>
                        <div>{timeAgo(s.lastSeenAt)}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>{fmtTime(s.createdAt)}</div>
                      </Link>
                    </td>
                    <td style={td}>{s.variant}</td>
                    <td style={td}>
                      <span style={{ fontWeight: 500 }}>{s.highestStepName || STEP_NAMES[s.highestStepRank] || '?'}</span>
                      <div style={{ fontSize: 11, color: '#888' }}>step {s.highestStepRank}</div>
                    </td>
                    <td style={td}>{s.tierPicked || '-'}</td>
                    <td style={td}>{String(s.quizAnswers?.q1_avg_weight ?? s.quizAnswers?.q1 ?? '-')}</td>
                    <td style={td}>{String(s.quizAnswers?.q2_business_type ?? s.quizAnswers?.q2 ?? '-')}</td>
                    <td style={td}>{String(s.quizAnswers?.q3_volume ?? s.quizAnswers?.q3 ?? '-')}</td>
                    <td style={td}>
                      <div style={{ fontSize: 11 }}>{s.attribution?.utm_creative || '-'}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>{s.attribution?.utm_placement || '-'}</div>
                    </td>
                    <td style={td}>{s.identity?.phone || '-'}</td>
                    <td style={td}>{s.totalEvents}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }
const td: React.CSSProperties = { padding: '10px', verticalAlign: 'top' }
const pctSpan: React.CSSProperties = { color: '#888', fontSize: 11 }

function pct(n: number, d: number) { return d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '0%' }

function FunnelCard({ label, value, pct: p, highlight }: { label: string; value: number; pct?: number; highlight?: boolean }) {
  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: 14,
      background: highlight ? 'rgba(124, 58, 237, 0.04)' : 'var(--bg)',
      borderColor:  highlight ? 'rgba(124, 58, 237, 0.4)' : 'var(--border)',
    }}>
      <div style={{ fontSize: 11, color: '#666', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>{value}</div>
      {p !== undefined && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{(p * 100).toFixed(1)}%</div>}
    </div>
  )
}
