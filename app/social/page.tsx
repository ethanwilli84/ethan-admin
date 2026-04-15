'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

interface IGAccount { id:string; name:string; assetId:string; igHandle?:string; active:boolean }
interface QItem { _id:string; title:string; caption:string; videoUrl:string; type:'reel'|'story'|'post'
  scheduledDate:string; status:string; order:number; batchId:string; accountId:string
  batchNumber?:number; postedAt?:string; errorMsg?:string }
interface BotLog { _id:string; type:string; accountId?:string; startedAt:string; finishedAt?:string
  durationMs?:number; status:string; itemsPosted:number; itemsFailed:number; itemsAttempted:number
  details:{file:string;ok:boolean;error?:string;scheduledFor?:string}[]; errorMsg?:string }

const CONTENT_TYPES = [
  { id:'reel', label:'Reels', icon:'🎬', accept:'video/*', desc:'MP4/MOV video' },
  { id:'story', label:'Stories', icon:'📸', accept:'video/*,image/*', desc:'JPG/PNG/MP4' },
  { id:'post', label:'Grid Posts', icon:'🖼', accept:'video/*,image/*', desc:'JPG/PNG/MP4' },
]
const STATUS_COLOR:Record<string,string> = { scheduled:'#5B4FE9', posted:'#00C896', failed:'#ef4444', skipped:'#666', running:'#f59e0b', success:'#00C896', partial:'#f59e0b' }

// Build schedule: batches every 14 days, starting from next occurrence, for 30 days
function buildBatchSchedule(reels:File[], stories:File[], posts:File[], timeStr:string): {reel?:Date,story?:Date,post?:Date,batchNum:number}[] {
  const [h,m] = timeStr.split(':').map(Number)
  const batches:any[] = []
  const maxBatches = Math.max(reels.length, stories.length, posts.length)
  let base = new Date(); base.setHours(h,m,0,0)
  // Start from tomorrow + 1 day buffer
  base.setDate(base.getDate() + 1)
  for (let i = 0; i < maxBatches; i++) {
    const d = new Date(base); d.setDate(base.getDate() + i * 14)
    batches.push({
      reel: reels[i] ? new Date(d) : undefined,
      story: stories[i] ? new Date(d.getTime() + 30*60000) : undefined, // +30min after reel
      post: posts[i] ? new Date(d.getTime() + 60*60000) : undefined,   // +60min after reel
      batchNum: i + 1,
    })
  }
  return batches
}

