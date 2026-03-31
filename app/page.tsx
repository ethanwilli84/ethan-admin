'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'

interface Campaign { _id: string; slug: string; name: string; description: string; icon: string; active: boolean }
interface Stats { total: number; replied: number; responseRate: number; recentWeek: number }
interface ChatMsg { role: 'user' | 'assistant'; content: string }
interface Generated { name:string;slug:string;description:string;icon:string;researchPrompt:string;template:string;sendTime:string;sendDays:string[];perSession:number;suggestedEndDate:string|null;rationale:string }

export default function Home() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stats, setStats] = useState<Record<string, Stats>>({})
  const [showCreator, setShowCreator] = useState(false)
  const [objective, setObjective] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<Generated|null>(null)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState(false)
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [devEvents, setDevEvents] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'campaigns'|'dev'>('campaigns')
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadCampaigns() }, [])
  useEffect(() => { chatEndRef.current?.scrollIntoView({behavior:'smooth'}) }, [chatMsgs])

  async function loadCampaigns() {
    const data: Campaign[] = await fetch('/api/campaigns').then(r=>r.json())
    setCampaigns(data)
    const map: Record<string,Stats> = {}
    await Promise.all(data.map(async c => { map[c.slug] = await fetch(`/api/stats?campaign=${c.slug}`).then(r=>r.json()) }))
    setStats(map)
  }

  async function generate() {
    if (!objective.trim()) return
    setGenerating(true); setGenerated(null)
    const res = await fetch('/api/generate-campaign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({objective})})
    const d = await res.json()
    if (d.ok) setGenerated(d.campaign)
    setGenerating(false)
  }

  async function createCampaign() {
    if (!generated) return
    setCreating(true)
    await fetch('/api/campaigns',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:generated.name,slug:generated.slug,description:generated.description,icon:generated.icon,active:true,githubRepo:'ethanwilli84/influence-outreach',githubWorkflow:'daily_outreach.yml'})})
    await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaign:generated.slug,template:generated.template,researchPrompt:generated.researchPrompt,sendTime:generated.sendTime,sendDays:generated.sendDays,perSession:generated.perSession,endDate:generated.suggestedEndDate,paused:false})})
    setCreated(true); setCreating(false)
    setTimeout(()=>{setShowCreator(false);setCreated(false);setGenerated(null);setObjective('');loadCampaigns()},1500)
  }

  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return
    const userMsg: ChatMsg = {role:'user',content:chatInput}
    const newMsgs = [...chatMsgs, userMsg]
    setChatMsgs(newMsgs); setChatInput(''); setChatLoading(true); setDevEvents([])
    const res = await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:newMsgs.map(m=>({role:m.role,content:m.content})),devMode:true})})
    const d = await res.json()
    setChatMsgs(prev=>[...prev,{role:'assistant',content:d.reply}])
    if (d.events?.length) setDevEvents(d.events)
    setChatLoading(false)
  }

  return (
    <div>
      <header className="header">
        <div style={{display:'flex',alignItems:'center'}}>
          <span className="header-brand">Ethan Admin</span>
          <span className="header-sep">/</span>
          <span className="header-breadcrumb">{activeTab === 'dev' ? 'dev agent' : 'campaigns'}</span>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button className={activeTab==='campaigns'?'btn-primary':'btn-ghost'} style={{fontSize:12,padding:'6px 14px'}} onClick={()=>setActiveTab('campaigns')}>◈ Campaigns</button>
          <button className={activeTab==='dev'?'btn-ghost':'btn-ghost'} style={{fontSize:12,padding:'6px 14px',background:activeTab==='dev'?'linear-gradient(135deg,#0f0f23,#1a1a3e)':undefined,color:activeTab==='dev'?'#7B6FF0':undefined,borderColor:activeTab==='dev'?'#7B6FF0':undefined}} onClick={()=>setActiveTab('dev')}>⌨ Dev Mode</button>
          <span style={{fontFamily:'var(--font-dm-mono)',fontSize:12,color:'var(--text-3)'}}>
            {new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}
          </span>
        </div>
      </header>

      <div className="main">

        {activeTab === 'campaigns' && (
          <div>
            <div className="page-header fade-up">
              <div><div className="page-title">Campaigns</div><div className="page-sub">Select a campaign to manage</div></div>
              <button className="btn-primary" onClick={()=>setShowCreator(!showCreator)}>+ New Campaign</button>
            </div>
            <div className="campaign-grid">
              {campaigns.map((c,i)=>{
                const s=stats[c.slug]
                return (
                  <Link key={c._id} href={`/campaigns/${c.slug}`} className={`campaign-card fade-up fade-up-${Math.min(i+1,4)}`}>
                    <div className="campaign-card-header">
                      <div style={{display:'flex',alignItems:'center'}}>
                        <span className="campaign-card-icon">{c.icon}</span>
                        <div><div className="campaign-card-name">{c.name}</div><div className="campaign-card-desc">{c.description}</div></div>
                      </div>
                      <span className={c.active?'badge-active':'badge-paused'}>{c.active?'live':'paused'}</span>
                    </div>
                    {s&&(
                      <div className="campaign-stats">
                        <div><div className="campaign-stat-label">Sent</div><div className="campaign-stat-val">{s.total}</div></div>
                        <div><div className="campaign-stat-label">Replies</div><div className="campaign-stat-val">{s.replied}</div></div>
                        <div><div className="campaign-stat-label">Rate</div><div className="campaign-stat-val">{s.responseRate}%</div></div>
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
            {showCreator&&(
              <div className="creator-card fade-up">
                <div style={{fontFamily:'var(--font-syne)',fontWeight:700,fontSize:16,marginBottom:4}}>✦ AI Campaign Generator</div>
                <div style={{color:'var(--text-3)',fontSize:13,marginBottom:16}}>Describe your objective — AI configures everything.</div>
                <textarea className="creator-textarea" placeholder="e.g. I want to get on fintech podcasts to promote Alpine, my BNPL platform for coaching sellers. Target CFOs and online business owners." value={objective} onChange={e=>setObjective(e.target.value)}/>
                <div style={{display:'flex',gap:8,marginTop:10,marginBottom:generated?20:0}}>
                  <button className="btn-primary" onClick={generate} disabled={generating||!objective.trim()}>{generating?'◌ Generating...':'✦ Generate Campaign'}</button>
                  <button className="btn-ghost" onClick={()=>{setShowCreator(false);setGenerated(null);setObjective('')}}>Cancel</button>
                </div>
                {generated&&(
                  <div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                      <div className="preview-field"><strong>Name</strong>{generated.icon} {generated.name}</div>
                      <div className="preview-field"><strong>Schedule</strong>{generated.sendTime} · {generated.sendDays?.join(', ')} · {generated.perSession}/run</div>
                      <div className="preview-field" style={{gridColumn:'1/-1'}}><strong>Research Prompt</strong>{generated.researchPrompt?.substring(0,200)}...</div>
                      <div className="preview-field" style={{gridColumn:'1/-1'}}><strong>Rationale</strong>{generated.rationale}</div>
                    </div>
                    <button className="btn-green" onClick={createCampaign} disabled={creating}>{creating?'◌ Creating...':created?'✓ Created!':'Create Campaign →'}</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'dev' && (
          <div className="fade-up" style={{maxWidth:900,display:'flex',flexDirection:'column',height:'calc(100vh - 140px)'}}>
            <div style={{marginBottom:12,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{fontFamily:'var(--font-syne)',fontSize:15,fontWeight:700,color:'#a0a0ff'}}>Dev Agent</div>
              <span style={{fontSize:11,color:'#5555aa',fontFamily:'var(--font-dm-mono)'}}>reads/writes github · commits to main · auto-deploys</span>
            </div>
            <div style={{flex:1,display:'flex',gap:12,overflow:'hidden'}}>
              <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:12,paddingBottom:12}}>
                {chatMsgs.length===0&&(
                  <div style={{background:'#0a0a1a',border:'1px solid #2a2a4e',borderRadius:16,padding:40,textAlign:'center'}}>
                    <div style={{fontSize:32,marginBottom:12}}>⌨</div>
                    <div style={{fontFamily:'var(--font-syne)',fontSize:16,fontWeight:700,color:'#a0a0ff',marginBottom:8}}>Dev Agent</div>
                    <div style={{color:'#6666aa',fontSize:13,lineHeight:1.6,marginBottom:16}}>
                      I can read files, write code, commit to GitHub, and deploy. Just describe what you want built or fixed.
                    </div>
                    <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center'}}>
                      {[
                        'Add a search bar to the outreach table',
                        'Show me the homepage code',
                        'Add a delete button to outreach records',
                        'Make the stats cards show percentage change vs last week',
                        'Fix the AI analyze button',
                        'Show all outreach records across all campaigns on the homepage'
                      ].map(s=>(
                        <button key={s} className="chip" style={{fontSize:11,background:'#1a1a3e',borderColor:'#2a2a4e',color:'#8888cc'}} onClick={()=>setChatInput(s)}>{s}</button>
                      ))}
                    </div>
                  </div>
                )}
                {chatMsgs.map((m,i)=>(
                  <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
                    <div style={{maxWidth:'80%',padding:'12px 16px',borderRadius:m.role==='user'?'16px 16px 4px 16px':'16px 16px 16px 4px',background:m.role==='user'?'linear-gradient(135deg,var(--accent),#7B6FF0)':'#0f0f23',color:m.role==='user'?'#fff':'#c0c0ff',fontSize:13,lineHeight:1.6,border:m.role==='assistant'?'1px solid #2a2a4e':'none',whiteSpace:'pre-wrap'}}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {chatLoading&&<div style={{display:'flex'}}><div style={{padding:'12px 16px',background:'#0f0f23',border:'1px solid #2a2a4e',borderRadius:'16px 16px 16px 4px',fontSize:13,color:'#6666aa'}}>◌ working...</div></div>}
                <div ref={chatEndRef}/>
              </div>
              {devEvents.length>0&&(
                <div style={{width:240,overflowY:'auto',background:'#050510',border:'1px solid #1a1a3e',borderRadius:12,padding:12,flexShrink:0}}>
                  <div style={{fontFamily:'var(--font-dm-mono)',fontSize:10,color:'#4444aa',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10}}>Tool Calls</div>
                  {devEvents.map((e,i)=>(
                    <div key={i} style={{fontFamily:'var(--font-dm-mono)',fontSize:11,color:'#6677cc',padding:'5px 0',borderBottom:'1px solid #1a1a3e',wordBreak:'break-all'}}>
                      {e}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{paddingTop:12,borderTop:'1px solid #2a2a4e',display:'flex',gap:8}}>
              <input className="settings-input" style={{flex:1,background:'#0f0f23',borderColor:'#2a2a4e',color:'#a0a0ff'}} placeholder="Describe what you want built or fixed..." value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&sendChat()}/>
              <button style={{background:'linear-gradient(135deg,#5B4FE9,#7B6FF0)',color:'#fff',padding:'10px 20px',border:'none',borderRadius:10,fontWeight:600,fontSize:13,cursor:'pointer',opacity:chatLoading||!chatInput.trim()?0.5:1}} onClick={sendChat} disabled={chatLoading||!chatInput.trim()}>Send</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
