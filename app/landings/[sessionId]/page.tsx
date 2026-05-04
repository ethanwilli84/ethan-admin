'use client'
import { useEffect, useState, use } from 'react'
import Link from 'next/link'

type Event = {
  _id: string
  sessionId: string
  variant: string
  event: string
  step?: string
  stepRank?: number
  contentName?: string
  question?: string
  answer?: string | number
  tier?: string
  value?: number
  funnelElapsed?: number
  ts: string
  raw?: Record<string, unknown>
}

type Session = {
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
  completed?: boolean
  tierPicked?: string
  quizAnswers?: Record<string, string | number>
  attribution?: Record<string, string | undefined>
  identity?: { phone?: string; email?: string }
}

export default function SessionDrillPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  const [data, setData] = useState<{ session: Session; events: Event[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/landings/' + encodeURIComponent(sessionId))
      .then(async r => {
        if (!r.ok) throw new Error((await r.json()).error || 'fetch failed')
        return r.json()
      })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [sessionId])

  return (
    <div style={{ padding: '32px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <Link href="/landings" style={{ fontSize: 13, color: '#666' }}>← All sessions</Link>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: '8px 0 4px', letterSpacing: '-0.01em', wordBreak: 'break-all' }}>{sessionId}</h1>

      {loading && <div style={{ marginTop: 24, color: '#666' }}>Loading…</div>}
      {error   && <div style={{ marginTop: 24, color: '#c00' }}>Error: {error}</div>}

      {data && (
        <>
          {/* Session summary */}
          <section style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Card title="Funnel">
              <Row label="variant" value={data.session.variant} />
              <Row label="step reached" value={`${data.session.highestStepName || '?'} (rank ${data.session.highestStepRank})`} />
              <Row label="created" value={new Date(data.session.createdAt).toLocaleString()} />
              <Row label="last seen" value={new Date(data.session.lastSeenAt).toLocaleString()} />
              <Row label="total events" value={String(data.session.totalEvents)} />
              <Row label="tier picked" value={data.session.tierPicked || '-'} />
              <Row label="reached savings" value={data.session.reachedSavings ? '✓' : '-'} />
              <Row label="reached tier select" value={data.session.reachedTierSelect ? '✓' : '-'} />
              <Row label="opened card popup" value={data.session.cardPopupOpened ? '✓' : '-'} />
              <Row label="submitted card" value={data.session.cardSubmitted ? '✓' : '-'} />
              <Row label="started trial" value={data.session.trialStarted ? '✓' : '-'} />
            </Card>
            <Card title="Quiz answers">
              {Object.keys(data.session.quizAnswers || {}).length === 0
                ? <div style={{ color: '#888', fontSize: 13 }}>No answers captured yet.</div>
                : Object.entries(data.session.quizAnswers || {}).map(([q, a]) => (
                    <Row key={q} label={q} value={String(a)} />
                  ))
              }
            </Card>
          </section>

          {/* Attribution */}
          <Card title="Attribution" style={{ marginTop: 12 }}>
            {Object.entries(data.session.attribution || {}).filter(([_, v]) => v).map(([k, v]) => (
              <Row key={k} label={k} value={String(v).slice(0, 200)} />
            ))}
            {data.session.identity?.phone && <Row label="phone" value={data.session.identity.phone} />}
            {data.session.identity?.email && <Row label="email" value={data.session.identity.email} />}
          </Card>

          {/* Event timeline */}
          <section style={{ marginTop: 28 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Event timeline ({data.events.length})</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2, #f7f7f7)' }}>
                  <th style={th}>When</th>
                  <th style={th}>Event</th>
                  <th style={th}>Step</th>
                  <th style={th}>Content / Q</th>
                  <th style={th}>Answer / Tier / Value</th>
                  <th style={th}>Elapsed</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map(e => (
                  <tr key={e._id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}>{new Date(e.ts).toLocaleTimeString()}</td>
                    <td style={td}><strong>{e.event}</strong></td>
                    <td style={td}>{e.step || '-'}</td>
                    <td style={td}>{e.question || e.contentName || '-'}</td>
                    <td style={td}>{e.answer ?? e.tier ?? (e.value ? `$${e.value}` : '-')}</td>
                    <td style={td}>{e.funnelElapsed != null ? `${(e.funnelElapsed / 1000).toFixed(1)}s` : '-'}</td>
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

function Card({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, ...style }}>
      <h3 style={{ fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>{title}</h3>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', fontSize: 13, borderBottom: '1px dashed var(--border-soft, #eee)' }}>
      <span style={{ color: '#666' }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '70%', wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '6px 10px', fontSize: 10, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }
const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'top' }
