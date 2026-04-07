'use client'
import Link from 'next/link'

const BADGE = (label: string, color = '#5B4FE9') => (
  <span style={{ fontSize:10, background:`${color}22`, color, border:`1px solid ${color}44`, borderRadius:20, padding:'2px 8px', fontFamily:'var(--font-dm-mono)', marginLeft:8 }}>{label}</span>
)

export default function FinancePage() {
  const accounts = [
    { name:'Chase Business Checking', last4:'8790', balance:'$47,230', type:'checking', status:'connected', stale:false },
    { name:'Chase College Checking', last4:'xxxx', balance:'—', type:'checking', status:'stale', stale:true },
    { name:'Michigan Hype 2', last4:'xxxx', balance:'—', type:'checking', status:'stale', stale:true },
    { name:'Amex Business Gold', last4:'xxxx', balance:'—', type:'credit', status:'not_connected', stale:false },
  ]
  const mockAlerts = [
    { type:'duplicate', desc:'$4,022.42 Merchant Service appears 2x on Jan 15', severity:'medium', date:'Jan 15' },
    { type:'large', desc:'$470,000 outbound transfer to CHK ...8790', severity:'high', date:'Jan 12' },
    { type:'unusual', desc:'19 transactions over $1,000 in 7 days', severity:'low', date:'Jan 8–15' },
  ]
  const mockTxns = [
    { date:'Jan 15', desc:'Merchant Service Deposit', amount:'+$4,022.42', type:'credit' },
    { date:'Jan 15', desc:'USPS Postage', amount:'-$52.08', type:'debit' },
    { date:'Jan 14', desc:'Merchant Service Deposit', amount:'+$3,698.84', type:'credit' },
    { date:'Jan 12', desc:'Online Transfer to CHK 8790', amount:'-$470,000.00', type:'debit', flag:true },
    { date:'Jan 12', desc:'Chase Card Payment 9488', amount:'-$5,591.50', type:'debit' },
  ]

  return (
    <div style={{ maxWidth:1000, margin:'0 auto', padding:'28px 24px' }}>
      <div style={{ marginBottom:24 }}>
        <Link href="/" style={{ color:'var(--text-3)', fontSize:13, textDecoration:'none' }}>← Admin</Link>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:4 }}>
          <div style={{ fontFamily:'var(--font-syne)', fontWeight:700, fontSize:22 }}>💰 Finance Monitor</div>
          {BADGE('PARTIAL — Plaid data stale Jan 15','#f59e0b')}
        </div>
        <div style={{ fontSize:13, color:'var(--text-3)', marginTop:4 }}>Bank accounts, unusual charges, duplicate transactions, large transfers. Needs Plaid reconnect for real-time data.</div>
      </div>

      {/* Account cards */}
      <div className="card-grid card-grid-4" style={{ marginBottom:24 }}>
        {accounts.map(acc => (
          <div key={acc.name} style={{ padding:'14px 16px', borderRadius:10, background:'var(--surface)', border:`1px solid ${acc.stale ? 'rgba(245,158,11,0.3)' : acc.status === 'not_connected' ? 'var(--border)' : 'rgba(0,200,150,0.2)'}` }}>
            <div style={{ fontSize:10, color:'var(--text-3)', marginBottom:4, fontFamily:'var(--font-dm-mono)', textTransform:'uppercase' }}>{acc.type}</div>
            <div style={{ fontWeight:600, fontSize:13, marginBottom:2 }}>{acc.name}</div>
            <div style={{ fontSize:20, fontFamily:'var(--font-syne)', fontWeight:700, color: acc.stale ? '#f59e0b' : acc.status === 'not_connected' ? 'var(--text-3)' : 'var(--green)', marginBottom:4 }}>{acc.balance}</div>
            <div style={{ fontSize:10 }}>
              {acc.stale ? BADGE('STALE — reconnect','#f59e0b') : acc.status === 'not_connected' ? BADGE('NOT CONNECTED','#999') : BADGE('LIVE','#00C896')}
            </div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      <div className="card" style={{ marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', marginBottom:14 }}>
          <div className="section-label">⚠ Unusual Activity Flags</div>
          {BADGE('From stale Jan data — reconnect for live','#f59e0b')}
        </div>
        {mockAlerts.map((a,i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
            <span style={{ fontSize:16 }}>{a.severity === 'high' ? '🔴' : a.severity === 'medium' ? '🟡' : '🔵'}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600 }}>{a.desc}</div>
              <div style={{ fontSize:11, color:'var(--text-3)' }}>{a.type} · {a.date}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Transaction table */}
      <div className="card" style={{ marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div className="section-label">Recent Transactions</div>
          <span style={{ fontSize:11, color:'#f59e0b', fontFamily:'var(--font-dm-mono)' }}>Last sync: Jan 15 — reconnect Plaid</span>
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--border)' }}>
              {['Date','Description','Amount'].map(h => <th key={h} style={{ textAlign:'left', padding:'6px 10px', fontSize:10, color:'var(--text-3)', fontFamily:'var(--font-dm-mono)', textTransform:'uppercase' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {mockTxns.map((t,i) => (
              <tr key={i} style={{ borderBottom:'1px solid var(--border)', background:t.flag?'rgba(255,71,87,0.04)':'transparent' }}>
                <td style={{ padding:'8px 10px', fontSize:11, color:'var(--text-3)' }}>{t.date}</td>
                <td style={{ padding:'8px 10px' }}>{t.desc} {t.flag && <span style={{ fontSize:10, color:'var(--red)', fontFamily:'var(--font-dm-mono)' }}>⚠ LARGE</span>}</td>
                <td style={{ padding:'8px 10px', fontFamily:'var(--font-dm-mono)', fontWeight:600, color: t.type==='credit'?'var(--green)':'var(--text)' }}>{t.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* What needs to be built */}
      <div style={{ padding:20, borderRadius:12, background:'rgba(91,79,233,0.06)', border:'1px dashed var(--accent)' }}>
        <div style={{ fontWeight:600, fontSize:14, marginBottom:10 }}>To make this fully functional:</div>
        {[
          ['Reconnect Plaid', 'Plaid token expired Jan 15. Reconnect at voice.google.com → trigger fresh sync'],
          ['Connect Amex', 'Link business Amex via Plaid for full spending picture'],
          ['Modern Treasury sync', 'Pull Alpine payout ACH activity — already have MT credentials'],
          ['Duplicate detection', 'Flag same-amount same-day transactions — logic built, needs live data'],
          ['Weekly digest', 'Monday morning email: here\'s what moved last week, anything weird'],
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
