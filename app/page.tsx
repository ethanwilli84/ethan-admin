'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'

interface CampaignOps {
  slug: string; name: string; icon: string; active: boolean; paused: boolean
  runStatus: 'idle'|'running'|'queued'|'done_today'|'not_in_run'
  sentToday: number; failedToday: number; noContactToday: number; totalSent: number
  perSession: number; sendTime: string
}
interface OpsData {
  ok: boolean; fetchedAt: string; campaigns: CampaignOps[]
  liveLogLines: string[]; activeLock: {campaign:string;acquiredAt:string}|null
  runs: {id:number;status:string;conclusion:string|null;createdAt:string}[]
  activeRun: {id:number;status:string;createdAt:string}|null
  cronInfo: {schedule:string;nextRunUTC:string;estimatedDuration:string}
  summary: {totalSentToday:number;anyRunning:boolean;anyQueued:boolean}
}
interface ChatMsg { role: 'user'|'assistant'; content: string }
interface Generated { name:string;slug:string;description:string;icon:string;researchPrompt:string;template:string;sendTime:string;sendDays:string[];perSession:number;suggestedEndDate:string|null;rationale:string }

const STATUS_CONFIG = {
  running:      { label:'● RUNNING',     color:'var(--green)',   bg:'rgba(0,200,150,0.1)',  border:'rgba(0,200,150,0.3)' },
  queued:       { label:'⏳ QUEUED',     color:'#f59e0b',        bg:'rgba(245,158,11,0.08)',border:'rgba(245,158,11,0.2)' },
  done_today:   { label:'✓ DONE',        color:'var(--green)',   bg:'rgba(0,200,150,0.06)', border:'rgba(0,200,150,0.15)'},
  not_in_run:   { label:'—',             color:'var(--text-3)',  bg:'transparent',          border:'transparent' },
  idle:         { label:'—',             color:'var(--text-3)',  bg:'transparent',          border:'transparent' },
}

