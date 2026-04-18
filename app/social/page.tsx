'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

interface IGAccount { id:string; name:string; assetId:string; igHandle?:string; active:boolean }
interface Variation { variationNum:number; url:string; title:string; uploadedAt:string }
interface Template { _id:string; accountId:string; contentType:string; name:string; caption:string; order:number; variations:Variation[]; variationCount:number }
interface QItem { _id:string; title:string; caption:string; videoUrl:string; type:string; scheduledDate:string; status:string; order:number; batchId:string; accountId:string; cycleNum?:number; templateName?:string; variationNum?:number; postedAt?:string; errorMsg?:string }
interface BotLog { _id:string; type:string; accountId?:string; startedAt:string; finishedAt?:string; durationMs?:number; status:string; itemsPosted:number; itemsFailed:number; itemsAttempted:number; details:{file:string;ok:boolean;error?:string}[] }
interface PreviewItem { templateName:string; variationNum:number; caption:string; scheduledDate:string; type:string; cycleNum:number }

const CONTENT_TYPES = [
  { id:'reel',  label:'Reels',      icon:'🎬', accept:'video/*',          hint:'Mon · Wed · Thu · Sun · 4/week' },
  { id:'story', label:'Stories',    icon:'📸', accept:'video/*,image/*',  hint:'Daily · restarts after 80' },
  { id:'post',  label:'Feed Posts', icon:'🖼',  accept:'video/*,image/*',  hint:'Mon · Wed · Thu · Sun · 4/week' },
]
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const STATUS_COLOR:Record<string,string> = { scheduled:'#5B4FE9',posted:'#00C896',failed:'#ef4444',running:'#f59e0b',success:'#00C896',partial:'#f59e0b' }
const DEFAULT_DAYS:Record<string,number[]> = { reel:[1,3,4,0], story:[0,1,2,3,4,5,6], post:[1,3,4,0] }
const DEFAULT_TIMES:Record<string,string> = { reel:'20:00', story:'09:00', post:'21:00' }

