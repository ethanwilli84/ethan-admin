'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

interface Campaign { _id: string; slug: string; name: string; description: string; icon: string; active: boolean }
interface Stats { total: number; replied: number; responseRate: number; recentWeek: number }
interface RunStatus { status: string; conclusion: string|null; lines: string[]; runId: number|null }
interface Generated { name:string;slug:string;description:string;icon:string;researchPrompt:string;template:string;sendTime:string;sendDays:string[];perSession:number;suggestedEndDate:string|null;rationale:string }

function CampaignRunBar({ slug, todaySent }: { slug: string; todaySent?: number }) {
  const [run, setRun] = useState<RunStatus|null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const d: RunStatus = await fetch(`/api/run-logs?campaign=${slug}`).then(r => r.json())
      setRun(d)
    } catch {}
  }, [slug])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 20000) // poll every 20s
    return () => clearInterval(interval)
  }, [fetchStatus])

  if (!run || run.status === 'idle') return null

  // Parse progress from log lines
  const lines = run.lines || []
  // Use DB-sourced today sent count (more reliable than log parsing)
  const sent = todaySent ?? lines.filter(l => l.includes('✓ Sent to') || l.includes('Sent to')).length
  const batchLine = lines.filter(l => l.includes('Batch ')).pop() || ''
  const batchMatch = batchLine.match(/Batch (\d+)/)
  const batchNum = batchMatch ? parseInt(batchMatch[1]) : 0
  const isDone = run.status === 'completed' || lines.some(l => l.includes('All campaigns complete') || l.includes('Done.'))
  const isQueued = run.status === 'queued'
  const isRunning = run.status === 'in_progress' && !isDone

  // Progress estimate: 5 batches max, each ~20% of the bar
  const batchPct = batchNum > 0 ? Math.min(batchNum / 5, 1) : 0
  const sentPct = sent > 0 ? Math.min(sent / 15, 1) * 0.8 : 0
  const pct = isDone ? 100 : Math.max(batchPct, sentPct) * 100 || (isRunning ? 15 : 0)

  const color = isDone && run.conclusion === 'success' ? 'var(--green)'
    : isDone && run.conclusion === 'failure' ? 'var(--red)'
    : isQueued ? '#f59e0b'
    : 'var(--accent)'

  const label = isDone && run.conclusion === 'success' ? (sent ? `✓ Done — ${sent} sent today` : '✓ Done')
    : isDone && run.conclusion === 'failure' ? '✗ Failed'
    : isQueued ? '⏳ Queued'
    : isRunning && batchNum > 0 ? `Running · Batch ${batchNum}/5 · ${sent} sent`
    : isRunning ? `Running · ${sent} sent`
    : ''

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }} onClick={e => e.preventDefault()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isRunning && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', animation: 'pulse 1s infinite' }}/>}
          <span style={{ fontSize: 11, fontFamily: 'var(--font-dm-mono)', color, fontWeight: 600 }}>{label}</span>
        </div>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-dm-mono)', color: 'var(--text-3)' }}>{Math.round(pct)}%</span>
      </div>
      <div style={{ height: 4, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 4, background: color,
          width: `${pct}%`,
          transition: 'width 1s ease',
          animation: isRunning && pct < 100 ? 'shimmer 2s infinite' : 'none',
        }}/>
      </div>
      {/* Last log line preview */}
      {isRunning && lines.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4, fontFamily: 'var(--font-dm-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lines[lines.length - 1]?.substring(0, 70)}
        </div>
      )}
    </div>
  )
}

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
    await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaign:generated.slug,researchObjective:generated.researchPrompt,template:generated.template,sendTime:generated.sendTime,sendDays:generated.sendDays,perSession:generated.perSession,endDate:generated.suggestedEndDate,paused:false})})
    setCreated(true); setCreating(false)
    setTimeout(()=>{setShowCreator(false);setCreated(false);setGenerated(null);setObjective('');loadCampaigns()},1500)
  }

  return (
    <div>
      <div className="page-header-bar">
        <div>
          <div className="page-title">Campaigns</div>
          <div className="page-sub">Select a campaign to manage</div>
        </div>
        <button className="btn-primary" onClick={()=>setShowCreator(!showCreator)}>+ New Campaign</button>
      </div>

      <div className="main">
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
                    <div><div className="campaign-stat-label">This Week</div><div className="campaign-stat-val">{s.recentWeek}</div></div>
                  </div>
                )}
                <CampaignRunBar slug={c.slug} todaySent={s?.recentWeek} />
              </Link>
            )
          })}
        </div>

        {showCreator&&(
          <div className="creator-card fade-up">
            <div style={{fontFamily:'var(--font-syne)',fontWeight:700,fontSize:16,marginBottom:4}}>✦ AI Campaign Generator</div>
            <div style={{color:'var(--text-3)',fontSize:13,marginBottom:16}}>Describe your objective — AI configures everything.</div>
            <textarea className="creator-textarea" placeholder="e.g. I want to get on fintech podcasts to promote Alpine, my BNPL platform for coaching sellers." value={objective} onChange={e=>setObjective(e.target.value)}/>
            <div style={{display:'flex',gap:8,marginTop:10,marginBottom:generated?20:0}}>
              <button className="btn-primary" onClick={generate} disabled={generating||!objective.trim()}>{generating?'◌ Generating...':'✦ Generate Campaign'}</button>
              <button className="btn-ghost" onClick={()=>{setShowCreator(false);setGenerated(null);setObjective('')}}>Cancel</button>
            </div>
            {generated&&(
              <div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                  <div className="preview-field"><strong>Name</strong>{generated.icon} {generated.name}</div>
                  <div className="preview-field"><strong>Schedule</strong>{generated.sendTime} · {generated.sendDays?.join(', ')} · {generated.perSession}/run</div>
                  <div className="preview-field" style={{gridColumn:'1/-1'}}><strong>Research Objective</strong>{generated.researchPrompt?.substring(0,200)}...</div>
                  <div className="preview-field" style={{gridColumn:'1/-1'}}><strong>Rationale</strong>{generated.rationale}</div>
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
