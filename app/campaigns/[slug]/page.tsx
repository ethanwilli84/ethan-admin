'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { use } from 'react'

interface Stats { total: number; replied: number; responseRate: number; recentWeek: number; byCategory: {_id:string;count:number}[]; byStatus: {_id:string;count:number}[] }
interface Record { _id: string; date: string; name: string; category: string; website: string; emailsSent: string; status: string; note?: string }
interface Campaign { slug: string; name: string; icon: string; githubRepo: string; githubWorkflow: string }

const STATUS_COLORS: Record<string,string> = {
  'Sent':'text-blue-400','Replied':'text-green-400','No Contact Found':'text-zinc-500','Send Failed':'text-red-400'
}

export default function CampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [tab, setTab] = useState<'dashboard'|'outreach'|'settings'>('dashboard')
  const [stats, setStats] = useState<Stats|null>(null)
  const [records, setRecords] = useState<Record[]>([])
  const [campaign, setCampaign] = useState<Campaign|null>(null)
  const [filter, setFilter] = useState('All')
  const [selected, setSelected] = useState<Record|null>(null)
  const [note, setNote] = useState('')
  const [template, setTemplate] = useState('')
  const [triggering, setTriggering] = useState(false)
  const [triggerMsg, setTriggerMsg] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/campaigns').then(r=>r.json()).then((cs:Campaign[]) => {
      const c = cs.find(c=>c.slug===slug)
      if (c) setCampaign(c)
    })
    fetch(`/api/stats?campaign=${slug}`).then(r=>r.json()).then(setStats)
    fetch(`/api/outreach?campaign=${slug}`).then(r=>r.json()).then(setRecords)
    fetch(`/api/settings?campaign=${slug}`).then(r=>r.json()).then(d=>setTemplate(d.template))
  }, [slug])

  async function triggerRun() {
    if (!campaign) return
    setTriggering(true); setTriggerMsg('')
    const res = await fetch('/api/trigger', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ repo: campaign.githubRepo, workflow: campaign.githubWorkflow }) })
    const d = await res.json()
    setTriggerMsg(d.ok ? '✓ Run triggered' : '✗ Failed')
    setTriggering(false)
  }

  async function markReplied(rec: Record) {
    await fetch('/api/outreach', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id:rec._id,status:'Replied',note}) })
    setRecords(prev=>prev.map(r=>r._id===rec._id?{...r,status:'Replied',note}:r))
    setSelected(null)
  }

  async function saveTemplate() {
    await fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({campaign:slug,template}) })
    setSaved(true); setTimeout(()=>setSaved(false),2000)
  }

  const filtered = filter==='All' ? records : records.filter(r=>r.status===filter)
  const statuses = ['All','Sent','Replied','No Contact Found','Send Failed']

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-orange-500 font-bold tracking-widest text-sm uppercase hover:text-orange-400">Ethan Admin</Link>
          <span className="text-zinc-700 text-xs">/</span>
          <span className="text-zinc-300 text-sm">{campaign?.icon} {campaign?.name}</span>
        </div>
        <button onClick={triggerRun} disabled={triggering}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-xs font-bold px-4 py-2 transition-colors">
          {triggering ? 'RUNNING...' : '▶ RUN NOW'}
        </button>
      </header>

      {triggerMsg && <div className={`px-8 py-2 text-xs ${triggerMsg.startsWith('✓')?'bg-green-900/20 text-green-400':'bg-red-900/20 text-red-400'}`}>{triggerMsg}</div>}

      <div className="border-b border-zinc-800 px-8 flex gap-0">
        {(['dashboard','outreach','settings'] as const).map(t => (
          <button key={t} onClick={()=>setTab(t)}
            className={`px-4 py-3 text-xs uppercase tracking-widest transition-colors border-b-2 -mb-px ${tab===t?'border-orange-500 text-white':'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
            {t}
          </button>
        ))}
      </div>

      <main className="px-8 py-8 max-w-6xl mx-auto">
        {tab === 'dashboard' && stats && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[['Total Sent',stats.total],['Replies',stats.replied],['Response Rate',`${stats.responseRate}%`],['This Week',stats.recentWeek]].map(([label,value])=>(
                <div key={label as string} className="border border-zinc-800 p-6">
                  <p className="text-zinc-500 text-xs uppercase tracking-widest">{label}</p>
                  <p className="text-3xl font-bold mt-2">{value}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-zinc-800 p-6 space-y-4">
                <p className="text-xs uppercase tracking-widest text-zinc-500">By Category</p>
                {stats.byCategory.map(c=>(
                  <div key={c._id} className="flex items-center gap-3">
                    <span className="text-zinc-400 text-sm w-24 capitalize">{c._id}</span>
                    <div className="flex-1 bg-zinc-900 h-1.5">
                      <div className="bg-orange-500 h-1.5" style={{width:`${Math.min(100,(c.count/(stats.total||1))*100)}%`}}/>
                    </div>
                    <span className="text-sm text-zinc-400 w-4 text-right">{c.count}</span>
                  </div>
                ))}
              </div>
              <div className="border border-zinc-800 p-6 space-y-4">
                <p className="text-xs uppercase tracking-widest text-zinc-500">By Status</p>
                {stats.byStatus.map(s=>(
                  <div key={s._id} className="flex items-center justify-between">
                    <span className={`text-sm ${STATUS_COLORS[s._id]??'text-zinc-400'}`}>{s._id}</span>
                    <span className="text-sm font-bold">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'outreach' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-zinc-500 text-sm">{records.length} total records</p>
              <div className="flex gap-2">
                {statuses.map(s=>(
                  <button key={s} onClick={()=>setFilter(s)}
                    className={`text-xs px-3 py-1.5 border transition-colors ${filter===s?'border-orange-500 text-orange-500':'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="border border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-widest">
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Platform</th>
                    <th className="text-left px-4 py-3">Category</th>
                    <th className="text-left px-4 py-3">Emails</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length===0&&<tr><td colSpan={6} className="px-4 py-8 text-zinc-600 text-center">No records yet</td></tr>}
                  {filtered.map(rec=>(
                    <tr key={rec._id} className="border-b border-zinc-900 hover:bg-zinc-950 transition-colors">
                      <td className="px-4 py-3 text-zinc-400 text-xs">{rec.date}</td>
                      <td className="px-4 py-3"><a href={rec.website} target="_blank" className="hover:text-orange-400 transition-colors">{rec.name}</a></td>
                      <td className="px-4 py-3 text-zinc-400 capitalize text-xs">{rec.category}</td>
                      <td className="px-4 py-3 text-zinc-500 text-xs max-w-[180px] truncate">{rec.emailsSent}</td>
                      <td className={`px-4 py-3 text-xs ${STATUS_COLORS[rec.status]??'text-zinc-400'}`}>{rec.status}</td>
                      <td className="px-4 py-3">
                        {rec.status==='Sent'&&<button onClick={()=>{setSelected(rec);setNote(rec.note??'')}} className="text-xs text-zinc-500 hover:text-green-400 transition-colors">Mark replied</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <div className="space-y-8 max-w-2xl">
            <div className="border border-zinc-800 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-widest text-zinc-500">Pitch Template</p>
                <button onClick={saveTemplate} className="bg-orange-500 hover:bg-orange-400 text-black text-xs font-bold px-4 py-2">
                  {saved?'✓ SAVED':'SAVE'}
                </button>
              </div>
              <textarea value={template} onChange={e=>setTemplate(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 text-sm p-4 text-white resize-none h-80 focus:outline-none focus:border-zinc-600 font-mono leading-relaxed"/>
              <p className="text-zinc-600 text-xs">Subject: "Guest Appearance - Ethan Williams"</p>
            </div>
          </div>
        )}
      </main>

      {selected&&(
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-zinc-950 border border-zinc-700 p-8 w-full max-w-md space-y-4">
            <h2 className="font-bold text-sm">Mark as Replied — {selected.name}</h2>
            <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Add a note (optional)..."
              className="w-full bg-zinc-900 border border-zinc-700 text-sm p-3 text-white resize-none h-24 focus:outline-none"/>
            <div className="flex gap-3">
              <button onClick={()=>markReplied(selected)} className="bg-green-600 hover:bg-green-500 text-white text-sm px-4 py-2">Confirm</button>
              <button onClick={()=>setSelected(null)} className="text-zinc-400 hover:text-white text-sm px-4 py-2">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
