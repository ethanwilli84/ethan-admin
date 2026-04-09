'use client'
import { useState, useEffect, useRef } from 'react'

type ContentType = 'youtube' | 'gdoc' | 'file' | 'link' | 'note'
interface ContentItem {
  _id: string; type: ContentType; title: string; url: string; description: string; tags: string[]
  videoId?: string; embedUrl?: string; thumbnailUrl?: string; docId?: string
  fileName?: string; fileType?: string; fileData?: string; createdAt: string
}

const TYPE_CONFIG = {
  youtube: { label: 'YouTube Video', icon: '▶️', color: '#ff0000' },
  gdoc: { label: 'Google Doc', icon: '📄', color: '#4285F4' },
  file: { label: 'File Upload', icon: '📎', color: '#5B4FE9' },
  link: { label: 'Link', icon: '🔗', color: '#00C896' },
  note: { label: 'Apple Note', icon: '📝', color: '#f59e0b' },
}

export default function ContentPage() {
  const [items, setItems] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addType, setAddType] = useState<ContentType>('youtube')
  const [form, setForm] = useState({ title: '', url: '', description: '', tags: '' })
  const [adding, setAdding] = useState(false)
  const [preview, setPreview] = useState<ContentItem | null>(null)
  const [filter, setFilter] = useState<ContentType | 'all'>('all')
  const [search, setSearch] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [fileData, setFileData] = useState<{ data: string; name: string; type: string } | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/content')
    const d = await res.json()
    if (d.ok) setItems(d.items)
    setLoading(false)
  }

  async function handleAdd() {
    if (!form.title) return
    setAdding(true)
    const body: Record<string, unknown> = {
      type: addType, title: form.title, url: form.url,
      description: form.description, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
    }
    if (addType === 'file' && fileData) {
      body.fileData = fileData.data; body.fileName = fileData.name; body.fileType = fileData.type
    }
    await fetch('/api/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setForm({ title: '', url: '', description: '', tags: '' })
    setFileData(null); setShowAdd(false); setAdding(false); load()
  }

  async function handleDelete(id: string) {
    await fetch('/api/content', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    load()
  }

  async function autoAnalyze(type: ContentType, url: string) {
    if (!url || type === 'file') return
    setAnalyzing(true)
    try {
      const res = await fetch('/api/content-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, url })
      })
      const d = await res.json()
      if (d.ok) {
        setForm(p => ({
          ...p,
          title: d.title || p.title,
          description: d.description || p.description,
          tags: d.tags?.join(', ') || p.tags,
        }))
      }
    } catch {}
    setAnalyzing(false)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setFileData({ data: ev.target?.result as string, name: file.name, type: file.type })
    reader.readAsDataURL(file)
    if (!form.title) setForm(p => ({ ...p, title: file.name }))
  }

  const filtered = items.filter(item =>
    (filter === 'all' || item.type === filter) &&
    (!search || item.title.toLowerCase().includes(search.toLowerCase()) || item.description?.toLowerCase().includes(search.toLowerCase()))
  )

  const counts = { all: items.length, youtube: items.filter(i => i.type === 'youtube').length, gdoc: items.filter(i => i.type === 'gdoc').length, file: items.filter(i => i.type === 'file').length, link: items.filter(i => i.type === 'link').length, note: items.filter(i => i.type === 'note').length }

  return (
    <div>
      <div className="page-header-bar">
        <div>
          <div className="page-title">Content</div>
          <div className="page-sub">{items.length} pieces · YouTube, Google Docs, files</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', width: 180 }} />
          <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Content</button>
        </div>
      </div>

      <div className="main">
        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {(['all', 'youtube', 'gdoc', 'file', 'link', 'note'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontFamily: 'var(--font-dm-mono)', cursor: 'pointer', border: '1px solid var(--border)', background: filter === f ? 'var(--accent)' : 'var(--surface-2)', color: filter === f ? '#fff' : 'var(--text-2)' }}>
              {f === 'all' ? `All (${counts.all})` : `${TYPE_CONFIG[f].icon} ${TYPE_CONFIG[f].label} (${counts[f]})`}
            </button>
          ))}
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)' }}>◌ Loading...</div>}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
            <div style={{ color: 'var(--text-3)', fontSize: 14 }}>No content yet</div>
            <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => setShowAdd(true)}>Add your first piece</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filtered.map(item => (
            <div key={item._id} className="card" style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer' }} onClick={() => setPreview(item)}>
              {/* YouTube thumbnail */}
              {item.type === 'youtube' && item.thumbnailUrl && (
                <div style={{ marginBottom: 12, borderRadius: 8, overflow: 'hidden', aspectRatio: '16/9', background: '#000', position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.thumbnailUrl} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
                    <div style={{ width: 48, height: 48, background: '#ff0000', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>▶</div>
                  </div>
                </div>
              )}

              {/* GDoc icon */}
              {item.type === 'note' && (
                <div style={{ marginBottom: 12, height: 60, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📝</div>
              )}
              {item.type === 'gdoc' && (
                <div style={{ marginBottom: 12, height: 60, background: 'rgba(66,133,244,0.08)', border: '1px solid rgba(66,133,244,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📄</div>
              )}

              {/* File icon */}
              {item.type === 'file' && (
                <div style={{ marginBottom: 12, height: 60, background: 'rgba(91,79,233,0.08)', border: '1px solid rgba(91,79,233,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px' }}>
                  <span style={{ fontSize: 24 }}>📎</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)' }}>{item.fileName}</span>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                  {item.description && <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.description}</div>}
                </div>
                <span style={{ fontSize: 9, background: `${TYPE_CONFIG[item.type as keyof typeof TYPE_CONFIG]?.color}22`, color: TYPE_CONFIG[item.type as keyof typeof TYPE_CONFIG]?.color, border: `1px solid ${TYPE_CONFIG[item.type as keyof typeof TYPE_CONFIG]?.color}44`, borderRadius: 10, padding: '2px 7px', fontFamily: 'var(--font-dm-mono)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {TYPE_CONFIG[item.type as keyof typeof TYPE_CONFIG]?.label || item.type}
                </span>
              </div>

              {item.tags?.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                  {item.tags.map(t => <span key={t} style={{ fontSize: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '1px 7px', color: 'var(--text-3)' }}>{t}</span>)}
                </div>
              )}

              <button onClick={e => { e.stopPropagation(); handleDelete(item._id) }}
                style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.2)', borderRadius: 6, color: '#ff5050', cursor: 'pointer', fontSize: 11, padding: '2px 8px', opacity: 0 }}
                className="delete-btn">✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Preview modal */}
      {preview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={() => setPreview(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 760, maxHeight: '90vh', overflow: 'auto', padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 18 }}>{preview.title}</div>
              <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-3)' }}>✕</button>
            </div>

            {preview.type === 'youtube' && preview.embedUrl && (
              <div style={{ aspectRatio: '16/9', marginBottom: 16, borderRadius: 10, overflow: 'hidden' }}>
                <iframe src={preview.embedUrl} style={{ width: '100%', height: '100%', border: 'none' }} allowFullScreen />
              </div>
            )}

            {preview.type === 'note' && (
              <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 10, padding: 20, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.8, maxHeight: 400, overflowY: 'auto' }}>
                {preview.description}
              </div>
            )}
            {preview.type === 'gdoc' && preview.embedUrl && (
              <div style={{ height: 500, marginBottom: 16, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <iframe src={preview.embedUrl} style={{ width: '100%', height: '100%', border: 'none' }} />
              </div>
            )}

            {preview.type === 'file' && preview.fileData && (
              <div style={{ marginBottom: 16, textAlign: 'center' }}>
                <a href={preview.fileData} download={preview.fileName} className="btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>⬇ Download {preview.fileName}</a>
              </div>
            )}

            {preview.description && <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 12 }}>{preview.description}</p>}
            {preview.url && <a href={preview.url} target="_blank" style={{ fontSize: 13, color: 'var(--accent)' }}>Open original →</a>}
          </div>
        </div>
      )}

      {/* Add content modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={() => setShowAdd(false)}>
          <div className="card" style={{ width: '100%', maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Add Content</div>

            {/* Type selector */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              {(['youtube', 'gdoc', 'file', 'link'] as ContentType[]).map(t => (
                <button key={t} onClick={() => setAddType(t)}
                  style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: '1px solid var(--border)', background: addType === t ? 'var(--accent)' : 'var(--surface-2)', color: addType === t ? '#fff' : 'var(--text-2)' }}>
                  {TYPE_CONFIG[t].icon} {TYPE_CONFIG[t].label}
                </button>
              ))}
            </div>

            {/* Form fields */}
            {[
              { label: 'Title', key: 'title', placeholder: addType === 'youtube' ? 'Video title...' : addType === 'gdoc' ? 'Doc title...' : 'Title...' },
              ...(addType !== 'file' ? [{ label: addType === 'youtube' ? 'YouTube URL' : addType === 'gdoc' ? 'Google Doc URL' : 'URL', key: 'url', placeholder: addType === 'youtube' ? 'https://youtube.com/watch?v=...' : addType === 'gdoc' ? 'https://docs.google.com/document/d/...' : 'https://...' }] : []),
              { label: 'Description (optional)', key: 'description', placeholder: 'What is this about?' },
              { label: 'Tags (optional, comma-separated)', key: 'tags', placeholder: 'writing, fintech, podcast' },
            ].map(({ label, key, placeholder }) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>{label}</label>
                <input value={form[key as keyof typeof form]} 
                  onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  onBlur={e => { if (key === 'url' && e.target.value) autoAnalyze(addType, e.target.value) }}
                  onPaste={e => { if (key === 'url') { const pasted = e.clipboardData.getData('text'); setTimeout(() => autoAnalyze(addType, pasted), 100) } }}
                  placeholder={placeholder}
                  style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}

            {addType === 'file' && (
              <div style={{ marginBottom: 16 }}>
                <input ref={fileRef} type="file" onChange={handleFile} style={{ display: 'none' }} />
                <button className="btn-ghost" style={{ fontSize: 13, width: '100%' }} onClick={() => fileRef.current?.click()}>
                  {fileData ? `✓ ${fileData.name}` : '📎 Choose file...'}
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" onClick={handleAdd} disabled={adding || !form.title}>{adding ? '◌ Adding...' : 'Add'}</button>
              <button className="btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <style>{`.delete-btn { opacity: 0; } .card:hover .delete-btn { opacity: 1 !important; }`}</style>
    </div>
  )
}
