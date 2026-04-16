'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

interface IGAccount { id:string; name:string; assetId:string; igHandle?:string; active:boolean; reelsUrl?:string; storiesUrl?:string }
interface Variation { variationNum:number; url:string; title:string; uploadedAt:string }
interface Template { _id:string; accountId:string; contentType:string; name:string; caption:string; order:number; variations:Variation[]; variationCount:number }
interface QItem { _id:string; title:string; caption:string; videoUrl:string; type:string; scheduledDate:string; status:string; order:number; batchId:string; accountId:string; batchNumber?:number; cycleNum?:number; templateName?:string; variationNum?:number; postedAt?:string; errorMsg?:string }
interface BotLog { _id:string; type:string; accountId?:string; startedAt:string; finishedAt?:string; durationMs?:number; status:string; itemsPosted:number; itemsFailed:number; itemsAttempted:number; details:{file:string;ok:boolean;error?:string;scheduledFor?:string}[] }

const CONTENT_TYPES = [
  { id:'reel', label:'Reels', icon:'🎬', accept:'video/*', days:'Mon · Wed · Thu · Sun', desc:'4 days/week — restarts after 80 posts' },
  { id:'story', label:'Stories', icon:'📸', accept:'video/*,image/*', days:'Every day', desc:'Daily — restarts after 80 days' },
  { id:'post', label:'Feed Posts', icon:'🖼', accept:'video/*,image/*', days:'Mon · Wed · Thu · Sun', desc:'4 days/week — same days as reels, +1hr after' },
]
const STATUS_COLOR:Record<string,string> = { scheduled:'#5B4FE9', posted:'#00C896', failed:'#ef4444', running:'#f59e0b', success:'#00C896', partial:'#f59e0b' }
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function SocialPage() {
  const [tab, setTab] = useState<'templates'|'queue'|'logs'|'accounts'>('templates')
  const [accounts, setAccounts] = useState<IGAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [contentType, setContentType] = useState<'reel'|'story'|'post'>('reel')
  const [templates, setTemplates] = useState<Template[]>([])
  const [queue, setQueue] = useState<QItem[]>([])
  const [logs, setLogs] = useState<BotLog[]>([])
  const [scheduleState, setScheduleState] = useState<Record<string,unknown>[]>([])
  const [qFilter, setQFilter] = useState<'all'|'scheduled'|'posted'|'failed'>('all')

  // New template form
  const [addingTemplate, setAddingTemplate] = useState(false)
  const [newTplName, setNewTplName] = useState('')
  const [newTplCaption, setNewTplCaption] = useState('')
  const [newTplFiles, setNewTplFiles] = useState<File[]>([])
  const [newTplOrder, setNewTplOrder] = useState(1)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({current:0,total:0,file:''})

  // Schedule
  const [scheduling, setScheduling] = useState(false)
  const [scheduleResult, setScheduleResult] = useState<Record<string,unknown>|null>(null)
  const [reelTime, setReelTime] = useState('20:00')
  const [storyTime, setStoryTime] = useState('09:00')
  const [postTime, setPostTime] = useState('21:00')

  // Accounts
  const [addAccountForm, setAddAccountForm] = useState({name:'',assetId:'',igHandle:''})
  const [addingAccount, setAddingAccount] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)

  const loadAll = useCallback(async () => {
    const [acctRes, qRes, logRes] = await Promise.all([
      fetch('/api/social/accounts').then(r=>r.json()),
      fetch('/api/social/queue').then(r=>r.json()),
      fetch('/api/social/logs?limit=40').then(r=>r.json()),
    ])
    if (acctRes.ok) {
      setAccounts(acctRes.accounts)
      if (!selectedAccount && acctRes.accounts[0]) setSelectedAccount(acctRes.accounts[0].id)
    }
    if (qRes.ok) setQueue(qRes.items)
    if (logRes.ok) setLogs(logRes.logs)
  }, [selectedAccount])

  const loadTemplates = useCallback(async () => {
    if (!selectedAccount) return
    const r = await fetch(`/api/social/templates?accountId=${selectedAccount}&contentType=${contentType}`)
    const d = await r.json()
    if (d.ok) setTemplates(d.templates.sort((a:Template,b:Template) => a.order - b.order))
    const sr = await fetch(`/api/social/schedule?accountId=${selectedAccount}&contentType=${contentType}`)
    const sd = await sr.json()
    if (sd.ok) setScheduleState(sd.states)
  }, [selectedAccount, contentType])

  useEffect(() => { loadAll() }, [])
  useEffect(() => { loadTemplates() }, [loadTemplates])

  // Upload new template + all its variations
  async function saveTemplate() {
    if (!newTplName || !newTplFiles.length || !selectedAccount) return
    setSavingTemplate(true)

    // 1. Create the template record
    const tmplRes = await fetch('/api/social/templates', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ accountId:selectedAccount, contentType, name:newTplName, caption:newTplCaption, order:newTplOrder })
    })
    const tmplData = await tmplRes.json()
    const templateId = tmplData.id

    // 2. Upload each variation file to DO Spaces, add to template
    for (let i = 0; i < newTplFiles.length; i++) {
      const file = newTplFiles[i]
      setUploadProgress({current:i+1, total:newTplFiles.length, file:file.name})
      try {
        const sigRes = await fetch(`/api/social/upload?filename=${encodeURIComponent(file.name)}&type=${file.type}`)
        const sig = await sigRes.json()
        if (!sig.ok) throw new Error(sig.error || 'Upload failed — is DO Spaces configured?')
        // Try presigned URL first; fall back to server-side proxy upload
        let uploadOk = false
        try {
          const putRes = await fetch(sig.presignedUrl, {method:'PUT',body:file,headers:{'Content-Type':file.type,'x-amz-acl':'public-read'}})
          uploadOk = putRes.ok
        } catch {}
        if (!uploadOk) {
          // Fallback: stream through server (slower but reliable)
          const proxyRes = await fetch(`/api/social/upload?filename=${encodeURIComponent(file.name)}`, {method:'POST',body:file,headers:{'Content-Type':file.type}})
          const pd = await proxyRes.json()
          if (!pd.ok) throw new Error(pd.error || 'Proxy upload also failed')
          sig.publicUrl = pd.publicUrl
        }
        await fetch('/api/social/templates', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ variation: { templateId, variationNum:i+1, url:sig.publicUrl, title:`V${i+1}` } })
        })
      } catch(e) { alert(`Upload failed: ${(e as Error).message}`); setSavingTemplate(false); return }
    }

    setSavingTemplate(false)
    setAddingTemplate(false)
    setNewTplName(''); setNewTplCaption(''); setNewTplFiles([]); setNewTplOrder(templates.length+1)
    loadTemplates()
  }

  async function runSchedule(force = false) {
    setScheduling(true); setScheduleResult(null)
    const timeKey = contentType === 'reel' ? reelTime : storyTime
    const body = { accountId:selectedAccount, contentType, reelTime, storyTime, postTime, force }
    const r = await fetch('/api/social/schedule', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    const d = await r.json()
    setScheduleResult(d)
    setScheduling(false)
    loadTemplates(); loadAll()
  }

  async function deleteTemplate(id:string) {
    if (!confirm('Delete this template and all its variations?')) return
    await fetch('/api/social/templates',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
    loadTemplates()
  }

  const filteredQueue = queue.filter(i => (qFilter==='all'||i.status===qFilter) && i.accountId===selectedAccount)
  const qStats = { scheduled:filteredQueue.filter(i=>i.status==='scheduled').length, posted:filteredQueue.filter(i=>i.status==='posted').length, failed:filteredQueue.filter(i=>i.status==='failed').length }
  const state = scheduleState.find(s => (s as Record<string,string>).contentType === contentType)
  const lastLog = logs[0]
  const accountName = accounts.find(a=>a.id===selectedAccount)?.name || ''

  // Preview the interleaved order
  const interleavePreview = (() => {
    if (!templates.length) return []
    const maxVars = Math.max(...templates.map(t=>t.variationCount))
    const preview:string[] = []
    for (let v = 0; v < Math.min(maxVars, 4); v++) {
      for (const t of templates) {
        if (v < t.variationCount) preview.push(`${t.name}·V${v+1}`)
      }
    }
    return preview
  })()

  return (
    <div>
      <div className="page-header-bar">
        <div>
          <div className="page-title">Social Queue</div>
          <div className="page-sub">
            {queue.filter(i=>i.status==='scheduled').length} scheduled · {accounts.length} account{accounts.length!==1?'s':''}
            {lastLog && <span style={{marginLeft:8}}>· Last run: <span style={{color:STATUS_COLOR[lastLog.status]||'var(--text-3)'}}>{lastLog.status}</span> {new Date(lastLog.startedAt).toLocaleDateString()}</span>}
          </div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {(['templates','queue','logs','accounts'] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{padding:'6px 14px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:tab===t?'var(--accent)':'var(--surface-2)',color:tab===t?'#fff':'var(--text-2)'}}>
              {t==='templates'?'🎞 Templates':t==='queue'?`📅 Queue (${queue.filter(i=>i.accountId===selectedAccount).length})`:t==='logs'?'🤖 Logs':'⚙ Accounts'}
            </button>
          ))}
        </div>
      </div>

      <div className="main">
        {/* Account + type selector bar (shown on templates + queue tabs) */}
        {(tab==='templates'||tab==='queue') && accounts.length>0 && (
          <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
            {accounts.map(a=>(
              <button key={a.id} onClick={()=>setSelectedAccount(a.id)} style={{padding:'6px 14px',borderRadius:20,fontSize:12,cursor:'pointer',border:`2px solid ${selectedAccount===a.id?'var(--accent)':'var(--border)'}`,background:selectedAccount===a.id?'rgba(91,79,233,0.08)':'var(--surface-2)',color:selectedAccount===a.id?'var(--accent)':'var(--text-2)',fontWeight:selectedAccount===a.id?700:400}}>
                {a.name} {a.igHandle&&<span style={{fontWeight:400,fontSize:11,color:'var(--text-3)'}}>{a.igHandle}</span>}
              </button>
            ))}
            {tab==='templates' && (
              <div style={{marginLeft:'auto',display:'flex',gap:6}}>
                {CONTENT_TYPES.map(ct=>(
                  <button key={ct.id} onClick={()=>setContentType(ct.id as 'reel'|'story'|'post')} style={{padding:'5px 12px',borderRadius:10,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:contentType===ct.id?'var(--accent)':'var(--surface-2)',color:contentType===ct.id?'#fff':'var(--text-2)'}}>
                    {ct.icon} {ct.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TEMPLATES ── */}
        {tab==='templates' && (
          <div style={{maxWidth:780}}>
            {accounts.length===0 ? (
              <div className="card" style={{textAlign:'center',padding:32}}>
                <div style={{fontSize:32,marginBottom:8}}>📱</div>
                <div style={{fontWeight:600,marginBottom:12}}>Add an Instagram account first</div>
                <button className="btn-primary" onClick={()=>setTab('accounts')}>Add Account →</button>
              </div>
            ) : (
              <>
                {/* Schedule info + run button */}
                {templates.length > 0 && (
                  <div className="card" style={{marginBottom:16}}>
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:13,marginBottom:6}}>
                          {CONTENT_TYPES.find(c=>c.id===contentType)?.icon} {accountName} — {CONTENT_TYPES.find(c=>c.id===contentType)?.label}
                        </div>
                        <div style={{fontSize:11,color:'var(--text-3)',marginBottom:8}}>
                          {templates.length} templates · {templates.reduce((s,t)=>s+t.variationCount,0)} total variations
                          · posts {CONTENT_TYPES.find(c=>c.id===contentType)?.days}
                        </div>
                        {/* Interleave order preview */}
                        {interleavePreview.length>0 && (
                          <div style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)'}}>
                            Order: {interleavePreview.join(' → ')}{interleavePreview.length<templates.reduce((s,t)=>s+t.variationCount,0)*templates.length?` → ... (${templates.reduce((s,t)=>s+t.variationCount,0)*templates.length} total, then restarts)`:''}
                          </div>
                        )}
                        {state && (
                          <div style={{fontSize:11,color:'var(--text-3)',marginTop:6}}>
                            Cycle {(state as Record<string,number>).cycleNum} · Position {(state as Record<string,number>).nextItemIndex}/{templates.reduce((s,t)=>s+t.variationCount,0)*templates.length} · Last scheduled: {(state as Record<string,string>).lastScheduledDate}
                          </div>
                        )}
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:8,alignItems:'flex-end'}}>
                        <div style={{display:'flex',gap:6,alignItems:'center'}}>
                          <span style={{fontSize:11,color:'var(--text-3)'}}>Time:</span>
                          <input type="time" value={contentType==='reel'?reelTime:contentType==='story'?storyTime:postTime}
                            onChange={e=>contentType==='reel'?setReelTime(e.target.value):contentType==='story'?setStoryTime(e.target.value):setPostTime(e.target.value)}
                            style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px',fontSize:12,color:'var(--text)',outline:'none',fontFamily:'var(--font-dm-mono)',width:90}}/>
                        </div>
                        <button className="btn-primary" onClick={()=>runSchedule(false)} disabled={scheduling} style={{fontSize:12,padding:'7px 16px'}}>
                          {scheduling?'◌ Scheduling...':'Schedule next 30 days →'}
                        </button>
                        <button onClick={()=>runSchedule(true)} disabled={scheduling} style={{fontSize:11,color:'var(--text-3)',background:'none',border:'1px solid var(--border)',borderRadius:8,padding:'4px 10px',cursor:'pointer'}}>Force re-run</button>
                      </div>
                    </div>
                    {scheduleResult && (
                      <div style={{marginTop:10,padding:'8px 12px',borderRadius:8,background:(scheduleResult.ok&&!scheduleResult.skipped)?'rgba(0,200,150,0.08)':'var(--surface-2)',fontSize:12,fontFamily:'var(--font-dm-mono)'}}>
                        {scheduleResult.skipped ? `↩ ${scheduleResult.message}` :
                          scheduleResult.scheduled ? `✓ ${scheduleResult.scheduled} items scheduled · Cycle ${scheduleResult.cycleNum} · Through ${String(scheduleResult.lastScheduled||'').substring(0,10)}` :
                          `${scheduleResult.message || JSON.stringify(scheduleResult)}`}
                      </div>
                    )}
                  </div>
                )}

                {/* Template cards */}
                {templates.map((tmpl,ti) => (
                  <div key={tmpl._id} className="card" style={{marginBottom:12}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                      <div>
                        <div style={{fontWeight:600,fontSize:14}}>
                          <span style={{color:'var(--text-3)',fontSize:11,fontFamily:'var(--font-dm-mono)',marginRight:6}}>T{tmpl.order}</span>
                          {tmpl.name}
                        </div>
                        <div style={{fontSize:11,color:'var(--text-3)',marginTop:2}}>{tmpl.variationCount} variations · {tmpl.caption?`"${tmpl.caption.substring(0,50)}${tmpl.caption.length>50?'...':''}"`:'no caption'}</div>
                      </div>
                      <button onClick={()=>deleteTemplate(tmpl._id)} style={{fontSize:11,color:'#ef4444',background:'none',border:'1px solid rgba(239,68,68,0.3)',borderRadius:6,padding:'3px 10px',cursor:'pointer'}}>Delete</button>
                    </div>
                    {tmpl.variations.length>0 && (
                      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                        {tmpl.variations.slice(0,12).map((v,vi)=>(
                          <div key={vi} style={{fontSize:10,background:'var(--surface-2)',borderRadius:6,padding:'3px 8px',fontFamily:'var(--font-dm-mono)',color:'var(--text-3)'}}>V{v.variationNum}</div>
                        ))}
                        {tmpl.variations.length>12&&<div style={{fontSize:10,color:'var(--text-3)',padding:'3px 0'}}>+{tmpl.variations.length-12} more</div>}
                      </div>
                    )}
                  </div>
                ))}

                {/* Add template */}
                {!addingTemplate ? (
                  <button onClick={()=>{setAddingTemplate(true);setNewTplOrder(templates.length+1)}}
                    style={{width:'100%',padding:'12px',borderRadius:10,border:'2px dashed var(--border)',background:'transparent',color:'var(--text-3)',fontSize:13,cursor:'pointer',marginTop:4}}>
                    + Add Template {templates.length+1}
                  </button>
                ) : (
                  <div className="card" style={{marginTop:8}}>
                    <div style={{fontWeight:600,fontSize:13,marginBottom:12}}>New Template {newTplOrder}</div>
                    <div style={{display:'flex',flexDirection:'column',gap:10}}>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 80px',gap:8}}>
                        <input value={newTplName} onChange={e=>setNewTplName(e.target.value)} placeholder="Template name (e.g. Template 1)"
                          style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'var(--text)',outline:'none'}}/>
                        <input type="number" min={1} max={10} value={newTplOrder} onChange={e=>setNewTplOrder(parseInt(e.target.value)||1)}
                          style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 10px',fontSize:13,color:'var(--text)',outline:'none',textAlign:'center'}}/>
                      </div>
                      <textarea value={newTplCaption} onChange={e=>setNewTplCaption(e.target.value)}
                        placeholder="Caption for ALL variations of this template (e.g. 'Check out our rates 🚀 #shipping #reseller')"
                        rows={2} style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'var(--text)',outline:'none',resize:'vertical',fontFamily:'inherit'}}/>
                      {/* File drop for variations */}
                      <div>
                        <div style={{fontSize:11,color:'var(--text-3)',marginBottom:6}}>Upload all variations ({newTplFiles.length} selected)</div>
                        <div onDrop={e=>{e.preventDefault();setNewTplFiles(p=>[...p,...Array.from(e.dataTransfer.files)])}}
                          onDragOver={e=>e.preventDefault()} onClick={()=>fileRef.current?.click()}
                          style={{border:'2px dashed var(--border)',borderRadius:10,padding:newTplFiles.length?'10px 12px':'20px 16px',cursor:'pointer',minHeight:52,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                          <input ref={fileRef} type="file" accept={CONTENT_TYPES.find(c=>c.id===contentType)?.accept} multiple style={{display:'none'}} onChange={e=>setNewTplFiles(p=>[...p,...Array.from(e.target.files||[])])}/>
                          {newTplFiles.length===0?<span style={{fontSize:12,color:'var(--text-3)'}}>Drop all {newTplFiles.length||20} variation files here (order matters)</span>:
                            newTplFiles.map((f,i)=>(
                              <div key={i} style={{display:'flex',alignItems:'center',gap:4,background:'var(--surface-2)',borderRadius:6,padding:'3px 8px',fontSize:11}}>
                                <span style={{color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',minWidth:24}}>V{i+1}</span>
                                <span style={{maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</span>
                                <button onClick={e=>{e.stopPropagation();setNewTplFiles(p=>p.filter((_,j)=>j!==i))}} style={{fontSize:13,color:'var(--text-3)',background:'none',border:'none',cursor:'pointer'}}>×</button>
                              </div>
                            ))
                          }
                        </div>
                      </div>
                      {savingTemplate && (
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
                        <button className="btn-primary" onClick={saveTemplate} disabled={savingTemplate||!newTplName||!newTplFiles.length} style={{flex:1}}>
                          {savingTemplate?`◌ Uploading V${uploadProgress.current}/${uploadProgress.total}...`:`Save Template ${newTplOrder} + ${newTplFiles.length} variations`}
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

        {/* ── QUEUE ── */}
        {tab==='queue' && (
          <div>
            <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
              {(['all','scheduled','posted','failed'] as const).map(s=>(
                <button key={s} onClick={()=>setQFilter(s)} style={{padding:'5px 14px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:qFilter===s?'var(--accent)':'var(--surface-2)',color:qFilter===s?'#fff':'var(--text-2)'}}>
                  {s} ({s==='all'?filteredQueue.length:qStats[s]??0})
                </button>
              ))}
              <button onClick={loadAll} style={{marginLeft:'auto',fontSize:11,color:'var(--text-3)',background:'none',border:'1px solid var(--border)',borderRadius:8,padding:'4px 10px',cursor:'pointer'}}>↻</button>
            </div>
            {filteredQueue.length===0?(
              <div style={{textAlign:'center',padding:40,color:'var(--text-3)'}}>
                <div style={{fontSize:32,marginBottom:8}}>📅</div>
                <div style={{fontSize:13}}>No items in queue</div>
                <button className="btn-primary" style={{marginTop:16,fontSize:12}} onClick={()=>setTab('templates')}>Add templates →</button>
              </div>
            ):(
              <div className="card">
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
                    {['Type','Template','Var','Scheduled','Status','Cycle'].map(h=>(
                      <th key={h} style={{textAlign:'left',padding:'5px 8px',fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',textTransform:'uppercase'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {filteredQueue.filter(i=>qFilter==='all'||i.status===qFilter).sort((a,b)=>new Date(a.scheduledDate).getTime()-new Date(b.scheduledDate).getTime()).slice(0,100).map(item=>(
                      <tr key={item._id} style={{borderBottom:'1px solid var(--border)'}}>
                        <td style={{padding:'6px 8px',fontSize:16}}>{item.type==='reel'?'🎬':item.type==='story'?'📸':'🖼'}</td>
                        <td style={{padding:'6px 8px',maxWidth:120}}>
                          <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500,fontSize:11}}>{item.templateName||item.title}</div>
                        </td>
                        <td style={{padding:'6px 8px',fontFamily:'var(--font-dm-mono)',color:'var(--text-3)',fontSize:11}}>V{item.variationNum||'?'}</td>
                        <td style={{padding:'6px 8px',fontFamily:'var(--font-dm-mono)',fontSize:11,whiteSpace:'nowrap',color:'var(--text-3)'}}>
                          {item.status==='posted'&&item.postedAt?new Date(item.postedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})+'  ✓'
                            :new Date(item.scheduledDate).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})+' '+new Date(item.scheduledDate).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}
                        </td>
                        <td style={{padding:'6px 8px'}}>
                          <span style={{fontSize:10,background:(STATUS_COLOR[item.status]||'#666')+'22',color:STATUS_COLOR[item.status]||'#666',border:`1px solid ${STATUS_COLOR[item.status]||'#666'}44`,borderRadius:10,padding:'2px 7px',fontFamily:'var(--font-dm-mono)'}}>{item.status}</span>
                          {item.errorMsg&&<div style={{fontSize:9,color:'#ef4444',marginTop:2}}>{item.errorMsg}</div>}
                        </td>
                        <td style={{padding:'6px 8px',color:'var(--text-3)',fontSize:11,fontFamily:'var(--font-dm-mono)'}}>{item.cycleNum||1}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── LOGS ── */}
        {tab==='logs' && (
          <div>
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
              <button onClick={loadAll} style={{fontSize:11,color:'var(--text-3)',background:'none',border:'1px solid var(--border)',borderRadius:8,padding:'4px 10px',cursor:'pointer'}}>↻ Refresh</button>
            </div>
            {logs.length===0?<div style={{textAlign:'center',padding:40,color:'var(--text-3)',fontSize:13}}>No bot runs yet</div>:(
              logs.map(log=>(
                <div key={log._id} className="card" style={{marginBottom:12}}>
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
                          {d.scheduledFor&&<span style={{color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',whiteSpace:'nowrap'}}>{new Date(d.scheduledFor).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>}
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

        {/* ── ACCOUNTS ── */}
        {tab==='accounts' && (
          <div style={{maxWidth:600}}>
            {accounts.map(a=>(
              <div key={a.id} className="card" style={{marginBottom:12}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontWeight:600,fontSize:14}}>{a.name} {a.igHandle&&<span style={{fontSize:12,color:'var(--text-3)',fontWeight:400}}>{a.igHandle}</span>}</div>
                    <div style={{fontSize:11,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',marginTop:3}}>asset_id: {a.assetId}</div>
                  </div>
                  <button onClick={async()=>{if(!confirm(`Delete ${a.name}?`))return;await fetch('/api/social/accounts',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:a.id})});loadAll()}} style={{fontSize:11,color:'#ef4444',background:'none',border:'1px solid rgba(239,68,68,0.3)',borderRadius:6,padding:'3px 10px',cursor:'pointer'}}>Delete</button>
                </div>
              </div>
            ))}
            <div className="card">
              <div style={{fontWeight:600,fontSize:13,marginBottom:12}}>+ Add Instagram Account</div>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <input value={addAccountForm.name} onChange={e=>setAddAccountForm(p=>({...p,name:e.target.value}))} placeholder="Account name (e.g. Sire Ship)"
                  style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'var(--text)',outline:'none'}}/>
                <input value={addAccountForm.assetId} onChange={e=>setAddAccountForm(p=>({...p,assetId:e.target.value}))} placeholder="asset_id from Meta Business Suite URL"
                  style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'var(--text)',outline:'none',fontFamily:'var(--font-dm-mono)'}}/>
                <input value={addAccountForm.igHandle} onChange={e=>setAddAccountForm(p=>({...p,igHandle:e.target.value}))} placeholder="@ighandle (optional)"
                  style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'var(--text)',outline:'none'}}/>
                <div style={{fontSize:11,color:'var(--text-3)'}}>Find asset_id in the Meta Business Suite URL when your page is selected — e.g. ?asset_id=162845390237140</div>
                <button className="btn-primary" onClick={async()=>{setAddingAccount(true);await fetch('/api/social/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(addAccountForm)});setAddAccountForm({name:'',assetId:'',igHandle:''});setAddingAccount(false);loadAll()}} disabled={addingAccount||!addAccountForm.name||!addAccountForm.assetId}>
                  {addingAccount?'◌ Adding...':'Add Account'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
