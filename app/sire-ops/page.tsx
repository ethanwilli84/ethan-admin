'use client'
import Link from 'next/link'

const BADGE = (label: string, color = 'var(--accent)') => (
  <span style={{ fontSize:10, background:`${color}22`, color, border:`1px solid ${color}44`, borderRadius:20, padding:'2px 8px', fontFamily:'var(--font-dm-mono)', marginLeft:8 }}>{label}</span>
)

export default function SireOpsPage() {
  const mockSurcharges = [
    { merchant:'MihypeLA', amount:'$182.40', type:'address_correction', date:'Apr 5', status:'open' },
    { merchant:'SneakerBull', amount:'$48.00', type:'fuel_surcharge', date:'Apr 4', status:'open' },
    { merchant:'KixandStiX', amount:'$320.00', type:'oversize', date:'Apr 3', status:'resolved' },
  ]
  const mockMerchants = [
    { name:'MihypeLA', labels:'1,240', revenue:'$8,420/mo', status:'active', issues:2 },
    { name:'SneakerBull', labels:'890', revenue:'$6,100/mo', status:'active', issues:1 },
    { name:'MyPrepCenter', labels:'3,100', revenue:'$21,000/mo', status:'active', issues:0 },
    { name:'Got Sole', labels:'640', revenue:'$4,400/mo', status:'active', issues:0 },
  ]

  return (
    <div style={{ maxWidth:1000, margin:'0 auto', padding:'28px 24px' }}>
      <div style={{ marginBottom:24 }}>
        <Link href="/" style={{ color:'var(--text-3)', fontSize:13, textDecoration:'none' }}>← Admin</Link>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:4 }}>
          <div style={{ fontFamily:'var(--font-syne)', fontWeight:700, fontSize:22 }}>📦 Sire Ops</div>
          {BADGE('FRONTEND ONLY','#f59e0b')}
        </div>
        <div style={{ fontSize:13, color:'var(--text-3)', marginTop:4 }}>Label issues, surcharge disputes, merchant health, UPS/FedEx problems. ~400 merchants, $50M+ labels processed.</div>
      </div>

      {/* Stat cards */}
      <div className="card-grid card-grid-4" style={{ marginBottom:24 }}>
        {[
          { label:'Active Merchants', value:'~400', note:'Processing via Elavon' },
          { label:'Open Surcharge Issues', value:'2', note:'Need to dispute', warn:true },
          { label:'Labels This Month', value:'—', note:'Connect UPS API' },
          { label:'Revenue This Month', value:'—', note:'Connect Pirate Ship' },
        ].map(c => (
          <div key={c.label} style={{ padding:'14px 16px', borderRadius:10, background:'var(--surface)', border:`1px solid ${c.warn?'rgba(255,71,87,0.3)':'var(--border)'}` }}>
            <div style={{ fontSize:10, color:'var(--text-3)', marginBottom:4, fontFamily:'var(--font-dm-mono)', textTransform:'uppercase' }}>{c.label}</div>
            <div style={{ fontSize:26, fontFamily:'var(--font-syne)', fontWeight:700, color:c.warn?'var(--red)':'var(--text)' }}>{c.value}</div>
            <div style={{ fontSize:11, color:'var(--text-3)', marginTop:2 }}>{c.note}</div>
          </div>
        ))}
      </div>

      {/* Surcharge issues */}
      <div className="card" style={{ marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', marginBottom:14 }}>
          <div className="section-label">Surcharge Disputes</div>
          {BADGE('TODO: Auto-detect via UPS webhook + RefundBolt logic')}
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--border)' }}>
              {['Merchant','Amount','Type','Date','Status'].map(h => <th key={h} style={{ textAlign:'left', padding:'6px 10px', fontSize:10, color:'var(--text-3)', fontFamily:'var(--font-dm-mono)', textTransform:'uppercase' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {mockSurcharges.map((s,i) => (
              <tr key={i} style={{ borderBottom:'1px solid var(--border)', opacity:0.7 }}>
                <td style={{ padding:'8px 10px', fontWeight:600 }}>{s.merchant}</td>
                <td style={{ padding:'8px 10px', fontFamily:'var(--font-dm-mono)', color:'var(--red)' }}>{s.amount}</td>
                <td style={{ padding:'8px 10px', fontSize:11, color:'var(--text-3)' }}>{s.type}</td>
                <td style={{ padding:'8px 10px', fontSize:11, color:'var(--text-3)' }}>{s.date}</td>
                <td style={{ padding:'8px 10px' }}><span style={{ fontSize:10, background:s.status==='resolved'?'rgba(0,200,150,0.1)':'rgba(255,71,87,0.1)', color:s.status==='resolved'?'var(--green)':'var(--red)', padding:'2px 8px', borderRadius:4 }}>{s.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top merchants */}
      <div className="card" style={{ marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', marginBottom:14 }}>
          <div className="section-label">Top Merchants</div>
          {BADGE('TODO: Pull from Pirate Ship + Elavon API')}
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--border)' }}>
              {['Merchant','Labels','Revenue','Status','Issues'].map(h => <th key={h} style={{ textAlign:'left', padding:'6px 10px', fontSize:10, color:'var(--text-3)', fontFamily:'var(--font-dm-mono)', textTransform:'uppercase' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {mockMerchants.map((m,i) => (
              <tr key={i} style={{ borderBottom:'1px solid var(--border)', opacity:0.7 }}>
                <td style={{ padding:'8px 10px', fontWeight:600 }}>{m.name}</td>
                <td style={{ padding:'8px 10px', fontFamily:'var(--font-dm-mono)' }}>{m.labels}</td>
                <td style={{ padding:'8px 10px', color:'var(--green)', fontFamily:'var(--font-dm-mono)', fontWeight:600 }}>{m.revenue}</td>
                <td style={{ padding:'8px 10px' }}><span style={{ fontSize:10, background:'rgba(0,200,150,0.1)', color:'var(--green)', padding:'2px 8px', borderRadius:4 }}>{m.status}</span></td>
                <td style={{ padding:'8px 10px' }}>{m.issues > 0 ? <span style={{ fontSize:12, color:'var(--red)' }}>⚠ {m.issues}</span> : <span style={{ color:'var(--text-3)', fontSize:12 }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* What to build */}
      <div style={{ padding:20, borderRadius:12, background:'var(--surface-2)', border:'1px dashed var(--accent)' }}>
        <div style={{ fontWeight:600, fontSize:14, marginBottom:10 }}>To make Sire Ops functional:</div>
        {[
          ['Pirate Ship API', 'Pull real label volume, revenue, merchant breakdown — GraphQL API available'],
          ['UPS Webhook', 'Receive surcharge notifications automatically — RefundBolt-style dispute queue'],
          ['Merchant CRM', 'Basic profile per merchant: labels/mo, revenue, open issues, contact info'],
          ['USPS status', 'Monitor if USPS is working (common question from merchants)'],
          ['Elavon data', 'Payment processing volume and any failed transactions from Elavon'],
        ].map(([title, desc]) => (
          <div key={title} style={{ display:'flex', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
            <span style={{ color:'var(--text-3)', flexShrink:0 }}>○</span>
            <div><span style={{ fontWeight:600, fontSize:13 }}>{title}</span><span style={{ fontSize:12, color:'var(--text-3)', marginLeft:8 }}>{desc}</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}
