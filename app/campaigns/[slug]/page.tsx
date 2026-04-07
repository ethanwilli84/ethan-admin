'use client'
import { useEffect, useState, useRef, use } from 'react'
import Link from 'next/link'

interface Campaign { slug: string; name: string; icon: string; githubRepo: string; githubWorkflow: string; active: boolean }
interface Stats { total: number; replied: number; responseRate: number; recentWeek: number; byCategory: {_id:string;count:number}[]; byStatus: {_id:string;count:number}[] }
interface Rec { _id: string; date: string; name: string; category: string; website: string; emailsSent: string; status: string; note?: string; aiStatus?: string; aiSummary?: string; aiNextStep?: string; replyPreview?: string }
interface Config { template: string; researchObjective: string; contactObjective: string; emailSubject: string; senderName: string; senderEmail: string; sendTime: string; sendDays: string[]; endDate: string|null; perSession: number; maxContactsPerPlatform: number; skipLowConfidence: boolean; paused: boolean; useFallbackEmails: boolean; fallbackPrefixes: string[] }
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
  const [search, setSearch] = useState('')
  const [config, setConfig] = useState<Config>({ template:'', researchObjective:'', contactObjective:'', emailSubject:'', senderName:'', senderEmail:'', sendTime:'09:00', sendDays:['mon','tue','wed','thu','fri'], endDate:null, perSession:15, maxContactsPerPlatform:3, skipLowConfidence:true, paused:false, useFallbackEmails:true, fallbackPrefixes:['info','contact','hello','partnerships','business'] })
  const [configSaved, setConfigSaved] = useState(false)
  const [spellIssues, setSpellIssues] = useState<string[]>([])
  const [overlapInfo, setOverlapInfo] = useState<{risk:'high'|'medium'|'low'; conflicts:{name:string;time:string;days:string[];overlap:number}[]; suggestedTime:string}|null>(null)
  const [triggering, setTriggering] = useState(false)
  const [triggerMsg, setTriggerMsg] = useState('')
  const [logs, setLogs] = useState<{status:string;conclusion:string|null;lines:string[];startedAt:string;runId:number|null}>({status:'idle',conclusion:null,lines:[],startedAt:'',runId:null})
  const [logPolling, setLogPolling] = useState<NodeJS.Timeout|null>(null)
  const [runStep, setRunStep] = useState('')
  const [selected, setSelected] = useState<Rec|null>(null)
  const [note, setNote] = useState('')
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [analyzingId, setAnalyzingId] = useState<string|null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  const [gmailStatus, setGmailStatus] = useState<{needsSetup?:boolean;count?:number}|null>(null)
  const [pullLoading, setPullLoading] = useState(false)
  const [naturalDate, setNaturalDate] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadAll()
    // Check for active run on load and auto-start polling
    fetchLogs().then((d: {status:string;runId:number|null}) => { if (d?.status === 'in_progress' && d.runId) startLogPolling() })
  }, [slug])
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


  async function checkOverlap(currentConfig: Config) {
    // Fetch all campaigns to compare schedules
    const allCampaigns = await fetch('/api/campaigns').then(r=>r.json()).catch(()=>[])
    const others = allCampaigns.filter((c: {slug:string;name:string;_id:string}) => c.slug !== slug)
    const conflicts: {name:string;time:string;days:string[];overlap:number}[] = []
    
    for (const other of others) {
      try {
        const res = await fetch(`/api/settings?campaign=${other.slug}`)
        const otherConfig = await res.json()
        if (otherConfig.paused) continue
        
        const myTime = currentConfig.sendTime || '09:00'
        const theirTime = otherConfig.sendTime || '09:00'
        
        // Convert to minutes for comparison
        const [myH, myM] = myTime.split(':').map(Number)
        const [thH, thM] = theirTime.split(':').map(Number)
        const myMins = myH * 60 + myM
        const thMins = thH * 60 + thM
        const timeDiff = Math.abs(myMins - thMins)
        
        if (timeDiff < 120) { // Within 2 hours = potential conflict
          const myDays = new Set(currentConfig.sendDays || [])
          const theirDays = otherConfig.sendDays || []
          const sharedDays = theirDays.filter((d: string) => myDays.has(d))
          
          if (sharedDays.length > 0) {
            conflicts.push({
              name: other.name,
              time: theirTime,
              days: sharedDays,
              overlap: timeDiff
            })
          }
        }
      } catch {}
    }
    
    // Calculate risk level
    const risk = conflicts.some(c => c.overlap < 30) ? 'high'
               : conflicts.some(c => c.overlap < 90) ? 'medium'
               : conflicts.length > 0 ? 'low' : 'low'
    
    let suggestedTime = '09:00'
    const allTakenMins: number[] = []
    for (const other of others) {
      try {
        const r = await fetch(`/api/settings?campaign=${other.slug}`)
        const s = await r.json()
        if (!s.paused) {
          const [h,m] = (s.sendTime||'09:00').split(':').map(Number)
          allTakenMins.push(h*60+m)
        }
      } catch {}
    }
    // Business hours candidates: 8am, 10am, 12pm, 2pm, 4pm
    const candidates = [480,600,720,840,960]
    const safe = candidates.find(t => allTakenMins.every(taken => Math.abs(t-taken) >= 120))
    if (safe !== undefined) {
      const h = Math.floor(safe/60).toString().padStart(2,'0')
      const m = (safe%60).toString().padStart(2,'0')
      suggestedTime = `${h}:${m}`
    }
    
    setOverlapInfo({ risk: conflicts.length > 0 ? risk : 'low', conflicts, suggestedTime })
  }

  async function saveConfig(patch?: Partial<Config>) {
    const next = {...config,...(patch||{})}
    if (patch) setConfig(next)
    
    // Spell + grammar check on email subject and template before saving
    const textToCheck = [next.emailSubject, next.template].filter(Boolean).join('\n\n')
    if (textToCheck.trim()) {
      try {
        const checkRes = await fetch('/api/chat', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ messages: [{role:'user',content:`Check for spelling and grammar errors ONLY in this text. List any errors found as bullet points. If no errors, reply with exactly "NO_ERRORS". Be brief, one line per issue. Text:\n\n${textToCheck}`}], campaign: slug })
        })
        const checkData = await checkRes.json()
        const reply = checkData.reply?.trim() || ''
        if (reply && reply !== 'NO_ERRORS' && !reply.toLowerCase().includes('no error')) {
          setSpellIssues(reply.split('\n').filter((l:string) => l.trim()))
          return // Block save until user acknowledges
        }
      } catch {} // If spell check fails, proceed with save anyway
    }
    
    setSpellIssues([])
    await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaign:slug,...next})})
    setConfigSaved(true); setTimeout(()=>setConfigSaved(false),2000)
  }

  async function togglePause() {
    await saveConfig({ paused: !config.paused })
  }

  async function fetchLogs() {
    const res = await fetch(`/api/run-logs?campaign=${slug}`)
    const d = await res.json()
    setLogs(d)
    // Extract current step from logs
    if (d.status === 'in_progress' && d.lines?.length) {
      const last = [...d.lines].reverse().find((l:string) => l.trim() && !l.includes('◌') && !l.startsWith('#'))
      if (last) setRunStep(last.substring(0, 60))
    } else if (d.status === 'completed') {
      const summary = d.lines?.find((l:string) => l.includes('Done') || l.includes('✅')) || ''
      setRunStep(summary.substring(0, 60))
    } else {
      setRunStep('')
    }
    return d
  }

  async function runNowWithLogs() {
    if (config.paused) {
      // Auto-unpause before running so it doesn't skip
      await saveConfig({ paused: false })
      await new Promise(r => setTimeout(r, 500)) // brief pause for save
    }
    await triggerRun()
    setTimeout(() => startLogPolling(), 3000)
  }

  function startLogPolling() {
    if (logPolling) clearInterval(logPolling)
    const interval = setInterval(async () => {
      const d = await fetchLogs()
      if (d.status === 'completed' || d.status === 'idle') {
        clearInterval(interval)
        setLogPolling(null)
        // Keep final conclusion badge for 10s then clear
        setTimeout(() => setRunStep(''), 10000)
      }
    }, 4000) // Poll every 4 seconds
    setLogPolling(interval)
    fetchLogs()
  }

  function stopLogPolling() {
    if (logPolling) { clearInterval(logPolling); setLogPolling(null) }
  }



  async function triggerRun() {
    if (!campaign) return
    setTriggering(true); setTriggerMsg('')
    const res = await fetch('/api/trigger',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({repo:campaign.githubRepo,workflow:campaign.githubWorkflow,campaignSlug:slug})})
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

  function relDate(d: string) {
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
    if (diff === 0) return 'today'
    if (diff === 1) return 'yesterday'
    if (diff < 7) return `${diff}d ago`
    return d.substring(5) // MM-DD
  }


  async function sendChat() {
    if (!chatInput.trim()||chatLoading) return
    const userMsg:ChatMsg = {role:'user',content:chatInput}
    const newMsgs = [...chatMsgs,userMsg]
    setChatMsgs(newMsgs); setChatInput(''); setChatLoading(true)
    const res = await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:newMsgs.map(m=>({role:m.role,content:m.content})),campaign:slug})})
    const d = await res.json()
    setChatMsgs(prev=>[...prev,{role:'assistant',content:d.reply}])
    setChatLoading(false)
    if (d.actions?.length) setTimeout(loadAll,1000)
  }

  const statuses = ['All','Sent','Replied','No Contact Found','Send Failed']
  const filtered = records.filter(r=>(filter==='All'||r.status===filter)&&(!search||r.name?.toLowerCase().includes(search.toLowerCase())||r.emailsSent?.toLowerCase().includes(search.toLowerCase())))
  const repliedCount = records.filter(r=>r.status==='Replied').length
  const convertedCount = records.filter(r=>r.aiStatus==='Converted').length

  return (
    <div>
      <div className="page-header-bar">
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <Link href="/" style={{color:'var(--text-3)',textDecoration:'none',fontSize:13}}>← Campaigns</Link>
          <span style={{color:'var(--border-hover)'}}>/</span>
          <span style={{fontFamily:'var(--font-syne)',fontWeight:700,fontSize:14}}>{campaign?.icon} {campaign?.name}</span>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {/* Run status pill */}
          {config.paused&&(
            <div style={{display:'flex',alignItems:'center',gap:6,background:'rgba(255,170,0,0.1)',border:'1px solid rgba(255,170,0,0.3)',borderRadius:20,padding:'3px 10px'}}>
              <span style={{fontSize:11,fontFamily:'var(--font-dm-mono)',color:'#f59e0b',fontWeight:600}}>⏸ PAUSED — won't send</span>
            </div>
          )}
          {!config.paused&&logs.status==='in_progress'&&(
            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2}}>
              <div style={{display:'flex',alignItems:'center',gap:6,background:'rgba(0,200,150,0.1)',border:'1px solid rgba(0,200,150,0.3)',borderRadius:20,padding:'3px 10px'}}>
                <span style={{width:6,height:6,borderRadius:'50%',background:'var(--green)',animation:'pulse 1s infinite',display:'inline-block'}}/>
                <span style={{fontSize:11,fontFamily:'var(--font-dm-mono)',color:'var(--green)',fontWeight:600}}>RUNNING</span>
              </div>
              {runStep&&<div style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',maxWidth:240,textOverflow:'ellipsis',overflow:'hidden',whiteSpace:'nowrap',textAlign:'right'}}>{runStep}</div>}
            </div>
          )}
          {!config.paused&&logs.status==='queued'&&(
            <div style={{display:'flex',alignItems:'center',gap:6,background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:20,padding:'3px 10px'}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:'#f59e0b',display:'inline-block'}}/>
              <span style={{fontSize:11,fontFamily:'var(--font-dm-mono)',color:'#f59e0b',fontWeight:600}}>QUEUED — other campaign running first</span>
            </div>
          )}
          {logs.status==='completed'&&logs.conclusion&&(
            <div style={{display:'flex',alignItems:'center',gap:6,background:logs.conclusion==='success'?'rgba(0,200,150,0.08)':'rgba(255,71,87,0.08)',border:`1px solid ${logs.conclusion==='success'?'rgba(0,200,150,0.25)':'rgba(255,71,87,0.25)'}`,borderRadius:20,padding:'3px 10px'}}>
              <span style={{fontSize:11,fontFamily:'var(--font-dm-mono)',color:logs.conclusion==='success'?'var(--green)':'var(--red)'}}>
                {logs.conclusion==='success'?'✓ Done':'✗ Failed'}
              </span>
            </div>
          )}
          <button className="btn-ghost" style={{fontSize:12}} onClick={togglePause}>{config.paused?'▶ Resume':'⏸ Pause'}</button>
          <button className="btn-primary" style={{fontSize:12}} onClick={runNowWithLogs} 
            disabled={triggering}
            title={logs.status==='in_progress'?'A run is active — clicking will queue another':'Run campaign now'}
          >
            {triggering?'◌ Queuing...':logs.status==='in_progress'?'▶ Run Again':'▶ Run Now'}
          </button>
        </div>
      </div>

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

      {config.paused&&(
        <div style={{background:'rgba(255,170,0,0.08)',borderBottom:'1px solid rgba(255,170,0,0.2)',padding:'8px 32px',display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:13}}>⏸</span>
          <span style={{fontSize:12,color:'#f59e0b',fontWeight:500}}>Campaign is paused — outreach is not running automatically</span>
          <button onClick={togglePause} style={{marginLeft:'auto',background:'rgba(255,170,0,0.15)',border:'1px solid rgba(255,170,0,0.3)',borderRadius:8,color:'#f59e0b',fontSize:11,padding:'4px 12px',cursor:'pointer',fontWeight:600}}>▶ Resume Campaign</button>
        </div>
      )}

      <div className="tabs">
        {(['dashboard','outreach','settings','chat'] as const).map(t=>(
          <button key={t} className={`tab ${tab===t?'active':''}`} onClick={()=>{setTab(t);if(t==='dashboard')fetchLogs()}}>
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
                {stats.byCategory.map((cat,i)=>{
                    const pct = Math.min(100,(cat.count/(stats.total||1))*100)
                    const colors = ['#5B4FE9','#00D4FF','#00C896','#FF6B6B','#FFB347','#A78BFA','#34D399']
                    const color = colors[i % colors.length]
                    const label = cat._id.replace(/_/g,' ').replace(/\w/g, (l:string)=>l.toUpperCase())
                    return (
                      <div key={cat._id} style={{marginBottom:10}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                          <span style={{fontSize:11,color:'var(--text-2)',fontWeight:500}}>{label}</span>
                          <span style={{fontSize:12,fontFamily:'var(--font-dm-mono)',color:'var(--text-3)',fontWeight:600}}>{cat.count}</span>
                        </div>
                        <div style={{background:'var(--surface-2)',borderRadius:6,height:6,overflow:'hidden'}}>
                          <div style={{height:'100%',borderRadius:6,background:color,width:`${pct}%`,transition:'width 0.6s ease'}}/>
                        </div>
                      </div>
                    )
                  })}
              </div>
              <div className="card">
                <div className="section-label">By Status</div>
                {stats.byStatus.map(s=>(<div key={s._id} className="status-row"><span className={SC[s._id]||'status-pill status-nocontact'} style={{fontSize:12}}>{s._id}</span><span className="status-row-val">{s.count}</span></div>))}
              </div>
            </div>

            {/* Live Run Logs */}
            <div className="card fade-up" style={{marginTop:24}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{fontFamily:'var(--font-syne)',fontWeight:700,fontSize:14}}>
                    {logs.status==='in_progress'?'🟢':'🔵'} Run Logs
                  </div>
                  {logs.status==='in_progress'&&<span style={{fontFamily:'var(--font-dm-mono)',fontSize:10,color:'var(--green)',background:'rgba(0,200,150,0.1)',padding:'2px 8px',borderRadius:20}}>LIVE</span>}
                  {logs.status==='completed'&&<span style={{fontFamily:'var(--font-dm-mono)',fontSize:10,color:logs.conclusion==='success'?'var(--green)':'var(--red)',background:logs.conclusion==='success'?'rgba(0,200,150,0.1)':'rgba(255,71,87,0.1)',padding:'2px 8px',borderRadius:20}}>{logs.conclusion?.toUpperCase()||'DONE'}</span>}
                  {logs.startedAt&&<span style={{fontSize:11,color:'var(--text-3)'}}>{logs.startedAt.substring(0,16).replace('T',' ')}</span>}
                </div>
                <div style={{display:'flex',gap:8}}>
                  {logs.status==='in_progress'&&logPolling&&<button className="btn-ghost" style={{fontSize:11,padding:'4px 10px'}} onClick={stopLogPolling}>⏹ Stop</button>}
                  {!logPolling&&<button className="btn-ghost" style={{fontSize:11,padding:'4px 10px'}} onClick={startLogPolling}>{logPolling?'◌ Watching...':'↺ Check logs'}</button>}
                </div>
              </div>
              {logs.lines.length===0&&logs.status==='idle'&&(
                <div style={{fontFamily:'var(--font-dm-mono)',fontSize:11,color:'var(--text-3)',padding:'20px',textAlign:'center'}}>
                  No active run. Hit ▶ Run Now to start a campaign and watch it live.
                </div>
              )}
              {logs.lines.length>0&&(
                <div style={{background:'#0a0a12',border:'1px solid #1a1a2e',borderRadius:10,padding:'12px 16px',maxHeight:300,overflowY:'auto',fontFamily:'var(--font-dm-mono)',fontSize:11,lineHeight:1.8}}>
                  {logs.lines.map((line,i)=>{
                    const isSuccess=line.includes('✅')||line.includes('✓ Sent')
                    const isSkip=line.includes('⏭')||line.includes('⏸')
                    const isError=line.includes('✗')||line.includes('Failed')
                    const isHeader=line.includes('===')||line.includes('🚀')||line.includes('Orchestrator')
                    const isProcessing=line.includes('Processing:')
                    return (<div key={i} style={{color:isSuccess?'#00C896':isError?'#FF4757':isSkip?'#888':isHeader?'#a0a0ff':isProcessing?'#c0c0ff':'#6a6a8a',fontWeight:isHeader||isProcessing?600:400,paddingLeft:isSkip||isSuccess||isError?8:0,borderLeft:isSuccess?'2px solid #00C896':isError?'2px solid #FF4757':isSkip?'2px solid #444':'none'}}>{line}</div>)
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {tab==='outreach'&&(
          <div className="fade-up">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,gap:10,flexWrap:'wrap'}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span className="page-sub">{records.length} total · {repliedCount} replied</span>
                {checkedIds.size > 0 && (
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontSize:12,color:'var(--accent)',fontFamily:'var(--font-dm-mono)',fontWeight:600}}>{checkedIds.size} selected</span>
                    <button onClick={()=>{
                      const names = filtered.filter(r=>checkedIds.has(r._id)).map(r=>r.name).join('\n')
                      navigator.clipboard.writeText(names)
                      setCopied(true); setTimeout(()=>setCopied(false),2000)
                    }} style={{fontSize:11,padding:'3px 10px',borderRadius:6,background:'var(--accent)',color:'#fff',border:'none',cursor:'pointer',fontFamily:'var(--font-dm-mono)'}}>
                      {copied ? '✓ Copied!' : '⎘ Copy names'}
                    </button>
                    <button onClick={()=>setCheckedIds(new Set())} style={{fontSize:11,padding:'3px 8px',borderRadius:6,background:'none',border:'1px solid var(--border)',color:'var(--text-3)',cursor:'pointer'}}>Clear</button>
                  </div>
                )}
              </div>
              <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
                <input className="settings-input" style={{width:200,fontSize:12,padding:'6px 12px'}} placeholder="Search platforms..." value={search} onChange={e=>setSearch(e.target.value)}/>
                <div className="filters" style={{display:'flex',gap:6,flexWrap:'wrap'}}>{statuses.map(s=><button key={s} className={`chip ${filter===s?'active':''}`} onClick={()=>setFilter(s)}>{s}</button>)}</div>
                {search&&<button onClick={()=>setSearch('')} style={{background:'none',border:'none',color:'var(--text-3)',cursor:'pointer',fontSize:12}}>✕</button>}
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr>
  <th style={{width:32,paddingRight:4}}>
    <input type="checkbox" style={{cursor:'pointer'}}
      checked={checkedIds.size > 0 && filtered.every(r=>checkedIds.has(r._id))}
      onChange={e=>{
        if(e.target.checked) setCheckedIds(new Set(filtered.map(r=>r._id)))
        else setCheckedIds(new Set())
      }}
    />
  </th>
  <th>Date</th><th>Platform</th><th>Category</th><th>Contacts</th><th>Status</th><th>AI Status</th><th>Next Step</th>
</tr></thead>
                <tbody>
                  {filtered.length===0&&<tr><td colSpan={8} className="td-empty">✦ No records yet</td></tr>}
                  {filtered.map(rec=>(
                    <tr key={rec._id} style={{background:checkedIds.has(rec._id)?'rgba(91,79,233,0.06)':undefined}}>
                      <td style={{width:32,paddingRight:4}} onClick={e=>e.stopPropagation()}>
                        <input type="checkbox" style={{cursor:'pointer'}}
                          checked={checkedIds.has(rec._id)}
                          onChange={e=>{
                            setCheckedIds(prev=>{
                              const next=new Set(prev)
                              e.target.checked ? next.add(rec._id) : next.delete(rec._id)
                              return next
                            })
                          }}
                        />
                      </td>
                      <td className="td-date"  title={rec.date}>{relDate(rec.date)}</td>
                      <td><a href={rec.website} target="_blank" className="td-link">{rec.name}</a></td>
                      <td className="td-sub" style={{textTransform:'capitalize'}}>{rec.category}</td>
                      <td className="td-sub" title={rec.emailsSent}>{rec.emailsSent?.length > 30 ? rec.emailsSent.substring(0, 28) + "…" : rec.emailsSent}</td>
                      <td><span className={SC[rec.status]||'status-pill status-nocontact'}>{rec.status}</span></td>
                      <td>
                        {rec.aiStatus?(
                          <div>
                            <span className={AC[rec.aiStatus]||'ai-pill ai-cold'}>{rec.aiStatus}</span>
                            {rec.aiSummary&&<div title={rec.aiSummary} style={{fontSize:10,color:'var(--text-3)',marginTop:2,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{rec.aiSummary}</div>}
                            <button className="td-action" style={{marginTop:4,fontSize:9,opacity:0.6}} onClick={()=>analyzeReply(rec)} disabled={analyzingId===rec._id}>
                              {analyzingId===rec._id?'◌':'↺ Re-analyze'}
                            </button>
                          </div>
                        ):rec.status==='Replied'?(
                          <button className="td-action" onClick={()=>analyzeReply(rec)} disabled={analyzingId===rec._id}>
                            {analyzingId===rec._id?'◌ Analyzing...':'✦ Analyze'}
                          </button>
                        ):'—'}
                      </td>
                      <td>
                        {rec.status==='Sent'&&<button className="td-action" onClick={()=>{setSelected(rec);setNote(rec.note||'')}}>Mark replied →</button>}
                        {rec.status==='Replied'&&rec.replyPreview&&!rec.aiNextStep&&<div title={rec.replyPreview} style={{fontSize:10,color:'var(--text-2)',maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontStyle:'italic'}}>"{rec.replyPreview.substring(0,80)}"</div>}
                        {rec.aiNextStep&&<div title={rec.aiNextStep} style={{fontSize:10,color:'var(--accent)',marginTop:2,maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{rec.aiNextStep}</div>}
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
              {spellIssues.length>0&&(
                <div style={{background:'rgba(255,170,0,0.1)',border:'1px solid rgba(255,170,0,0.3)',borderRadius:10,padding:'12px 16px',marginBottom:12}}>
                  <div style={{fontSize:12,fontWeight:600,color:'#f59e0b',marginBottom:6}}>⚠ Issues found before sending:</div>
                  {spellIssues.map((issue,i)=><div key={i} style={{fontSize:12,color:'var(--text-2)',marginBottom:2}}>• {issue}</div>)}
                  <div style={{display:'flex',gap:8,marginTop:10}}>
                    <button className="btn-ghost" style={{fontSize:11}} onClick={()=>{setSpellIssues([]);saveConfig()}}>Ignore & Save Anyway</button>
                    <button className="btn-ghost" style={{fontSize:11}} onClick={()=>setSpellIssues([])}>Dismiss</button>
                  </div>
                </div>
              )}
              <button className="btn-primary" onClick={()=>saveConfig()}>{configSaved?'✓ Saved':'Save All Settings'}</button>
            </div>

            {/* Overlap Risk Banner */}
            {overlapInfo&&overlapInfo.conflicts.length>0&&(
              <div style={{
                marginBottom:16,padding:'14px 18px',borderRadius:12,
                background: overlapInfo.risk==='high'?'rgba(255,71,87,0.08)':overlapInfo.risk==='medium'?'rgba(255,170,0,0.08)':'rgba(0,200,150,0.06)',
                border: `1px solid ${overlapInfo.risk==='high'?'rgba(255,71,87,0.3)':overlapInfo.risk==='medium'?'rgba(255,170,0,0.3)':'rgba(0,200,150,0.2)'}`,
              }}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                  <span style={{fontSize:14}}>{overlapInfo.risk==='high'?'🚨':overlapInfo.risk==='medium'?'⚠️':'⚡'}</span>
                  <span style={{fontWeight:700,fontSize:13,color:overlapInfo.risk==='high'?'var(--red)':overlapInfo.risk==='medium'?'#f59e0b':'var(--green)'}}>
                    {overlapInfo.risk==='high'?'High':'Medium'} overlap risk
                  </span>
                </div>
                {overlapInfo.conflicts.map((conflict,i)=>(
                  <div key={i} style={{fontSize:12,color:'var(--text-2)',marginBottom:4}}>
                    <strong>{conflict.name}</strong> runs at <code style={{background:'var(--surface-2)',padding:'1px 5px',borderRadius:4}}>{conflict.time}</code> — only {conflict.overlap} min apart on <strong>{conflict.days.join(', ')}</strong>
                  </div>
                ))}
                <div style={{marginTop:10,display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:12,color:'var(--text-3)'}}>Guaranteed safe time:</span>
                  <code style={{background:'var(--surface-2)',padding:'2px 8px',borderRadius:6,fontSize:12,fontFamily:'var(--font-dm-mono)',color:'var(--green)',fontWeight:600}}>{overlapInfo.suggestedTime}</code>
                  <button className="chip" style={{fontSize:11,padding:'3px 10px'}} onClick={()=>setConfig(p=>({...p,sendTime:overlapInfo.suggestedTime}))}>Use this time</button>
                </div>
              </div>
            )}

            {/* Schedule */}
            <div className="card space-24">
              <div className="section-label space-8">Schedule & Volume</div>
              <div className="grid-2 space-16">
                <div>
                  <div className="settings-label" style={{display:'flex',alignItems:'center',gap:6}}>
                    Send Time
                    <span style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',fontWeight:400}}>EST</span>
                  </div>
                  <input type="time" className="settings-input" value={config.sendTime}
                    onChange={e=>{
                      const newConfig = {...config,sendTime:e.target.value}
                      setConfig(newConfig)
                      checkOverlap(newConfig)
                    }} />
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
              {/* Fallback emails when no contact found */}
              <div className="space-16">
                <div className="settings-label" style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                  If No Contact Found
                  <button className={config.useFallbackEmails?'chip active':'chip'} style={{fontSize:11}} onClick={()=>setConfig(p=>({...p,useFallbackEmails:!p.useFallbackEmails}))}>
                    {config.useFallbackEmails?'✓ Try guessed emails':'Skip — log as No Contact'}
                  </button>
                </div>
                {config.useFallbackEmails&&(
                  <div>
                    <div style={{fontSize:11,color:'var(--text-3)',marginBottom:8}}>
                      Prefixes to try at the company domain. Type and press Enter to add.
                    </div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:6}}>
                      {(config.fallbackPrefixes||[]).map((prefix,i)=>(
                        <span key={i} style={{display:'flex',alignItems:'center',gap:4,background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:20,padding:'3px 10px',fontSize:12,fontFamily:'var(--font-dm-mono)'}}>
                          {prefix}@
                          <button onClick={()=>setConfig(prev=>({...prev,fallbackPrefixes:prev.fallbackPrefixes.filter((_,j)=>j!==i)}))} style={{background:'none',border:'none',color:'var(--text-3)',cursor:'pointer',fontSize:13,lineHeight:1,padding:'0 1px'}}>✕</button>
                        </span>
                      ))}
                      <input
                        placeholder="+ add prefix"
                        style={{background:'var(--surface-2)',border:'1px dashed var(--border)',borderRadius:20,padding:'3px 12px',fontSize:12,fontFamily:'var(--font-dm-mono)',color:'var(--text)',outline:'none',minWidth:120}}
                        onKeyDown={e=>{
                          if(e.key==='Enter'||e.key===','){
                            const val=(e.target as HTMLInputElement).value.trim().toLowerCase().replace(/[@,\s]/g,'')
                            if(val&&!(config.fallbackPrefixes||[]).includes(val))
                              setConfig(p=>({...p,fallbackPrefixes:[...(p.fallbackPrefixes||[]),val]}))
                            ;(e.target as HTMLInputElement).value=''
                            e.preventDefault()
                          }
                        }}
                      />
                    </div>
                    <div style={{fontSize:10,color:'var(--text-3)'}}>
                      Suggestions: info · contact · hello · partnerships · business · investors · lending · support · sales · press · funding · hello
                    </div>
                  </div>
                )}
              </div>
              <div className="space-16">
                <div className="settings-label">Send Days</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {['mon','tue','wed','thu','fri','sat','sun'].map(d=><button key={d} className={`chip ${config.sendDays?.includes(d)?'active':''}`} style={{padding:'4px 12px',fontSize:11,textTransform:'capitalize'}} onClick={()=>{const nd={...config,sendDays:config.sendDays?.includes(d)?config.sendDays.filter(x=>x!==d):[...(config.sendDays||[]),d]};setConfig(nd);checkOverlap(nd)}}>{d}</button>)}
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
                  <input type="text" className="settings-input" value={config.emailSubject} onChange={e=>setConfig(p=>({...p,emailSubject:e.target.value}))} placeholder="e.g. Guest Appearance - Ethan Williams" />
                </div>
                <div>
                  <div className="settings-label">Sender Name</div>
                  <input type="text" className="settings-input" value={config.senderName} onChange={e=>setConfig(p=>({...p,senderName:e.target.value}))} placeholder="e.g. Ethan Williams" />
                </div>
                <div style={{gridColumn:'1/-1'}}>
                  <div className="settings-label">Sender Email</div>
                  <input type="email" className="settings-input" value={config.senderEmail} onChange={e=>setConfig(p=>({...p,senderEmail:e.target.value}))} placeholder="e.g. ethan@sireapp.io" />
                </div>
              </div>
            </div>

            {/* Research Objective - plain English */}
            <div className="card space-24">
              <div className="section-label space-8">Who to Find</div>
              <div style={{fontSize:11,color:'var(--text-3)',marginBottom:10}}>
                Plain English description of the outreach targets you want. Claude handles all the search + formatting automatically.
              </div>
              <textarea className="textarea" style={{height:140}} value={config.researchObjective}
                placeholder="e.g. Find podcasts about entrepreneurship and Gen Z business with 1k–100k listeners that actively book guests. Focus on NYC-based shows or fintech, sneakers, and lifestyle niches."
                onChange={e=>setConfig(p=>({...p,researchObjective:e.target.value}))} />
            </div>

            {/* Contact Objective - plain English */}
            <div className="card space-24">
              <div className="section-label space-8">How to Find Contact Emails</div>
              <div style={{fontSize:11,color:'var(--text-3)',marginBottom:10}}>
                Plain English instructions for finding the right person to email. Claude handles the search and formatting.
              </div>
              <textarea className="textarea" style={{height:100}} value={config.contactObjective}
                placeholder="e.g. Find the podcast host, booking manager, or guest coordinator. Look for booking@ or contact@ emails first. Prioritize high-confidence contacts."
                onChange={e=>setConfig(p=>({...p,contactObjective:e.target.value}))} />
            </div>

            {/* Pitch Template */}
            <div className="card">
              <div className="section-label space-8">Pitch Template</div>
              <textarea className="textarea" style={{height:280}} value={config.template} onChange={e=>setConfig(p=>({...p,template:e.target.value}))} />
            </div>
          </div>
        )}

        {tab==='chat'&&(
          <div className="fade-up" style={{maxWidth:700,display:'flex',flexDirection:'column',height:'calc(100vh - 220px)'}}>
            <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:12,paddingBottom:12}}>
              {chatMsgs.length===0&&(
                <div className="card" style={{textAlign:'center',padding:40}}>
                  <div style={{fontSize:32,marginBottom:12}}>✦</div>
                  <div style={{fontFamily:'var(--font-syne)',fontSize:16,fontWeight:700,marginBottom:8}}>Admin AI</div>
                  <div style={{color:'var(--text-3)',fontSize:13,lineHeight:1.6,marginBottom:16}}>
                    Ask anything about this campaign — strategy, settings, reply analysis, or next steps.
                  </div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center'}}>
                    {['What should I do with my promising replies?','How can I improve my reply rate?','Pause this campaign until Monday',"Summarize this week's results"].map(s=>(
                      <button key={s} className="chip" style={{fontSize:11}} onClick={()=>setChatInput(s)}>{s}</button>
                    ))}
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
              {chatLoading&&<div style={{display:'flex'}}><div style={{padding:'12px 16px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'16px 16px 16px 4px',fontSize:13,color:'var(--text-3)'}}>◌ thinking...</div></div>}
              <div ref={chatEndRef}/>
            </div>
            <div style={{paddingTop:12,borderTop:'1px solid var(--border)',display:'flex',gap:8}}>
              <input className="settings-input" style={{flex:1}} placeholder="Ask anything about this campaign..." value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&sendChat()}/>
              <button className="btn-primary" onClick={sendChat} disabled={chatLoading||!chatInput.trim()}>Send</button>
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
