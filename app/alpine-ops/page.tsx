'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Chargeback { _id:string; amount:number; status:string; disputedAt:string; company:string; customer:{name:string;email:string;phone:string}|null; transaction:{amount:number;status:string;createdAt:string}|null }
interface CollectorLoan { _id:string; amount:number; dueDate:string; status:string; name:string; phone:string; email:string; company:string; overdue:boolean }
interface FailedTxn { _id:string; amount:number; status:string; createdAt:string; customer:string; company:string }
interface Stats { chargebacks:{total:number;pending:number}; failed:{today:number;week:number}; collector:{total:number;overdue:number}; payouts:{pending:number} }

const STATUS_PILL = (s: string) => {
  const colors: Record<string,string> = { pending:'rgba(245,158,11,0.15)', won:'rgba(0,200,150,0.15)', lost:'rgba(255,71,87,0.15)', FAILED:'rgba(255,71,87,0.15)', PENDING:'rgba(245,158,11,0.15)' }
  const text: Record<string,string> = { pending:'#f59e0b', won:'var(--green)', lost:'var(--red)', FAILED:'var(--red)', PENDING:'#f59e0b' }
  return <span style={{ fontSize:11, fontFamily:'var(--font-dm-mono)', background:colors[s]||'var(--surface-2)', color:text[s]||'var(--text-3)', padding:'2px 8px', borderRadius:4 }}>{s}</span>
}

