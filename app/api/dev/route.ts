export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

const GH_TOKEN = process.env.GITHUB_TOKEN!
const REPO = 'ethanwilli84/ethan-admin'
const DO_APP_ID = '40dc1fb0-f772-428d-84d6-67097b5ac703'
const DO_TOKEN = process.env.DO_TOKEN || ''

const ghHeaders = () => ({
  'Authorization': `token ${GH_TOKEN}`,
  'Accept': 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
})

// Read a file from GitHub repo
async function readFile(path: string) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, { headers: ghHeaders() })
  if (!res.ok) {
    const err = await res.json()
    return { error: err.message || 'Not found', path }
  }
  const data = await res.json()
  if (Array.isArray(data)) {
    // Directory listing
    return { type: 'dir', path, files: data.map((f: { name: string; type: string; path: string; size: number }) => ({ name: f.name, type: f.type, path: f.path, size: f.size })) }
  }
  const content = Buffer.from(data.content, 'base64').toString('utf-8')
  return { type: 'file', path, content, sha: data.sha, size: data.size }
}

// Write (create or update) a file in GitHub repo
async function writeFile(path: string, content: string, message: string, sha?: string) {
  const body: Record<string, string> = {
    message,
    content: Buffer.from(content).toString('base64'),
    branch: 'main',
  }
  if (sha) body.sha = sha

  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers: ghHeaders(),
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) return { error: data.message || 'Write failed', path }
  return { ok: true, path, sha: data.content?.sha, commit: data.commit?.sha?.substring(0, 7) }
}

// Get latest deployments from DO
async function getDeployments() {
  if (!DO_TOKEN) return { error: 'DO_TOKEN not set' }
  const res = await fetch(`https://api.digitalocean.com/v2/apps/${DO_APP_ID}/deployments?page=1&per_page=5`, {
    headers: { 'Authorization': `Bearer ${DO_TOKEN}` }
  })
  const data = await res.json()
  return data.deployments?.map((d: { id: string; cause: string; progress: { success_steps: number; total_steps: number }; phase: string; updated_at: string }) => ({
    id: d.id?.substring(0, 8),
    cause: d.cause,
    progress: `${d.progress?.success_steps}/${d.progress?.total_steps}`,
    phase: d.phase,
    updated: d.updated_at?.substring(0, 16),
  })) || []
}

// Trigger a deployment
async function triggerDeploy() {
  if (!DO_TOKEN) {
    // Fall back to GitHub Actions trigger
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/deploy.yml/dispatches`,
      { method: 'POST', headers: ghHeaders(), body: JSON.stringify({ ref: 'main' }) }
    )
    // Just push a dummy commit via git — actually trigger via webhook
    return { ok: true, method: 'auto-deploy via push' }
  }
  const res = await fetch(`https://api.digitalocean.com/v2/apps/${DO_APP_ID}/deployments`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${DO_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const data = await res.json()
  return { ok: res.ok, deploymentId: data.deployment?.id?.substring(0, 8) }
}

export async function POST(req: NextRequest) {
  const { action, path, content, message, sha } = await req.json()

  if (action === 'read') return NextResponse.json(await readFile(path))
  if (action === 'write') return NextResponse.json(await writeFile(path, content, message, sha))
  if (action === 'deployments') return NextResponse.json(await getDeployments())
  if (action === 'deploy') return NextResponse.json(await triggerDeploy())

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
