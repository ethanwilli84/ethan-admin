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
  const [tab, setTab] = useState<'templates'|'queue'|'logs'|'accounts'>('templates')
  const [accounts, setAccounts] = useState<IGAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [contentType, setContentType] = useState<'reel'|'story'|'post'>('post')
  const [templates, setTemplates] = useState<Template[]>([])
  const [queue, setQueue] = useState<QItem[]>([])
  const [logs, setLogs] = useState<BotLog[]>([])

  // Schedule config — per content type
  const [postDays, setPostDays] = useState<Record<string,number[]>>(DEFAULT_DAYS)
  const [postTimes, setPostTimes] = useState<Record<string,string>>(DEFAULT_TIMES)

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
    const [ar,qr,lr] = await Promise.all([
      fetch('/api/social/accounts').then(r=>r.json()),
      fetch('/api/social/queue').then(r=>r.json()),
      fetch('/api/social/logs?limit=40').then(r=>r.json()),
    ])
    if (ar.ok) { setAccounts(ar.accounts); if (!selectedAccount && ar.accounts[0]) setSelectedAccount(ar.accounts[0].id) }
    if (qr.ok) setQueue(qr.items)
    if (lr.ok) setLogs(lr.logs)
  }, [selectedAccount])

  const loadTemplates = useCallback(async () => {
    if (!selectedAccount) return
    const r = await fetch(`/api/social/templates?accountId=${selectedAccount}&contentType=${contentType}`)
    const d = await r.json()
    if (d.ok) setTemplates(d.templates.sort((a:Template,b:Template)=>a.order-b.order))
    // Load saved schedule config for this type
    const sr = await fetch(`/api/social/schedule?accountId=${selectedAccount}&contentType=${contentType}`)
    const sd = await sr.json()
    const saved = sd.states?.find((s:Record<string,unknown>)=>s.contentType===contentType)
    if (saved?.postDays) setPostDays(p=>({...p,[contentType]:saved.postDays as number[]}))
    if (saved?.postTime) setPostTimes(p=>({...p,[contentType]:saved.postTime as string}))
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
    loadTemplates()
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
        const upRes = await fetch(
          `http://localhost:3002/upload?filename=${encodeURIComponent(file.name)}&accountId=${selectedAccount}&contentType=${contentType}`,
          {method:'POST',body:file,headers:{'Content-Type':file.type,'Content-Length':String(file.size)}})
        if (!upRes.ok) throw new Error(`Server error ${upRes.status}`)
        const upData = await upRes.json()
        if (!upData.ok) throw new Error(upData.error||'Upload failed')
        await fetch('/api/social/templates',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({variation:{templateId,variationNum:i+1,url:upData.localPath,title:`V${i+1}`}})})
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
      body:JSON.stringify({accountId:selectedAccount,contentType,postDays:postDays[contentType],postTime:postTimes[contentType],force:true,preview:true})})
    const d = await r.json()
    if (d.ok && d.preview) { setPreviewItems(d.items as PreviewItem[]); setShowPreview(true) }
    else alert(d.error||'Preview failed')
    setPreviewing(false)
  }

  async function confirmSchedule() {
    setConfirming(true)
    const r = await fetch('/api/social/schedule',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({accountId:selectedAccount,contentType,postDays:postDays[contentType],postTime:postTimes[contentType],force:true})})
    const d = await r.json()
    setSchedResult(d); setShowPreview(false); setConfirming(false)
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
    const total = templates.reduce((s,t)=>s+t.variationCount,0)*templates.length
    return rows.join(' → ') + (rows.length<total ? ` → ... (${total} total, restarts)` : '')
  })()

  const activeDays = postDays[contentType] || DEFAULT_DAYS[contentType]
  const activeTime = postTimes[contentType] || DEFAULT_TIMES[contentType]

  function toggleDay(d:number) {
    setPostDays(p=>({ ...p, [contentType]: p[contentType]?.includes(d) ? p[contentType].filter(x=>x!==d) : [...(p[contentType]||[]),d].sort() }))
  }

  return (
    <div>
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
                {confirming?`◌ Scheduling ${previewItems.length} items...`:`✓ Confirm & write ${previewItems.length} items to queue`}
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
            {queue.filter(i=>i.status==='scheduled').length} scheduled · {accounts.length} account{accounts.length!==1?'s':''}
            {lastLog&&<span style={{marginLeft:8}}>· Last run: <span style={{color:STATUS_COLOR[lastLog.status]||'var(--text-3)'}}>{lastLog.status}</span> {new Date(lastLog.startedAt).toLocaleDateString()}</span>}
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          {(['templates','queue','logs','accounts'] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{padding:'6px 14px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:tab===t?'var(--accent)':'var(--surface-2)',color:tab===t?'#fff':'var(--text-2)'}}>
              {t==='templates'?'🎞 Templates':t==='queue'?`📅 Queue (${queue.filter(i=>i.accountId===selectedAccount).length})`:t==='logs'?'🤖 Logs':'⚙ Accounts'}
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
                        <div style={{fontWeight:600,fontSize:13,marginBottom:10}}>
                          {ct.icon} {accounts.find(a=>a.id===selectedAccount)?.name} — {ct.label} Schedule
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
                        {/* Time */}
                        <div style={{marginBottom:12}}>
                          <div style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',textTransform:'uppercase',marginBottom:6}}>Post time</div>
                          <input type="time" value={activeTime} onChange={e=>setPostTimes(p=>({...p,[contentType]:e.target.value}))}
                            style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 12px',fontSize:14,color:'var(--text)',outline:'none',fontFamily:'var(--font-dm-mono)'}}/>
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
                            <div style={{fontSize:11,color:'var(--text-3)',marginBottom:8,cursor:'pointer'}} onClick={()=>startEdit(tmpl)}>
                              {tmpl.caption?`"${tmpl.caption.substring(0,80)}${tmpl.caption.length>80?'…':''}"` : <span style={{fontStyle:'italic'}}>no caption — click to add</span>}
                            </div>
                            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                              {tmpl.variations.slice(0,15).map((v,vi)=>(
                                <span key={vi} style={{fontSize:10,background:'var(--surface-2)',borderRadius:5,padding:'3px 7px',fontFamily:'var(--font-dm-mono)',color:'var(--text-3)'}}>V{v.variationNum}</span>
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
                      <textarea value={newTplCaption} onChange={e=>setNewTplCaption(e.target.value)}
                        placeholder="Caption for ALL variations of this template" rows={2}
                        style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'var(--text)',outline:'none',resize:'vertical',fontFamily:'inherit'}}/>
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
      </div>
    </div>
  )
}