export default function AlpineOpsPage() {
  const [data, setData] = useState<{ stats:Stats; chargebacks:Chargeback[]; recentFailed:FailedTxn[]; collectorQueue:CollectorLoan[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'chargebacks'|'collector'|'failed'>('chargebacks')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/alpine-ops')
    setData(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const s = data?.stats ?? null

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'28px 24px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <Link href="/" style={{ color:'var(--text-3)', fontSize:13, textDecoration:'none' }}>← Admin</Link>
          <div style={{ fontFamily:'var(--font-syne)', fontWeight:700, fontSize:22, marginTop:4 }}>
            Alpine Ops
            {(s?.chargebacks?.pending ?? 0) > 0 && <span style={{ fontSize:11, background:'var(--red)', color:'#fff', borderRadius:20, padding:'2px 8px', marginLeft:10, fontFamily:'var(--font-dm-mono)' }}>{s?.chargebacks?.pending} chargebacks need response</span>}
          </div>
        </div>
        <button className="btn-ghost" style={{ fontSize:12 }} onClick={load} disabled={loading}>{loading ? '◌' : '↺ Refresh'}</button>
      </div>

      {/* Stat cards */}
      {s && (
        <div className="card-grid card-grid-4" style={{ marginBottom:24 }}>
          {[
            { label:'Open Chargebacks', value:s.chargebacks?.pending??0, warn:(s.chargebacks?.pending??0)>0, onClick:()=>setTab('chargebacks') },
            { label:'Failed Today', value:s.failed?.today??0, warn:(s.failed?.today??0)>10, onClick:()=>setTab('failed') },
            { label:'Failed This Week', value:s.failed?.week??0, warn:(s.failed?.week??0)>50, onClick:()=>setTab('failed') },
            { label:'Overdue Loans', value:s.collector?.overdue??0, warn:(s.collector?.overdue??0)>0, onClick:()=>setTab('collector') },
          ].map(c => (
            <div key={c.label} onClick={c.onClick} style={{ padding:'14px 16px', borderRadius:10, cursor:'pointer', background:c.warn?'rgba(255,71,87,0.08)':'var(--surface)', border:`1px solid ${c.warn?'rgba(255,71,87,0.3)':'var(--border)'}`, transition:'all 0.15s' }}>
              <div style={{ fontSize:10, color:'var(--text-3)', fontFamily:'var(--font-dm-mono)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>{c.label}</div>
              <div style={{ fontSize:28, fontFamily:'var(--font-syne)', fontWeight:700, color:c.warn?'var(--red)':'var(--green)' }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom:20 }}>
        {[['chargebacks','💳 Chargebacks'],['collector','📞 Collector Queue'],['failed','❌ Failed Payments']].map(([val,label]) => (
          <button key={val} className={`tab ${tab===val?'active':''}`} onClick={()=>setTab(val as typeof tab)}>{label}</button>
        ))}
      </div>

      {loading && <div style={{ textAlign:'center', padding:40, color:'var(--text-3)', fontFamily:'var(--font-dm-mono)', fontSize:12 }}>◌ Loading Alpine data...</div>}

      {/* Chargebacks */}
      {!loading && tab === 'chargebacks' && (
        <div>
          {data?.chargebacks.length === 0 && <div className="card" style={{ textAlign:'center', padding:30, color:'var(--text-3)' }}>✅ No open chargebacks</div>}
          {data?.chargebacks.map(cb => (
            <div key={cb._id} className="card" style={{ marginBottom:12 }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    {STATUS_PILL(cb.status)}
                    <span style={{ fontFamily:'var(--font-syne)', fontWeight:700, fontSize:16 }}>${(cb.amount/100).toFixed(2)}</span>
                    <span style={{ fontSize:11, color:'var(--text-3)' }}>Disputed {cb.disputedAt ? new Date(cb.disputedAt).toLocaleDateString() : '—'}</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    {cb.customer && (
                      <div style={{ fontSize:12 }}>
                        <div style={{ color:'var(--text-3)', fontSize:10, marginBottom:2 }}>CUSTOMER</div>
                        <div style={{ fontWeight:600 }}>{cb.customer.name}</div>
                        <div style={{ color:'var(--text-3)', fontSize:11 }}>{cb.customer.email}</div>
                        <div style={{ color:'var(--text-3)', fontSize:11 }}>{cb.customer.phone}</div>
                      </div>
                    )}
                    {cb.transaction && (
                      <div style={{ fontSize:12 }}>
                        <div style={{ color:'var(--text-3)', fontSize:10, marginBottom:2 }}>ORIGINAL TRANSACTION</div>
                        <div style={{ fontWeight:600 }}>${(cb.transaction.amount/100).toFixed(2)}</div>
                        <div style={{ color:'var(--text-3)', fontSize:11 }}>{new Date(cb.transaction.createdAt).toLocaleDateString()}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Collector Queue */}
      {!loading && tab === 'collector' && (
        <div>
          <div style={{ fontSize:12, color:'var(--text-3)', marginBottom:12 }}>{data?.collectorQueue.length} pending loans · {data?.collectorQueue.filter(l=>l.overdue).length} overdue</div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                {['Name','Phone','Email','Amount','Due Date','Status'].map(h => <th key={h} style={{ textAlign:'left', padding:'8px 12px', fontSize:10, color:'var(--text-3)', fontFamily:'var(--font-dm-mono)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data?.collectorQueue.map(loan => (
                <tr key={loan._id} style={{ borderBottom:'1px solid var(--border)', background:loan.overdue?'rgba(255,71,87,0.04)':'transparent' }}>
                  <td style={{ padding:'8px 12px', fontWeight:600 }}>{loan.name || '—'} {loan.overdue && <span style={{ fontSize:9, color:'var(--red)', fontFamily:'var(--font-dm-mono)' }}>OVERDUE</span>}</td>
                  <td style={{ padding:'8px 12px', color:'var(--text-2)' }}>{loan.phone || '—'}</td>
                  <td style={{ padding:'8px 12px', color:'var(--text-2)', fontSize:11 }}>{loan.email || '—'}</td>
                  <td style={{ padding:'8px 12px', fontFamily:'var(--font-dm-mono)', fontWeight:600 }}>${(loan.amount/100).toFixed(2)}</td>
                  <td style={{ padding:'8px 12px', color:loan.overdue?'var(--red)':'var(--text-2)', fontSize:11 }}>{loan.dueDate ? new Date(loan.dueDate).toLocaleDateString() : '—'}</td>
                  <td style={{ padding:'8px 12px' }}>{STATUS_PILL(loan.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Failed Payments */}
      {!loading && tab === 'failed' && (
        <div>
          <div style={{ fontSize:12, color:'var(--text-3)', marginBottom:12 }}>Last 7 days of failed transactions</div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                {['Date','Amount','Customer','Company','Status'].map(h => <th key={h} style={{ textAlign:'left', padding:'8px 12px', fontSize:10, color:'var(--text-3)', fontFamily:'var(--font-dm-mono)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data?.recentFailed.map(t => (
                <tr key={t._id} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={{ padding:'8px 12px', fontSize:11, color:'var(--text-3)' }}>{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding:'8px 12px', fontFamily:'var(--font-dm-mono)', fontWeight:600 }}>${t.amount > 0 ? (t.amount/100).toFixed(2) : '—'}</td>
                  <td style={{ padding:'8px 12px', color:'var(--text-2)', fontSize:11 }}>{String(t.customer).substring(0,16) || '—'}</td>
                  <td style={{ padding:'8px 12px', color:'var(--text-2)', fontSize:11 }}>{String(t.company).substring(0,16) || '—'}</td>
                  <td style={{ padding:'8px 12px' }}>{STATUS_PILL(t.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
