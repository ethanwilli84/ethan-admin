'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Issue {
  _id: string; title: string; description: string; channel: string
  from: string; product: string; category: string; severity: string
  status: string; resolution?: string; resolvedBy?: string; resolvedAt?: string
  createdAt: string; rawMessage: string; notes?: string[]
  linkedIssueIds?: string[]
}

const CHANNEL_ICON: Record<string,string> = { imessage:'💬', slack:'#', email_sire:'📧', email_sireapps:'📧', whatsapp:'📱', google_voice:'📞' }
const CHANNEL_LABEL: Record<string,string> = { imessage:'iMessage', slack:'Slack', email_sire:'Email (Sire)', email_sireapps:'Email (SireApps)', whatsapp:'WhatsApp', google_voice:'Google Voice' }
const SEV_COLOR: Record<string,string> = { critical:'#FF4757', high:'#ff7043', medium:'#f59e0b', low:'var(--green)' }
const SEV_BG: Record<string,string> = { critical:'rgba(255,71,87,0.1)', high:'rgba(255,112,67,0.1)', medium:'rgba(245,158,11,0.08)', low:'rgba(0,200,150,0.08)' }
const PRODUCT_COLOR: Record<string,string> = { sire:'#00D4FF', alpine:'#5B4FE9', both:'#7B6FF0', unknown:'var(--text-3)' }

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([])
  const [counts, setCounts] = useState<{_id:string;count:number}[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [selected, setSelected] = useState<Issue|null>(null)
  const [noteInput, setNoteInput] = useState('')
  const [statusFilter, setStatusFilter] = useState('open')
  const [channelFilter, setChannelFilter] = useState('all')
  const [productFilter, setProductFilter] = useState('all')
  const [syncResult, setSyncResult] = useState<Record<string,number>|null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ status: statusFilter, limit: '100' })
    if (channelFilter !== 'all') params.set('channel', channelFilter)
    if (productFilter !== 'all') params.set('product', productFilter)
    const res = await fetch(`/api/issues?${params}`)
    const d = await res.json()
    setIssues(d.issues || [])
    setCounts(d.counts || [])
    setLoading(false)
  }, [statusFilter, channelFilter, productFilter])

  useEffect(() => { load() }, [load])

  async function runSync() {
    setSyncing(true); setSyncResult(null)
    const res = await fetch('/api/sync-issues')
    const d = await res.json()
    setSyncResult(d.synced)
    setSyncing(false)
    load()
  }

  async function resolveIssue(id: string, resolution: string) {
    await fetch('/api/issues', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'resolve', id, resolution }) })
    load(); setSelected(null)
  }

  async function dismissIssue(id: string) {
    await fetch('/api/issues', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'dismiss', id }) })
    load(); setSelected(null)
  }

  async function addNote(id: string) {
    if (!noteInput.trim()) return
    await fetch('/api/issues', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'note', id, note: noteInput }) })
    setNoteInput('')
    load()
    setSelected(issues.find(i => i._id === id) || null)
  }

  const countMap = Object.fromEntries(counts.map(c => [c._id, c.count]))
  const openCount = countMap['open'] || 0
  const criticalOpen = issues.filter(i => i.severity === 'critical' && i.status === 'open').length

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'28px 24px' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <Link href="/" style={{ color:'var(--text-3)', fontSize:13, textDecoration:'none' }}>← Admin</Link>
          <div style={{ fontFamily:'var(--font-syne)', fontWeight:700, fontSize:22, marginTop:4, display:'flex', alignItems:'center', gap:10 }}>
            Issues
            {openCount > 0 && <span style={{ fontSize:12, background:'var(--red)', color:'#fff', borderRadius:20, padding:'2px 8px', fontFamily:'var(--font-dm-mono)', fontWeight:600 }}>{openCount} open</span>}
            {criticalOpen > 0 && <span style={{ fontSize:11, background:'rgba(255,71,87,0.15)', color:'var(--red)', borderRadius:20, padding:'2px 8px', fontFamily:'var(--font-dm-mono)', border:'1px solid rgba(255,71,87,0.3)' }}>🚨 {criticalOpen} critical</span>}
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {syncResult && <span style={{ fontSize:11, color:'var(--green)', fontFamily:'var(--font-dm-mono)' }}>
            +{Object.values(syncResult).reduce((a,b)=>a+b,0)} synced
          </span>}
          <button className="btn-primary" style={{ fontSize:12 }} onClick={runSync} disabled={syncing}>
            {syncing ? '◌ Syncing...' : '↺ Sync All Channels'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {[['open','Open'], ['in_progress','In Progress'], ['resolved','Resolved'], ['all','All']].map(([val,label]) => (
          <button key={val} className={statusFilter===val?'chip active':'chip'} onClick={()=>setStatusFilter(val)}>{label}{val==='open'&&countMap['open']?` (${countMap['open']})`:''}</button>
        ))}
        <div style={{ width:1, background:'var(--border)', margin:'0 4px' }}/>
        {[['all','All Channels'], ['imessage','💬 iMessage'], ['slack','# Slack'], ['email_sire','📧 Email']].map(([val,label]) => (
          <button key={val} className={channelFilter===val?'chip active':'chip'} style={{fontSize:11}} onClick={()=>setChannelFilter(val)}>{label}</button>
        ))}
        <div style={{ width:1, background:'var(--border)', margin:'0 4px' }}/>
        {[['all','All'], ['sire','Sire'], ['alpine','Alpine']].map(([val,label]) => (
          <button key={val} className={productFilter===val?'chip active':'chip'} style={{fontSize:11}} onClick={()=>setProductFilter(val)}>{label}</button>
        ))}
      </div>

      {/* Sync result toast */}
      {syncResult && (
        <div style={{ padding:'10px 14px', borderRadius:8, background:'rgba(0,200,150,0.08)', border:'1px solid rgba(0,200,150,0.2)', marginBottom:16, fontSize:12, fontFamily:'var(--font-dm-mono)', display:'flex', gap:16 }}>
          {Object.entries(syncResult).map(([ch,n]) => <span key={ch}><span style={{color:'var(--green)'}}>{n}</span> {ch}</span>)}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap:16 }}>
        {/* Issue list */}
        <div>
          {loading && <div style={{ textAlign:'center', padding:40, color:'var(--text-3)', fontFamily:'var(--font-dm-mono)', fontSize:12 }}>◌ Loading...</div>}
          {!loading && issues.length === 0 && (
            <div className="card" style={{ textAlign:'center', padding:40, color:'var(--text-3)' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
              <div style={{ fontSize:14, fontWeight:600 }}>No {statusFilter} issues</div>
              <div style={{ fontSize:12, marginTop:4 }}>Hit "Sync All Channels" to check for new issues</div>
            </div>
          )}
          {issues.map(issue => (
            <div key={issue._id}
              onClick={() => setSelected(selected?._id === issue._id ? null : issue)}
              style={{
                padding:'12px 16px', borderRadius:10, marginBottom:8, cursor:'pointer',
                background: selected?._id === issue._id ? 'var(--surface-2)' : 'var(--surface)',
                border:`1px solid ${selected?._id===issue._id?'var(--accent)':SEV_COLOR[issue.severity]+'33'}`,
                transition:'all 0.15s',
              }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                {/* Severity dot */}
                <div style={{ width:8, height:8, borderRadius:'50%', background:SEV_COLOR[issue.severity], flexShrink:0, animation:issue.severity==='critical'?'pulse 1s infinite':'none' }}/>
                {/* Channel badge */}
                <span style={{ fontSize:10, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:4, padding:'1px 6px', fontFamily:'var(--font-dm-mono)', flexShrink:0 }}>
                  {CHANNEL_ICON[issue.channel]} {CHANNEL_LABEL[issue.channel]}
                </span>
                {/* Product badge */}
                <span style={{ fontSize:10, color:PRODUCT_COLOR[issue.product], fontFamily:'var(--font-dm-mono)', fontWeight:600, flexShrink:0 }}>
                  {issue.product?.toUpperCase()}
                </span>
                <span style={{ fontSize:10, background:SEV_BG[issue.severity], color:SEV_COLOR[issue.severity], borderRadius:4, padding:'1px 6px', fontFamily:'var(--font-dm-mono)', flexShrink:0 }}>
                  {issue.severity}
                </span>
                <span style={{ fontSize:10, color:'var(--text-3)', marginLeft:'auto', flexShrink:0 }}>
                  {new Date(issue.createdAt).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
                </span>
              </div>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:2 }}>{issue.title}</div>
              <div style={{ fontSize:11, color:'var(--text-3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                <strong style={{color:'var(--text-2)'}}>{issue.from}</strong> · {issue.rawMessage.substring(0,100)}
              </div>
              {issue.status === 'resolved' && (
                <div style={{ fontSize:10, color:'var(--green)', marginTop:4 }}>
                  ✓ {issue.resolvedBy === 'imessage_reply' ? 'Replied via iMessage' : issue.resolvedBy === 'slack_reply' ? 'Replied in Slack' : issue.resolution || 'Resolved'}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="card" style={{ position:'sticky', top:24, maxHeight:'80vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
              <span style={{ fontSize:10, fontFamily:'var(--font-dm-mono)', color:'var(--text-3)' }}>{CHANNEL_ICON[selected.channel]} {CHANNEL_LABEL[selected.channel]}</span>
              <button onClick={()=>setSelected(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', fontSize:14 }}>✕</button>
            </div>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>{selected.title}</div>
            <div style={{ fontSize:11, color:'var(--text-3)', marginBottom:12 }}>
              From: <strong style={{color:'var(--text-2)'}}>{selected.from}</strong> · {new Date(selected.createdAt).toLocaleString('en-US',{timeZone:'America/New_York'})}
            </div>

            <div style={{ background:'var(--surface-2)', borderRadius:8, padding:'10px 12px', fontSize:12, lineHeight:1.7, marginBottom:14, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
              {selected.rawMessage}
            </div>

            <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
              <span style={{ fontSize:10, background:SEV_BG[selected.severity], color:SEV_COLOR[selected.severity], borderRadius:4, padding:'2px 8px', fontFamily:'var(--font-dm-mono)' }}>{selected.severity}</span>
              <span style={{ fontSize:10, color:PRODUCT_COLOR[selected.product], fontFamily:'var(--font-dm-mono)', fontWeight:600 }}>{selected.product}</span>
              <span style={{ fontSize:10, background:'var(--surface-2)', borderRadius:4, padding:'2px 8px', fontFamily:'var(--font-dm-mono)' }}>{selected.category}</span>
            </div>

            {/* Notes */}
            {(selected.notes?.length || 0) > 0 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, color:'var(--text-3)', marginBottom:6, fontFamily:'var(--font-dm-mono)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Notes</div>
                {selected.notes!.map((n,i) => <div key={i} style={{ fontSize:12, padding:'4px 0', borderBottom:'1px solid var(--border)' }}>• {n}</div>)}
              </div>
            )}

            {/* Add note */}
            <div style={{ marginBottom:12 }}>
              <input value={noteInput} onChange={e=>setNoteInput(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter') addNote(selected._id) }}
                placeholder="Add note... (Enter to save)"
                style={{ width:'100%', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 10px', fontSize:12, color:'var(--text)', outline:'none', boxSizing:'border-box' }}
              />
            </div>

            {/* Actions */}
            {selected.status === 'open' && (
              <div style={{ display:'flex', gap:6, flexDirection:'column' }}>
                <button className="btn-primary" style={{fontSize:12}} onClick={()=>resolveIssue(selected._id, 'Manually resolved')}>✓ Mark Resolved</button>
                <button className="btn-ghost" style={{fontSize:12}} onClick={()=>dismissIssue(selected._id)}>Dismiss (not an issue)</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
