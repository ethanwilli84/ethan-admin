import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { repo, workflow } = await req.json()
  const token = process.env.GITHUB_TOKEN
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  )
  if (res.status === 204) return NextResponse.json({ ok: true })
  return NextResponse.json({ ok: false }, { status: 500 })
}
