'use client'
import { useEffect, useState, useRef, use } from 'react'
import Link from 'next/link'

interface Campaign { slug: string; name: string; icon: string; githubRepo: string; githubWorkflow: string; active: boolean }
interface Stats { total: number; replied: number; responseRate: number; recentWeek: number; byCategory: {_id:string;count:number}[]; byStatus: {_id:string;count:number}[] }
interface Rec { _id: string; date: string; name: string; category: string; website: string; emailsSent: string; status: string; note?: string; aiStatus?: string; aiSummary?: string; aiNextStep?: string; replyPreview?: string }
interface Config { template: string; researchPrompt: string; contactPrompt: string; emailSubject: string; senderName: string; senderEmail: string; sendTime: string; sendDays: string[]; endDate: string|null; perSession: number; maxContactsPerPlatform: number; skipLowConfidence: boolean; paused: boolean }
interface ChatMsg { role: 'user'|'assistant'; content: string }

const SC: Record<string,string> = { Sent:'status-pill status-sent', Replied:'status-pill status-replied', 'No Contact Found':'status-pill status-nocontact', 'Send Failed':'status-pill status-failed' }
const AC: Record<string,string> = { Promising:'ai-pill ai-promising', 'Not Promising':'ai-pill ai-cold', Converted:'ai-pill ai-converted', 'Not Interested':'ai-pill ai-cold', 'Auto Reply':'ai-pill ai-nocontact' }
const DAYS = ['mon','tue','wed','thu','fri','sat','sun']