export default function SocialPage() {
  const [tab, setTab] = useState<'upload'|'queue'|'logs'|'accounts'>('upload')
  const [accounts, setAccounts] = useState<IGAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>('')
  const [postTime, setPostTime] = useState('16:00')
  const [reelFiles, setReelFiles] = useState<File[]>([])
  const [storyFiles, setStoryFiles] = useState<File[]>([])
  const [postFiles, setPostFiles] = useState<File[]>([])
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({current:0,total:0,file:''})
  const [uploadDone, setUploadDone] = useState(false)
  const [queue, setQueue] = useState<QItem[]>([])
  const [logs, setLogs] = useState<BotLog[]>([])
  const [qFilter, setQFilter] = useState<'all'|'scheduled'|'posted'|'failed'>('all')
  const [qAccountFilter, setQAccountFilter] = useState('')
  const [addAccountForm, setAddAccountForm] = useState({name:'',assetId:'',igHandle:''})
  const [addingAccount, setAddingAccount] = useState(false)
  const reelRef = useRef<HTMLInputElement>(null)
  const storyRef = useRef<HTMLInputElement>(null)
  const postRef = useRef<HTMLInputElement>(null)

  const loadAll = useCallback(async () => {
    const [acctRes, qRes, logRes] = await Promise.all([
      fetch('/api/social/accounts').then(r=>r.json()),
      fetch('/api/social/queue').then(r=>r.json()),
      fetch('/api/social/logs?limit=50').then(r=>r.json()),
    ])
    if (acctRes.ok) { setAccounts(acctRes.accounts); if (!selectedAccount && acctRes.accounts[0]) setSelectedAccount(acctRes.accounts[0].id) }
    if (qRes.ok) setQueue(qRes.items)
    if (logRes.ok) setLogs(logRes.logs)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const schedule = buildBatchSchedule(reelFiles, storyFiles, postFiles, postTime)
  const totalFiles = reelFiles.length + storyFiles.length + postFiles.length
  const account = accounts.find(a=>a.id===selectedAccount)

  async function uploadBatch() {
    if (!totalFiles || !selectedAccount) return
    setUploading(true); setUploadDone(false)
    const batchId = `batch_${Date.now()}`
    const allItems:any[] = []
    let total = 0, current = 0

    // Count total for progress
    for (const type of ['reel','story','post']) {
      const files = type==='reel'?reelFiles:type==='story'?storyFiles:postFiles
      total += files.length
    }
    setUploadProgress({current:0, total, file:''})

    for (const [typeKey, files, schedKey] of [['reel',reelFiles,'reel'],['story',storyFiles,'story'],['post',postFiles,'post']] as const) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        current++
        setUploadProgress({current, total, file:file.name})
        try {
          const sigRes = await fetch(`/api/social/upload?filename=${encodeURIComponent(file.name)}&type=${file.type}`)
          const sig = await sigRes.json()
          if (!sig.ok) throw new Error(sig.error || 'Upload failed — check DO_SPACES env vars are set')
          await fetch(sig.presignedUrl, {method:'PUT',body:file,headers:{'Content-Type':file.type,'x-amz-acl':'public-read'}})
          const batchSchedule = schedule[i]
          allItems.push({
            title: file.name.replace(/\.[^.]+$/,''), caption,
            videoUrl: sig.publicUrl, platform:'instagram', type:typeKey,
            scheduledDate: (batchSchedule?.[schedKey as 'reel'|'story'|'post'] || new Date()).toISOString(),
            status:'scheduled', order:i+1, batchId, accountId:selectedAccount, batchNumber:i+1,
          })
        } catch(e) { alert(`Upload failed: ${(e as Error).message}`); setUploading(false); return }
      }
    }

    await fetch('/api/social/queue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:allItems})})
    setUploading(false); setUploadDone(true)
    setReelFiles([]); setStoryFiles([]); setPostFiles([]); setCaption('')
    loadAll()
    setTimeout(()=>{setUploadDone(false);setTab('queue')},1500)
  }

  async function addAccount() {
    setAddingAccount(true)
    await fetch('/api/social/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(addAccountForm)})
    setAddAccountForm({name:'',assetId:'',igHandle:''}); setAddingAccount(false)
    loadAll()
  }

  const filteredQueue = queue.filter(i => (qFilter==='all'||i.status===qFilter) && (!qAccountFilter||i.accountId===qAccountFilter))
  const qStats = { scheduled:queue.filter(i=>i.status==='scheduled').length, posted:queue.filter(i=>i.status==='posted').length, failed:queue.filter(i=>i.status==='failed').length }

  // Group queue by account+batch
  const grouped = filteredQueue.reduce((acc,item) => {
    const key = `${item.accountId}_${item.batchId}`
    if (!acc[key]) acc[key]=[]
    acc[key].push(item); return acc
  }, {} as Record<string,QItem[]>)

  const FileDropZone = ({type,files,setFiles,inputRef}:{type:'reel'|'story'|'post',files:File[],setFiles:any,inputRef:any}) => {
    const cfg = CONTENT_TYPES.find(c=>c.id===type)!
    return (
      <div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
          <label style={{fontSize:12,fontWeight:600}}>{cfg.icon} {cfg.label} <span style={{color:'var(--text-3)',fontWeight:400,fontSize:11}}>({cfg.desc})</span></label>
          {files.length>0&&<button onClick={()=>setFiles([])} style={{fontSize:11,color:'var(--text-3)',background:'none',border:'none',cursor:'pointer'}}>Clear {files.length}</button>}
        </div>
        <div onDrop={e=>{e.preventDefault();setFiles((p:File[])=>[...p,...Array.from(e.dataTransfer.files)])}}
          onDragOver={e=>e.preventDefault()} onClick={()=>inputRef.current?.click()}
          style={{border:'2px dashed var(--border)',borderRadius:10,padding:'16px 14px',cursor:'pointer',minHeight:52,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',transition:'border-color 0.15s'}}>
          <input ref={inputRef} type="file" accept={cfg.accept} multiple style={{display:'none'}} onChange={e=>setFiles((p:File[])=>[...p,...Array.from(e.target.files||[])])}/>
          {files.length===0 ? <span style={{fontSize:12,color:'var(--text-3)'}}>Drop {cfg.label.toLowerCase()} or click to browse</span>
            : files.map((f,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:5,background:'var(--surface-2)',borderRadius:6,padding:'3px 8px',fontSize:11}}>
                <span style={{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</span>
                <button onClick={e=>{e.stopPropagation();setFiles((p:File[])=>p.filter((_:File,j:number)=>j!==i))}} style={{fontSize:13,color:'var(--text-3)',background:'none',border:'none',cursor:'pointer',lineHeight:1}}>×</button>
              </div>
            ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header-bar">
        <div>
          <div className="page-title">Social Queue</div>
          <div className="page-sub">{qStats.scheduled} scheduled · {qStats.posted} posted · {accounts.length} account{accounts.length!==1?'s':''}</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          {(['upload','queue','logs','accounts'] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{padding:'6px 14px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:tab===t?'var(--accent)':'var(--surface-2)',color:tab===t?'#fff':'var(--text-2)'}}>
              {t==='upload'?'⬆ Upload':t==='queue'?`📅 Queue (${queue.length})`:t==='logs'?'🤖 Logs':'⚙ Accounts'}
            </button>
          ))}
        </div>
      </div>

      <div className="main">

        {/* ── UPLOAD ── */}
        {tab==='upload'&&(
          <div style={{maxWidth:700}}>
            {accounts.length===0?(
              <div className="card" style={{textAlign:'center',padding:32}}>
                <div style={{fontSize:32,marginBottom:8}}>📱</div>
                <div style={{fontWeight:600,marginBottom:4}}>No accounts yet</div>
                <div style={{fontSize:12,color:'var(--text-3)',marginBottom:16}}>Add your Instagram accounts first</div>
                <button className="btn-primary" onClick={()=>setTab('accounts')}>Add Account →</button>
              </div>
            ):(
              <>
                {/* Account + Time */}
                <div className="card" style={{marginBottom:14}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 160px',gap:12,marginBottom:14}}>
                    <div>
                      <label style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',textTransform:'uppercase',display:'block',marginBottom:6}}>Post to account</label>
                      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                        {accounts.filter(a=>a.active).map(a=>(
                          <button key={a.id} onClick={()=>setSelectedAccount(a.id)}
                            style={{padding:'7px 14px',borderRadius:10,fontSize:13,cursor:'pointer',border:`2px solid ${selectedAccount===a.id?'var(--accent)':'var(--border)'}`,background:selectedAccount===a.id?'rgba(91,79,233,0.08)':'var(--surface)',fontWeight:selectedAccount===a.id?700:400,color:selectedAccount===a.id?'var(--accent)':'var(--text-2)'}}>
                            {a.name} {a.igHandle&&<span style={{fontSize:11,fontWeight:400,color:'var(--text-3)'}}>{a.igHandle}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',textTransform:'uppercase',display:'block',marginBottom:6}}>Post time</label>
                      <input type="time" value={postTime} onChange={e=>setPostTime(e.target.value)}
                        style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:14,color:'var(--text)',outline:'none',fontFamily:'var(--font-dm-mono)',width:'100%',boxSizing:'border-box'}}/>
                    </div>
                  </div>
                  {/* Batch schedule info */}
                  {totalFiles>0&&(
                    <div style={{background:'rgba(91,79,233,0.06)',borderRadius:8,padding:'10px 14px',fontSize:12}}>
                      <div style={{fontWeight:600,marginBottom:6}}>📅 Batch schedule — every 14 days, {Math.max(reelFiles.length,storyFiles.length,postFiles.length)} batches</div>
                      {schedule.slice(0,4).map((b,i)=>(
                        <div key={i} style={{display:'flex',gap:12,fontSize:11,color:'var(--text-3)',padding:'2px 0'}}>
                          <span style={{fontFamily:'var(--font-dm-mono)',minWidth:60}}>Batch {b.batchNum}</span>
                          <span>{b.reel?.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</span>
                          {b.reel&&<span style={{color:'#5B4FE9'}}>🎬 reel {postTime}</span>}
                          {b.story&&<span style={{color:'#f59e0b'}}>📸 story +30m</span>}
                          {b.post&&<span style={{color:'#00C896'}}>🖼 post +60m</span>}
                        </div>
                      ))}
                      {schedule.length>4&&<div style={{fontSize:11,color:'var(--text-3)',marginTop:4}}>+ {schedule.length-4} more batches</div>}
                    </div>
                  )}
                </div>

                {/* Upload zones */}
                <div className="card" style={{marginBottom:14,display:'flex',flexDirection:'column',gap:14}}>
                  <div style={{fontWeight:600,fontSize:13,marginBottom:2}}>Content — upload all three types for each batch</div>
                  <FileDropZone type="reel" files={reelFiles} setFiles={setReelFiles} inputRef={reelRef}/>
                  <FileDropZone type="story" files={storyFiles} setFiles={setStoryFiles} inputRef={storyRef}/>
                  <FileDropZone type="post" files={postFiles} setFiles={setPostFiles} inputRef={postRef}/>
                </div>

                {/* Caption */}
                <div className="card" style={{marginBottom:14}}>
                  <label style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',textTransform:'uppercase',display:'block',marginBottom:6}}>Default caption (applies to all, edit per-item after)</label>
                  <textarea value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Add caption, hashtags, mentions..." rows={2}
                    style={{width:'100%',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'var(--text)',outline:'none',resize:'vertical',boxSizing:'border-box',fontFamily:'inherit'}}/>
                </div>

                {totalFiles>0&&(
                  <div>
                    {uploading&&(
                      <div style={{marginBottom:12,background:'var(--surface-2)',borderRadius:8,padding:12}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:6}}>
                          <span style={{color:'var(--text-3)',fontFamily:'var(--font-dm-mono)'}}>Uploading {uploadProgress.current}/{uploadProgress.total}</span>
                          <span style={{color:'var(--text-3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'55%'}}>{uploadProgress.file}</span>
                        </div>
                        <div style={{height:4,background:'var(--border)',borderRadius:2}}>
                          <div style={{height:'100%',background:'var(--accent)',borderRadius:2,width:`${(uploadProgress.current/uploadProgress.total)*100}%`,transition:'width 0.3s'}}/>
                        </div>
                      </div>
                    )}
                    {uploadDone&&<div style={{marginBottom:12,color:'var(--green)',fontSize:13,fontFamily:'var(--font-dm-mono)'}}>✓ {uploadProgress.total} files queued — opening queue...</div>}
                    <button className="btn-primary" onClick={uploadBatch} disabled={uploading||uploadDone||!selectedAccount} style={{width:'100%',padding:'12px',fontSize:14}}>
                      {uploading?`◌ Uploading ${uploadProgress.current}/${totalFiles}...`:uploadDone?'✓ Done':
                        `Upload ${totalFiles} file${totalFiles!==1?'s':''} → ${schedule.length} batches for ${account?.name||'account'}`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── QUEUE ── */}
        {tab==='queue'&&(
          <div>
            <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
              {(['all','scheduled','posted','failed'] as const).map(s=>(
                <button key={s} onClick={()=>setQFilter(s)} style={{padding:'5px 14px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:qFilter===s?'var(--accent)':'var(--surface-2)',color:qFilter===s?'#fff':'var(--text-2)'}}>
                  {s} ({s==='all'?queue.length:qStats[s]??0})
                </button>
              ))}
              {accounts.length>1&&(
                <select value={qAccountFilter} onChange={e=>setQAccountFilter(e.target.value)}
                  style={{marginLeft:'auto',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'5px 10px',fontSize:12,color:'var(--text)'}}>
                  <option value="">All accounts</option>
                  {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
              <button onClick={loadAll} style={{fontSize:11,color:'var(--text-3)',background:'none',border:'1px solid var(--border)',borderRadius:8,padding:'4px 10px',cursor:'pointer'}}>↻</button>
            </div>
            {filteredQueue.length===0?(
              <div style={{textAlign:'center',padding:40,color:'var(--text-3)'}}>
                <div style={{fontSize:32,marginBottom:8}}>📅</div>
                <div style={{fontSize:13}}>No items in queue</div>
                <button className="btn-primary" style={{marginTop:16,fontSize:12}} onClick={()=>setTab('upload')}>Upload content →</button>
              </div>
            ):(
              Object.entries(grouped).map(([groupKey,items])=>{
                const acctName = accounts.find(a=>a.id===items[0]?.accountId)?.name || items[0]?.accountId
                const batchNum = items[0]?.batchNumber
                const reels = items.filter(i=>i.type==='reel')
                const stories = items.filter(i=>i.type==='story')
                const posts = items.filter(i=>i.type==='post')
                const scheduled = items.filter(i=>i.status==='scheduled')
                return (
                  <div key={groupKey} className="card" style={{marginBottom:16}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                      <div>
                        <div style={{fontWeight:600,fontSize:13}}>{acctName} — Batch {batchNum}</div>
                        <div style={{fontSize:11,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',marginTop:2}}>
                          {reels.length>0&&`🎬${reels.length} `}{stories.length>0&&`📸${stories.length} `}{posts.length>0&&`🖼${posts.length} `}· {items.filter(i=>i.status==='posted').length} posted · {scheduled.length} remaining
                        </div>
                      </div>
                      {scheduled.length>0&&<button onClick={async()=>{if(!confirm('Delete batch?'))return;await fetch('/api/social/queue',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({batchId:items[0].batchId})});loadAll()}} style={{fontSize:11,color:'#ef4444',background:'none',border:'1px solid rgba(239,68,68,0.3)',borderRadius:6,padding:'2px 10px',cursor:'pointer'}}>Delete</button>}
                    </div>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                      <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
                        {['Type','File','Scheduled','Status'].map(h=><th key={h} style={{textAlign:'left',padding:'4px 8px',fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',textTransform:'uppercase'}}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {[...items].sort((a,b)=>['reel','story','post'].indexOf(a.type)-['reel','story','post'].indexOf(b.type)).map(item=>(
                          <tr key={item._id} style={{borderBottom:'1px solid var(--border)'}}>
                            <td style={{padding:'7px 8px',fontSize:16}}>{item.type==='reel'?'🎬':item.type==='story'?'📸':'🖼'}</td>
                            <td style={{padding:'7px 8px',maxWidth:180}}><div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500}}>{item.title}</div>
                              {item.errorMsg&&<div style={{fontSize:10,color:'#ef4444'}}>{item.errorMsg}</div>}</td>
                            <td style={{padding:'7px 8px',color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',fontSize:11,whiteSpace:'nowrap'}}>
                              {item.status==='posted'&&item.postedAt?new Date(item.postedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})+' ✓'
                                :new Date(item.scheduledDate).toLocaleDateString('en-US',{month:'short',day:'numeric'})+' '+new Date(item.scheduledDate).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}
                            </td>
                            <td style={{padding:'7px 8px'}}><span style={{fontSize:10,background:(STATUS_COLOR[item.status]||'#666')+'22',color:STATUS_COLOR[item.status]||'#666',border:`1px solid ${STATUS_COLOR[item.status]||'#666'}44`,borderRadius:10,padding:'2px 7px',fontFamily:'var(--font-dm-mono)'}}>{item.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* ── LOGS ── */}
        {tab==='logs'&&(
          <div>
            <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'center'}}>
              <button onClick={loadAll} style={{marginLeft:'auto',fontSize:11,color:'var(--text-3)',background:'none',border:'1px solid var(--border)',borderRadius:8,padding:'4px 10px',cursor:'pointer'}}>↻ Refresh</button>
            </div>
            {logs.length===0?(<div style={{textAlign:'center',padding:40,color:'var(--text-3)'}}><div style={{fontSize:32,marginBottom:8}}>🤖</div><div>No bot runs yet</div></div>):(
              logs.map(log=>(
                <div key={log._id} className="card" style={{marginBottom:12}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <span style={{fontSize:14}}>{log.type==='reel'?'🎬':log.type==='story'?'📸':'🖼'}</span>
                      <div>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <span style={{fontWeight:600,fontSize:13,textTransform:'capitalize'}}>{log.type} · {accounts.find(a=>a.id===log.accountId)?.name||log.accountId||'unknown'}</span>
                          <span style={{fontSize:10,background:(STATUS_COLOR[log.status]||'#666')+'22',color:STATUS_COLOR[log.status]||'#666',border:`1px solid ${STATUS_COLOR[log.status]||'#666'}44`,borderRadius:10,padding:'2px 7px',fontFamily:'var(--font-dm-mono)'}}>{log.status}</span>
                        </div>
                        <div style={{fontSize:11,color:'var(--text-3)',marginTop:2}}>
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
                  {log.errorMsg&&<div style={{fontSize:12,color:'#ef4444',padding:'6px 10px',background:'rgba(239,68,68,0.06)',borderRadius:6}}>✗ {log.errorMsg}</div>}
                  {log.details?.length>0&&(
                    <div style={{borderTop:'1px solid var(--border)',paddingTop:8}}>
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
        {tab==='accounts'&&(
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
                <div style={{marginTop:10,fontSize:11,color:'var(--text-3)'}}>
                  <div style={{fontFamily:'var(--font-dm-mono)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>🎬 {a.reelsUrl}</div>
                  <div style={{fontFamily:'var(--font-dm-mono)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:3}}>📸 {a.storiesUrl}</div>
                </div>
              </div>
            ))}
            <div className="card">
              <div style={{fontWeight:600,fontSize:13,marginBottom:12}}>+ Add account</div>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <input value={addAccountForm.name} onChange={e=>setAddAccountForm(p=>({...p,name:e.target.value}))} placeholder="Account name (e.g. Sire Ship)"
                  style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'var(--text)',outline:'none'}}/>
                <input value={addAccountForm.assetId} onChange={e=>setAddAccountForm(p=>({...p,assetId:e.target.value}))} placeholder="asset_id from Meta Business Suite URL"
                  style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'var(--text)',outline:'none',fontFamily:'var(--font-dm-mono)'}}/>
                <input value={addAccountForm.igHandle} onChange={e=>setAddAccountForm(p=>({...p,igHandle:e.target.value}))} placeholder="@ighandle (optional)"
                  style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'var(--text)',outline:'none'}}/>
                <div style={{fontSize:11,color:'var(--text-3)'}}>Find asset_id in Meta Business Suite URL when viewing your page — e.g. ?asset_id=162845390237140</div>
                <button className="btn-primary" onClick={addAccount} disabled={addingAccount||!addAccountForm.name||!addAccountForm.assetId}>
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
