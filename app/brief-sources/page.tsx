'use client'

import { useEffect, useState } from 'react'

type Source = {
  _id?: string
  name: string
  url: string
  section_hint: 'ai_news' | 'stuff_that_affects_my_life'
  enabled: boolean
}

export default function BriefSourcesPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Source>({
    name: '',
    url: '',
    section_hint: 'ai_news',
    enabled: true,
  })

  async function load() {
    setLoading(true)
    const r = await fetch('/api/brief/sources').then((r) => r.json())
    setSources(r.sources || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function add() {
    if (!draft.name || !draft.url) return
    await fetch('/api/brief/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    setDraft({ name: '', url: '', section_hint: 'ai_news', enabled: true })
    load()
  }

  async function toggle(id: string, enabled: boolean) {
    await fetch('/api/brief/sources', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled }),
    })
    load()
  }

  async function remove(id: string) {
    if (!confirm('delete this source?')) return
    await fetch(`/api/brief/sources?id=${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <main className="main">
      <header className="page-header">
        <div>
          <h1 className="page-title">Brief sources</h1>
          <div className="page-sub">RSS feeds and X accounts the curator pulls from</div>
        </div>
      </header>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="section-label">Add a source</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 160px 80px', gap: 8 }}>
          <input
            className="settings-input"
            placeholder="name (e.g. anthropic)"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <input
            className="settings-input"
            placeholder="https://..."
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          />
          <select
            className="settings-input"
            value={draft.section_hint}
            onChange={(e) =>
              setDraft({
                ...draft,
                section_hint: e.target.value as Source['section_hint'],
              })
            }
          >
            <option value="ai_news">AI news</option>
            <option value="stuff_that_affects_my_life">Stuff that affects my life</option>
          </select>
          <button className="btn-primary" onClick={add}>Add</button>
        </div>
      </section>

      <section className="card">
        <div className="section-label">All sources</div>
        {loading && <div style={{ color: 'var(--text-3)' }}>loading…</div>}
        {!loading && sources.length === 0 && (
          <div style={{ color: 'var(--text-3)' }}>No sources yet.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {sources.map((s) => (
            <div
              key={s._id}
              style={{
                display: 'grid',
                gridTemplateColumns: '180px 1fr 180px 80px 60px',
                gap: 8,
                alignItems: 'center',
                padding: '8px 12px',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-sm)',
                background: s.enabled ? 'transparent' : 'var(--surface-2)',
                opacity: s.enabled ? 1 : 0.6,
              }}
            >
              <span style={{ fontWeight: 500 }}>{s.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.url}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {s.section_hint === 'ai_news' ? 'AI news' : 'Stuff'}
              </span>
              <button
                className="btn-ghost"
                style={{ padding: '4px 10px', fontSize: 11 }}
                onClick={() => toggle(s._id!, !s.enabled)}
              >
                {s.enabled ? 'disable' : 'enable'}
              </button>
              <button
                className="btn-ghost"
                style={{ padding: '4px 10px', fontSize: 11, color: 'var(--red)' }}
                onClick={() => remove(s._id!)}
              >
                del
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
