'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Project {
  id: number; name: string; fullName: string; description: string; summary: string
  url: string; cloneUrl: string; private: boolean; language: string; languages: string[]
  stars: number; updatedAt: string; createdAt: string; defaultBranch: string
  lastCommit: { sha: string; message: string; date: string; author: string } | null
  domain: string | null; host: string | null; deployCmd: string | null; editInstructions: string | null
  topics: string[]
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f7df1e', Python: '#3572A5', HTML: '#e34c26',
  CSS: '#563d7c', Go: '#00ADD8', Rust: '#dea584',
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<Project | null>(null)
  const [editForm, setEditForm] = useState({ domain: '', host: '', deployCmd: '', editInstructions: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load(refresh = false) {
    refresh ? setRefreshing(true) : setLoading(true)
    const res = await fetch(`/api/projects${refresh ? '?refresh=1' : ''}`)
    const d = await res.json()
    if (d.ok) { setProjects(d.projects); setCachedAt(d.cachedAt) }
    refresh ? setRefreshing(false) : setLoading(false)
  }

  async function saveHosting() {
    if (!editTarget) return
    setSaving(true)
    await fetch('/api/projects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editTarget.name, ...editForm })
    })
    setEditTarget(null); setSaving(false); load(true)
  }

  const filtered = projects.filter(p =>
    !search || p.name.includes(search) || p.summary?.toLowerCase().includes(search.toLowerCase()) || p.language?.toLowerCase().includes(search.toLowerCase())
  )

  const relDate = (d: string) => {
    const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
    return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`
  }

  return (
    <div>
      <div className="page-header-bar">
        <div>
          <div className="page-title">Projects</div>
          <div className="page-sub">
            {projects.length} repos from GitHub
            {cachedAt && <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>· synced {relDate(cachedAt)}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search projects..."
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', width: 200 }} />
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => load(true)} disabled={refreshing}>
            {refreshing ? '◌ Syncing...' : '↺ Sync GitHub'}
          </button>
        </div>
      </div>

      <div className="main">
        {loading && <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)' }}>◌ Loading repos...</div>}

        <div style={{ display: 'grid', gap: 12 }}>
          {filtered.map(p => (
            <div key={p.name} className="card" style={{ cursor: 'pointer', transition: 'box-shadow 0.15s' }}
              onClick={() => setExpanded(expanded === p.name ? null : p.name)}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                    <a href={p.url} target="_blank" onClick={e => e.stopPropagation()}
                      style={{ fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 16, color: 'var(--accent)', textDecoration: 'none' }}>
                      {p.name}
                    </a>
                    {p.private && <span style={{ fontSize: 9, background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border)', borderRadius: 10, padding: '1px 7px', fontFamily: 'var(--font-dm-mono)', color: 'var(--text-3)' }}>private</span>}
                    {p.language && <span style={{ fontSize: 10, fontFamily: 'var(--font-dm-mono)', color: LANG_COLORS[p.language] || 'var(--text-3)' }}>● {p.language}</span>}
                    {p.domain && <a href={p.domain} target="_blank" onClick={e => e.stopPropagation()}
                      style={{ fontSize: 11, color: 'var(--green)', textDecoration: 'none' }}>↗ {p.domain.replace('https://', '').substring(0, 35)}</a>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{p.summary}</div>
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)' }}>{relDate(p.updatedAt)}</div>
                  {p.host && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{p.host}</div>}
                </div>
              </div>

              {/* Last commit */}
              {p.lastCommit && (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>{p.lastCommit.sha}</span>
                  <span>{p.lastCommit.message}</span>
                </div>
              )}

              {/* Expanded detail */}
              {expanded === p.name && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    {p.domain && (
                      <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 12 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase', marginBottom: 4 }}>Live URL</div>
                        <a href={p.domain} target="_blank" style={{ fontSize: 13, color: 'var(--accent)', wordBreak: 'break-all' }}>{p.domain}</a>
                      </div>
                    )}
                    {p.host && (
                      <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 12 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase', marginBottom: 4 }}>Hosted On</div>
                        <div style={{ fontSize: 13 }}>{p.host}</div>
                      </div>
                    )}
                    {p.deployCmd && (
                      <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 12 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase', marginBottom: 4 }}>Deploy</div>
                        <div style={{ fontSize: 12, fontFamily: 'var(--font-dm-mono)', color: 'var(--green)' }}>{p.deployCmd}</div>
                      </div>
                    )}
                    <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase', marginBottom: 4 }}>Clone</div>
                      <div style={{ fontSize: 11, fontFamily: 'var(--font-dm-mono)', color: 'var(--text-2)', wordBreak: 'break-all' }}>git clone {p.cloneUrl}</div>
                    </div>
                  </div>

                  {p.editInstructions && (
                    <div style={{ background: 'rgba(91,79,233,0.06)', border: '1px solid rgba(91,79,233,0.2)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                      <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase', marginBottom: 6 }}>How to Edit & Deploy</div>
                      <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{p.editInstructions}</div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <a href={p.url} target="_blank" className="btn-ghost" style={{ fontSize: 12, textDecoration: 'none' }}>View on GitHub →</a>
                    <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => {
                      setEditTarget(p)
                      setEditForm({ domain: p.domain || '', host: p.host || '', deployCmd: p.deployCmd || '', editInstructions: p.editInstructions || '' })
                    }}>✏ Edit hosting info</button>
                    {p.languages.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {p.languages.map(l => <span key={l} style={{ fontSize: 10, color: LANG_COLORS[l] || 'var(--text-3)', fontFamily: 'var(--font-dm-mono)' }}>● {l}</span>)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Edit hosting modal */}
      {editTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={() => setEditTarget(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 520, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Edit hosting — {editTarget.name}</div>
            {[
              { label: 'Live Domain', key: 'domain', placeholder: 'https://myapp.vercel.app' },
              { label: 'Hosted On', key: 'host', placeholder: 'Vercel / DigitalOcean / Railway...' },
              { label: 'Deploy Command', key: 'deployCmd', placeholder: 'git push origin main → auto-deploys' },
            ].map(({ label, key, placeholder }) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>{label}</label>
                <input value={editForm[key as keyof typeof editForm]} onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Edit Instructions</label>
              <textarea value={editForm.editInstructions} onChange={e => setEditForm(p => ({ ...p, editInstructions: e.target.value }))}
                rows={4} placeholder="How to edit and deploy this project..."
                style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" onClick={saveHosting} disabled={saving}>{saving ? '◌ Saving...' : 'Save'}</button>
              <button className="btn-ghost" onClick={() => setEditTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
