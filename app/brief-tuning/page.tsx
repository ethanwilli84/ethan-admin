export const dynamic = 'force-dynamic'

import { getDb } from '@/lib/mongodb'

type Feedback = {
  _id: string
  slug?: string
  verdict: string
  item_title?: string
  item_url?: string
  item_source?: string
  note?: string
  created_at: Date
}

const VERDICT_LABELS: Record<string, { label: string; color: string }> = {
  up: { label: '👍 keep', color: 'rgba(22,163,74,0.10)' },
  down: { label: '👎 cut', color: 'rgba(220,38,38,0.10)' },
  less: { label: 'less of this', color: 'rgba(217,119,6,0.10)' },
  override: { label: 'show me this', color: 'rgba(37,99,235,0.10)' },
  note: { label: 'note', color: 'rgba(0,0,0,0.05)' },
}

async function loadFeedback(): Promise<Feedback[]> {
  const db = await getDb()
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const rows = await db
    .collection('brief_feedback')
    .find({ created_at: { $gte: cutoff } })
    .sort({ created_at: -1 })
    .limit(500)
    .toArray()
  return rows.map((r) => ({ ...r, _id: String(r._id) })) as unknown as Feedback[]
}

export default async function BriefTuningPage() {
  const rows = await loadFeedback()

  const byDay: Record<string, Feedback[]> = {}
  for (const r of rows) {
    const d = new Date(r.created_at).toISOString().slice(0, 10)
    ;(byDay[d] ||= []).push(r)
  }

  return (
    <main className="main">
      <header className="page-header">
        <div>
          <h1 className="page-title">Brief tuning</h1>
          <div className="page-sub">Last 30 days · {rows.length} feedback events</div>
        </div>
      </header>

      {rows.length === 0 && (
        <div className="card" style={{ color: 'var(--text-3)' }}>
          No feedback yet. Tap 👍 / 👎 / less-of-this on a brief to start tuning.
        </div>
      )}

      {Object.entries(byDay).map(([day, items]) => (
        <section key={day} className="card" style={{ marginBottom: 16 }}>
          <div className="section-label" style={{ marginBottom: 12 }}>{day} · {items.length}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((r) => {
              const meta = VERDICT_LABELS[r.verdict] ?? { label: r.verdict, color: 'rgba(0,0,0,0.05)' }
              return (
                <div
                  key={r._id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 12px',
                    border: '1px solid var(--border-soft)',
                    borderRadius: 'var(--radius-sm)',
                    background: meta.color,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 600, minWidth: 110 }}>{meta.label}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-strong)' }}>
                      {r.item_title || <span style={{ color: 'var(--text-3)' }}>(no title)</span>}
                    </div>
                    {r.note && (
                      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>note: {r.note}</div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>
                      {r.item_source || '—'} · {r.slug || '—'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </main>
  )
}
