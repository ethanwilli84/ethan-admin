'use client'
import { useState } from 'react'
import Link from 'next/link'

const BADGE = (label: string, color = '#5B4FE9') => (
  <span style={{ fontSize:10, background:`${color}22`, color, border:`1px solid ${color}44`, borderRadius:20, padding:'2px 8px', fontFamily:'var(--font-dm-mono)', marginLeft:8 }}>{label}</span>
)

const MOCK_TASKS = [
  { id:1, title:'Follow up with Pier Asset Management on warehouse facility', source:'Email', priority:'high', product:'Alpine', status:'pending', from:'Cassandra Doeng' },
  { id:2, title:'Chase $500K LOC — submit final documents', source:'iMessage', priority:'high', product:'Sire', status:'pending', from:'Bank' },
  { id:3, title:'Respond to 3 open chargebacks before window closes', source:'System', priority:'critical', product:'Alpine', status:'pending', from:'Auto-detected' },
  { id:4, title:'Call Amine re: Alpine checkout Plaid glitch during live sales', source:'iMessage', priority:'high', product:'Alpine', status:'pending', from:'+18044265663' },
  { id:5, title:'Set up Instagram phone automation — buy Pixel device', source:'AI Suggestion', priority:'medium', product:'Personal', status:'idea', from:'Claude' },
  { id:6, title:'Pay out all sellers + bring reserve balance back up', source:'iMessage', priority:'high', product:'Alpine', status:'in_progress', from:'Ethan (note)' },
]

const SEV_COLOR: Record<string,string> = { critical:'var(--red)', high:'#f59e0b', medium:'var(--text-2)', low:'var(--text-3)' }

export default function LifeOSPage() {
  const [view, setView] = useState<'swipe'|'board'>('board')
  const [cardIdx, setCardIdx] = useState(0)

  const currentCard = MOCK_TASKS[cardIdx % MOCK_TASKS.length]

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'28px 24px' }}>
      <div style={{ marginBottom:24 }}>
        <Link href="/" style={{ color:'var(--text-3)', fontSize:13, textDecoration:'none' }}>← Admin</Link>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:4 }}>
          <div style={{ fontFamily:'var(--font-syne)', fontWeight:700, fontSize:22 }}>🧠 AI Life OS</div>
          {BADGE('FRONTEND ONLY','#f59e0b')}
        </div>
        <div style={{ fontSize:13, color:'var(--text-3)', marginTop:4 }}>
          AI reads iMessage + WhatsApp + Slack + Email → surfaces tasks → you approve/reject → AI executes. Duolingo streaks for completion. Proactive suggestions from business patterns.
        </div>
      </div>

      {/* View toggle */}
      <div className="tabs" style={{ marginBottom:24 }}>
        <button className={`tab ${view==='board'?'active':''}`} onClick={()=>setView('board')}>📋 Task Board</button>
        <button className={`tab ${view==='swipe'?'active':''}`} onClick={()=>setView('swipe')}>👆 Swipe to Approve</button>
      </div>

      {view === 'swipe' && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:20 }}>
          {/* Tinder-style card */}
          <div style={{ width:380, padding:'28px 28px 24px', borderRadius:20, background:'var(--surface)', border:'1px solid var(--border)', boxShadow:'0 8px 40px rgba(0,0,0,0.15)', position:'relative' }}>
            <div style={{ position:'absolute', top:16, right:16, display:'flex', gap:6 }}>
              <span style={{ fontSize:10, color:SEV_COLOR[currentCard.priority], fontFamily:'var(--font-dm-mono)', fontWeight:600 }}>{currentCard.priority.toUpperCase()}</span>
            </div>
            <div style={{ fontSize:11, color:'var(--text-3)', marginBottom:8, fontFamily:'var(--font-dm-mono)' }}>{currentCard.source} · {currentCard.product}</div>
            <div style={{ fontFamily:'var(--font-syne)', fontWeight:700, fontSize:18, lineHeight:1.4, marginBottom:12 }}>{currentCard.title}</div>
            <div style={{ fontSize:12, color:'var(--text-3)' }}>From: {currentCard.from}</div>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={()=>setCardIdx(i=>i+1)} style={{ flex:1, padding:'10px', borderRadius:12, background:'rgba(255,71,87,0.1)', border:'1px solid rgba(255,71,87,0.3)', color:'var(--red)', fontSize:18, cursor:'pointer', fontWeight:700 }}>✗</button>
              <button style={{ flex:1, padding:'10px', borderRadius:12, background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)', color:'#f59e0b', fontSize:16, cursor:'not-allowed', opacity:0.5 }}>⏸</button>
              <button onClick={()=>setCardIdx(i=>i+1)} style={{ flex:1, padding:'10px', borderRadius:12, background:'rgba(0,200,150,0.1)', border:'1px solid rgba(0,200,150,0.3)', color:'var(--green)', fontSize:18, cursor:'pointer', fontWeight:700 }}>✓</button>
            </div>
          </div>
          <div style={{ fontSize:11, color:'var(--text-3)' }}>{cardIdx + 1} of {MOCK_TASKS.length} pending · Swipe right = approve + queue for execution</div>

          {/* Streak */}
          <div style={{ padding:'12px 20px', borderRadius:12, background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:20 }}>🔥</span>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:'#f59e0b' }}>3 day streak</div>
              <div style={{ fontSize:11, color:'var(--text-3)' }}>You&apos;ve cleared your inbox 3 days in a row</div>
            </div>
          </div>
        </div>
      )}

      {view === 'board' && (
        <div>
          {['critical','high','medium'].map(priority => {
            const tasks = MOCK_TASKS.filter(t => t.priority === priority)
            if (!tasks.length) return null
            return (
              <div key={priority} className="card" style={{ marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:SEV_COLOR[priority] }}/>
                  <div className="section-label">{priority.toUpperCase()} PRIORITY</div>
                </div>
                {tasks.map(task => (
                  <div key={task.id} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:13 }}>{task.title}</div>
                      <div style={{ fontSize:11, color:'var(--text-3)', marginTop:2 }}>{task.source} · {task.product} · {task.from}</div>
                    </div>
                    <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                      <button style={{ fontSize:11, padding:'4px 10px', borderRadius:6, background:'rgba(0,200,150,0.1)', border:'1px solid rgba(0,200,150,0.2)', color:'var(--green)', cursor:'not-allowed', opacity:0.6 }}>✓ Approve</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
          <div style={{ padding:16, borderRadius:10, background:'var(--surface-2)', border:'1px dashed var(--border)', textAlign:'center', color:'var(--text-3)', fontSize:12 }}>
            <div style={{ fontSize:20, marginBottom:6 }}>🤖</div>
            <div style={{ fontWeight:600, marginBottom:4 }}>AI Idea Engine</div>
            <div>TODO: Weekly agent analyzes Sire + Alpine metrics and surfaces &quot;here&apos;s what I&apos;d focus on&quot; — unprompted</div>
            {BADGE('NOT BUILT YET')}
          </div>
        </div>
      )}
    </div>
  )
}
