'use client'
import { useState, useEffect, useRef } from 'react'

interface PoolStats { total: number; pending: number; sources: { _id: string; count: number; pending: number }[] }
interface Lead { _id: string; name: string; website: string; email: string | null; category: string; source: string; status: string; score: number; campaigns: string[]; description: string; createdAt: string }

export default function LeadPoolPage() {
  const [stats, setStats] = useState<PoolStats | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [ingesting, setIngesting] = useState(false)
  const [ingestLog, setIngestLog] = useState<string[]>([])
  const [campaignFilter, setCampaignFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('pending')
  const [sourceFilter, setSourceFilter] = useState('')
  const [campaigns, setCampaigns] = useState<{ slug: string; name: string }[]>([])
  const [activeTab, setActiveTab] = useState<'pool' | 'ingest' | 'csv'>('ingest')
  const [csvContent, setCsvContent] = useState('')
  const [csvCampaigns, setCsvCampaigns] = useState<string[]>([])
  const [csvSource, setCsvSource] = useState('')
  const [uploadingCSV, setUploadingCSV] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadStats()
    loadLeads()
    fetch('/api/campaigns').then(r => r.json()).then((d: { slug: string; name: string }[]) => setCampaigns(d.map(c => ({ slug: c.slug, name: c.name }))))
  }, [])

  useEffect(() => { loadLeads() }, [campaignFilter, statusFilter, sourceFilter])

  async function loadStats() {
    const r = await fetch('/api/lead-sources')
    const d = await r.json()
    if (d.ok) setStats(d)
  }

  async function loadLeads() {
    setLoading(true)
    const params = new URLSearchParams({ status: statusFilter, limit: '100' })
    if (campaignFilter) params.set('campaign', campaignFilter)
    if (sourceFilter) params.set('source', sourceFilter)
    const r = await fetch('/api/lead-pool?' + params.toString())
    const d = await r.json()
    if (d.ok) setLeads(d.leads)
    setLoading(false)
  }

  async function autoDiscover() {
    if (!campaignFilter) return
    setIngesting(true)
    setIngestLog(['🤖 AI analyzing campaign for best lead sources...'])
    const camp = campaigns.find(c => c.slug === campaignFilter)
    const res = await fetch('/api/lead-discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignSlug: campaignFilter, campaignName: camp?.name || campaignFilter, perSession: 20, force: true })
    })
    const d = await res.json()
    setIngestLog(d.log || (d.ok ? ['Done: ' + d.finalCount + ' leads'] : ['Error: ' + d.error]))
    setIngesting(false)
    loadStats(); loadLeads()
  }

  async function ingest(sourceType: string) {
    setIngesting(true)
    setIngestLog(['Starting ' + sourceType + ' ingest...'])
    const selectedCampaigns = campaignFilter ? [campaignFilter] : campaigns.map(c => c.slug)
    const res = await fetch('/api/lead-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceType, campaigns: selectedCampaigns })
    })
    const d = await res.json()
    setIngestLog([d.ok ? ('Added ' + d.count + ' new leads (pool: ' + d.poolSize + ' total)') : ('Error: ' + d.error)])
    setIngesting(false)
    loadStats(); loadLeads()
  }

  async function uploadCSV() {
    if (!csvContent || !csvCampaigns.length) return
    setUploadingCSV(true)
    const res = await fetch('/api/lead-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceType: 'csv', csvContent, campaigns: csvCampaigns, source: csvSource || 'csv_upload' })
    })
    const d = await res.json()
    setIngestLog([d.ok ? ('Imported ' + d.count + ' leads from CSV') : ('Error: ' + d.error)])
    setCsvContent(''); setUploadingCSV(false); loadStats(); loadLeads()
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setCsvContent(ev.target?.result as string)
    reader.readAsText(file)
    if (!csvSource) setCsvSource(file.name.replace('.csv', ''))
  }

  const STATUS_COLOR: Record<string, string> = { pending: '#5B4FE9', contacted: '#f59e0b', replied: '#00C896', converted: '#00C896', skip: '#666' }
  const selectedCampName = campaigns.find(c => c.slug === campaignFilter)?.name || campaignFilter

  return (
    <div>
      <div className="page-header-bar">
        <div>
          <div className="page-title">Lead Pool</div>
          <div className="page-sub">
            {stats ? (stats.total.toLocaleString() + ' total · ' + stats.pending.toLocaleString() + ' pending') : 'Loading...'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)}
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--text)' }}>
            <option value="">All Campaigns</option>
            {campaigns.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--text)' }}>
            {['pending', 'contacted', 'replied', 'converted', 'skip', 'all'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="main">
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
            {([
              { label: 'Total Leads', value: stats.total.toLocaleString(), color: 'var(--text)' },
              { label: 'Pending', value: stats.pending.toLocaleString(), color: 'var(--accent)' },
              ...stats.sources.map(s => ({ label: s._id, value: s.pending + '/' + s.count, color: 'var(--text-3)' }))
            ] as { label: string; value: string | number; color: string }[]).map((card, i) => (
              <div key={i} className="card" style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase', marginBottom: 4 }}>{card.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: card.color }}>{card.value}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['ingest', 'csv', 'pool'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: '1px solid var(--border)', background: activeTab === t ? 'var(--accent)' : 'var(--surface-2)', color: activeTab === t ? '#fff' : 'var(--text-2)' }}>
              {t === 'pool' ? '🗂 Browse Pool' : t === 'ingest' ? '⚡ Fetch Sources' : '📤 CSV Upload'}
            </button>
          ))}
        </div>

        {activeTab === 'ingest' && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>Pull structured leads from free databases — replaces Claude web research with deterministic data sources.</div>

            <div style={{ marginBottom: 16, background: 'rgba(91,79,233,0.08)', borderRadius: 10, padding: 14, border: '1px solid rgba(91,79,233,0.2)' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>🤖 Auto-Discover (recommended)</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10 }}>AI picks the best free databases for your campaign, runs them in priority order. Automatically uses iTunes for podcasts, FDIC for banking, SEC/GLEIF for investors.</div>
              <button className="btn-primary" style={{ fontSize: 12 }} disabled={ingesting || !campaignFilter} onClick={autoDiscover}>
                {ingesting ? '◌ Discovering...' : campaignFilter ? ('Auto-Discover for ' + selectedCampName) : 'Select a campaign above first'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { id: 'itunes_podcasts', icon: '🎙', title: 'iTunes Podcasts', sub: 'Free · unlimited · RSS email extraction' },
                { id: 'fdic_banks', icon: '🏦', title: 'FDIC Bank Database', sub: 'Free · 4,000+ community banks' },
              ].map(src => (
                <div key={src.id} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 14, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{src.icon}</div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{src.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10 }}>{src.sub}</div>
                  <button className="btn-ghost" style={{ fontSize: 11 }} disabled={ingesting} onClick={() => ingest(src.id)}>Fetch →</button>
                </div>
              ))}
            </div>

            {ingestLog.length > 0 && (
              <div style={{ marginTop: 14, background: '#0d0d0d', borderRadius: 8, padding: 12, fontFamily: 'var(--font-dm-mono)', fontSize: 11, maxHeight: 200, overflowY: 'auto' }}>
                {ingestLog.map((l, i) => (
                  <div key={i} style={{ color: l.includes('✓') || l.includes('Done') ? '#4ade80' : l.includes('✗') || l.includes('Error') ? '#f87171' : l.includes('⚠') ? '#fbbf24' : '#d1d5db' }}>{l}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'csv' && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>Import any CSV — Apollo.io exports, LinkedIn Sales Nav, manual lists. Needs: name, website columns. Optional: email, category, description.</div>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{ display: 'none' }} />
            <button className="btn-ghost" style={{ marginBottom: 12, fontSize: 13 }} onClick={() => fileRef.current?.click()}>
              {csvContent ? ('✓ ' + (csvContent.split('\n').length - 1) + ' rows loaded') : '📎 Upload CSV file...'}
            </button>
            {csvContent && <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)', marginBottom: 12 }}>Headers: {csvContent.split('\n')[0]}</div>}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Assign to campaigns:</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {campaigns.map(c => (
                  <button key={c.slug} onClick={() => setCsvCampaigns(prev => prev.includes(c.slug) ? prev.filter(s => s !== c.slug) : [...prev, c.slug])}
                    style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer', border: '1px solid var(--border)', background: csvCampaigns.includes(c.slug) ? 'var(--accent)' : 'var(--surface-2)', color: csvCampaigns.includes(c.slug) ? '#fff' : 'var(--text-2)' }}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <input value={csvSource} onChange={e => setCsvSource(e.target.value)} placeholder="Source label (e.g. apollo_export)"
              style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
            <button className="btn-primary" onClick={uploadCSV} disabled={uploadingCSV || !csvContent || !csvCampaigns.length}>
              {uploadingCSV ? '◌ Importing...' : 'Import ' + (csvContent ? csvContent.split('\n').length - 1 : 0) + ' leads'}
            </button>
            {ingestLog.length > 0 && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--green)', fontFamily: 'var(--font-dm-mono)' }}>{ingestLog[ingestLog.length - 1]}</div>}
          </div>
        )}

        {activeTab === 'pool' && (
          <div className="card">
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>{leads.length} leads shown</div>
            {loading ? <div style={{ color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)', fontSize: 12 }}>◌ Loading...</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Name', 'Category', 'Email', 'Source', 'Status', 'Score'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.map(lead => (
                    <tr key={lead._id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '7px 10px', fontWeight: 600 }}>
                        {lead.website ? <a href={lead.website} target="_blank" style={{ color: 'var(--accent)', textDecoration: 'none' }}>{lead.name}</a> : lead.name}
                      </td>
                      <td style={{ padding: '7px 10px', color: 'var(--text-3)' }}>{lead.category}</td>
                      <td style={{ padding: '7px 10px', color: lead.email ? 'var(--green)' : 'var(--text-3)', fontFamily: 'var(--font-dm-mono)', fontSize: 11 }}>{lead.email || '—'}</td>
                      <td style={{ padding: '7px 10px', color: 'var(--text-3)' }}>{lead.source}</td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{ fontSize: 10, background: (STATUS_COLOR[lead.status] || '#666') + '22', color: STATUS_COLOR[lead.status] || '#666', border: '1px solid ' + (STATUS_COLOR[lead.status] || '#666') + '44', borderRadius: 10, padding: '2px 7px', fontFamily: 'var(--font-dm-mono)' }}>{lead.status}</span>
                      </td>
                      <td style={{ padding: '7px 10px', fontFamily: 'var(--font-dm-mono)', color: lead.score >= 70 ? 'var(--green)' : 'var(--text-3)' }}>{lead.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
