'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Campaign { _id: string; slug: string; name: string; description: string; icon: string; active: boolean }
interface Stats { total: number; replied: number; responseRate: number; recentWeek: number }

export default function Home() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stats, setStats] = useState<Record<string, Stats>>({})

  useEffect(() => {
    fetch('/api/campaigns').then(r => r.json()).then(async (data: Campaign[]) => {
      setCampaigns(data)
      const map: Record<string, Stats> = {}
      await Promise.all(data.map(async c => {
        map[c.slug] = await fetch(`/api/stats?campaign=${c.slug}`).then(r => r.json())
      }))
      setStats(map)
    })
  }, [])

  return (
    <div>
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="header-brand">Ethan Admin</span>
          <span className="header-sep">/</span>
          <span className="header-breadcrumb">campaigns</span>
        </div>
        <span className="header-breadcrumb" style={{fontFamily:'var(--font-dm-mono),monospace',fontSize:12}}>
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
      </header>

      <div className="main">
        <div className="page-header fade-up">
          <div>
            <div className="page-title">Campaigns</div>
            <div className="page-sub">Select a campaign to manage</div>
          </div>
        </div>

        <div className="campaign-grid">
          {campaigns.map((c, i) => {
            const s = stats[c.slug]
            return (
              <Link key={c._id} href={`/campaigns/${c.slug}`} className={`campaign-card fade-up fade-up-${Math.min(i+1,4)}`}>
                <div className="campaign-card-header">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span className="campaign-card-icon">{c.icon}</span>
                    <div>
                      <div className="campaign-card-name">{c.name}</div>
                      <div className="campaign-card-desc">{c.description}</div>
                    </div>
                  </div>
                  <span className={c.active ? 'badge-active' : 'badge-paused'}>{c.active ? 'live' : 'paused'}</span>
                </div>
                {s && (
                  <div className="campaign-stats">
                    <div><div className="campaign-stat-label">Sent</div><div className="campaign-stat-val">{s.total}</div></div>
                    <div><div className="campaign-stat-label">Replies</div><div className="campaign-stat-val">{s.replied}</div></div>
                    <div><div className="campaign-stat-label">Rate</div><div className="campaign-stat-val">{s.responseRate}%</div></div>
                  </div>
                )}
              </Link>
            )
          })}
          <button className="campaign-add fade-up fade-up-2">
            <span className="campaign-add-icon">＋</span>
            <span>New Campaign</span>
          </button>
        </div>
      </div>
    </div>
  )
}
