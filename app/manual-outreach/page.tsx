'use client'
import Link from 'next/link'

const SCAFFOLD_STYLE = { opacity:0.4, pointerEvents:'none' as const }
const BADGE = (label: string, color = '#5B4FE9') => (
  <span style={{ fontSize:10, background:`${color}22`, color, border:`1px solid ${color}44`, borderRadius:20, padding:'2px 8px', fontFamily:'var(--font-dm-mono)', marginLeft:8 }}>{label}</span>
)

export default function ManualOutreachPage() {
  const channels = [
    { name:'Instagram DMs', icon:'📸', status:'not_built', description:'Queue targets, track sent DMs, log replies from phone', count:0 },
    { name:'LinkedIn DMs', icon:'💼', status:'not_built', description:'Manual DM targets with notes and follow-up tracking', count:0 },
    { name:'Twitter/X DMs', icon:'🐦', status:'not_built', description:'Cold outreach via Twitter DMs', count:0 },
    { name:'SMS (Google Voice)', icon:'📱', status:'partial', description:'Track outbound texts and full conversation threads', count:0 },
  ]
  const mockTargets = [
    { name:'@garyvee', platform:'instagram', status:'pending', notes:'Follow up on collab', added:'Apr 5' },
    { name:'@alexhormozi', platform:'instagram', status:'dm_sent', notes:'Sent Apr 3', added:'Apr 3' },
    { name:'Gary Vaynerchuk', platform:'linkedin', status:'connected', notes:'Mutual connection via Freddy', added:'Apr 1' },
    { name:'@thesambents', platform:'instagram', status:'pending', notes:'Pod guest potential', added:'Apr 6' },
  ]
  return (
    <div style={{ maxWidth:1000, margin:'0 auto', padding:'28px 24px' }}>
      <div style={{ marginBottom:28 }}>
        <Link href="/" style={{ color:'var(--text-3)', fontSize:13, textDecoration:'none' }}>← Admin</Link>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:4 }}>
          <div style={{ fontFamily:'var(--font-syne)', fontWeight:700, fontSize:22 }}>Manual Outreach</div>
          {BADGE('IN PROGRESS','#f59e0b')}
        </div>
        <div style={{ fontSize:13, color:'var(--text-3)', marginTop:4 }}>Track LinkedIn, Instagram, Twitter DMs — add targets, log sends, mark replied. Feeds into central dedup so email campaigns never double-contact.</div>
      </div>

      {/* Channel cards */}
      <div className="card-grid card-grid-4" style={{ marginBottom:24 }}>
        {channels.map(ch => (
          <div key={ch.name} style={{ padding:'14px 16px', borderRadius:10, background:'var(--surface)', border:'1px solid var(--border)', opacity:ch.status==='not_built'?0.6:1 }}>
            <div style={{ fontSize:24, marginBottom:6 }}>{ch.icon}</div>
            <div style={{ fontWeight:600, fontSize:13 }}>{ch.name}</div>
            <div style={{ fontSize:11, color:'var(--text-3)', marginTop:4, lineHeight:1.5 }}>{ch.description}</div>
            <div style={{ marginTop:8 }}>{ch.status === 'not_built' ? BADGE('NOT BUILT','#999') : BADGE('PARTIAL','#f59e0b')}</div>
          </div>
        ))}
      </div>

      {/* Target queue mockup */}
      <div className="card" style={{ marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div className="section-label">Outreach Queue</div>
          <button className="btn-primary" style={{ fontSize:11, opacity:0.5, cursor:'not-allowed' }}>+ Add Target</button>
        </div>
        <div style={{ fontSize:11, color:'var(--accent)', marginBottom:12, fontFamily:'var(--font-dm-mono)' }}>TODO: Add target → log DM sent from phone → mark replied → auto-adds to dedup DB</div>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--border)' }}>
              {['Target','Platform','Status','Notes','Added'].map(h => <th key={h} style={{ textAlign:'left', padding:'6px 10px', fontSize:10, color:'var(--text-3)', fontFamily:'var(--font-dm-mono)', textTransform:'uppercase' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody style={SCAFFOLD_STYLE}>
            {mockTargets.map((t,i) => (
              <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                <td style={{ padding:'8px 10px', fontWeight:600 }}>{t.name}</td>
                <td style={{ padding:'8px 10px' }}>{t.platform === 'instagram' ? '📸' : '💼'} {t.platform}</td>
                <td style={{ padding:'8px 10px' }}><span style={{ fontSize:10, background:t.status==='dm_sent'?'rgba(0,200,150,0.1)':'var(--surface-2)', color:t.status==='dm_sent'?'var(--green)':'var(--text-3)', padding:'2px 8px', borderRadius:4, fontFamily:'var(--font-dm-mono)' }}>{t.status}</span></td>
                <td style={{ padding:'8px 10px', fontSize:11, color:'var(--text-3)' }}>{t.notes}</td>
                <td style={{ padding:'8px 10px', fontSize:11, color:'var(--text-3)' }}>{t.added}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Instagram phone automation section */}
      <div className="card">
        <div className="section-label" style={{ marginBottom:12 }}>📱 Instagram Phone Automation {BADGE('PLANNED')}</div>
        <div style={{ fontSize:13, color:'var(--text-3)', lineHeight:1.7, marginBottom:12 }}>
          Dedicated Android phone running 24/7. Script rotates through 2-3 accounts, sends max 25 DMs/day with randomized delays. Queue managed from this dashboard — you add targets here, phone processes them automatically.
        </div>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          {[['Phone Setup','Not started'],['ADB Script','Not started'],['Account Queue','Not started'],['Rate Limiting','Designed']].map(([label, status]) => (
            <div key={label} style={{ padding:'8px 14px', background:'var(--surface-2)', borderRadius:8, fontSize:12 }}>
              <div style={{ fontWeight:600 }}>{label}</div>
              <div style={{ fontSize:10, color:'var(--text-3)', marginTop:2 }}>{status}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