export default function CampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [tab, setTab] = useState<'dashboard'|'outreach'|'settings'|'chat'>('dashboard')
  const [stats, setStats] = useState<Stats|null>(null)
  const [records, setRecords] = useState<Rec[]>([])
  const [campaign, setCampaign] = useState<Campaign|null>(null)
  const [filter, setFilter] = useState('All')
  const [config, setConfig] = useState<Config>({ template:'', researchPrompt:'', contactPrompt:'', emailSubject:'', senderName:'', senderEmail:'', sendTime:'09:00', sendDays:['mon','tue','wed','thu','fri'], endDate:null, perSession:15, maxContactsPerPlatform:3, skipLowConfidence:true, paused:false })
  const [configSaved, setConfigSaved] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [triggerMsg, setTriggerMsg] = useState('')
  const [selected, setSelected] = useState<Rec|null>(null)
  const [note, setNote] = useState('')
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [devMode, setDevMode] = useState(false)
  const [devEvents, setDevEvents] = useState<string[]>([])
  const [analyzingId, setAnalyzingId] = useState<string|null>(null)
  const [gmailStatus, setGmailStatus] = useState<{needsSetup?:boolean;count?:number}|null>(null)
  const [pullLoading, setPullLoading] = useState(false)
  const [naturalDate, setNaturalDate] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadAll() }, [slug])
  useEffect(() => { chatEndRef.current?.scrollIntoView({behavior:'smooth'}) }, [chatMsgs])

  async function loadAll() {
    const [cs, st, rc, cfg] = await Promise.all([
      fetch('/api/campaigns').then(r=>r.json()),
      fetch(`/api/stats?campaign=${slug}`).then(r=>r.json()),
      fetch(`/api/outreach?campaign=${slug}`).then(r=>r.json()),
      fetch(`/api/settings?campaign=${slug}`).then(r=>r.json()),
    ])
    setCampaign(cs.find((c:Campaign)=>c.slug===slug)||null)
    setStats(st); setRecords(rc); setConfig(cfg)
  }

  async function saveConfig(patch?: Partial<Config>) {
    const next = {...config,...(patch||{})}
    if (patch) setConfig(next)
    await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaign:slug,...next})})
    await loadAll()
    setConfigSaved(true); setTimeout(()=>setConfigSaved(false),2000)
  }

  async function triggerRun() {
    if (!campaign) return
    setTriggering(true); setTriggerMsg('')
    const res = await fetch('/api/trigger',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({repo:campaign.githubRepo,workflow:campaign.githubWorkflow})})
    const d = await res.json()
    setTriggerMsg(d.ok?'✓ Run triggered':'✗ Failed')
    setTriggering(false); setTimeout(()=>setTriggerMsg(''),4000)
  }

  async function markReplied(rec:Rec) {
    await fetch('/api/outreach',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:rec._id,status:'Replied',note})})
    setRecords(prev=>prev.map(r=>r._id===rec._id?{...r,status:'Replied',note}:r))
    setSelected(null)
  }

  async function analyzeReply(rec:Rec) {
    setAnalyzingId(rec._id)
    const res = await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recordId:rec._id,threadContent:rec.replyPreview||rec.note||'',emailSubject:'Guest Appearance - Ethan Williams',platformName:rec.name})})
    const d = await res.json()
    if (d.ok) setRecords(prev=>prev.map(r=>r._id===rec._id?{...r,aiStatus:d.analysis.status,aiSummary:d.analysis.summary,aiNextStep:d.analysis.nextStep}:r))
    setAnalyzingId(null)
  }

  async function pullGmail() {
    setPullLoading(true)
    const res = await fetch(`/api/gmail-replies?campaign=${slug}`)
    const d = await res.json()
    setGmailStatus(d); if(d.ok) loadAll()
    setPullLoading(false)
  }

  async function parseNaturalDate() {
    if (!naturalDate) return
    const res = await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:`Convert to YYYY-MM-DD: "${naturalDate}". Today is ${new Date().toISOString().split('T')[0]}. Reply with ONLY the date.`}],campaign:slug})})
    const d = await res.json()
    const parsed = d.reply?.trim()
    if (parsed&&/^\d{4}-\d{2}-\d{2}$/.test(parsed)) setConfig(p=>({...p,endDate:parsed}))
  }

  async function sendChat() {
    if (!chatInput.trim()||chatLoading) return
    const userMsg:ChatMsg = {role:'user',content:chatInput}
    const newMsgs = [...chatMsgs,userMsg]
    setChatMsgs(newMsgs); setChatInput(''); setChatLoading(true)
    const res = await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:newMsgs.map(m=>({role:m.role,content:m.content})),campaign:slug})})
    const d = await res.json()
    setChatMsgs(prev=>[...prev,{role:'assistant',content:d.reply}])
    if(d.events?.length) setDevEvents(d.events)
    setChatLoading(false)
    if (d.actions?.length) setTimeout(loadAll,1000)
  }

  const statuses = ['All','Sent','Replied','No Contact Found','Send Failed']
  const filtered = filter==='All'?records:records.filter(r=>r.status===filter)
  const repliedCount = records.filter(r=>r.status==='Replied').length
  const convertedCount = records.filter(r=>r.aiStatus==='Converted').length

  return (
    <div>
      <header className="header">
        <div style={{display:'flex',alignItems:'center'}}>
          <Link href="/" className="header-brand">Ethan Admin</Link>
          <span className="header-sep">/</span>
          <span className="header-page">{campaign?.icon} {campaign?.name}</span>
          {config.paused&&<span className="badge-paused" style={{marginLeft:10}}>paused</span>}
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {triggerMsg&&<span style={{fontSize:12,color:triggerMsg.startsWith('✓')?'var(--green)':'var(--red)'}}>{triggerMsg}</span>}
          <button className="btn-ghost" onClick={()=>saveConfig({paused:!config.paused})} style={{fontSize:12}}>
            {config.paused?'▶ Resume':'⏸ Pause'}
          </button>
          <button className="btn-primary" onClick={triggerRun} disabled={triggering||config.paused}>
            {triggering?'◌ Running...':'▶ Run Now'}
          </button>
        </div>
      </header>

      {stats&&(
        <div style={{background:'var(--surface)',borderBottom:'1px solid var(--border)',padding:'10px 32px',display:'flex',gap:32,alignItems:'center'}}>
          {[['Sent',stats.total],['Replied',repliedCount],['Rate',`${stats.total?Math.round((repliedCount/stats.total)*100):0}%`],['Converted',convertedCount],['This Week',stats.recentWeek]].map(([l,v])=>(
            <div key={l as string} style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:11,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',textTransform:'uppercase',letterSpacing:'0.08em'}}>{l}</span>
              <span style={{fontFamily:'var(--font-syne)',fontSize:18,fontWeight:700}}>{v}</span>
            </div>
          ))}
          <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center'}}>
            <button className="btn-ghost" style={{fontSize:11}} onClick={pullGmail} disabled={pullLoading}>{pullLoading?'◌ Pulling...':'⟳ Sync Gmail'}</button>
            {gmailStatus?.needsSetup&&<span style={{fontSize:11,color:'var(--amber)'}}>Gmail not configured</span>}
            {gmailStatus?.count!==undefined&&!gmailStatus.needsSetup&&<span style={{fontSize:11,color:'var(--green)'}}>{gmailStatus.count} replies found</span>}
          </div>
        </div>
      )}

      <div className="tabs">
        {(['dashboard','outreach','settings','chat'] as const).map(t=>(
          <button key={t} className={`tab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>
            {t==='dashboard'?'◈ Dashboard':t==='outreach'?'◎ Outreach':t==='settings'?'⚙ Settings':'✦ AI Chat'}
          </button>
        ))}
      </div>

      <div className="main">
        {tab==='dashboard'&&stats&&(
          <div>
            <div className="card-grid card-grid-4 space-32 fade-up">
              {[['Total Sent',stats.total,'fade-up-1'],['Replies',repliedCount,'fade-up-2'],['Converted',convertedCount,'fade-up-3'],['This Week',stats.recentWeek,'fade-up-4']].map(([l,v,cls])=>(
                <div key={l as string} className={`stat-card ${cls}`}>
                  <div className="stat-label">{l}</div>
                  <div className="stat-value">{v}</div>
                </div>
              ))}
            </div>
            <div className="grid-2 fade-up fade-up-2">
              <div className="card">
                <div className="section-label">By Category</div>
                {stats.byCategory.length===0&&<div style={{color:'var(--text-3)',fontSize:13}}>No data yet</div>}
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
                    <span className={SC[s._id]||'status-pill status-nocontact'} style={{fontSize:12}}>{s._id}</span>
                    <span className="status-row-val">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab==='outreach'&&(
          <div className="fade-up">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <span className="page-sub">{records.length} total · {repliedCount} replied</span>
              <div className="filters">{statuses.map(s=><button key={s} className={`chip ${filter===s?'active':''}`} onClick={()=>setFilter(s)}>{s}</button>)}</div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Platform</th><th>Category</th><th>Contacts</th><th>Status</th><th>AI Status</th><th></th></tr></thead>
                <tbody>
                  {filtered.length===0&&<tr><td colSpan={7} className="td-empty">✦ No records yet</td></tr>}
                  {filtered.map(rec=>(
                    <tr key={rec._id}>
                      <td className="td-date">{rec.date}</td>
                      <td><a href={rec.website} target="_blank" className="td-link">{rec.name}</a></td>
                      <td className="td-sub" style={{textTransform:'capitalize'}}>{rec.category}</td>
                      <td className="td-sub">{rec.emailsSent}</td>
                      <td><span className={SC[rec.status]||'status-pill status-nocontact'}>{rec.status}</span></td>
                      <td>
                        {rec.aiStatus?(
                          <div>
                            <span className={AC[rec.aiStatus]||'ai-pill ai-cold'}>{rec.aiStatus}</span>
                            {rec.aiSummary&&<div style={{fontSize:10,color:'var(--text-3)',marginTop:2,maxWidth:160}}>{rec.aiSummary}</div>}
                          </div>
                        ):rec.status==='Replied'?(
                          <button className="td-action" onClick={()=>analyzeReply(rec)} disabled={analyzingId===rec._id}>
                            {analyzingId===rec._id?'◌ Analyzing...':'✦ Analyze'}
                          </button>
                        ):'—'}
                      </td>
                      <td>
                        {rec.status==='Sent'&&<button className="td-action" onClick={()=>{setSelected(rec);setNote(rec.note||'')}}>Mark replied →</button>}
                        {rec.aiNextStep&&<div style={{fontSize:10,color:'var(--accent)',marginTop:2}}>{rec.aiNextStep}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab==='settings'&&(
          <div className="fade-up" style={{maxWidth:760}}>
            {/* Save button sticky */}
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:20,gap:8}}>
              {configSaved&&<span style={{color:'var(--green)',fontSize:12,alignSelf:'center'}}>✓ Saved</span>}
              <button className="btn-primary" onClick={()=>saveConfig()}>Save All Settings</button>
            </div>

            {/* Schedule */}
            <div className="card space-24">
              <div className="section-label space-8">Schedule & Volume</div>
              <div className="grid-2 space-16">
                <div>
                  <div className="settings-label">Send Time</div>
                  <input type="time" className="settings-input" value={config.sendTime} onChange={e=>setConfig(p=>({...p,sendTime:e.target.value}))} />
                </div>
                <div>
                  <div className="settings-label">Platforms Per Run</div>
                  <input type="number" className="settings-input" min={1} max={50} value={config.perSession} onChange={e=>setConfig(p=>({...p,perSession:parseInt(e.target.value)||15}))} />
                </div>
                <div>
                  <div className="settings-label">Max Contacts Per Platform</div>
                  <input type="number" className="settings-input" min={1} max={10} value={config.maxContactsPerPlatform} onChange={e=>setConfig(p=>({...p,maxContactsPerPlatform:parseInt(e.target.value)||3}))} />
                </div>
                <div style={{display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
                  <div className="settings-label">Skip Low Confidence Contacts</div>
                  <div style={{display:'flex',alignItems:'center',gap:8,paddingTop:8}}>
                    <button className={config.skipLowConfidence?'chip active':'chip'} onClick={()=>setConfig(p=>({...p,skipLowConfidence:!p.skipLowConfidence}))}>
                      {config.skipLowConfidence?'✓ Enabled':'Disabled'}
                    </button>
                    <span style={{fontSize:11,color:'var(--text-3)'}}>skip contacts AI rates as "low" confidence</span>
                  </div>
                </div>
              </div>
              <div className="space-16">
                <div className="settings-label">Send Days</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {['mon','tue','wed','thu','fri','sat','sun'].map(d=><button key={d} className={`chip ${config.sendDays?.includes(d)?'active':''}`} style={{padding:'4px 12px',fontSize:11,textTransform:'capitalize'}} onClick={()=>setConfig(p=>({...p,sendDays:p.sendDays?.includes(d)?p.sendDays.filter(x=>x!==d):[...(p.sendDays||[]),d]}))}>{d}</button>)}
                </div>
              </div>
              <div>
                <div className="settings-label">End Date <span style={{color:'var(--text-3)',fontSize:10,fontWeight:400}}>(natural language OK)</span></div>
                <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:6}}>
                  <input type="text" className="settings-input" style={{flex:1}} placeholder='"end of June" or "July 4th" or "in 3 months"' onChange={async e=>{
                    const val = e.target.value
                    if (!val) return
                    // Auto-parse on blur
                  }} onBlur={async e=>{
                    const val = e.target.value
                    if (!val) return
                    const res = await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:`Convert to YYYY-MM-DD: "${val}". Today is ${new Date().toISOString().split('T')[0]}. Reply with ONLY the date.`}]})})
                    const d = await res.json()
                    const parsed = d.reply?.trim()
                    if (parsed&&/^\d{4}-\d{2}-\d{2}$/.test(parsed)) setConfig(p=>({...p,endDate:parsed}))
                  }} />
                </div>
                {config.endDate?<div style={{display:'flex',alignItems:'center',gap:8}}><span className="status-pill status-sent">{config.endDate}</span><button onClick={()=>setConfig(p=>({...p,endDate:null}))} style={{background:'none',border:'none',color:'var(--text-3)',fontSize:12,cursor:'pointer'}}>✕</button></div>:<div style={{fontSize:11,color:'var(--text-3)'}}>No end date — runs indefinitely</div>}
              </div>
            </div>

            {/* Email Settings */}
            <div className="card space-24">
              <div className="section-label space-8">Email Settings</div>
              <div className="grid-2">
                <div>
                  <div className="settings-label">Email Subject</div>
                  <input type="text" className="settings-input" value={config.emailSubject} onChange={e=>setConfig(p=>({...p,emailSubject:e.target.value}))} placeholder="Guest Appearance - Ethan Williams" />
                </div>
                <div>
                  <div className="settings-label">Sender Name</div>
                  <input type="text" className="settings-input" value={config.senderName} onChange={e=>setConfig(p=>({...p,senderName:e.target.value}))} placeholder="Ethan Williams" />
                </div>
                <div style={{gridColumn:'1/-1'}}>
                  <div className="settings-label">Sender Email</div>
                  <input type="email" className="settings-input" value={config.senderEmail} onChange={e=>setConfig(p=>({...p,senderEmail:e.target.value}))} placeholder="ethan@sireapp.io" />
                </div>
              </div>
            </div>

            {/* Research Prompt */}
            <div className="card space-24">
              <div className="section-label space-8">Research Prompt</div>
              <div style={{fontSize:11,color:'var(--text-3)',marginBottom:10}}>What Claude uses to find outreach targets each run. Must end with a JSON format instruction.</div>
              <textarea className="textarea" style={{height:200}} value={config.researchPrompt} onChange={e=>setConfig(p=>({...p,researchPrompt:e.target.value}))} />
            </div>

            {/* Contact Finder Prompt */}
            <div className="card space-24">
              <div className="section-label space-8">Contact Finder Prompt</div>
              <div style={{fontSize:11,color:'var(--text-3)',marginBottom:10}}>
                How Claude finds emails for each platform. Use <code style={{background:'var(--surface-2)',padding:'1px 4px',borderRadius:4}}>{'{name}'}</code>, <code style={{background:'var(--surface-2)',padding:'1px 4px',borderRadius:4}}>{'{website}'}</code>, <code style={{background:'var(--surface-2)',padding:'1px 4px',borderRadius:4}}>{'{contact_page}'}</code> as variables.
              </div>
              <textarea className="textarea" style={{height:200}} value={config.contactPrompt} onChange={e=>setConfig(p=>({...p,contactPrompt:e.target.value}))} />
            </div>

            {/* Pitch Template */}
            <div className="card">
              <div className="section-label space-8">Pitch Template</div>
              <textarea className="textarea" style={{height:280}} value={config.template} onChange={e=>setConfig(p=>({...p,template:e.target.value}))} />
            </div>
          </div>
        )}

        {tab==='chat'&&(
          <div className="fade-up" style={{maxWidth:devMode?900:700,display:'flex',flexDirection:'column',height:'calc(100vh - 240px)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
              <div style={{display:'flex',gap:8}}>
                <button className={devMode?'btn-primary':'btn-ghost'} style={{fontSize:12,padding:'6px 14px'}} onClick={()=>{setDevMode(false);setChatMsgs([]);setDevEvents([])}}>
                  ✦ Admin
                </button>
                <button className={devMode?'btn-ghost btn-active':'btn-ghost'} style={{fontSize:12,padding:'6px 14px',background:devMode?'linear-gradient(135deg,#0f0f23,#1a1a3e)':undefined,color:devMode?'#7B6FF0':undefined,borderColor:devMode?'#7B6FF0':undefined}} onClick={()=>{setDevMode(true);setChatMsgs([]);setDevEvents([])}}>
                  ⌨ Dev Mode
                </button>
              </div>
              {devMode&&<span style={{fontSize:11,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)'}}>reads/writes github · auto-deploys</span>}
            </div>
            <div style={{flex:1,display:'flex',gap:12,overflow:'hidden'}}>
              <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:12,paddingBottom:12}}>
              {chatMsgs.length===0&&(
                <div className="card" style={{textAlign:'center',padding:40,background:devMode?'#0f0f23':undefined,borderColor:devMode?'#2a2a4e':undefined}}>
                  <div style={{fontSize:32,marginBottom:12}}>{devMode?'⌨':'✦'}</div>
                  <div style={{fontFamily:'var(--font-syne)',fontSize:16,fontWeight:700,marginBottom:8,color:devMode?'#a0a0ff':undefined}}>{devMode?'Dev Agent':'Admin AI'}</div>
                  <div style={{color:devMode?'#6666aa':'var(--text-3)',fontSize:13,lineHeight:1.6,marginBottom:16}}>
                    {devMode?'Write, test, and deploy code changes. I can read files, write code, commit to GitHub, and trigger deploys.':'Update settings, create campaigns, analyze performance — just ask.'}
                  </div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center'}}>
                    {devMode
                      ?['Add a new API endpoint','Fix the stats chart colors','Add pagination to the outreach table','Show me the current homepage code'].map(s=>(
                          <button key={s} className="chip" style={{fontSize:11,background:'#1a1a3e',borderColor:'#2a2a4e',color:'#8888cc'}} onClick={()=>setChatInput(s)}>{s}</button>
                        ))
                      :['Pause this campaign until next Monday','Create an Alpine BNPL outreach campaign','What can I do to improve reply rate?','Run the outreach now'].map(s=>(
                          <button key={s} className="chip" style={{fontSize:11}} onClick={()=>setChatInput(s)}>{s}</button>
                        ))
                    }
                  </div>
                </div>
              )}
              {chatMsgs.map((m,i)=>(
                <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
                  <div style={{maxWidth:'80%',padding:'12px 16px',borderRadius:m.role==='user'?'16px 16px 4px 16px':'16px 16px 16px 4px',background:m.role==='user'?'linear-gradient(135deg,var(--accent),#7B6FF0)':'var(--surface)',color:m.role==='user'?'#fff':'var(--text)',fontSize:13,lineHeight:1.6,border:m.role==='assistant'?'1px solid var(--border)':'none',boxShadow:'var(--shadow)',whiteSpace:'pre-wrap'}}>
                    {m.content}
                  </div>
                </div>
              ))}
              {chatLoading&&<div style={{display:'flex'}}><div style={{padding:'12px 16px',border:'1px solid var(--border)',borderRadius:'16px 16px 16px 4px',fontSize:13,background:devMode?'#1a1a3e':'var(--surface)',color:devMode?'#6666aa':'var(--text-3)'}}>◌ thinking...</div></div>}
              <div ref={chatEndRef}/>
            </div>
              {devMode&&devEvents.length>0&&(
                <div style={{width:220,overflowY:'auto',background:'#0a0a1a',border:'1px solid #2a2a4e',borderRadius:12,padding:12}}>
                  <div style={{fontFamily:'var(--font-dm-mono)',fontSize:10,color:'#5555aa',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10}}>Tool Calls</div>
                  {devEvents.map((e,i)=>(
                    <div key={i} style={{fontFamily:'var(--font-dm-mono)',fontSize:11,color:'#7777cc',padding:'4px 0',borderBottom:'1px solid #1a1a3e'}}>
                      {e}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{paddingTop:12,borderTop:devMode?'1px solid #2a2a4e':'1px solid var(--border)',display:'flex',gap:8}}>
              <input className="settings-input" style={{flex:1,background:devMode?'#0f0f23':undefined,borderColor:devMode?'#2a2a4e':undefined,color:devMode?'#a0a0ff':undefined}} placeholder={devMode?"Describe a code change or ask about the codebase...":"Ask anything about your campaigns..."} value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&sendChat()}/>
              <button className={devMode?'':'btn-primary'} style={devMode?{background:'linear-gradient(135deg,#5B4FE9,#7B6FF0)',color:'#fff',padding:'10px 20px',border:'none',borderRadius:10,fontWeight:600,fontSize:13,cursor:'pointer'}:undefined} onClick={sendChat} disabled={chatLoading||!chatInput.trim()}>Send</button>
            </div>
          </div>
        )}
      </div>

      {selected&&(
        <div className="modal-overlay">
          <div className="modal fade-up">
            <div className="modal-title">Mark as Replied</div>
            <div className="modal-sub">{selected.name}</div>
            <textarea className="textarea" style={{height:80}} value={note} onChange={e=>setNote(e.target.value)} placeholder="Paste their reply or add a note..."/>
            <div className="modal-actions">
              <button className="btn-green" onClick={()=>markReplied(selected)}>Confirm ✓</button>
              <button className="btn-cancel" onClick={()=>setSelected(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
