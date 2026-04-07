'use client'
import Link from 'next/link'

const BADGE = (label: string, color = '#5B4FE9') => (
  <span style={{ fontSize:10, background:`${color}22`, color, border:`1px solid ${color}44`, borderRadius:20, padding:'2px 8px', fontFamily:'var(--font-dm-mono)' }}>{label}</span>
)

export default function FinancePage() {
  return (
    <div style={{ maxWidth:1000, margin:'0 auto', padding:'28px 24px' }}>
      <div style={{ marginBottom:28 }}>
        <Link href="/" style={{ color:'var(--text-3)', fontSize:13, textDecoration:'none' }}>← Admin</Link>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:4 }}>
          <div style={{ fontFamily:'var(--font-syne)', fontWeight:700, fontSize:22 }}>💰 Finance Monitor</div>
          {BADGE('LIVE — QuickBooks connected','#00C896')}
        </div>
        <div style={{ fontSize:13, color:'var(--text-3)', marginTop:4 }}>
          Sire Apps LLC · QuickBooks Online · Connected via Claude MCP
        </div>
      </div>

      {/* QuickBooks is connected via Claude — direct to QBO */}
      <div className="card" style={{ marginBottom:20, textAlign:'center', padding:40 }}>
        <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
        <div style={{ fontFamily:'var(--font-syne)', fontWeight:700, fontSize:18, marginBottom:8 }}>
          QuickBooks Online — Sire Apps LLC
        </div>
        <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:20, lineHeight:1.7 }}>
          Your QuickBooks is connected directly to Claude. Ask Claude for live P&L, cash flow, or transaction data — it pulls from QBO in real-time.
        </div>
        <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
          <a href="https://qbo.intuit.com/app/homepage?cid=claude.ai-QBApp&app_group=QBO&3p_provider=Claude_QB_MCP"
            target="_blank"
            style={{ padding:'10px 20px', borderRadius:10, background:'rgba(0,200,150,0.1)', border:'1px solid rgba(0,200,150,0.3)', color:'var(--green)', textDecoration:'none', fontSize:13, fontWeight:600 }}>
            Open QuickBooks →
          </a>
        </div>
      </div>

      {/* What's wired and what's planned */}
      <div className="card" style={{ marginBottom:20 }}>
        <div className="section-label" style={{ marginBottom:14 }}>What Claude can pull from QuickBooks right now</div>
        {[
          { feature:'P&L Report (YTD, monthly, quarterly)', status:'live', note:'Ask "show me my P&L from QBO"' },
          { feature:'Cash Flow Statement', status:'live', note:'Ask "pull my cash flow from QuickBooks"' },
          { feature:'Industry Benchmarking (revenue, profit, expenses)', status:'live', note:'Ask "how does my profit compare to industry?"' },
          { feature:'Transaction Import (CSV → QBO)', status:'live', note:'Ask "import these transactions to QuickBooks"' },
          { feature:'Daily auto-sync to Finance Monitor', status:'planned', note:'Build a GitHub Actions cron to sync daily' },
          { feature:'Unusual transaction alerts', status:'planned', note:'Flag duplicate charges, large transfers' },
          { feature:'Multi-company (Sire + Alpine)', status:'planned', note:'Alpine needs its own QBO account' },
        ].map(item => (
          <div key={item.feature} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
            <span style={{ fontSize:14, flexShrink:0 }}>{item.status === 'live' ? '✅' : '○'}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:13 }}>{item.feature}</div>
              <div style={{ fontSize:11, color:'var(--text-3)', marginTop:2 }}>{item.note}</div>
            </div>
            {BADGE(item.status === 'live' ? 'LIVE' : 'PLANNED', item.status === 'live' ? '#00C896' : '#999')}
          </div>
        ))}
      </div>

      {/* Plaid status */}
      <div className="card">
        <div className="section-label" style={{ marginBottom:12 }}>Previous Setup — Plaid {BADGE('REPLACED BY QUICKBOOKS','#999')}</div>
        <div style={{ fontSize:13, color:'var(--text-3)', lineHeight:1.7 }}>
          Plaid was previously connected via your Alpine account (+17346645129) with data for Michigan Hype 2 and Chase College checking accounts. Data was last synced Jan 15. QuickBooks is the better source of truth — it has all accounts, categorized transactions, and real P&L.
        </div>
      </div>
    </div>
  )
}
