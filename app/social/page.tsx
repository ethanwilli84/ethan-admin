'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

interface QItem { _id:string; title:string; caption:string; videoUrl:string; type:'reel'|'story'
  scheduledDate:string; status:string; order:number; batchId:string; postedAt?:string; errorMsg?:string }
interface BotLog { _id:string; type:string; startedAt:string; finishedAt?:string; durationMs?:number
  status:string; itemsPosted:number; itemsFailed:number; itemsAttempted:number
  details:{file:string;ok:boolean;error?:string;scheduledFor?:string}[]; errorMsg?:string }

function getNextOccurrences(count:number, dayOfWeek:number, timeStr:string): Date[] {
  const [h,m] = timeStr.split(':').map(Number)
  const dates:Date[] = []
  let cursor = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(cursor)
    d.setHours(h,m,0,0)
    let diff = (dayOfWeek - d.getDay() + 7) % 7
    if (diff === 0) diff = 7
    d.setDate(d.getDate() + diff)
    dates.push(d)
    cursor = new Date(d.getTime() + 60000)
  }
  return dates
}

const STATUS_COLOR:Record<string,string> = {scheduled:'#5B4FE9',posted:'#00C896',failed:'#ef4444',skipped:'#666',running:'#f59e0b',success:'#00C896',partial:'#f59e0b'}

