'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Campaign {
  _id: string
  slug: string
  name: string
  description: string
  icon: string
  color: string
  active: boolean
}

interface CampaignStats {
  total: number
  replied: number
  responseRate: number
  recentWeek: number
}

export default function Home() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stats, setStats] = useState<Record<string, CampaignStats>>({})

  useEffect(() => {
    fetch('/api/campaigns').then(r => r.json()).then(async (data: Campaign[]) => {
      setCampaigns(data)
      const statsMap: Record<string, CampaignStats> = {}
      await Promise.all(data.map(async (c) => {
        const s = await fetch(`/api/stats?campaign=${c.slug}`).then(r => r.json())
        statsMap[c.slug] = s
      }))
      setStats(statsMap)
    })
  }, [])

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-orange-500 font-bold tracking-widest text-sm uppercase">Ethan Admin</span>
          <span className="text-zinc-700 text-xs">/ campaigns</span>
        </div>
        <span className="text-zinc-600 text-xs">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      </header>

      <main className="px-8 py-10 max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-zinc-500 text-sm mt-1">Select a campaign to manage</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map(c => {
            const s = stats[c.slug]
            return (
              <Link key={c._id} href={`/campaigns/${c.slug}`}
                className="border border-zinc-800 p-6 hover:border-zinc-600 transition-all group space-y-4 block">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{c.icon}</span>
                    <div>
                      <p className="font-bold text-sm group-hover:text-orange-400 transition-colors">{c.name}</p>
                      <p className="text-zinc-500 text-xs mt-0.5">{c.description}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 ${c.active ? 'bg-green-900/40 text-green-400' : 'bg-zinc-800 text-zinc-500'}`}>
                    {c.active ? 'active' : 'paused'}
                  </span>
                </div>
                {s && (
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800">
                    <div>
                      <p className="text-zinc-500 text-xs">Sent</p>
                      <p className="text-lg font-bold mt-0.5">{s.total}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500 text-xs">Replies</p>
                      <p className="text-lg font-bold mt-0.5">{s.replied}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500 text-xs">Rate</p>
                      <p className="text-lg font-bold mt-0.5">{s.responseRate}%</p>
                    </div>
                  </div>
                )}
              </Link>
            )
          })}

          <button className="border border-dashed border-zinc-700 p-6 hover:border-zinc-500 transition-all text-zinc-600 hover:text-zinc-400 text-sm flex flex-col items-center justify-center gap-2 min-h-[140px]">
            <span className="text-2xl">+</span>
            <span>New Campaign</span>
          </button>
        </div>
      </main>
    </div>
  )
}
