'use client'
import { useState, useEffect, useRef } from 'react'

interface Creative {
  _id: string
  name: string
  imageUrl: string
  hook?: string
  angle?: string
  variant?: string
  tags?: string[]
  mediaType?: string
  stats?: { timesUsedInAds?: number }
  createdAt?: string
}

interface Ad {
  _id: string
  metaId: string
  name: string
  status: string
  creativeId?: string
  adsetMetaId: string
  destinationUrl?: string
  metrics?: Record<string, number> | null
}
interface AdSet {
  _id: string
  metaId: string
  name?: string
  destinationName: string
  destinationUrl: string
  dailyBudgetCents: number
  status: string
  ads: Ad[]
}
interface Campaign {
  _id: string
  metaId: string
  name: string
  objective: string
  status: string
  adsets: AdSet[]
  createdAt?: string
}

interface Health {
  ok: boolean
  token?: { status: string; daysUntilExpiry?: number; error?: string }
  adAccount?: Record<string, unknown>
  pixel?: Record<string, unknown>
  error?: string
}

type Tab = 'launch' | 'creatives' | 'campaigns' | 'metrics' | 'rules' | 'events'

export default function AdsPage() {
  const [tab, setTab] = useState<Tab>('launch')
  const [health, setHealth] = useState<Health | null>(null)
  const [creatives, setCreatives] = useState<Creative[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [toast, setToast] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const showToast = (m: string, ms = 2500) => {
    setToast(m)
    if (ms) setTimeout(() => setToast(''), ms)
  }

  async function loadHealth() {
    try {
      const r = await fetch('/api/ads/health', { cache: 'no-store' })
      setHealth(await r.json())
    } catch (e) {
      setHealth({ ok: false, error: (e as Error).message })
    }
  }
  async function loadCreatives() {
    const r = await fetch('/api/ads/creatives?accountId=sire-ship', { cache: 'no-store' })
    const j = await r.json()
    setCreatives(j.creatives || [])
  }
  async function loadCampaigns() {
    const r = await fetch('/api/ads/campaigns?accountId=sire-ship', { cache: 'no-store' })
    const j = await r.json()
    setCampaigns(j.campaigns || [])
  }

  useEffect(() => {
    loadHealth()
    loadCreatives()
    loadCampaigns()
  }, [])

  // ─────────────────────── LAUNCH TAB STATE ───────────────────────
  const [launchForm, setLaunchForm] = useState({
    campaignName: `Sire Ship — Test ${new Date().toISOString().slice(0, 10)}`,
    objective: 'OUTCOME_SALES' as const,
    customEvent: 'LEAD' as const,
    optimizationGoal: 'OFFSITE_CONVERSIONS' as const,
    dailyBudgetUsd: 15,
    primaryText: "Ship smarter. Pay less. Get UPS & FedEx rates 10% below Shippo.",
    headline: 'Sire Ship',
    description: '10% below Shippo. No subscription.',
    ctaType: 'SIGN_UP' as const,
    status: 'PAUSED' as 'PAUSED' | 'ACTIVE',
    ageMin: 22,
    ageMax: 55,
    countries: 'US',
  })
  const [destinations, setDestinations] = useState<Array<{ name: string; url: string; creativeIds: string[] }>>([
    { name: 'waitlist',  url: 'https://app.sireapp.io',     creativeIds: [] },
  ])
  const [launchResult, setLaunchResult] = useState<unknown>(null)

  async function launch() {
    if (busy) return
    setBusy(true); setLaunchResult(null)
    try {
      const payload = {
        accountId: 'sire-ship',
        campaignName: launchForm.campaignName,
        objective: launchForm.objective,
        customEvent: launchForm.customEvent,
        optimizationGoal: launchForm.optimizationGoal,
        dailyBudgetCents: Math.round(launchForm.dailyBudgetUsd * 100),
        primaryText: launchForm.primaryText,
        headline: launchForm.headline,
        description: launchForm.description,
        ctaType: launchForm.ctaType,
        status: launchForm.status,
        destinations: destinations.filter(d => d.creativeIds.length > 0),
        targeting: {
          geo_locations: { countries: launchForm.countries.split(',').map(s => s.trim()) },
          age_min: launchForm.ageMin, age_max: launchForm.ageMax,
        },
      }
      const r = await fetch('/api/ads/launch', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) })
      const j = await r.json()
      setLaunchResult(j)
      if (j.ok) { showToast('✓ Campaign created (status = ' + launchForm.status + ')'); loadCampaigns() }
      else     { showToast('✗ ' + (j.error || 'failed'), 6000) }
    } catch (e) {
      setLaunchResult({ ok: false, error: (e as Error).message })
    } finally { setBusy(false) }
  }

  // ─────────────────────── UPLOAD CREATIVE ───────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadMeta, setUploadMeta] = useState({ name: '', hook: '', angle: '', variant: '', tags: '' })

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        const qs = new URLSearchParams({
          accountId: 'sire-ship',
          name:     uploadMeta.name || f.name.replace(/\.[^/.]+$/, ''),
          filename: f.name,
          hook:     uploadMeta.hook,
          angle:    uploadMeta.angle,
          variant:  uploadMeta.variant,
          tags:     uploadMeta.tags,
        }).toString()
        const r = await fetch(`/api/ads/upload?${qs}`, { method: 'POST', body: f })
        const j = await r.json()
        if (!j.ok) { showToast(`✗ ${f.name}: ${j.error}`, 6000); continue }
      }
      showToast(`✓ Uploaded ${files.length} creative${files.length>1?'s':''}`)
      await loadCreatives()
      setUploadMeta({ name: '', hook: '', angle: '', variant: '', tags: '' })
      if (fileInputRef.current) fileInputRef.current.value = ''
    } finally { setBusy(false) }
  }

  async function deleteCreative(id: string) {
    if (!confirm('Delete creative?')) return
    await fetch(`/api/ads/creatives?id=${id}`, { method: 'DELETE' })
    loadCreatives()
  }

  // ─────────────────────── CAMPAIGN CONTROL ───────────────────────
  async function setCampaignStatus(metaId: string, status: 'ACTIVE' | 'PAUSED') {
    await fetch('/api/ads/campaigns', { method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ action: 'set_status', metaId, status }) })
    showToast(`✓ ${status}`)
    loadCampaigns()
  }

  async function adjustBudget(adsetMetaId: string, cents: number) {
    await fetch('/api/ads/campaigns', { method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ action: 'set_budget', metaId: adsetMetaId, budgetCents: cents }) })
    showToast('✓ Budget updated')
    loadCampaigns()
  }

  async function syncMetrics() {
    setBusy(true)
    try {
      const r = await fetch('/api/ads/sync', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({accountId:'sire-ship'})})
      const j = await r.json()
      showToast(j.ok ? `✓ Synced ${j.writes} metrics` : `✗ ${j.error}`)
      loadCampaigns()
    } finally { setBusy(false) }
  }

  async function runRules(dryRun = true) {
    setBusy(true)
    try {
      const r = await fetch('/api/ads/rules', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({accountId:'sire-ship',dryRun})})
      const j = await r.json()
      showToast(dryRun ? `Dry run: ${j.actions?.length || 0} would fire` : `✓ ${j.actions?.length || 0} actions`)
      console.log(j)
    } finally { setBusy(false) }
  }

  // ─────────────────────── RENDER ───────────────────────
  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'launch',    label: 'Launch',    icon: '🚀' },
    { id: 'creatives', label: 'Creatives', icon: '🎨' },
    { id: 'campaigns', label: 'Campaigns', icon: '📊' },
    { id: 'metrics',   label: 'Metrics',   icon: '📈' },
    { id: 'rules',     label: 'Rules',     icon: '⚙️' },
    { id: 'events',    label: 'Events',    icon: '🔔' },
  ]

  return (
    <div style={{padding:'20px 30px', minHeight:'100vh'}}>
      {/* Header */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18}}>
        <div>
          <div style={{fontSize:22, fontWeight:700}}>Meta Ads</div>
          <div style={{fontSize:12, color:'var(--text-3)', marginTop:2}}>
            {health?.adAccount ? `${(health.adAccount as {name?:string}).name || 'Sire Ship'} · ${(health.adAccount as {currency?:string}).currency || 'USD'} · $${((health.adAccount as {amount_spent?:string}).amount_spent ? Number((health.adAccount as {amount_spent?:string}).amount_spent) / 100 : 0).toLocaleString()} lifetime` : 'Loading…'}
          </div>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          {health && (
            <div style={{fontSize:11, padding:'4px 10px', borderRadius:999,
              background: health.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              color: health.ok ? '#22c55e' : '#ef4444'}}>
              {health.ok ? `✓ Connected (token: ${health.token?.daysUntilExpiry}d)` : '✗ Not connected'}
            </div>
          )}
          <button onClick={syncMetrics} disabled={busy}
            style={{padding:'7px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text)', cursor:busy?'wait':'pointer', fontSize:12}}>
            ↻ Sync metrics
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)'}}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{
              padding:'9px 14px', fontSize:13, fontWeight: tab===t.id ? 600 : 400,
              border:'none', background:'transparent', cursor:'pointer',
              color: tab===t.id ? 'var(--accent)' : 'var(--text-2)',
              borderBottom: tab===t.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom:-1,
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {toast && <div style={{position:'fixed',top:20,right:20,padding:'10px 16px',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,fontSize:13,zIndex:1000}}>{toast}</div>}

      {/* ─────────────────────── LAUNCH ─────────────────────── */}
      {tab === 'launch' && (
        <div style={{display:'grid', gap:18}}>
          <div style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:18}}>
            <div style={{fontSize:14, fontWeight:600, marginBottom:12}}>Campaign</div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
              <label style={{display:'flex',flexDirection:'column',gap:5}}>
                <span style={{fontSize:11, color:'var(--text-3)', textTransform:'uppercase'}}>Name</span>
                <input value={launchForm.campaignName} onChange={e=>setLaunchForm(f=>({...f, campaignName:e.target.value}))}
                  style={{padding:'8px 10px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', fontSize:13}}/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:5}}>
                <span style={{fontSize:11, color:'var(--text-3)', textTransform:'uppercase'}}>Daily budget per ad set (USD)</span>
                <input type="number" value={launchForm.dailyBudgetUsd} onChange={e=>setLaunchForm(f=>({...f, dailyBudgetUsd:Number(e.target.value)}))}
                  style={{padding:'8px 10px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', fontSize:13}}/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:5}}>
                <span style={{fontSize:11, color:'var(--text-3)', textTransform:'uppercase'}}>Primary text</span>
                <textarea value={launchForm.primaryText} onChange={e=>setLaunchForm(f=>({...f, primaryText:e.target.value}))} rows={3}
                  style={{padding:'8px 10px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', fontSize:13, resize:'vertical'}}/>
              </label>
              <div style={{display:'grid', gap:10}}>
                <label style={{display:'flex',flexDirection:'column',gap:5}}>
                  <span style={{fontSize:11, color:'var(--text-3)', textTransform:'uppercase'}}>Headline</span>
                  <input value={launchForm.headline} onChange={e=>setLaunchForm(f=>({...f, headline:e.target.value}))}
                    style={{padding:'8px 10px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', fontSize:13}}/>
                </label>
                <label style={{display:'flex',flexDirection:'column',gap:5}}>
                  <span style={{fontSize:11, color:'var(--text-3)', textTransform:'uppercase'}}>Description</span>
                  <input value={launchForm.description} onChange={e=>setLaunchForm(f=>({...f, description:e.target.value}))}
                    style={{padding:'8px 10px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', fontSize:13}}/>
                </label>
              </div>
            </div>
            <div style={{display:'flex', gap:12, marginTop:12, flexWrap:'wrap'}}>
              <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}>CTA:
                <select value={launchForm.ctaType} onChange={e=>setLaunchForm(f=>({...f, ctaType:e.target.value as typeof f.ctaType}))}
                  style={{padding:'5px 8px',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:12}}>
                  <option value="SIGN_UP">Sign Up</option>
                  <option value="LEARN_MORE">Learn More</option>
                  <option value="GET_OFFER">Get Offer</option>
                  <option value="APPLY_NOW">Apply Now</option>
                  <option value="DOWNLOAD">Download</option>
                </select>
              </label>
              <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}>Event:
                <select value={launchForm.customEvent} onChange={e=>setLaunchForm(f=>({...f, customEvent:e.target.value as typeof f.customEvent}))}
                  style={{padding:'5px 8px',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:12}}>
                  <option value="LEAD">Lead</option>
                  <option value="COMPLETE_REGISTRATION">Complete Registration</option>
                  <option value="PURCHASE">Purchase</option>
                  <option value="SUBSCRIBE">Subscribe</option>
                </select>
              </label>
              <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}>Age:
                <input type="number" value={launchForm.ageMin} onChange={e=>setLaunchForm(f=>({...f, ageMin:Number(e.target.value)}))} style={{width:52,padding:'5px 6px',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:12}}/>
                –
                <input type="number" value={launchForm.ageMax} onChange={e=>setLaunchForm(f=>({...f, ageMax:Number(e.target.value)}))} style={{width:52,padding:'5px 6px',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:12}}/>
              </label>
              <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}>Countries:
                <input value={launchForm.countries} onChange={e=>setLaunchForm(f=>({...f, countries:e.target.value}))} style={{width:100,padding:'5px 8px',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:12}}/>
              </label>
            </div>
          </div>

          {/* Destinations (ad sets) */}
          <div style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:18}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <div style={{fontSize:14, fontWeight:600}}>Destinations (1 ad set per destination)</div>
              <button onClick={()=>setDestinations(d=>[...d, {name:'', url:'', creativeIds:[]}])}
                style={{padding:'6px 10px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)', cursor:'pointer', fontSize:12}}>
                + Add destination
              </button>
            </div>
            {destinations.map((d, idx) => (
              <div key={idx} style={{border:'1px solid var(--border)', borderRadius:10, padding:12, marginBottom:10}}>
                <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:8}}>
                  <input placeholder="name (e.g. waitlist, homepage)" value={d.name} onChange={e=>{
                      const v=e.target.value; setDestinations(arr=>arr.map((x,i)=>i===idx?{...x,name:v}:x))
                    }} style={{flex:1, padding:'6px 10px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)', fontSize:13}}/>
                  <input placeholder="https://…" value={d.url} onChange={e=>{
                      const v=e.target.value; setDestinations(arr=>arr.map((x,i)=>i===idx?{...x,url:v}:x))
                    }} style={{flex:2, padding:'6px 10px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)', fontSize:13}}/>
                  {destinations.length > 1 &&
                    <button onClick={()=>setDestinations(arr=>arr.filter((_,i)=>i!==idx))}
                      style={{padding:'6px 10px', background:'transparent', border:'1px solid var(--border)', borderRadius:6, color:'#ef4444', cursor:'pointer', fontSize:12}}>×</button>}
                </div>
                <div style={{fontSize:11, color:'var(--text-3)', marginBottom:6}}>
                  Creatives assigned to this destination ({d.creativeIds.length} selected):
                </div>
                <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(100px, 1fr))', gap:8}}>
                  {creatives.map(c => {
                    const on = d.creativeIds.includes(c._id)
                    return (
                      <button key={c._id} onClick={()=>{
                        setDestinations(arr=>arr.map((x,i)=> i===idx ? {
                          ...x,
                          creativeIds: on ? x.creativeIds.filter(id=>id!==c._id) : [...x.creativeIds, c._id]
                        } : x))
                      }}
                        title={c.name}
                        style={{padding:0, border: on ? '2px solid var(--accent)' : '2px solid transparent', background:'transparent', borderRadius:8, cursor:'pointer', overflow:'hidden', position:'relative'}}>
                        <img src={c.imageUrl} alt="" style={{width:'100%', aspectRatio:'1', objectFit:'cover', display:'block', opacity: on ? 1 : 0.55}}/>
                        <div style={{position:'absolute',bottom:0,left:0,right:0,background:'linear-gradient(transparent,rgba(0,0,0,0.85))',color:'#fff',fontSize:9,padding:'12px 4px 3px',textAlign:'left',lineHeight:1.2}}>{c.name}</div>
                      </button>
                    )
                  })}
                  {creatives.length===0 && <div style={{gridColumn:'1/-1',fontSize:11,color:'var(--text-3)',padding:10,textAlign:'center'}}>No creatives yet — upload on the Creatives tab</div>}
                </div>
              </div>
            ))}
          </div>

          {/* Launch controls */}
          <div style={{display:'flex', gap:10, alignItems:'center'}}>
            <label style={{display:'flex',alignItems:'center',gap:6,fontSize:13}}>
              Status on create:
              <select value={launchForm.status} onChange={e=>setLaunchForm(f=>({...f, status:e.target.value as 'PAUSED'|'ACTIVE'}))}
                style={{padding:'6px 10px',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:12}}>
                <option value="PAUSED">PAUSED (review first — recommended)</option>
                <option value="ACTIVE">ACTIVE (live immediately)</option>
              </select>
            </label>
            <button onClick={launch} disabled={busy || destinations.every(d=>d.creativeIds.length===0)}
              style={{padding:'10px 18px', background:'var(--accent)', border:'none', borderRadius:8, color:'#fff', cursor:busy?'wait':'pointer', fontSize:13, fontWeight:600}}>
              {busy ? 'Creating…' : 'Create campaign →'}
            </button>
          </div>

          {launchResult !== null && (
            <pre style={{background:'var(--surface-2)',padding:12,borderRadius:8,fontSize:11,maxHeight:300,overflow:'auto',color:'var(--text-2)'}}>{JSON.stringify(launchResult, null, 2)}</pre>
          )}
        </div>
      )}

      {/* ─────────────────────── CREATIVES ─────────────────────── */}
      {tab === 'creatives' && (
        <div style={{display:'grid', gap:18}}>
          <div style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:18}}>
            <div style={{fontSize:14, fontWeight:600, marginBottom:12}}>Upload creatives</div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:8, marginBottom:10}}>
              <input placeholder="name" value={uploadMeta.name} onChange={e=>setUploadMeta(m=>({...m, name:e.target.value}))} style={{padding:'7px 10px',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:12}}/>
              <input placeholder="hook" value={uploadMeta.hook} onChange={e=>setUploadMeta(m=>({...m, hook:e.target.value}))} style={{padding:'7px 10px',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:12}}/>
              <input placeholder="angle" value={uploadMeta.angle} onChange={e=>setUploadMeta(m=>({...m, angle:e.target.value}))} style={{padding:'7px 10px',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:12}}/>
              <input placeholder="variant" value={uploadMeta.variant} onChange={e=>setUploadMeta(m=>({...m, variant:e.target.value}))} style={{padding:'7px 10px',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:12}}/>
              <input placeholder="tags (comma sep)" value={uploadMeta.tags} onChange={e=>setUploadMeta(m=>({...m, tags:e.target.value}))} style={{padding:'7px 10px',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:12}}/>
            </div>
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" onChange={e=>handleUpload(e.target.files)}
              style={{fontSize:12, padding:10, background:'var(--surface-2)', border:'1px dashed var(--border)', borderRadius:8, width:'100%', cursor:'pointer'}}/>
            <div style={{fontSize:11, color:'var(--text-3)', marginTop:6}}>Name/hook/angle/variant/tags apply to ALL files uploaded in this batch. You can edit per-creative afterward.</div>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(170px, 1fr))', gap:12}}>
            {creatives.map(c => (
              <div key={c._id} style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden', position:'relative'}}>
                <img src={c.imageUrl} alt="" style={{width:'100%', aspectRatio:'1', objectFit:'cover', display:'block'}}/>
                <div style={{padding:10}}>
                  <div style={{fontSize:12, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{c.name}</div>
                  <div style={{fontSize:10, color:'var(--text-3)', marginTop:3}}>
                    {c.hook && <span style={{marginRight:6}}>🪝 {c.hook}</span>}
                    {c.angle && <span style={{marginRight:6}}>📐 {c.angle}</span>}
                  </div>
                  <div style={{fontSize:10, color:'var(--text-3)', marginTop:4}}>
                    Used {c.stats?.timesUsedInAds ?? 0}× in ads
                  </div>
                </div>
                <button onClick={()=>deleteCreative(c._id)}
                  style={{position:'absolute', top:6, right:6, padding:'3px 7px', background:'rgba(0,0,0,0.55)', border:'none', borderRadius:5, color:'#fff', fontSize:10, cursor:'pointer'}}>×</button>
              </div>
            ))}
            {creatives.length===0 && <div style={{gridColumn:'1/-1',fontSize:12,color:'var(--text-3)',padding:20,textAlign:'center'}}>No creatives uploaded yet</div>}
          </div>
        </div>
      )}

      {/* ─────────────────────── CAMPAIGNS ─────────────────────── */}
      {tab === 'campaigns' && (
        <div style={{display:'grid', gap:12}}>
          {campaigns.map(c => (
            <div key={c._id} style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:14}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                <div>
                  <div style={{fontWeight:600, fontSize:14}}>{c.name}</div>
                  <div style={{fontSize:10, color:'var(--text-3)', marginTop:2, fontFamily:'var(--font-dm-mono)'}}>
                    {c.metaId} · {c.objective} · {c.status}
                  </div>
                </div>
                <div style={{display:'flex', gap:6}}>
                  <button onClick={()=>setCampaignStatus(c.metaId, c.status==='ACTIVE'?'PAUSED':'ACTIVE')}
                    style={{padding:'6px 12px', background: c.status==='ACTIVE'?'rgba(239,68,68,0.15)':'rgba(34,197,94,0.15)', color: c.status==='ACTIVE'?'#ef4444':'#22c55e', border:'none', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:600}}>
                    {c.status==='ACTIVE'?'⏸ Pause':'▶ Activate'}
                  </button>
                </div>
              </div>
              {c.adsets.map(s => (
                <div key={s._id} style={{marginLeft:14, borderLeft:'2px solid var(--border)', paddingLeft:12, marginTop:8}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:10}}>
                    <div>
                      <div style={{fontSize:12, fontWeight:500}}>{s.destinationName} <span style={{color:'var(--text-3)',fontWeight:400}}>→ {s.destinationUrl}</span></div>
                      <div style={{fontSize:10, color:'var(--text-3)', fontFamily:'var(--font-dm-mono)'}}>${(s.dailyBudgetCents/100).toFixed(2)}/day · {s.status}</div>
                    </div>
                    <div style={{display:'flex', gap:4}}>
                      <button onClick={()=>{
                        const v = prompt('Daily budget ($):', String(s.dailyBudgetCents/100))
                        if (v) adjustBudget(s.metaId, Math.round(Number(v)*100))
                      }} style={{padding:'4px 10px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:5, color:'var(--text-2)', cursor:'pointer', fontSize:11}}>$ Edit</button>
                    </div>
                  </div>
                  {s.ads.map(a => {
                    const m = a.metrics as Record<string,number> | null
                    return (
                      <div key={a._id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', fontSize:11, borderBottom:'1px dashed var(--border)'}}>
                        <div style={{flex:1}}>{a.name}</div>
                        <div style={{fontFamily:'var(--font-dm-mono)',color:'var(--text-3)',fontSize:10}}>
                          {m ? `$${(Number(m.spend)||0).toFixed(2)} · ${m.impressions||0} imp · ${m.clicks||0} clk · ${((Number(m.leads)||0)+(Number(m.regs)||0)+(Number(m.purchases)||0))} conv` : 'no data'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          ))}
          {campaigns.length===0 && <div style={{fontSize:12, color:'var(--text-3)', padding:30, textAlign:'center'}}>No campaigns yet. Go to Launch tab to create one.</div>}
        </div>
      )}

      {/* ─────────────────────── METRICS (simple rollup) ─────────────────────── */}
      {tab === 'metrics' && (
        <div style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:18}}>
          <div style={{fontSize:13, color:'var(--text-2)', marginBottom:8}}>
            Hourly metrics are pulled automatically via cron. Click <strong>Sync metrics</strong> at top to pull now. Charts coming — for now open each ad set on the Campaigns tab to see counts.
          </div>
        </div>
      )}

      {/* ─────────────────────── RULES ─────────────────────── */}
      {tab === 'rules' && (
        <div style={{display:'grid', gap:14}}>
          <div style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:18}}>
            <div style={{fontSize:14, fontWeight:600, marginBottom:8}}>Auto-optimization rules (defaults)</div>
            <ul style={{fontSize:12, color:'var(--text-2)', lineHeight:1.7, margin:0, paddingLeft:18}}>
              <li>Pause ad if <strong>CAC &gt; $60</strong> (after min $10 spend)</li>
              <li>Pause ad if <strong>frequency &gt; 3.5</strong> (creative fatigue)</li>
              <li>Scale ad set <strong>+20% budget</strong> if CAC &lt; $30 and ≥2 conversions</li>
            </ul>
            <div style={{display:'flex', gap:8, marginTop:12}}>
              <button onClick={()=>runRules(true)} disabled={busy}
                style={{padding:'8px 14px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)', cursor:'pointer', fontSize:12}}>🔍 Dry run</button>
              <button onClick={()=>{if(confirm('Apply rules for real?')) runRules(false)}} disabled={busy}
                style={{padding:'8px 14px', background:'var(--accent)', border:'none', borderRadius:6, color:'#fff', cursor:'pointer', fontSize:12, fontWeight:600}}>⚡ Apply now</button>
            </div>
            <div style={{fontSize:11, color:'var(--text-3)', marginTop:8}}>Open your console (F12) to see detailed action log.</div>
          </div>
        </div>
      )}

      {/* ─────────────────────── EVENTS ─────────────────────── */}
      {tab === 'events' && (
        <div style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:18}}>
          <div style={{fontSize:13, color:'var(--text-2)'}}>
            Server-side CAPI events that have been sent. (Hit <code>/api/ads/capi</code> from your waitlist backend when someone signs up.)
          </div>
        </div>
      )}
    </div>
  )
}