export default function Home() {
  const [ops, setOps] = useState<OpsData|null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreator, setShowCreator] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [objective, setObjective] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<Generated|null>(null)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)

  const loadOps = useCallback(async () => {
    try {
      const d: OpsData = await fetch('/api/ops-status').then(r => r.json())
      setOps(d)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    loadOps()
    const iv = setInterval(loadOps, 30000)
    return () => clearInterval(iv)
  }, [loadOps])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [ops?.liveLogLines])

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [chatHistory])

  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return
    const msg = chatInput.trim()
    setChatInput('')
    setChatLoading(true)
    const newHistory: ChatMsg[] = [...chatHistory, { role: 'user', content: msg }]
    setChatHistory(newHistory)
    try {
      const res = await fetch('/api/ops-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history: chatHistory })
      })
      const d = await res.json()
      setChatHistory([...newHistory, { role: 'assistant', content: d.reply }])
    } catch {
      setChatHistory([...newHistory, { role: 'assistant', content: 'Error — try again' }])
    }
    setChatLoading(false)
  }

  async function generate() {
    if (!objective.trim()) return
    setGenerating(true); setGenerated(null)
    const res = await fetch('/api/generate-campaign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({objective})})
    const d = await res.json()
    if (d.ok) setGenerated(d.campaign)
    setGenerating(false)
  }

  async function createCampaign() {
    if (!generated) return
    setCreating(true)
    await fetch('/api/campaigns',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:generated.name,slug:generated.slug,description:generated.description,icon:generated.icon,active:true,githubRepo:'ethanwilli84/influence-outreach',githubWorkflow:'daily_outreach.yml'})})
    await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaign:generated.slug,researchObjective:generated.researchPrompt,template:generated.template,sendTime:generated.sendTime,sendDays:generated.sendDays,perSession:generated.perSession,endDate:generated.suggestedEndDate,paused:false})})
    setCreated(true); setCreating(false)
    setTimeout(()=>{setShowCreator(false);setCreated(false);setGenerated(null);setObjective('');loadOps()},1500)
  }

  const anyRunning = ops?.summary.anyRunning
  const nextRun = ops ? new Date(ops.cronInfo.nextRunUTC).toLocaleString('en-US',{timeZone:'America/New_York',weekday:'short',hour:'numeric',minute:'2-digit'}) : '—'

  return (
    <div>
      <div className="page-header-bar">
        <div>
          <div className="page-title">Campaigns</div>
          <div className="page-sub" style={{display:'flex',alignItems:'center',gap:10}}>
            {anyRunning
              ? <span style={{color:'var(--green)',fontWeight:600}}>● Running now</span>
              : <span>Next run: {nextRun} ET</span>
            }
            {ops && <span style={{color:'var(--text-3)'}}>· {ops.summary.totalSentToday} sent today</span>}
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn-ghost" style={{fontSize:12}} onClick={()=>setChatOpen(v=>!v)}>🤖 Ask AI</button>
          <button className="btn-ghost" style={{fontSize:12}} onClick={()=>setShowLogs(v=>!v)}>📋 Live Logs</button>
          <button className="btn-primary" onClick={()=>setShowCreator(!showCreator)}>+ New Campaign</button>
        </div>
      </div>

      <div className="main">

        {/* Live logs panel */}
        {showLogs && ops && (
          <div className="card fade-up" style={{marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span className="section-label">Live Logs</span>
                {ops.activeRun && <span style={{fontSize:11,fontFamily:'var(--font-dm-mono)',color:ops.activeRun.status==='in_progress'?'var(--green)':'var(--text-3)'}}>
                  {ops.activeRun.status === 'in_progress' ? '● RUNNING' : '✓ Last run'} · started {new Date(ops.activeRun.createdAt).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'})} ET
                </span>}
              </div>
              <button onClick={loadOps} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',fontSize:12}}>↺ Refresh</button>
            </div>
            <div ref={logRef} style={{
              background:'#0d0d0d',borderRadius:8,padding:'10px 14px',
              height:220,overflowY:'auto',fontFamily:'var(--font-dm-mono)',
              fontSize:11,lineHeight:1.6,
            }}>
              {ops.liveLogLines.length === 0
                ? <span style={{color:'#555'}}>No logs available — logs appear after a run starts</span>
                : ops.liveLogLines.map((line, i) => {
                    const color = line.includes('✓ Sent') || line.includes('Done') ? '#4ade80'
                      : line.includes('⏭') ? '#9ca3af'
                      : line.includes('✗') || line.includes('Error') || line.includes('Failed') ? '#f87171'
                      : line.includes('Running:') || line.includes('Batch') ? '#60a5fa'
                      : line.includes('⚠') || line.includes('WARNING') ? '#fbbf24'
                      : '#d1d5db'
                    return <div key={i} style={{color}}>{line}</div>
                  })
              }
            </div>
          </div>
        )}

        {/* AI Chat panel */}
        {chatOpen && (
          <div className="card fade-up" style={{marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <span className="section-label">🤖 Ask AI about your campaigns</span>
              <div style={{display:'flex',gap:8}}>
                {chatHistory.length > 0 && <button onClick={()=>setChatHistory([])} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',fontSize:11}}>Clear</button>}
                <button onClick={()=>setChatOpen(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',fontSize:13}}>✕</button>
              </div>
            </div>
            <div ref={chatRef} style={{height:220,overflowY:'auto',marginBottom:10,display:'flex',flexDirection:'column',gap:8,padding:'4px 0'}}>
              {chatHistory.length === 0 && (
                <div style={{color:'var(--text-3)',fontSize:12,textAlign:'center',padding:'40px 0'}}>
                  <div style={{fontSize:20,marginBottom:6}}>🤖</div>
                  <div>Ask me anything about what&apos;s running right now</div>
                  <div style={{display:'flex',gap:6,justifyContent:'center',marginTop:10,flexWrap:'wrap'}}>
                    {["What's running right now?","Did everything send today?","Why is BNPL not hitting its limit?","When does the next run start?"].map(q => (
                      <button key={q} onClick={()=>{setChatInput(q)}} style={{fontSize:10,padding:'3px 8px',borderRadius:12,background:'var(--surface-2)',border:'1px solid var(--border)',cursor:'pointer',color:'var(--text-2)'}}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatHistory.map((m, i) => (
                <div key={i} style={{
                  padding:'8px 12px',borderRadius:10,maxWidth:'85%',fontSize:13,lineHeight:1.6,
                  background: m.role==='user' ? 'rgba(91,79,233,0.12)' : 'var(--surface-2)',
                  border: m.role==='user' ? '1px solid rgba(91,79,233,0.2)' : '1px solid var(--border)',
                  alignSelf: m.role==='user' ? 'flex-end' : 'flex-start',
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.content}
                </div>
              ))}
              {chatLoading && <div style={{alignSelf:'flex-start',color:'var(--text-3)',fontSize:12,fontFamily:'var(--font-dm-mono)'}}>◌ thinking...</div>}
            </div>
            <div style={{display:'flex',gap:8}}>
              <input value={chatInput} onChange={e=>setChatInput(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); sendChat() } }}
                placeholder="What's happening with my campaigns right now?"
                style={{flex:1,background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'var(--text)',outline:'none'}}
              />
              <button onClick={sendChat} disabled={chatLoading||!chatInput.trim()} className="btn-primary" style={{fontSize:12,padding:'8px 14px'}}>Send</button>
            </div>
          </div>
        )}

        {/* Campaign cards */}
        <div className="campaign-grid">
          {loading && <div style={{color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',fontSize:12,padding:20}}>◌ Loading...</div>}
          {ops?.campaigns.map((c, i) => {
            const sc = STATUS_CONFIG[c.runStatus] || STATUS_CONFIG.idle
            const showBar = c.runStatus !== 'idle' && c.runStatus !== 'not_in_run'
            const progress = c.runStatus === 'done_today' ? 100
              : c.runStatus === 'running' ? Math.min(Math.round((c.sentToday / c.perSession) * 100), 95)
              : c.runStatus === 'queued' ? 0 : 0

            return (
              <Link key={c.slug} href={`/campaigns/${c.slug}`} className={`campaign-card fade-up fade-up-${Math.min(i+1,4)}`}>
                <div className="campaign-card-header">
                  <div style={{display:'flex',alignItems:'center'}}>
                    <span className="campaign-card-icon">{c.icon}</span>
                    <div>
                      <div className="campaign-card-name">{c.name}</div>
                      <div style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',marginTop:1}}>
                        {c.sendTime} ET · {c.perSession}/run
                      </div>
                    </div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
                    <span className={c.active?'badge-active':'badge-paused'}>{c.active?'live':'paused'}</span>
                    {showBar && sc.label !== '—' && (
                      <span style={{fontSize:9,fontFamily:'var(--font-dm-mono)',color:sc.color,background:sc.bg,border:`1px solid ${sc.border}`,borderRadius:10,padding:'1px 6px',whiteSpace:'nowrap'}}>
                        {sc.label}
                      </span>
                    )}
                  </div>
                </div>

                <div className="campaign-stats">
                  <div><div className="campaign-stat-label">Platforms</div><div className="campaign-stat-val">{c.totalSent}</div></div>
                  <div><div className="campaign-stat-label">Today</div><div className="campaign-stat-val" style={{color:c.sentToday>0?'var(--green)':'var(--text-3)'}}>{c.sentToday}</div></div>
                  <div><div className="campaign-stat-label">Target</div><div className="campaign-stat-val">{c.perSession}</div></div>
                </div>

                {showBar && (
                  <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)'}} onClick={e=>e.preventDefault()}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontSize:11,fontFamily:'var(--font-dm-mono)',color:sc.color}}>
                        {c.runStatus === 'done_today' ? `✓ Done — ${c.sentToday} sent` : sc.label}
                      </span>
                      <span style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)'}}>{c.sentToday}/{c.perSession}</span>
                    </div>
                    <div style={{height:4,borderRadius:4,background:'var(--surface-2)',overflow:'hidden'}}>
                      <div style={{height:'100%',borderRadius:4,background:sc.color,width:`${progress}%`,transition:'width 1s ease'}}/>
                    </div>
                  </div>
                )}
              </Link>
            )
          })}
        </div>

        {/* New campaign creator */}
        {showCreator&&(
          <div className="creator-card fade-up">
            <div style={{fontFamily:'var(--font-syne)',fontWeight:700,fontSize:16,marginBottom:4}}>✦ AI Campaign Generator</div>
            <div style={{color:'var(--text-3)',fontSize:13,marginBottom:16}}>Describe your objective — AI configures everything.</div>
            <textarea className="creator-textarea" placeholder="e.g. I want to get on fintech podcasts to promote Alpine, my BNPL platform for coaching sellers." value={objective} onChange={e=>setObjective(e.target.value)}/>
            <div style={{display:'flex',gap:8,marginTop:10,marginBottom:generated?20:0}}>
              <button className="btn-primary" onClick={generate} disabled={generating||!objective.trim()}>{generating?'◌ Generating...':'✦ Generate Campaign'}</button>
              <button className="btn-ghost" onClick={()=>{setShowCreator(false);setGenerated(null);setObjective('')}}>Cancel</button>
            </div>
            {generated&&(
              <div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                  <div className="preview-field"><strong>Name</strong>{generated.icon} {generated.name}</div>
                  <div className="preview-field"><strong>Schedule</strong>{generated.sendTime} · {generated.sendDays?.join(', ')} · {generated.perSession}/run</div>
                  <div className="preview-field" style={{gridColumn:'1/-1'}}><strong>Research Objective</strong>{generated.researchPrompt?.substring(0,200)}...</div>
                  <div className="preview-field" style={{gridColumn:'1/-1'}}><strong>Rationale</strong>{generated.rationale}</div>
                </div>
                <button className="btn-green" onClick={createCampaign} disabled={creating}>{creating?'◌ Creating...':created?'✓ Created!':'Create Campaign →'}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
