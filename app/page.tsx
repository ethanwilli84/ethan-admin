'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Campaign { _id: string; slug: string; name: string; description: string; icon: string; active: boolean }
interface Stats { total: number; replied: number; responseRate: number; recentWeek: number }
interface Generated { name:string; slug:string; description:string; icon:string; researchPrompt:string; template:string; sendTime:string; sendDays:string[]; perSession:number; suggestedEndDate:string|null; rationale:string }

export default function Home() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stats, setStats] = useState<Record<string, Stats>>({})
  const [showCreator, setShowCreator] = useState(false)
  const [objective, setObjective] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<Generated|null>(null)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState(false)

  useEffect(() => { loadCampaigns() }, [])

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

  return (
    <div>
      <header className="header">
        <div style={{display:'flex',alignItems:'center'}}>
          <span className="header-brand">Ethan Admin</span>
          <span className="header-sep">/</span>
          <span className="header-breadcrumb">campaigns</span>
        </div>
        <span style={{fontFamily:'var(--font-dm-mono)',fontSize:12,color:'var(--text-3)'}}>
          {new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}
        </span>
      </header>
      <div className="main">
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
            <div style={{color:'var(--text-3)',fontSize:13,marginBottom:16}}>Describe your objective in plain text — AI will configure everything.</div>
            <textarea className="creator-textarea" placeholder="e.g. I want to get on fintech podcasts to promote Alpine, my BNPL platform for coaching sellers. I want to reach CFOs and finance folks who run high-ticket programs and need payment solutions..." value={objective} onChange={e=>setObjective(e.target.value)}/>
            <div style={{display:'flex',gap:8,marginTop:10,marginBottom:generated?20:0}}>
              <button className="btn-primary" onClick={generate} disabled={generating||!objective.trim()}>{generating?'◌ Generating...':'✦ Generate Campaign'}</button>
              <button className="btn-ghost" onClick={()=>{setShowCreator(false);setGenerated(null);setObjective('')}}>Cancel</button>
            </div>
            {generated&&(
              <div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                  <div className="preview-field"><strong>Name</strong>{generated.icon} {generated.name}</div>
                  <div className="preview-field"><strong>Schedule</strong>{generated.sendTime} · {generated.sendDays?.join(', ')} · {generated.perSession}/run</div>
                  <div className="preview-field" style={{gridColumn:'1/-1'}}><strong>Research Prompt</strong>{generated.researchPrompt}</div>
                  <div className="preview-field" style={{gridColumn:'1/-1'}}><strong>AI Rationale</strong>{generated.rationale}</div>
                </div>
                <button className="btn-green" onClick={createCampaign} disabled={creating}>{creating?'◌ Creating...':created?'✓ Created!':'Create Campaign →'}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