export default function SocialPage() {
  const [tab, setTab] = useState<'upload'|'queue'|'logs'>('upload')
  const [uploadType, setUploadType] = useState<'reel'|'story'>('reel')
  const [files, setFiles] = useState<File[]>([])
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [postTime, setPostTime] = useState('16:00')
  const [defaultCaption, setDefaultCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({current:0,total:0,file:''})
  const [uploadDone, setUploadDone] = useState(false)
  const [schedule, setSchedule] = useState<Date[]>([])
  const [queue, setQueue] = useState<QItem[]>([])
  const [logs, setLogs] = useState<BotLog[]>([])
  const [queueFilter, setQueueFilter] = useState<'all'|'scheduled'|'posted'|'failed'>('all')
  const [logType, setLogType] = useState<'all'|'reel'|'story'>('all')
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadQueue = useCallback(async () => {
    const r = await fetch('/api/social/queue'); const d = await r.json()
    if (d.ok) setQueue(d.items)
  }, [])
  const loadLogs = useCallback(async () => {
    const url = logType === 'all' ? '/api/social/logs?limit=50' : `/api/social/logs?type=${logType}&limit=50`
    const r = await fetch(url); const d = await r.json()
    if (d.ok) setLogs(d.logs)
  }, [logType])

  useEffect(() => { loadQueue(); loadLogs() }, [loadQueue, loadLogs])
  useEffect(() => {
    if (files.length && uploadType === 'reel') setSchedule(getNextOccurrences(files.length, dayOfWeek, postTime))
    else if (files.length && uploadType === 'story') {
      // Stories: one per day starting tomorrow
      const dates:Date[] = []; let d = new Date()
      for (let i = 0; i < files.length; i++) {
        d = new Date(d); d.setDate(d.getDate() + 1)
        const [h,m] = postTime.split(':').map(Number); d.setHours(h,m,0,0)
        dates.push(new Date(d))
      }
      setSchedule(dates)
    }
  }, [files, dayOfWeek, postTime, uploadType])

  const handleFiles = (newFiles: File[]) => {
    const videos = newFiles.filter(f => f.type.startsWith('video/') || f.type.startsWith('image/'))
    setFiles(prev => [...prev, ...videos])
  }

  async function uploadAll() {
    if (!files.length) return
    setUploading(true); setUploadDone(false)
    const batchId = `batch_${Date.now()}`
    const items = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setUploadProgress({current:i+1, total:files.length, file:file.name})
      try {
        const sigRes = await fetch(`/api/social/upload?filename=${encodeURIComponent(file.name)}&type=${file.type}`)
        const sig = await sigRes.json()
        if (!sig.ok) throw new Error(sig.error || 'Upload init failed — check DO_SPACES env vars')
        await fetch(sig.presignedUrl, { method:'PUT', body:file, headers:{'Content-Type':file.type,'x-amz-acl':'public-read'} })
        items.push({
          title: file.name.replace(/\.[^.]+$/,''), caption:defaultCaption,
          videoUrl:sig.publicUrl, platform:'instagram', type:uploadType,
          scheduledDate: schedule[i]?.toISOString() || new Date().toISOString(),
          status:'scheduled', order:i+1, batchId,
        })
      } catch(e) { alert(`Upload failed for ${file.name}: ${(e as Error).message}`); setUploading(false); return }
    }
    await fetch('/api/social/queue', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items})})
    setUploading(false); setUploadDone(true); setFiles([]); setDefaultCaption('')
    loadQueue(); setTimeout(() => { setUploadDone(false); setTab('queue') }, 1500)
  }

  async function deleteItem(id:string) {
    await fetch('/api/social/queue',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
    loadQueue()
  }

  const qStats = { scheduled:queue.filter(i=>i.status==='scheduled').length, posted:queue.filter(i=>i.status==='posted').length, failed:queue.filter(i=>i.status==='failed').length }
  const filtered = queue.filter(i => queueFilter==='all' || i.status===queueFilter)
  const batches = filtered.reduce((acc,item) => {
    const k = item.batchId || 'single'; if (!acc[k]) acc[k]=[]
    acc[k].push(item); return acc
  }, {} as Record<string,QItem[]>)
  const lastLog = logs[0]

  return (
    <div>
      <div className="page-header-bar">
        <div>
          <div className="page-title">Social Queue</div>
          <div className="page-sub">
            {qStats.scheduled} scheduled · {qStats.posted} posted
            {lastLog && <span style={{marginLeft:8}}>· Last run: <span style={{color:STATUS_COLOR[lastLog.status]||'var(--text-3)'}}>{lastLog.status}</span> {new Date(lastLog.startedAt).toLocaleDateString()}</span>}
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          {(['upload','queue','logs'] as const).map(t => (
            <button key={t} onClick={()=>setTab(t)} style={{padding:'6px 16px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:tab===t?'var(--accent)':'var(--surface-2)',color:tab===t?'#fff':'var(--text-2)'}}>
              {t==='upload'?'⬆ Upload':t==='queue'?`📅 Queue (${queue.length})`:'🤖 Bot Logs'}
            </button>
          ))}
        </div>
      </div>

      <div className="main">

        {/* ─── UPLOAD TAB ─── */}
        {tab==='upload' && (
          <div style={{maxWidth:680}}>
            {/* Type toggle */}
            <div style={{display:'flex',gap:8,marginBottom:16}}>
              {(['reel','story'] as const).map(t => (
                <button key={t} onClick={()=>{setUploadType(t);setFiles([])}} style={{flex:1,padding:'10px',borderRadius:10,fontSize:13,cursor:'pointer',border:`2px solid ${uploadType===t?'var(--accent)':'var(--border)'}`,background:uploadType===t?'rgba(91,79,233,0.08)':'var(--surface)',fontWeight:uploadType===t?700:400,color:uploadType===t?'var(--accent)':'var(--text-2)'}}>
                  {t==='reel'?'🎬 Reels (weekly)':'📸 Stories (daily)'}
                </button>
              ))}
            </div>

            {/* Config */}
            <div className="card" style={{marginBottom:16}}>
              <div style={{fontWeight:600,fontSize:13,marginBottom:12}}>Schedule Config</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 180px',gap:16,marginBottom:16}}>
                {uploadType==='reel' ? (
                  <div>
                    <label style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',textTransform:'uppercase',display:'block',marginBottom:6}}>Post every</label>
                    <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                      {DAYS.map((day,i) => (
                        <button key={day} onClick={()=>setDayOfWeek(i)} style={{padding:'4px 9px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:dayOfWeek===i?'var(--accent)':'var(--surface-2)',color:dayOfWeek===i?'#fff':'var(--text-2)',fontWeight:dayOfWeek===i?600:400}}>
                          {DAY_SHORT[i]}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',textTransform:'uppercase',display:'block',marginBottom:6}}>Post daily starting tomorrow</label>
                    <div style={{fontSize:12,color:'var(--text-3)',marginTop:4}}>One story per day in file order</div>
                  </div>
                )}
                <div>
                  <label style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',textTransform:'uppercase',display:'block',marginBottom:6}}>At time</label>
                  <input type="time" value={postTime} onChange={e=>setPostTime(e.target.value)} style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:14,color:'var(--text)',outline:'none',fontFamily:'var(--font-dm-mono)',width:'100%',boxSizing:'border-box'}}/>
                </div>
              </div>
              <div>
                <label style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',textTransform:'uppercase',display:'block',marginBottom:6}}>Default caption (edit per-item after)</label>
                <textarea value={defaultCaption} onChange={e=>setDefaultCaption(e.target.value)} placeholder={uploadType==='reel'?"Caption for all reels — you can edit each individually after upload":"Story caption (optional)"} rows={2} style={{width:'100%',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'var(--text)',outline:'none',resize:'vertical',boxSizing:'border-box',fontFamily:'inherit'}}/>
              </div>
            </div>

            {/* Drop zone */}
            <div className="card" onDrop={e=>{e.preventDefault();handleFiles(Array.from(e.dataTransfer.files))}} onDragOver={e=>e.preventDefault()}
              style={{marginBottom:16,border:'2px dashed var(--border)',borderRadius:12,padding:'28px 24px',textAlign:'center',cursor:'pointer',transition:'border-color 0.15s'}}
              onClick={()=>fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept={uploadType==='reel'?'video/*':'video/*,image/*'} multiple style={{display:'none'}} onChange={e=>handleFiles(Array.from(e.target.files||[]))}/>
              <div style={{fontSize:32,marginBottom:8}}>{uploadType==='reel'?'🎬':'📸'}</div>
              <div style={{fontWeight:600,fontSize:14,marginBottom:4}}>Drop {uploadType==='reel'?'reel videos':'story images/videos'} here or click to browse</div>
              <div style={{fontSize:11,color:'var(--text-3)'}}>{uploadType==='reel'?'MP4, MOV — any size':'JPG, PNG, MP4, MOV'} · {files.length>0?`${files.length} selected, ~${(files.reduce((s,f)=>s+f.size,0)/1024/1024).toFixed(0)}MB total`:'Drop as many as you want'}</div>
              <div style={{fontSize:10,color:'var(--text-3)',marginTop:6}}>Stored 30 days on DO Spaces, then auto-deleted after posting</div>
            </div>

            {/* File list */}
            {files.length>0 && (
              <div className="card" style={{marginBottom:16}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                  <div style={{fontWeight:600,fontSize:13}}>{files.length} files · {uploadType==='reel'?`every ${DAYS[dayOfWeek]} at ${postTime}`:`daily at ${postTime}`}</div>
                  <button onClick={()=>setFiles([])} style={{fontSize:11,color:'var(--text-3)',background:'none',border:'none',cursor:'pointer'}}>Clear all</button>
                </div>
                <div style={{maxHeight:320,overflowY:'auto'}}>
                  {files.map((file,i) => (
                    <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderBottom:'1px solid var(--border)'}}>
                      <div style={{width:22,height:22,background:'var(--accent)',borderRadius:5,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#fff',flexShrink:0}}>{i+1}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{file.name}</div>
                        <div style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)'}}>
                          {schedule[i]?.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'})} at {schedule[i]?.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}
                        </div>
                      </div>
                      <div style={{fontSize:10,color:'var(--text-3)'}}>{(file.size/1024/1024).toFixed(0)}MB</div>
                      <button onClick={()=>setFiles(prev=>prev.filter((_,j)=>j!==i))} style={{fontSize:15,color:'var(--text-3)',background:'none',border:'none',cursor:'pointer',lineHeight:1,padding:'0 4px'}}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {files.length>0 && (
              <div>
                {uploading && (
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
                {uploadDone && <div style={{marginBottom:12,color:'var(--green)',fontSize:13,fontFamily:'var(--font-dm-mono)'}}>✓ All {uploadProgress.total} files queued — opening queue view...</div>}
                <button className="btn-primary" onClick={uploadAll} disabled={uploading||uploadDone} style={{width:'100%',padding:'12px',fontSize:14}}>
                  {uploading?`◌ Uploading ${uploadProgress.current}/${files.length}...`:uploadDone?'✓ Done':
                    `Upload & schedule ${files.length} ${uploadType}${files.length!==1?'s':''} → ${uploadType==='reel'?`every ${DAYS[dayOfWeek]} at ${postTime}`:`daily at ${postTime}`}`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── QUEUE TAB ─── */}
        {tab==='queue' && (
          <div>
            <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
              {(['all','scheduled','posted','failed'] as const).map(s => (
                <button key={s} onClick={()=>setQueueFilter(s)} style={{padding:'5px 14px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:queueFilter===s?'var(--accent)':'var(--surface-2)',color:queueFilter===s?'#fff':'var(--text-2)'}}>
                  {s} ({s==='all'?queue.length:qStats[s]??0})
                </button>
              ))}
              <button onClick={loadQueue} style={{marginLeft:'auto',fontSize:11,color:'var(--text-3)',background:'none',border:'1px solid var(--border)',borderRadius:8,padding:'4px 10px',cursor:'pointer'}}>↻ Refresh</button>
            </div>

            {filtered.length===0 ? (
              <div style={{textAlign:'center',padding:40,color:'var(--text-3)'}}>
                <div style={{fontSize:32,marginBottom:8}}>📅</div>
                <div style={{fontSize:13}}>No items in queue</div>
                <button className="btn-primary" style={{marginTop:16,fontSize:12}} onClick={()=>setTab('upload')}>Upload content →</button>
              </div>
            ) : (
              Object.entries(batches).map(([batchId,items]) => {
                const reels = items.filter(i=>i.type==='reel')
                const stories = items.filter(i=>i.type==='story')
                const batchType = items[0]?.type
                const scheduled = items.filter(i=>i.status==='scheduled')
                return (
                  <div key={batchId} className="card" style={{marginBottom:16}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <span style={{fontSize:16}}>{batchType==='reel'?'🎬':'📸'}</span>
                        <div>
                          <div style={{fontWeight:600,fontSize:13}}>{batchType==='reel'?'Reels batch':'Stories batch'}</div>
                          <div style={{fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)'}}>{items.length} items · {items.filter(i=>i.status==='posted').length} posted · {scheduled.length} remaining</div>
                        </div>
                      </div>
                      {scheduled.length>0 && (
                        <button onClick={async()=>{if(!confirm('Delete all scheduled items in this batch?'))return;await fetch('/api/social/queue',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({batchId})});loadQueue()}} style={{fontSize:11,color:'#ef4444',background:'none',border:'1px solid rgba(239,68,68,0.3)',borderRadius:6,padding:'2px 10px',cursor:'pointer'}}>
                          Delete batch
                        </button>
                      )}
                    </div>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                      <thead>
                        <tr style={{borderBottom:'1px solid var(--border)'}}>
                          {['#','File','Scheduled','Status',''].map(h=>(
                            <th key={h} style={{textAlign:'left',padding:'4px 8px',fontSize:10,color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',textTransform:'uppercase'}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...items].sort((a,b)=>a.order-b.order).map(item=>(
                          <tr key={item._id} style={{borderBottom:'1px solid var(--border)'}}>
                            <td style={{padding:'7px 8px',color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',width:28}}>{item.order}</td>
                            <td style={{padding:'7px 8px',maxWidth:200}}>
                              <div style={{fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.title}</div>
                              {item.errorMsg&&<div style={{fontSize:10,color:'#ef4444',marginTop:2}}>{item.errorMsg}</div>}
                            </td>
                            <td style={{padding:'7px 8px',color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',fontSize:11,whiteSpace:'nowrap'}}>
                              {item.status==='posted'&&item.postedAt
                                ?new Date(item.postedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})+'  ✓'
                                :new Date(item.scheduledDate).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})
                                +' '+new Date(item.scheduledDate).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})
                              }
                            </td>
                            <td style={{padding:'7px 8px'}}>
                              <span style={{fontSize:10,background:(STATUS_COLOR[item.status]||'#666')+'22',color:STATUS_COLOR[item.status]||'#666',border:`1px solid ${STATUS_COLOR[item.status]||'#666'}44`,borderRadius:10,padding:'2px 7px',fontFamily:'var(--font-dm-mono)'}}>{item.status}</span>
                            </td>
                            <td style={{padding:'7px 8px'}}>
                              {item.status==='scheduled'&&(
                                <button onClick={()=>deleteItem(item._id)} style={{fontSize:11,color:'var(--text-3)',background:'none',border:'1px solid var(--border)',borderRadius:6,padding:'2px 8px',cursor:'pointer'}}>×</button>
                              )}
                            </td>
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

        {/* ─── LOGS TAB ─── */}
        {tab==='logs' && (
          <div>
            <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'center'}}>
              {(['all','reel','story'] as const).map(t=>(
                <button key={t} onClick={()=>setLogType(t)} style={{padding:'5px 14px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:logType===t?'var(--accent)':'var(--surface-2)',color:logType===t?'#fff':'var(--text-2)'}}>
                  {t}
                </button>
              ))}
              <button onClick={loadLogs} style={{marginLeft:'auto',fontSize:11,color:'var(--text-3)',background:'none',border:'1px solid var(--border)',borderRadius:8,padding:'4px 10px',cursor:'pointer'}}>↻ Refresh</button>
            </div>

            {logs.length===0?(
              <div style={{textAlign:'center',padding:40,color:'var(--text-3)'}}>
                <div style={{fontSize:32,marginBottom:8}}>🤖</div>
                <div style={{fontSize:13}}>No bot runs yet</div>
                <div style={{fontSize:11,marginTop:4}}>Logs appear here after the first reel or story gets scheduled</div>
              </div>
            ):(
              logs.map(log=>(
                <div key={log._id} className="card" style={{marginBottom:12}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <span style={{fontSize:14}}>{log.type==='reel'?'🎬':'📸'}</span>
                      <div>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <span style={{fontWeight:600,fontSize:13,textTransform:'capitalize'}}>{log.type} scheduler</span>
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
                  {log.errorMsg&&<div style={{fontSize:12,color:'#ef4444',marginBottom:8,padding:'6px 10px',background:'rgba(239,68,68,0.06)',borderRadius:6}}>✗ {log.errorMsg}</div>}
                  {log.details?.length>0&&(
                    <div style={{borderTop:'1px solid var(--border)',paddingTop:8}}>
                      {log.details.map((d,i)=>(
                        <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 0',fontSize:11}}>
                          <span style={{color:d.ok?'var(--green)':'#ef4444',fontWeight:700}}>{d.ok?'✓':'✗'}</span>
                          <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.file}</span>
                          {d.scheduledFor&&<span style={{color:'var(--text-3)',fontFamily:'var(--font-dm-mono)',whiteSpace:'nowrap'}}>{new Date(d.scheduledFor).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>}
                          {d.error&&<span style={{color:'#ef4444',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:200}}>{d.error}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
