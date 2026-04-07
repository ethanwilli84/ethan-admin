export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { repo, workflow, campaignSlug } = await req.json()
  const token = process.env.GITHUB_TOKEN

  // Pass campaign_slug as input so run_all.py only runs that one campaign
  const inputs: Record<string, string> = {}
  if (campaignSlug) inputs.campaign_slug = campaignSlug

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs }),
    }
  )
  if (res.status === 204) return NextResponse.json({ ok: true })
  const text = await res.text()
  return NextResponse.json({ ok: false, error: text }, { status: 500 })
}
