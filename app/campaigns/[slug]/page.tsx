'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { use } from 'react'

interface Stats { total: number; replied: number; responseRate: number; recentWeek: number; byCategory: {_id:string;count:number}[]; byStatus: {_id:string;count:number}[] }
interface Rec { _id: string; date: string; name: string; category: string; website: string; emailsSent: string; status: string; note?: string }
interface Campaign { slug: string; name: string; icon: string; githubRepo: string; githubWorkflow: string }

const STATUS_CLASS: Record<string,string> = { 'Sent':'status-sent','Replied':'status-replied','No Contact Found':'status-nocontact','Send Failed':'status-failed' }

export default function CampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [tab, setTab] = useState<'dashboard'|'outreach'|'settings'>('dashboard')
  const [stats, setStats] = useState<Stats|null>(null)
  const [records, setRecords] = useState<Rec[]>([])
  const [campaign, setCampaign] = useState<Campaign|null>(null)
  const [filter, setFilter] = useState('All')
  const [selected, setSelected] = useState<Rec|null>(null)
  const [note, setNote] = useState('')
  const [template, setTemplate] = useState('')
  const [triggering, setTriggering] = useState(false)
  const [triggerMsg, setTriggerMsg] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/campaigns').then(r=>r.json()).then((cs:Campaign[]) => setCampaign(cs.find(c=>c.slug===slug)||null))
    fetch(`/api/stats?campaign=${slug}`).then(r=>r.json()).then(setStats)
    fetch(`/api/outreach?campaign=${slug}`).then(r=>r.json()).then(setRecords)
    fetch(`/api/settings?campaign=${slug}`).then(r=>r.json()).then(d=>setTemplate(d.template))
  }, [slug])

  async function triggerRun() {
    if (!campaign) return
    setTriggering(true); setTriggerMsg('')
    const res = await fetch('/api/trigger', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({repo:campaign.githubRepo,workflow:campaign.githubWorkflow}) })
    const d = await res.json()
    setTriggerMsg(d.ok ? '✓ Run triggered — check GitHub Actions' : '✗ Failed to trigger')
    setTriggering(false)
  }

  async function markReplied(rec: Rec) {
    await fetch('/api/outreach', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id:rec._id,status:'Replied',note}) })
    setRecords(prev=>prev.map(r=>r._id===rec._id?{...r,status:'Replied',note}:r))
    setSelected(null)
  }

  async function saveTemplate() {
    await fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({campaign:slug,template}) })
    setSaved(true); setTimeout(()=>setSaved(false),2000)
  }

  const statuses = ['All','Sent','Replied','No Contact Found','Send Failed']
  const filtered = filter==='All' ? records : records.filter(r=>r.status===filter)

  return (
    <div>
      <header className="header">
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <Link href="/" className="header-brand">Ethan Admin</Link>
          <span className="header-sep">/</span>
          <span className="header-page">{campaign?.icon} {campaign?.name}</span>
        </div>
        <button className="btn-orange" onClick={triggerRun} disabled={triggering}>
          {triggering ? 'RUNNING...' : '▶ RUN NOW'}
        </button>
      </header>

      {triggerMsg && <div className={triggerMsg.startsWith('✓') ? 'msg-success' : 'msg-error'} style={{padding:'8px 32px'}}>{triggerMsg}</div>}

      <div className="tabs" style={{padding:'0 32px'}}>
        {(['dashboard','outreach','settings'] as const).map(t => (
          <button key={t} className={`tab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="main">
        {tab==='dashboard' && stats && (
          <div>
            <div className="card-grid card-grid-4 space-32">
              {[['Total Sent',stats.total],['Replies',stats.replied],['Response Rate',`${stats.responseRate}%`],['This Week',stats.recentWeek]].map(([l,v])=>(
                <div key={l as string} className="card">
                  <div className="stat-label">{l}</div>
                  <div className="stat-value">{v}</div>
                </div>
              ))}
            </div>
            <div className="grid-2">
              <div className="card">
                <div className="section-label">By Category</div>
                {stats.byCategory.map(c=>(
                  <div key={c._id} className="bar-row">
                    <span className="bar-label">{c._id}</span>
                    <div className="bar-track"><div className="bar-fill" style={{width:`${Math.min(100,(c.count/(stats.total||1))*100)}%`}}/></div>
                    <span className="bar-count">{c.count}</span>
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="section-label">By Status</div>
                {stats.byStatus.map(s=>(
                  <div key={s._id} className="status-row">
                    <span className={`${STATUS_CLASS[s._id]||''}`} style={{fontSize:13}}>{s._id}</span>
                    <span className="status-row-val">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab==='outreach' && (
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <span className="page-sub">{records.length} total records</span>
              <div className="filters">
                {statuses.map(s=>(
                  <button key={s} className={`chip ${filter===s?'active':''}`} onClick={()=>setFilter(s)}>{s}</button>
                ))}
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Platform</th><th>Category</th><th>Emails</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {filtered.length===0&&<tr><td colSpan={6} className="td-empty">No records yet</td></tr>}
                  {filtered.map(rec=>(
                    <tr key={rec._id}>
                      <td className="td-date">{rec.date}</td>
                      <td><a href={rec.website} target="_blank" className="td-link">{rec.name}</a></td>
                      <td className="td-sub" style={{textTransform:'capitalize'}}>{rec.category}</td>
                      <td className="td-sub">{rec.emailsSent}</td>
                      <td className={STATUS_CLASS[rec.status]||''} style={{fontSize:11}}>{rec.status}</td>
                      <td>{rec.status==='Sent'&&<button className="td-action" onClick={()=>{setSelected(rec);setNote(rec.note||'')}}>Mark replied</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab==='settings' && (
          <div style={{maxWidth:680}}>
            <div className="card">
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                <span className="section-label">Pitch Template</span>
                <button className="btn-orange" onClick={saveTemplate}>{saved?'✓ SAVED':'SAVE'}</button>
              </div>
              <textarea className="textarea" style={{height:320}} value={template} onChange={e=>setTemplate(e.target.value)}/>
              <div style={{marginTop:8,color:'#3f3f46',fontSize:11}}>Subject: "Guest Appearance - Ethan Williams"</div>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">Mark as Replied</div>
            <div className="modal-sub">{selected.name}</div>
            <textarea className="textarea" style={{height:96}} value={note} onChange={e=>setNote(e.target.value)} placeholder="Add a note (optional)..."/>
            <div className="modal-actions">
              <button className="btn-green" onClick={()=>markReplied(selected)}>Confirm</button>
              <button className="btn-cancel" onClick={()=>setSelected(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
