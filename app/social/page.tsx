'use client'
import Link from 'next/link'

const BADGE = (label: string, color = '#5B4FE9') => (
  <span style={{ fontSize:10, background:`${color}22`, color, border:`1px solid ${color}44`, borderRadius:20, padding:'2px 8px', fontFamily:'var(--font-dm-mono)', marginLeft:8 }}>{label}</span>
)

export default function SocialPage() {
  const mockQueue = [
    { id:1, content:'Shipping 50,000 sneakers this week through Sire. The #1 B2B shipping platform for resellers. 📦', platform:'instagram', type:'story', status:'scheduled', date:'Apr 8 9:00 AM' },
    { id:2, content:'Built a $3M/yr company before I turned 21. Here\'s what school didn\'t teach me about building:', platform:'twitter', type:'thread', status:'draft', date:'Apr 9' },
    { id:3, content:'The Taco Project → 35 builders under 28 doing big things. Applications open.', platform:'instagram', type:'post', status:'idea', date:'TBD' },
  ]
  return (
    <div style={{ maxWidth:1000, margin:'0 auto', padding:'28px 24px' }}>
      <div style={{ marginBottom:24 }}>
        <Link href="/" style={{ color:'var(--text-3)', fontSize:13, textDecoration:'none' }}>← Admin</Link>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:4 }}>
          <div style={{ fontFamily:'var(--font-syne)', fontWeight:700, fontSize:22 }}>📸 Social Queue</div>
          {BADGE('NOT BUILT','#999')}
        </div>
        <div style={{ fontSize:13, color:'var(--text-3)', marginTop:4 }}>AI generates bulk graphics + captions, schedules posts, maintains proof of life. Instagram, Twitter/X, LinkedIn. Auto-posts while you sleep.</div>
      </div>

      {/* Features grid */}
      <div className="card-grid card-grid-4" style={{ marginBottom:24 }}>
        {[
          { icon:'🎨', title:'AI Graphic Gen', desc:'Bulk generate story/post graphics from brand templates', status:'planned' },
          { icon:'📅', title:'Post Scheduler', desc:'Schedule Instagram, Twitter, LinkedIn from one place', status:'planned' },
          { icon:'🤖', title:'Proof of Life Bot', desc:'Daily auto-posts to maintain engagement baseline', status:'planned' },
          { icon:'📊', title:'Analytics', desc:'Track reach, engagement, follower growth across platforms', status:'planned' },
        ].map(f => (
          <div key={f.title} style={{ padding:'14px 16px', borderRadius:10, background:'var(--surface)', border:'1px solid var(--border)', opacity:0.7 }}>
            <div style={{ fontSize:24, marginBottom:6 }}>{f.icon}</div>
            <div style={{ fontWeight:600, fontSize:13, marginBottom:4 }}>{f.title}</div>
            <div style={{ fontSize:11, color:'var(--text-3)', lineHeight:1.5 }}>{f.desc}</div>
            {BADGE('PLANNED','#999')}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div className="section-label">Content Queue</div>
          <button className="btn-primary" style={{ fontSize:11, opacity:0.5, cursor:'not-allowed' }}>+ Generate Content</button>
        </div>
        {mockQueue.map(post => (
          <div key={post.id} style={{ padding:'12px 0', borderBottom:'1px solid var(--border)', opacity:0.6 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <span style={{ fontSize:11, fontFamily:'var(--font-dm-mono)', color:'var(--accent)' }}>{post.platform}</span>
              <span style={{ fontSize:10, background:'var(--surface-2)', padding:'1px 6px', borderRadius:4 }}>{post.type}</span>
              <span style={{ fontSize:10, color:post.status==='scheduled'?'var(--green)':post.status==='draft'?'#f59e0b':'var(--text-3)', marginLeft:'auto' }}>{post.status}</span>
              <span style={{ fontSize:11, color:'var(--text-3)' }}>{post.date}</span>
            </div>
            <div style={{ fontSize:13 }}>{post.content}</div>
          </div>
        ))}
      </div>

      <div style={{ padding:20, borderRadius:12, background:'rgba(91,79,233,0.06)', border:'1px dashed var(--accent)', textAlign:'center' }}>
        <div style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>How this should work</div>
        <div style={{ fontSize:12, color:'var(--text-3)', lineHeight:1.8 }}>
          1. AI agent runs weekly, generates 7 days of content based on what&apos;s happening in your business<br/>
          2. You approve/reject each post in the swipe UI<br/>
          3. Approved posts get scheduled automatically<br/>
          4. Graphics generated from brand templates (Sire colors, Alpine colors, Taco Project)<br/>
          5. Always looks human — varied posting times, slight caption variations
        </div>
      </div>
    </div>
  )
}