export default function SocialPage() {
  const [tab, setTab] = useState<'templates'|'queue'|'calendar'|'logs'|'accounts'>('templates')

  const [queueTotal, setQueueTotal] = useState<number>(0)
  const [calendarItems, setCalendarItems] = useState<Record<string,unknown>[]>([])
  const [calMonth, setCalMonth] = useState<Date>(new Date())
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [toast, setToast] = useState<{msg:string,type:'saving'|'success'|'error'}|null>(null)
  const showToast = (msg:string, type:'saving'|'success'|'error'='saving', ms=0) => {
    setToast({msg,type})
    if (ms > 0) setTimeout(()=>setToast(null), ms)
  }
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [accounts, setAccounts] = useState<IGAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [contentType, setContentType] = useState<'reel'|'story'|'post'>('post')
  const [templates, setTemplates] = useState<Template[]>([])
  const [queue, setQueue] = useState<QItem[]>([])
  const [logs, setLogs] = useState<BotLog[]>([])

  // Schedule config — per content type
  const [postDays, setPostDays] = useState<Record<string,number[]>>(DEFAULT_DAYS)
  const [postTimes, setPostTimes] = useState<Record<string,string>>(DEFAULT_TIMES)
  // Per-day times: { reel: { 1: '20:00', 3: '19:00', ... }, story: {...}, post: {...} }
  const [perDayTimes, setPerDayTimes] = useState<Record<string,Record<number,string>>>({reel:{},story:{},post:{}})
  // Random range: { reel: { enabled: true, from: '18:00', to: '22:00' }, ... }
  const [randomRange, setRandomRange] = useState<Record<string,{enabled:boolean,from:string,to:string}>>({
    reel:{enabled:false,from:'18:00',to:'22:00'},
    story:{enabled:false,from:'08:00',to:'11:00'},
    post:{enabled:false,from:'19:00',to:'22:00'},
  })

  // Preview modal
  const [showPreview, setShowPreview] = useState(false)
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([])
  const [previewing, setPreviewing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [schedResult, setSchedResult] = useState<Record<string,unknown>|null>(null)

  // Template editing
  const [editingId, setEditingId] = useState<string|null>(null)
  const [editName, setEditName] = useState('')
  const [editCaption, setEditCaption] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [dragIdx, setDragIdx] = useState<number|null>(null)
  const [dragOver, setDragOver] = useState<number|null>(null)

  // New template
  const [addingTemplate, setAddingTemplate] = useState(false)
  const [newTplName, setNewTplName] = useState('')
  const [newTplCaption, setNewTplCaption] = useState('')
  const [newTplFiles, setNewTplFiles] = useState<File[]>([])
  const [newTplOrder, setNewTplOrder] = useState(1)
  const [saving, setSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({current:0,total:0,file:''})
  const [addAcctForm, setAddAcctForm] = useState({name:'',assetId:'',igHandle:''})
  const [qFilter, setQFilter] = useState<'all'|'scheduled'|'posted'|'failed'>('all')
  const fileRef = useRef<HTMLInputElement>(null)

  const loadAll = useCallback(async () => {
    const [ar,qr,cr,lr] = await Promise.all([
      fetch('/api/social/accounts').then(r=>r.json()),
      fetch('/api/social/queue').then(r=>r.json()),
      fetch('/api/social/queue?countOnly=true').then(r=>r.json()).catch(()=>({total:0})),
      fetch('/api/social/logs?limit=40').then(r=>r.json()),
    ])
    if (ar.ok) { setAccounts(ar.accounts); if (!selectedAccount && ar.accounts[0]) setSelectedAccount(ar.accounts[0].id) }
    if (qr.ok) setQueue(qr.items)
    if (cr?.total != null) setQueueTotal(cr.total)
    if (lr.ok) setLogs(lr.logs)
  }, [selectedAccount])

  const loadTemplates = useCallback(async () => {
    if (!selectedAccount) return
    const r = await fetch(`/api/social/templates?accountId=${selectedAccount}&contentType=${contentType}`)
    const d = await r.json()
    if (d.ok) setTemplates(d.templates.sort((a:Template,b:Template)=>a.order-b.order))
    // Load saved settings from DB (source of truth)
    const sr = await fetch(`/api/social/settings?accountId=${selectedAccount}`)
    const sd = await sr.json()
    const s = sd.settings || {}
    // Map settings fields to the right content type
    const daysKey = contentType==='story' ? 'storyDays' : contentType==='reel' ? 'reelDays' : 'postDays'
    const timeKey = contentType==='story' ? 'storyTime' : contentType==='reel' ? 'reelTime' : 'postTime'
    if (s[daysKey]) setPostDays(p=>({...p,[contentType]: [...(s[daysKey] as number[])].sort((a,b)=>a-b)}))
    if (s[timeKey]) setPostTimes(p=>({...p,[contentType]: s[timeKey] as string}))
    // Also restore random range if saved
    // DB stores as randomRange_post / randomRange_story / randomRange_reel
    const rrKey = `randomRange_${contentType}`
    if (s[rrKey]) setRandomRange(p=>({...p,[contentType]:s[rrKey]}))
  }, [selectedAccount, contentType])

  useEffect(()=>{ loadAll() },[])
  useEffect(()=>{ loadTemplates() },[loadTemplates])

  // ── Template editing ──────────────────────────────────────────────────────
  function startEdit(t:Template) { setEditingId(t._id); setEditName(t.name); setEditCaption(t.caption) }
  async function saveEdit(t:Template) {
    setSavingEdit(true)
    await fetch('/api/social/templates',{method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:t._id,name:editName,caption:editCaption})})
    setEditingId(null); setSavingEdit(false); loadTemplates()
  }
  function cancelEdit() { setEditingId(null) }

  // Drag-to-reorder templates
  async function onDrop(toIdx:number) {
    if (dragIdx===null || dragIdx===toIdx) { setDragIdx(null); setDragOver(null); return }
    const reordered = [...templates]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setTemplates(reordered)
    setDragIdx(null); setDragOver(null)
    // Persist new orders
    await Promise.all(reordered.map((t,i)=>
      fetch('/api/social/templates',{method:'PATCH',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:t._id,order:i+1})})
    ))
    // Auto-regenerate queue with new template order
    await fetch('/api/social/generate',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({accountId:selectedAccount,types:[contentType],yearsAhead:3,randomRange:randomRange[contentType]||null})})
    loadTemplates(); loadAll()
  }

  // ── Upload new template ───────────────────────────────────────────────────
  async function saveTemplate() {
    if (!newTplName || !newTplFiles.length || !selectedAccount) return
    setSaving(true)
    const res = await fetch('/api/social/templates',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({accountId:selectedAccount,contentType,name:newTplName,caption:newTplCaption,order:newTplOrder})})
    const {id:templateId} = await res.json()
    for (let i=0;i<newTplFiles.length;i++) {
      const file=newTplFiles[i]
      setUploadProgress({current:i+1,total:newTplFiles.length,file:file.name})
      try {
        // Upload file through server to DO Spaces (avoids CORS/presigned issues)
        const uploadRes = await fetch(`/api/social/upload?filename=${encodeURIComponent(file.name)}&contentType=${contentType}&templateName=${encodeURIComponent(newTplName)}&variationNum=${i+1}`,
          {method:'POST', body:file, headers:{'Content-Type':file.type}})
        if (!uploadRes.ok) throw new Error(`Upload failed: Server error ${uploadRes.status}`)
        const {url: cdnUrl} = await uploadRes.json()
        // Save variation URL to template
        await fetch('/api/social/templates',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({variation:{templateId,variationNum:i+1,url:cdnUrl,title:`V${i+1}`}})})
      } catch(e) { alert(`Upload failed: ${(e as Error).message}`); setSaving(false); return }
    }
    setSaving(false); setAddingTemplate(false)
    setNewTplName(''); setNewTplCaption(''); setNewTplFiles([]); setNewTplOrder(templates.length+2)
    loadTemplates()
  }

  async function deleteTemplate(id:string, name:string) {
    if (!confirm(`Delete "${name}" and all its variations?`)) return
    await fetch('/api/social/templates',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
    loadTemplates()
  }

  // ── Preview & Confirm ─────────────────────────────────────────────────────
  async function runPreview() {
    setPreviewing(true); setSchedResult(null)
    const r = await fetch('/api/social/schedule',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({accountId:selectedAccount,contentType,postDays:postDays[contentType],postTime:postTimes[contentType],perDayTimes:perDayTimes[contentType]||{},randomRange:randomRange[contentType],force:true,preview:true})})
    const d = await r.json()
    if (d.ok && d.preview) { setPreviewItems(d.items as PreviewItem[]); setShowPreview(true) }
    else alert(d.error||'Preview failed')
    setPreviewing(false)
  }

  async function confirmSchedule() {
    setConfirming(true)
    showToast('Saving settings…', 'saving')
    try {
      // 1. Save settings to DB
      const rr = randomRange?.[contentType] as {enabled?:boolean,from?:string,to?:string}|undefined
      await fetch('/api/social/settings',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          accountId:selectedAccount,
          postDays:    contentType==='post'  ? postDays[contentType]  : undefined,
          postTime:    contentType==='post'  ? postTimes[contentType] : undefined,
          storyDays:   contentType==='story' ? postDays[contentType]  : undefined,
          storyTime:   contentType==='story' ? postTimes[contentType] : undefined,
          reelDays:    contentType==='reel'  ? postDays[contentType]  : undefined,
          reelTime:    contentType==='reel'  ? postTimes[contentType] : undefined,
          postTimezone:'America/New_York',
          [`randomRange_${contentType}`]: rr,
        })})
      showToast('Generating schedule — don\'t refresh…', 'saving')
      // 2. Generate infinite queue
      const r = await fetch('/api/social/generate',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({accountId:selectedAccount, types:[contentType], yearsAhead:3, randomRange:randomRange[contentType]||null})})
      const d = await r.json()
      const count = d.generated?.[contentType] || 0
      setSchedResult(d); setShowPreview(false)
      showToast(`✓ Saved! ${count} posts generated`, 'success', 4000)
    } catch(e) {
      showToast('Something went wrong — try again', 'error', 4000)
    }
    setConfirming(false)
    loadAll(); loadTemplates()
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const filtQ = queue.filter(i=>(qFilter==='all'||i.status===qFilter)&&i.accountId===selectedAccount)
  const qStats = {scheduled:filtQ.filter(i=>i.status==='scheduled').length,posted:filtQ.filter(i=>i.status==='posted').length,failed:filtQ.filter(i=>i.status==='failed').length}
  const lastLog = logs[0]
  const ct = CONTENT_TYPES.find(c=>c.id===contentType)!

  // Interleave preview string
  const interleavePreview = (() => {
    if (!templates.length) return ''
    const maxV = Math.max(...templates.map(t=>t.variationCount))
    const rows:string[] = []
    for (let v=0;v<Math.min(maxV,3);v++) {
      for (const t of templates) {
        if (v<t.variationCount) rows.push(`T${t.order}·V${v+1}`)
      }
    }
    const total = Math.max(...templates.map(t=>t.variationCount)) * templates.length
    return rows.join(' → ') + (rows.length<total ? ` → ... (${total} total, restarts)` : '')
  })()

  const activeDays = [...(postDays[contentType] || DEFAULT_DAYS[contentType])].sort((a,b)=>a-b)
  const activeTime = postTimes[contentType] || DEFAULT_TIMES[contentType]

  function toggleDay(d:number) {
    setPostDays(p=>({ ...p, [contentType]: p[contentType]?.includes(d) ? p[contentType].filter(x=>x!==d) : [...(p[contentType]||[]),d].sort((a,b)=>a-b) }))
  }

  return (
    <div>
      {/* ── Toast notification ───────────────────────────────────────────── */}
      {toast && (
        <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:9999,
          background:toast.type==='success'?'#16a34a':toast.type==='error'?'#dc2626':'#1e1b4b',
          color:'#fff',borderRadius:12,padding:'12px 20px',fontSize:13,fontWeight:500,
          display:'flex',alignItems:'center',gap:10,boxShadow:'0 8px 32px rgba(0,0,0,0.4)',
          minWidth:240,justifyContent:'center',pointerEvents:'none',
          animation:'slideUp 0.2s ease'}}>
          {toast.type==='saving'&&<div style={{width:14,height:14,border:'2px solid rgba(255,255,255,0.3)',borderTop:'2px solid #fff',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>}
          {toast.type==='success'&&<span style={{fontSize:16}}>✓</span>}
          {toast.type==='error'&&<span style={{fontSize:16}}>✗</span>}
          {toast.msg}
        </div>
      )}
      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateX(-50%) translateY(12px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>
      {/* ── Preview Modal ─────────────────────────────────────────────────── */}
      {showPreview && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
          <div style={{background:'var(--surface)',borderRadius:16,width:'100%',maxWidth:760,maxHeight:'85vh',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 20px 60px rgba(0,0,0,0.5)'}}>
            <div style={{padding:'20px 24px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontWeight:700,fontSize:16}}>Schedule Preview — {ct.icon} {ct.label}</div>
                <div style={{fontSize:12,color:'var(--text-3)',marginTop:2}}>{previewItems.length} items · {activeDays.map(d=>DAY_LABELS[d]).join(' · ')} at {activeTime} · confirm to write to queue</div>
              </div>
              <button onClick={()=>setShowPreview(false)} style={{fontSize:20,background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',lineHeight:1}}>×</button>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'0 4px'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead style={{position:'sticky',top:0,background:'var(--surface)',zIndex:1}}>
                  <tr style={{borderBottom:'1px solid var(--border)'}}>
                    {['#','Template','Variation','Date','Day','Time','Cycle'].map(h=>(
                      <th key={h} style={{textAlign:'left',padding:'10px 14px',fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',textTransform:'uppercase',fontWeight:500}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewItems.map((item,i)=>{
                    const dt = new Date(item.scheduledDate)
                    const isNew = i>0 && ((item as unknown) as {cycleNum:number}).cycleNum > ((previewItems[i-1] as unknown) as {cycleNum:number}).cycleNum
                    return (
                      <tr key={i} style={{borderBottom:'1px solid var(--border)',background:isNew?'rgba(91,79,233,0.04)':'transparent'}}>
                        <td style={{padding:'8px 14px',color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',width:36}}>{i+1}</td>
                        <td style={{padding:'8px 14px',fontWeight:500}}>{item.templateName}</td>
                        <td style={{padding:'8px 14px',fontFamily:'var(--font-dm-mono)',color:'var(--accent)'}}>V{item.variationNum}</td>
                        <td style={{padding:'8px 14px',fontFamily:'var(--font-dm-mono)',fontSize:11}}>{dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
                        <td style={{padding:'8px 14px',color:'var(--text-3)'}}>{DAY_LABELS[dt.getDay()]}</td>
                        <td style={{padding:'8px 14px',fontFamily:'var(--font-dm-mono)',color:'var(--text-3)'}}>{dt.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</td>
                        <td style={{padding:'8px 14px'}}>
                          {isNew && <span style={{fontSize:9,background:'rgba(91,79,233,0.15)',color:'var(--accent)',borderRadius:8,padding:'2px 6px'}}>new cycle</span>}
                          {!isNew && <span style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)'}}>{(item as unknown as {cycleNum:number}).cycleNum}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{padding:'16px 24px',borderTop:'1px solid var(--border)',display:'flex',gap:10,alignItems:'center'}}>
              <button onClick={()=>setShowPreview(false)} style={{padding:'9px 20px',borderRadius:8,border:'1px solid var(--border)',background:'none',color:'var(--text-2)',cursor:'pointer',fontSize:13}}>Cancel</button>
              <button className="btn-primary" onClick={confirmSchedule} disabled={confirming} style={{flex:1,padding:'10px',fontSize:14}}>
                {confirming?'◌ Saving & generating infinite queue...':`✓ Save settings & generate full schedule`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="page-header-bar">
        <div>
          <div className="page-title">Social Queue</div>
          <div className="page-sub">
            {queueTotal||queue.filter(i=>i.status==='scheduled').length} scheduled · {accounts.length} account{accounts.length!==1?'s':''}
            {lastLog&&<span style={{marginLeft:8}}>· Last run: <span style={{color:STATUS_COLOR[lastLog.status]||'var(--text-3)'}}>{lastLog.status}</span> {new Date(lastLog.startedAt).toLocaleDateString()}</span>}
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          {(['templates','queue','calendar','logs','accounts'] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{padding:'6px 14px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:tab===t?'var(--accent)':'var(--surface-2)',color:tab===t?'#fff':'var(--text-2)'}}>
              {t==='templates'?'🎞 Templates':t==='queue'?`📅 Queue (${queueTotal||queue.filter(i=>i.accountId===selectedAccount).length})`:t==='calendar'?'📆 Calendar':t==='logs'?'🤖 Logs':'⚙ Accounts'}
            </button>
          ))}
        </div>
      </div>

      <div className="main">
        {/* Account + type selector */}
        {(tab==='templates'||tab==='queue')&&accounts.length>0&&(
          <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
            {accounts.map(a=>(
              <button key={a.id} onClick={()=>setSelectedAccount(a.id)} style={{padding:'6px 14px',borderRadius:20,fontSize:12,cursor:'pointer',border:`2px solid ${selectedAccount===a.id?'var(--accent)':'var(--border)'}`,background:selectedAccount===a.id?'rgba(91,79,233,0.08)':'var(--surface-2)',color:selectedAccount===a.id?'var(--accent)':'var(--text-2)',fontWeight:selectedAccount===a.id?700:400}}>
                {a.name}{a.igHandle&&<span style={{fontWeight:400,fontSize:11,color:'var(--text-3)',marginLeft:4}}>{a.igHandle}</span>}
              </button>
            ))}
            {tab==='templates'&&(
              <div style={{marginLeft:'auto',display:'flex',gap:6}}>
                {CONTENT_TYPES.map(c=>(
                  <button key={c.id} onClick={()=>setContentType(c.id as 'reel'|'story'|'post')} style={{padding:'5px 12px',borderRadius:10,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:contentType===c.id?'var(--accent)':'var(--surface-2)',color:contentType===c.id?'#fff':'var(--text-2)'}}>
                    {c.icon} {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TEMPLATES ─────────────────────────────────────────────────────── */}
        {tab==='templates'&&(
          <div style={{maxWidth:800}}>
            {accounts.length===0?(
              <div className="card" style={{textAlign:'center',padding:32}}>
                <div style={{fontSize:32,marginBottom:8}}>📱</div>
                <div style={{fontWeight:600,marginBottom:12}}>Add an Instagram account first</div>
                <button className="btn-primary" onClick={()=>setTab('accounts')}>Add Account →</button>
              </div>
            ):(
              <>
                {/* Schedule config card */}
                {templates.length>0&&(
                  <div className="card" style={{marginBottom:16}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:16,alignItems:'start'}}>
                      <div>
                        <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:10}}>
                          <div style={{fontWeight:600,fontSize:13}}>
                            {ct.icon} {accounts.find(a=>a.id===selectedAccount)?.name} — {ct.label} Schedule
                          </div>
                          <div style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)'}}>
                            Saved: {activeDays.map(d=>DAY_LABELS[d]).join('·')} @ {activeTime} ET
                          </div>
                        </div>
                        {/* Day selector */}
                        <div style={{marginBottom:12}}>
                          <div style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',textTransform:'uppercase',marginBottom:6}}>Post days</div>
                          <div style={{display:'flex',gap:5}}>
                            {DAY_LABELS.map((d,i)=>(
                              <button key={i} onClick={()=>toggleDay(i)} style={{width:40,height:36,borderRadius:8,fontSize:11,cursor:'pointer',fontWeight:activeDays.includes(i)?700:400,border:`2px solid ${activeDays.includes(i)?'var(--accent)':'var(--border)'}`,background:activeDays.includes(i)?'rgba(91,79,233,0.1)':'var(--surface-2)',color:activeDays.includes(i)?'var(--accent)':'var(--text-3)'}}>
                                {d}
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* Time — per-day + random range */}
                        <div style={{marginBottom:12}}>
                          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                            <div style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',textTransform:'uppercase'}}>Post time</div>
                            <button onClick={()=>setRandomRange(p=>({...p,[contentType]:{...p[contentType],enabled:!p[contentType].enabled}}))}
                              style={{display:'flex',alignItems:'center',gap:6,fontSize:11,background:'none',border:'none',cursor:'pointer',color:randomRange[contentType]?.enabled?'var(--accent)':'var(--text-3)'}}>
                              <div style={{width:28,height:16,borderRadius:8,background:randomRange[contentType]?.enabled?'var(--accent)':'var(--border)',position:'relative',transition:'background 0.2s'}}>
                                <div style={{position:'absolute',top:2,left:randomRange[contentType]?.enabled?12:2,width:12,height:12,borderRadius:'50%',background:'#fff',transition:'left 0.2s'}}/>
                              </div>
                              Random range
                            </button>
                          </div>
                          {randomRange[contentType]?.enabled ? (
                            <div style={{display:'flex',alignItems:'center',gap:8}}>
                              <input type="time" value={randomRange[contentType].from}
                                onChange={e=>setRandomRange(p=>({...p,[contentType]:{...p[contentType],from:e.target.value}}))}
                                style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 10px',fontSize:13,color:'var(--text)',outline:'none',fontFamily:'var(--font-dm-mono)'}}/>
                              <span style={{fontSize:11,color:'var(--text-3)'}}>to</span>
                              <input type="time" value={randomRange[contentType].to}
                                onChange={e=>setRandomRange(p=>({...p,[contentType]:{...p[contentType],to:e.target.value}}))}
                                style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 10px',fontSize:13,color:'var(--text)',outline:'none',fontFamily:'var(--font-dm-mono)'}}/>
                              <div style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)'}}>random each week</div>
                            </div>
                          ) : (
                            <div style={{display:'flex',flexDirection:'column',gap:6}}>
                              {activeDays.map(dayIdx => (
                                <div key={dayIdx} style={{display:'flex',alignItems:'center',gap:8}}>
                                  <div style={{width:28,fontSize:11,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',fontWeight:600}}>{DAY_LABELS[dayIdx]}</div>
                                  <input type="time"
                                    value={perDayTimes[contentType]?.[dayIdx] ?? activeTime}
                                    onChange={e=>setPerDayTimes(p=>({...p,[contentType]:{...p[contentType],[dayIdx]:e.target.value}}))}
                                    style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'5px 10px',fontSize:13,color:'var(--text)',outline:'none',fontFamily:'var(--font-dm-mono)'}}/>
                                </div>
                              ))}
                              <button onClick={()=>{
                                const t = activeDays.length > 0 ? (perDayTimes[contentType]?.[activeDays[0]] ?? activeTime) : activeTime
                                const all = Object.fromEntries(activeDays.map(d=>[d,t]))
                                setPerDayTimes(p=>({...p,[contentType]:all}))
                              }} style={{fontSize:10,color:'var(--text-3)',background:'none',border:'none',cursor:'pointer',textAlign:'left',marginTop:2}}>
                                Set all days to same time
                              </button>
                            </div>
                          )}
                        </div>
                        {/* Interleave order */}
                        {interleavePreview&&(
                          <div style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',padding:'6px 10px',background:'var(--surface-2)',borderRadius:6}}>
                            Order: {interleavePreview}
                          </div>
                        )}
                        {schedResult&&(
                          <div style={{marginTop:8,padding:'7px 12px',borderRadius:8,background:((schedResult.ok&&!schedResult.skipped)?'rgba(0,200,150,0.08)':'var(--surface-2)'),fontSize:12,fontFamily:'var(--font-dm-mono)'}}>
                            {schedResult.skipped?`↩ ${schedResult.message}`:schedResult.scheduled?`✓ ${schedResult.scheduled} items written to queue · Cycle ${schedResult.cycleNum}`:`${schedResult.message||JSON.stringify(schedResult)}`}
                          </div>
                        )}
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:8,minWidth:180}}>
                        <button className="btn-primary" onClick={runPreview} disabled={previewing||!activeDays.length} style={{fontSize:13,padding:'10px 16px',whiteSpace:'nowrap'}}>
                          {previewing?'◌ Previewing...':'Preview schedule →'}
                        </button>
                        <div style={{fontSize:10,color:'var(--text-3)',textAlign:'center'}}>Review before confirming</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Template list — drag to reorder */}
                <div style={{marginBottom:8,fontSize:11,color:'var(--text-3)'}}>
                  {templates.length>0?'Drag to reorder · Click name or caption to edit':''}
                </div>
                {templates.map((tmpl,ti)=>(
                  <div key={tmpl._id}
                    draggable onDragStart={()=>setDragIdx(ti)} onDragOver={e=>{e.preventDefault();setDragOver(ti)}} onDrop={()=>onDrop(ti)} onDragEnd={()=>{setDragIdx(null);setDragOver(null)}}
                    className="card" style={{marginBottom:10,opacity:dragIdx===ti?0.4:1,border:`2px solid ${dragOver===ti&&dragIdx!==ti?'var(--accent)':'var(--border)'}`,transition:'border-color 0.1s',cursor:'grab'}}>
                    <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
                      {/* Drag handle + order */}
                      <div style={{paddingTop:2,color:'var(--text-3)',cursor:'grab',userSelect:'none'}}>
                        <div style={{fontSize:14,lineHeight:1}}>⠿</div>
                        <div style={{fontSize:10,fontFamily:'var(--font-dm-mono)',color:'var(--accent)',marginTop:3,textAlign:'center'}}>T{ti+1}</div>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        {editingId===tmpl._id?(
                          <div style={{display:'flex',flexDirection:'column',gap:8}}>
                            <input value={editName} onChange={e=>setEditName(e.target.value)} autoFocus
                              style={{background:'var(--surface-2)',border:'1px solid var(--accent)',borderRadius:7,padding:'6px 10px',fontSize:14,fontWeight:600,color:'var(--text)',outline:'none'}}/>
                            <textarea value={editCaption} onChange={e=>setEditCaption(e.target.value)} rows={2}
                              style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:7,padding:'6px 10px',fontSize:12,color:'var(--text)',outline:'none',resize:'vertical',fontFamily:'inherit'}}/>
                            <div style={{display:'flex',gap:6}}>
                              <button className="btn-primary" onClick={()=>saveEdit(tmpl)} disabled={savingEdit} style={{fontSize:11,padding:'5px 14px'}}>{savingEdit?'◌ Saving...':'Save'}</button>
                              <button onClick={cancelEdit} style={{fontSize:11,padding:'5px 12px',borderRadius:7,border:'1px solid var(--border)',background:'none',cursor:'pointer',color:'var(--text-2)'}}>Cancel</button>
                            </div>
                          </div>
                        ):(
                          <>
                            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                              <div style={{fontWeight:600,fontSize:14,cursor:'pointer'}} onClick={()=>startEdit(tmpl)}>{tmpl.name} <span style={{fontSize:10,color:'var(--text-3)',fontWeight:400}}>✏</span></div>
                              <button onClick={()=>deleteTemplate(tmpl._id,tmpl.name)} style={{fontSize:11,color:'#ef4444',background:'none',border:'1px solid rgba(239,68,68,0.3)',borderRadius:6,padding:'2px 10px',cursor:'pointer',flexShrink:0}}>Delete</button>
                            </div>
                            {contentType!=='story' && <div style={{fontSize:11,color:'var(--text-3)',marginBottom:8,cursor:'pointer'}} onClick={()=>startEdit(tmpl)}>
                              {tmpl.caption?`"${tmpl.caption.substring(0,80)}${tmpl.caption.length>80?'…':''}"` : <span style={{fontStyle:'italic'}}>no caption — click to add</span>}
                            </div>}
                            <div style={{display:'flex',gap:5,flexWrap:'wrap',alignItems:'center'}}>
                              {tmpl.variations.slice(0,15).map((v,vi)=>(
                                <label key={vi} title={`Click to replace V${v.variationNum}`} style={{cursor:'pointer'}}>
                                  <input type="file" accept="video/*,image/*" style={{display:'none'}} onChange={async e=>{
                                    const file=e.target.files?.[0]; if(!file) return
                                    try {
                                      const pr=await fetch(`/api/social/upload?filename=${encodeURIComponent(file.name)}&contentType=${contentType}&templateName=${encodeURIComponent(tmpl.name)}&variationNum=${v.variationNum}`,
                                        {method:'POST',body:file,headers:{'Content-Type':file.type}})
                                      if(!pr.ok) throw new Error('Upload failed: '+pr.status)
                                      const {url:cdnUrl}=await pr.json()
                                      const newVars=tmpl.variations.map((vv,j)=>j===vi?{...vv,url:cdnUrl,uploadedAt:new Date().toISOString()}:vv)
                                      await fetch('/api/social/templates',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:tmpl._id,variations:newVars})})
                                      loadTemplates()
                                    } catch(e){alert('Upload failed: '+(e as Error).message)}
                                  }}/>
                                  <div style={{fontSize:10,background:'var(--surface-2)',borderRadius:5,padding:'3px 7px',fontFamily:'var(--font-dm-mono)',color:'var(--accent)',border:'1px dashed var(--border)',cursor:'pointer'}}
                                    title="Click to swap this variation file">
                                    V{v.variationNum} ✏
                                  </div>
                                </label>
                              ))}
                              {tmpl.variationCount>15&&<span style={{fontSize:10,color:'var(--text-3)',padding:'3px 0'}}>+{tmpl.variationCount-15} more</span>}
                              <span style={{fontSize:10,color:'var(--text-3)',marginLeft:4}}>{tmpl.variationCount} variations</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add template */}
                {!addingTemplate?(
                  <button onClick={()=>{setAddingTemplate(true);setNewTplOrder(templates.length+1)}}
                    style={{width:'100%',padding:'12px',borderRadius:10,border:'2px dashed var(--border)',background:'transparent',color:'var(--text-3)',fontSize:13,cursor:'pointer',marginTop:4}}>
                    + Add Template {templates.length+1}
                  </button>
                ):(
                  <div className="card" style={{marginTop:8}}>
                    <div style={{fontWeight:600,fontSize:13,marginBottom:12}}>New Template</div>
                    <div style={{display:'flex',flexDirection:'column',gap:10}}>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 70px',gap:8}}>
                        <input value={newTplName} onChange={e=>setNewTplName(e.target.value)} placeholder="Template name"
                          style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'var(--text)',outline:'none'}}/>
                        <input type="number" min={1} max={20} value={newTplOrder} onChange={e=>setNewTplOrder(parseInt(e.target.value)||1)}
                          style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 10px',fontSize:13,color:'var(--text)',outline:'none',textAlign:'center'}}/>
                      </div>
                      {contentType!=='story' && <textarea value={newTplCaption} onChange={e=>setNewTplCaption(e.target.value)}
                        placeholder="Caption for ALL variations of this template" rows={2}
                        style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'var(--text)',outline:'none',resize:'vertical',fontFamily:'inherit'}}/>}
                      <div>
                        <div style={{fontSize:11,color:'var(--text-3)',marginBottom:5}}>{newTplFiles.length} variations selected — order matters (V1, V2...)</div>
                        <div onDrop={e=>{e.preventDefault();setNewTplFiles(p=>[...p,...Array.from(e.dataTransfer.files)])}}
                          onDragOver={e=>e.preventDefault()} onClick={()=>fileRef.current?.click()}
                          style={{border:'2px dashed var(--border)',borderRadius:10,padding:newTplFiles.length?'10px 12px':'20px 16px',cursor:'pointer',display:'flex',gap:7,flexWrap:'wrap',minHeight:52,alignItems:'center'}}>
                          <input ref={fileRef} type="file" accept={ct.accept} multiple style={{display:'none'}} onChange={e=>setNewTplFiles(p=>[...p,...Array.from(e.target.files||[])])}/>
                          {newTplFiles.length===0?<span style={{fontSize:12,color:'var(--text-3)'}}>Drop all variation files here or click to browse</span>:
                            newTplFiles.map((f,i)=>(
                              <div key={i} style={{display:'flex',alignItems:'center',gap:4,background:'var(--surface-2)',borderRadius:6,padding:'3px 8px',fontSize:11}}>
                                <span style={{color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',minWidth:22}}>V{i+1}</span>
                                <span style={{maxWidth:90,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</span>
                                <button onClick={e=>{e.stopPropagation();setNewTplFiles(p=>p.filter((_,j)=>j!==i))}} style={{fontSize:13,color:'var(--text-3)',background:'none',border:'none',cursor:'pointer'}}>×</button>
                              </div>
                            ))
                          }
                        </div>
                      </div>
                      {saving&&(
                        <div style={{background:'var(--surface-2)',borderRadius:8,padding:'8px 12px'}}>
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:4}}>
                            <span style={{fontFamily:'var(--font-dm-mono)'}}>Uploading V{uploadProgress.current}/{uploadProgress.total}</span>
                            <span style={{color:'var(--text-3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'55%'}}>{uploadProgress.file}</span>
                          </div>
                          <div style={{height:3,background:'var(--border)',borderRadius:2}}>
                            <div style={{height:'100%',background:'var(--accent)',borderRadius:2,width:`${(uploadProgress.current/uploadProgress.total)*100}%`,transition:'width 0.3s'}}/>
                          </div>
                        </div>
                      )}
                      <div style={{display:'flex',gap:8}}>
                        <button className="btn-primary" onClick={saveTemplate} disabled={saving||!newTplName||!newTplFiles.length} style={{flex:1}}>
                          {saving?`◌ Uploading V${uploadProgress.current}/${uploadProgress.total}...`:`Save + Upload ${newTplFiles.length} variations`}
                        </button>
                        <button onClick={()=>{setAddingTemplate(false);setNewTplFiles([])}} style={{padding:'8px 16px',borderRadius:8,border:'1px solid var(--border)',background:'none',color:'var(--text-2)',cursor:'pointer',fontSize:13}}>Cancel</button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── QUEUE ────────────────────────────────────────────────────────── */}
        {tab==='queue'&&(
          <div>
            <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
              {(['all','scheduled','posted','failed'] as const).map(s=>(
                <button key={s} onClick={()=>setQFilter(s)} style={{padding:'5px 14px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:qFilter===s?'var(--accent)':'var(--surface-2)',color:qFilter===s?'#fff':'var(--text-2)'}}>
                  {s} ({s==='all'?filtQ.length:qStats[s]??0})
                </button>
              ))}
              <button onClick={loadAll} style={{marginLeft:'auto',fontSize:11,color:'var(--text-3)',background:'none',border:'1px solid var(--border)',borderRadius:8,padding:'4px 10px',cursor:'pointer'}}>↻</button>
            </div>
            {filtQ.length===0?(
              <div style={{textAlign:'center',padding:40,color:'var(--text-3)'}}>
                <div style={{fontSize:32,marginBottom:8}}>📅</div>
                <div style={{fontSize:13}}>No items in queue</div>
                <button className="btn-primary" style={{marginTop:16,fontSize:12}} onClick={()=>setTab('templates')}>Set up templates →</button>
              </div>
            ):(
              <div className="card">
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
                    {['Type','Template','V','Date','Day','Time','Status','Cycle'].map(h=>(
                      <th key={h} style={{textAlign:'left',padding:'5px 10px',fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',textTransform:'uppercase'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {filtQ.sort((a,b)=>new Date(a.scheduledDate).getTime()-new Date(b.scheduledDate).getTime()).slice(0,120).map(item=>{
                      const dt=new Date(item.scheduledDate)
                      return (
                        <tr key={item._id} style={{borderBottom:'1px solid var(--border)'}}>
                          <td style={{padding:'6px 10px',fontSize:15}}>{item.type==='reel'?'🎬':item.type==='story'?'📸':'🖼'}</td>
                          <td style={{padding:'6px 10px',maxWidth:130}}><div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500,fontSize:11}}>{item.templateName||item.title}</div></td>
                          <td style={{padding:'6px 10px',fontFamily:'var(--font-dm-mono)',color:'var(--accent)',fontSize:11}}>V{item.variationNum||'?'}</td>
                          <td style={{padding:'6px 10px',fontFamily:'var(--font-dm-mono)',fontSize:11}}>{dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'})}</td>
                          <td style={{padding:'6px 10px',color:'var(--text-3)',fontSize:11}}>{DAY_LABELS[dt.getDay()]}</td>
                          <td style={{padding:'6px 10px',fontFamily:'var(--font-dm-mono)',color:'var(--text-3)',fontSize:11}}>{dt.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</td>
                          <td style={{padding:'6px 10px'}}>
                            <span style={{fontSize:10,background:(STATUS_COLOR[item.status]||'#666')+'22',color:STATUS_COLOR[item.status]||'#666',border:`1px solid ${STATUS_COLOR[item.status]||'#666'}44`,borderRadius:10,padding:'2px 6px',fontFamily:'var(--font-dm-mono)'}}>{item.status}</span>
                          </td>
                          <td style={{padding:'6px 10px',color:'var(--text-3)',fontSize:11,fontFamily:'var(--font-dm-mono)'}}>{item.cycleNum||1}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── LOGS ────────────────────────────────────────────────────────── */}
        {tab==='logs'&&(
          <div>
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
              <button onClick={loadAll} style={{fontSize:11,color:'var(--text-3)',background:'none',border:'1px solid var(--border)',borderRadius:8,padding:'4px 10px',cursor:'pointer'}}>↻ Refresh</button>
            </div>
            {logs.length===0?<div style={{textAlign:'center',padding:40,color:'var(--text-3)',fontSize:13}}>No bot runs yet</div>:(
              logs.map(log=>(
                <div key={log._id} className="card" style={{marginBottom:10}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <span style={{fontSize:14}}>{log.type==='reel'?'🎬':log.type==='story'?'📸':'📦'}</span>
                      <div>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <span style={{fontWeight:600,fontSize:13,textTransform:'capitalize'}}>{log.type} · {accounts.find(a=>a.id===log.accountId)?.name||log.accountId||'batch'}</span>
                          <span style={{fontSize:10,background:(STATUS_COLOR[log.status]||'#666')+'22',color:STATUS_COLOR[log.status]||'#666',border:`1px solid ${STATUS_COLOR[log.status]||'#666'}44`,borderRadius:10,padding:'2px 7px',fontFamily:'var(--font-dm-mono)'}}>{log.status}</span>
                        </div>
                        <div style={{fontSize:11,color:'var(--text-3)',marginTop:1}}>
                          {new Date(log.startedAt).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}
                          {log.durationMs&&<span style={{marginLeft:8,fontFamily:'var(--font-dm-mono)'}}>{(log.durationMs/1000).toFixed(1)}s</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:13,fontWeight:600,color:'var(--green)'}}>{log.itemsPosted} posted</div>
                      {log.itemsFailed>0&&<div style={{fontSize:11,color:'#ef4444'}}>{log.itemsFailed} failed</div>}
                    </div>
                  </div>
                  {log.details?.length>0&&(
                    <div style={{borderTop:'1px solid var(--border)',paddingTop:6}}>
                      {log.details.map((d,i)=>(
                        <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'3px 0',fontSize:11}}>
                          <span style={{color:d.ok?'var(--green)':'#ef4444',fontWeight:700}}>{d.ok?'✓':'✗'}</span>
                          <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.file}</span>
                          {d.error&&<span style={{color:'#ef4444',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.error}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── ACCOUNTS ────────────────────────────────────────────────────── */}
        {tab==='accounts'&&(
          <div style={{maxWidth:580}}>
            {accounts.map(a=>(
              <div key={a.id} className="card" style={{marginBottom:10}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontWeight:600,fontSize:14}}>{a.name}{a.igHandle&&<span style={{fontSize:12,color:'var(--text-3)',fontWeight:400,marginLeft:6}}>{a.igHandle}</span>}</div>
                    <div style={{fontSize:11,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',marginTop:2}}>asset_id: {a.assetId}</div>
                  </div>
                  <button onClick={async()=>{if(!confirm(`Delete ${a.name}?`))return;await fetch('/api/social/accounts',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:a.id})});loadAll()}} style={{fontSize:11,color:'#ef4444',background:'none',border:'1px solid rgba(239,68,68,0.3)',borderRadius:6,padding:'3px 10px',cursor:'pointer'}}>Delete</button>
                </div>
              </div>
            ))}
            <div className="card">
              <div style={{fontWeight:600,fontSize:13,marginBottom:12}}>+ Add Instagram Account</div>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {(['name','assetId','igHandle'] as const).map(k=>(
                  <input key={k} value={addAcctForm[k]} onChange={e=>setAddAcctForm(p=>({...p,[k]:e.target.value}))}
                    placeholder={k==='name'?'Account name (e.g. Sire Ship)':k==='assetId'?'asset_id from Meta Business Suite URL':'@ighandle (optional)'}
                    style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'var(--text)',outline:'none',fontFamily:k==='assetId'?'var(--font-dm-mono)':'inherit'}}/>
                ))}
                <div style={{fontSize:11,color:'var(--text-3)'}}>Find asset_id in Meta Business Suite URL — e.g. ?asset_id=162845390237140</div>
                <button className="btn-primary" onClick={async()=>{await fetch('/api/social/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(addAcctForm)});setAddAcctForm({name:'',assetId:'',igHandle:''});loadAll()}} disabled={!addAcctForm.name||!addAcctForm.assetId}>
                  Add Account
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── CALENDAR ─────────────────────────────────────────────────────── */}
        {tab==='calendar'&&(
          <div>
            {/* Header */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
              <div>
                <div style={{fontWeight:700,fontSize:16}}>📅 Content Calendar</div>
                <div style={{fontSize:12,color:'var(--text-3)',marginTop:2}}>{queueTotal} posts scheduled · runs indefinitely</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <button onClick={()=>setCalMonth(m=>new Date(m.getFullYear(),m.getMonth()-1,1))}
                  style={{padding:'6px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-2)',cursor:'pointer',color:'var(--text)',fontSize:14}}>‹</button>
                <div style={{fontWeight:600,fontSize:14,minWidth:140,textAlign:'center'}}>
                  {calMonth.toLocaleDateString('en-US',{month:'long',year:'numeric'})}
                </div>
                <button onClick={()=>setCalMonth(m=>new Date(m.getFullYear(),m.getMonth()+1,1))}
                  style={{padding:'6px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-2)',cursor:'pointer',color:'var(--text)',fontSize:14}}>›</button>
                <button className="btn-primary" style={{fontSize:12,padding:'6px 14px',marginLeft:8}} onClick={async()=>{
                  setCalendarLoading(true)
                  const r = await fetch(`/api/social/queue?accountId=${selectedAccount}&status=scheduled&limit=2000`)
                  const d = await r.json()
                  setCalendarItems(d.items||[])
                  setCalendarLoading(false)
                }}>{calendarLoading?'Loading...':(calendarItems.length?'↻ Refresh':'Load')}</button>
              </div>
            </div>

            {/* Legend */}
            <div style={{display:'flex',gap:14,marginBottom:12,fontSize:11}}>
              {[{color:'#6366f1',label:'Feed Post'},{color:'#f59e0b',label:'Story'},{color:'#10b981',label:'Reel'},{color:'#22c55e',label:'Posted'}].map(l=>(
                <div key={l.label} style={{display:'flex',alignItems:'center',gap:5}}>
                  <div style={{width:10,height:10,borderRadius:3,background:l.color}}/>
                  <span style={{color:'var(--text-3)'}}>{l.label}</span>
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            {(()=>{
              const year = calMonth.getFullYear()
              const month = calMonth.getMonth()
              const firstDay = new Date(year, month, 1).getDay()
              const daysInMonth = new Date(year, month+1, 0).getDate()
              const today = new Date()

              // Group items by date string
              const byDate: Record<string, Record<string,unknown>[]> = {}
              calendarItems.forEach((item: Record<string,unknown>) => {
                const dt = new Date(item.scheduledDate as string)
                // Convert UTC to ET
                const etStr = dt.toLocaleDateString('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'})
                if (!byDate[etStr]) byDate[etStr] = []
                byDate[etStr].push(item)
              })

              const typeColor: Record<string,string> = {post:'#6366f1',story:'#f59e0b',reel:'#10b981'}

              const cells = []
              // Empty cells before first day
              for (let i=0;i<firstDay;i++) cells.push(<div key={'e'+i}/>)
              // Day cells
              for (let d=1;d<=daysInMonth;d++) {
                const dateObj = new Date(year, month, d)
                const dateStr = `${String(month+1).padStart(2,'0')}/${String(d).padStart(2,'0')}/${year}`
                const dayItems = byDate[dateStr] || []
                const isToday = dateObj.toDateString() === today.toDateString()
                const isPast = dateObj < today && !isToday

                cells.push(
                  <div key={d} style={{
                    minHeight:90,border:'1px solid var(--border)',borderRadius:8,padding:'6px 7px',
                    background:isToday?'rgba(99,102,241,0.08)':isPast?'rgba(0,0,0,0.02)':'var(--surface)',
                    opacity:isPast&&dayItems.length===0?0.4:1,
                  }}>
                    <div style={{fontSize:11,fontWeight:isToday?700:500,color:isToday?'var(--accent)':'var(--text-2)',marginBottom:4}}>{d}</div>
                    <div style={{display:'flex',flexDirection:'column',gap:2}}>
                      {dayItems.slice(0,4).map((item,idx)=>{
                        const isPosted = item.status==='posted'
                        const bg = isPosted?'#22c55e':(typeColor[item.type as string]||'#6366f1')
                        const time = new Date(item.scheduledDate as string).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})
                        return (
                          <div key={idx} title={`${item.templateName} V${item.variationNum} · ${time}`}
                            style={{fontSize:9,background:bg,color:'#fff',borderRadius:3,padding:'1px 5px',
                              whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',cursor:'default',lineHeight:'16px'}}>
                            {item.type==='story'?'📖':item.type==='reel'?'🎬':'📸'} {item.templateName as string} V{item.variationNum as number}
                          </div>
                        )
                      })}
                      {dayItems.length>4&&<div style={{fontSize:9,color:'var(--text-3)',paddingLeft:5}}>+{dayItems.length-4} more</div>}
                    </div>
                  </div>
                )
              }

              return (
                <div>
                  {/* Day headers */}
                  <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4,marginBottom:4}}>
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>(
                      <div key={d} style={{textAlign:'center',fontSize:10,color:'var(--text-3)',fontWeight:600,textTransform:'uppercase',padding:'4px 0'}}>{d}</div>
                    ))}
                  </div>
                  {/* Day cells */}
                  <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4}}>
                    {cells}
                  </div>
                  {calendarItems.length===0&&!calendarLoading&&(
                    <div style={{textAlign:'center',padding:'40px 0',color:'var(--text-3)',fontSize:13}}>
                      Click Load to see your schedule
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* ── SETTINGS ─────────────────────────────────────────────────────── */}

      </div>
    </div>
  )
}
