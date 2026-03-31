export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://ethan-admin-hlfdr.ondigitalocean.app'

const ADMIN_SYSTEM = `You are the AI assistant built into Ethan's personal admin dashboard for his outreach campaigns. Help manage campaigns, update settings, and give strategic advice. When making changes, emit <action>{"type":"...","data":{...}}</action> tags.`

const DEV_SYSTEM = `You are an expert full-stack developer and autonomous coding agent built into Ethan's admin dashboard at https://ethan-admin-hlfdr.ondigitalocean.app.

The codebase is a Next.js 16 app at github.com/ethanwilli84/ethan-admin. Stack: TypeScript, plain CSS (no Tailwind), MongoDB, DigitalOcean App Platform. Auto-deploys on push to main.

You have tools to read files, write files (commits directly to GitHub), and trigger deploys.

WORKFLOW: When asked to add a feature or fix a bug:
1. Read relevant files first to understand the current code
2. Write the updated/new files (commits to GitHub automatically)
3. Trigger a deploy if needed
4. Report what you changed and what the user should see

Be autonomous — read, write, deploy without asking permission. Just do it and report back.
Key paths: app/api/ (routes), app/campaigns/[slug]/page.tsx (campaign page), app/page.tsx (home), app/globals.css (styles), lib/mongodb.ts (db).`

const DEV_TOOLS = [
  {
    name: 'read_file',
    description: 'Read a file or list a directory from the GitHub repo',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path e.g. "app/page.tsx" or directory "app/api"' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Create or update a file in the GitHub repo. Commits directly to main.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path e.g. "app/api/newroute/route.ts"' },
        content: { type: 'string', description: 'Full file content' },
        message: { type: 'string', description: 'Git commit message' },
        sha: { type: 'string', description: 'Current file SHA (required when updating existing file)' }
      },
      required: ['path', 'content', 'message']
    }
  },
  {
    name: 'deploy',
    description: 'Trigger a new deployment on DigitalOcean App Platform',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_deployments',
    description: 'Get the latest deployment statuses',
    input_schema: { type: 'object', properties: {} }
  }
]

async function callTool(name: string, input: Record<string, string>) {
  const base = BASE_URL
  if (name === 'read_file') {
    const r = await fetch(`${base}/api/dev`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'read', path: input.path }) })
    return await r.json()
  }
  if (name === 'write_file') {
    const r = await fetch(`${base}/api/dev`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'write', path: input.path, content: input.content, message: input.message, sha: input.sha }) })
    return await r.json()
  }
  if (name === 'deploy') {
    const r = await fetch(`${base}/api/dev`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deploy' }) })
    return await r.json()
  }
  if (name === 'get_deployments') {
    const r = await fetch(`${base}/api/dev`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deployments' }) })
    return await r.json()
  }
  return { error: 'Unknown tool' }
}

export async function POST(req: NextRequest) {
  const { messages, campaign, devMode } = await req.json()
  const db = await getDb()

  if (devMode) {
    // Agentic dev loop — keeps calling Claude until no more tool calls
    const allMessages = [...messages]
    const events: string[] = []
    let finalText = ''

    for (let i = 0; i < 10; i++) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: DEV_SYSTEM,
          tools: DEV_TOOLS,
          messages: allMessages,
        }),
      })
      const data = await res.json()

      if (data.error) { finalText = `Error: ${data.error.message}`; break }

      // Collect text
      const textBlocks = data.content?.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n') || ''
      if (textBlocks) finalText = textBlocks

      // Check for tool use
      const toolUses = data.content?.filter((b: { type: string }) => b.type === 'tool_use') || []
      if (toolUses.length === 0 || data.stop_reason === 'end_turn') break

      // Execute tools
      allMessages.push({ role: 'assistant', content: data.content })
      const toolResults = []
      for (const tu of toolUses) {
        events.push(`🔧 ${tu.name}(${tu.input?.path || tu.input?.message || ''})`)
        const result = await callTool(tu.name, tu.input)
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) })
      }
      allMessages.push({ role: 'user', content: toolResults })
    }

    return NextResponse.json({ reply: finalText, events, devMode: true })
  }

  // Normal admin chat mode
  const campaigns = await db.collection('campaigns').find({}).toArray()
  const stats = campaign ? await db.collection('outreach_records').aggregate([
    { $match: { campaign } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]).toArray() : []

  const contextMsg = `Campaigns: ${JSON.stringify(campaigns.map(c => ({ name: c.name, slug: c.slug, active: c.active })))} | Active: ${campaign || 'none'} | Stats: ${JSON.stringify(stats)}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1024, system: ADMIN_SYSTEM + '\n\n' + contextMsg, messages }),
  })

  const data = await response.json()
  const text = data.content?.[0]?.text ?? 'Error'

  // Execute any actions
  const actionMatches = [...text.matchAll(/<action>([\s\S]*?)<\/action>/g)]
  const results = []
  for (const match of actionMatches) {
    try {
      const action = JSON.parse(match[1])
      if (action.type === 'update_settings') {
        await db.collection('campaign_settings').updateOne(
          { campaign: action.campaign, key: 'config' },
          { $set: { campaign: action.campaign, key: 'config', value: action.data, updatedAt: new Date() } },
          { upsert: true }
        )
        results.push({ type: 'update_settings', ok: true })
      } else if (action.type === 'create_campaign') {
        const slug = action.data.slug || action.data.name.toLowerCase().replace(/\s+/g, '-')
        await db.collection('campaigns').insertOne({ ...action.data, slug, createdAt: new Date() })
        results.push({ type: 'create_campaign', ok: true, slug })
      } else if (action.type === 'update_campaign') {
        await db.collection('campaigns').updateOne({ slug: action.campaign }, { $set: { ...action.data, updatedAt: new Date() } })
        results.push({ type: 'update_campaign', ok: true })
      }
    } catch {}
  }

  const cleanText = text.replace(/<action>[\s\S]*?<\/action>/g, '').trim()
  return NextResponse.json({ reply: cleanText, actions: results })
}
