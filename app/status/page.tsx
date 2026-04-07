'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface ServiceResult { id:string; name:string; url:string; status:'up'|'down'|'slow'; httpCode:number|null; responseMs:number; critical:boolean; category:string; error?:string }
interface Metrics { stuckPayouts:number; newDefaults:number; pendingPayouts:number; todayLoans:number; ok:boolean }
interface CheckData { ok:boolean; checkedAt:string; results:ServiceResult[]; metrics:Metrics; summary:{ allClear:boolean; criticalDown:number; totalDown:number; totalSlow:number; totalUp:number } }
interface HistoryCheck { checkedAt:string; summary:{ allClear:boolean; totalDown:number }; results:{id:string;status:string}[] }

const STATUS_COLOR = { up:'var(--green)', down:'var(--red)', slow:'#f59e0b' }
const STATUS_BG = { up:'rgba(0,200,150,0.08)', down:'rgba(255,71,87,0.08)', slow:'rgba(245,158,11,0.08)' }
const STATUS_BORDER = { up:'rgba(0,200,150,0.2)', down:'rgba(255,71,87,0.3)', slow:'rgba(245,158,11,0.2)' }

export default function StatusPage() {
  const [data, setData] = useState<CheckData|null>(null)
  const [history, setHistory] = useState<HistoryCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/monitor', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ hours: 24 }) })
      const d = await res.json()
      setHistory(d.history || [])
    } catch {}
  }, [])

  const runCheck = useCallback(async (save = true) => {
    setChecking(true)
    try {
      const res = await fetch(`/api/monitor?save=${save}`)
      setData(await res.json())
      await fetchHistory()
    } catch {}
    setChecking(false)
    setLoading(false)
  }, [fetchHistory])

  useEffect(() => {
    runCheck(true) // Run and save on page load
    const interval = setInterval(() => runCheck(true), 5 * 60 * 1000) // Auto-check every 5 min
    return () => clearInterval(interval)
  }, [runCheck])

  function uptimePct(serviceId: string) {
    if (!history.length) return null
    const checks = history.filter(h => h.results?.find(r => r.id === serviceId))
    if (!checks.length) return null
    const up = checks.filter(h => h.results.find(r => r.id === serviceId)?.status === 'up').length
    return Math.round((up / checks.length) * 100)
  }

  function statusDots(serviceId: string) {
    const last30 = [...history].reverse().slice(0, 30)
    return last30.map(h => h.results?.find(r => r.id === serviceId)?.status || 'unknown')
  }

  const alpine = data?.results.filter(s => s.category === 'alpine') || []
  const sire = data?.results.filter(s => s.category === 'sire') || []
  const incidents = history.filter(h => !h.summary?.allClear).slice(0, 10)

  return (
    <div style={{ maxWidth:920, margin:'0 auto', padding:'32px 24px' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28 }}>
        <div>
          <Link href="/" style={{ color:'var(--text-3)', fontSize:13, textDecoration:'none' }}>← Admin</Link>
          <div style={{ fontFamily:'var(--font-syne)', fontWeight:700, fontSize:22, marginTop:4 }}>System Status</div>
          {data && <div style={{ fontSize:11, color:'var(--text-3)', fontFamily:'var(--font-dm-mono)', marginTop:2 }}>
            Last checked {new Date(data.checkedAt).toLocaleTimeString('en-US', { timeZone:'America/New_York' })} ET
          </div>}
        </div>
        <button className="btn-primary" style={{ fontSize:12 }} onClick={() => runCheck(true)} disabled={checking}>
          {checking ? '◌ Checking...' : '↺ Run Check'}
        </button>
      </div>

      {loading && <div style={{ textAlign:'center', padding:60, color:'var(--text-3)', fontFamily:'var(--font-dm-mono)', fontSize:12 }}>◌ Running health checks...</div>}

      {data && <>
        {/* Overall banner */}
        <div style={{ padding:'14px 20px', borderRadius:12, marginBottom:24, background: data.summary.allClear ? 'rgba(0,200,150,0.08)' : 'rgba(255,71,87,0.08)', border:`1.5px solid ${data.summary.allClear ? 'rgba(0,200,150,0.3)' : 'rgba(255,71,87,0.4)'}`, display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:22 }}>{data.summary.allClear ? '✅' : '🚨'}</span>
          <div>
            <div style={{ fontWeight:700, fontSize:14, color: data.summary.allClear ? 'var(--green)' : 'var(--red)' }}>
              {data.summary.allClear ? 'All Systems Operational' : `${data.summary.criticalDown} Critical Service${data.summary.criticalDown !== 1 ? 's' : ''} Down`}
            </div>
            <div style={{ fontSize:11, color:'var(--text-3)', marginTop:1 }}>
              {data.summary.totalUp}/{data.results.length} up{data.summary.totalSlow > 0 ? ` · ${data.summary.totalSlow} slow` : ''}
              {history.length > 0 && ` · ${history.length} checks in last 24h`}
            </div>
          </div>
        </div>

        {/* Services */}
        {[{ label:'Alpine', items: alpine }, { label:'Sire', items: sire }].map(group => (
          <div key={group.label} className="card" style={{ marginBottom:20 }}>
            <div className="section-label" style={{ marginBottom:14 }}>{group.label}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {group.items.map(svc => {
                const pct = uptimePct(svc.id)
                const dots = statusDots(svc.id)
                return (
                  <div key={svc.id} style={{ padding:'12px 14px', borderRadius:10, background:STATUS_BG[svc.status], border:`1px solid ${STATUS_BORDER[svc.status]}` }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:STATUS_COLOR[svc.status], flexShrink:0, animation:svc.status==='down'?'pulse 1s infinite':'none' }}/>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600, fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
                          {svc.name}
                          {svc.critical && <span style={{ fontSize:9, fontFamily:'var(--font-dm-mono)', color:'var(--text-3)', background:'var(--surface-2)', padding:'1px 5px', borderRadius:3 }}>CRITICAL</span>}
                        </div>
                        {svc.error && <div style={{ fontSize:11, color:'var(--red)', marginTop:1 }}>{svc.error}</div>}
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:STATUS_COLOR[svc.status], fontFamily:'var(--font-dm-mono)' }}>{svc.status.toUpperCase()}</div>
                        <div style={{ fontSize:11, color:'var(--text-3)', fontFamily:'var(--font-dm-mono)' }}>{svc.responseMs}ms{svc.httpCode ? ` · ${svc.httpCode}` : ''}</div>
                      </div>
                    </div>
                    {/* Uptime dots */}
                    {dots.length > 0 && (
                      <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ display:'flex', gap:2 }}>
                          {dots.map((d, i) => (
                            <div key={i} style={{ width:6, height:6, borderRadius:1, background: d==='up'?'var(--green)':d==='slow'?'#f59e0b':'var(--red)', opacity: i < dots.length - 5 ? 0.5 : 1 }}/>
                          ))}
                        </div>
                        {pct !== null && <span style={{ fontSize:10, color:'var(--text-3)', fontFamily:'var(--font-dm-mono)' }}>{pct}% uptime (24h)</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Business metrics */}
        {data.metrics.ok && (
          <div className="card" style={{ marginBottom:20 }}>
            <div className="section-label" style={{ marginBottom:14 }}>Alpine Business Health</div>
            <div className="card-grid card-grid-4">
              {[
                { label:'Stuck Payouts', value: data.metrics.stuckPayouts, warn: data.metrics.stuckPayouts > 5, suffix:'> 4h' },
                { label:'Pending Payouts', value: data.metrics.pendingPayouts, warn: false, suffix:'total' },
                { label:'Defaults Today', value: data.metrics.newDefaults, warn: data.metrics.newDefaults > 3, suffix:'new' },
                { label:'Loans Today', value: data.metrics.todayLoans, warn: false, suffix:'originated' },
              ].map(m => (
                <div key={m.label} style={{ padding:'12px 14px', borderRadius:10, background: m.warn ? 'rgba(255,71,87,0.08)' : 'rgba(0,200,150,0.06)', border:`1px solid ${m.warn ? 'rgba(255,71,87,0.3)' : 'rgba(0,200,150,0.2)'}` }}>
                  <div style={{ fontSize:10, color:'var(--text-3)', fontFamily:'var(--font-dm-mono)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>{m.label}</div>
                  <div style={{ fontSize:26, fontFamily:'var(--font-syne)', fontWeight:700, color: m.warn ? 'var(--red)' : 'var(--green)' }}>{m.value}</div>
                  <div style={{ fontSize:10, color:'var(--text-3)', marginTop:1 }}>{m.suffix}{m.warn ? ' ⚠' : ''}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Incident log */}
        {incidents.length > 0 && (
          <div className="card">
            <div className="section-label" style={{ marginBottom:14 }}>Incident Log (24h)</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {incidents.map((inc, i) => {
                const downServices = inc.results?.filter(r => r.status === 'down').map(r => r.id) || []
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8, background:'rgba(255,71,87,0.06)', border:'1px solid rgba(255,71,87,0.15)' }}>
                    <span style={{ fontSize:11 }}>🔴</span>
                    <span style={{ fontSize:12, color:'var(--text-2)', flex:1 }}>
                      {downServices.join(', ')} down
                    </span>
                    <span style={{ fontSize:11, color:'var(--text-3)', fontFamily:'var(--font-dm-mono)', flexShrink:0 }}>
                      {new Date(inc.checkedAt).toLocaleString('en-US', { timeZone:'America/New_York', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {incidents.length === 0 && history.length > 0 && (
          <div className="card" style={{ textAlign:'center', padding:20, color:'var(--text-3)', fontSize:12 }}>
            ✅ No incidents in the last 24 hours
          </div>
        )}
      </>}
    </div>
  )
}
