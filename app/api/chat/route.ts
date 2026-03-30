export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

const SYSTEM = `You are the AI assistant built into Ethan's personal admin dashboard. You help manage outreach campaigns, update settings, create new campaigns, and provide strategic advice.

You have full context of the admin system:
- The admin is at ethan-admin-hlfdr.ondigitalocean.app
- Campaigns are stored in MongoDB under the 'campaigns' collection
- Each campaign has: name, slug, description, icon, active, githubRepo, githubWorkflow
- Campaign settings (in 'campaign_settings' collection) include: template, researchPrompt, sendTime, sendDays, endDate, perSession, paused
- Outreach records are in 'outreach_records' collection
- The outreach script lives at github.com/ethanwilli84/influence-outreach

When the user asks you to make changes, respond with a JSON action block at the END of your message like this:
<action>{"type":"update_settings","campaign":"influence-outreach","data":{"paused":true}}</action>
<action>{"type":"create_campaign","data":{"name":"Alpine Outreach","slug":"alpine-outreach","description":"...","icon":"💳","githubRepo":"...","githubWorkflow":"daily_outreach.yml"}}</action>
<action>{"type":"update_campaign","campaign":"influence-outreach","data":{"active":false}}</action>

Action types: update_settings, create_campaign, update_campaign, trigger_run

Always be direct, concise, and smart. You know Ethan's businesses (Sire - shipping platform $3M/yr, Alpine - BNPL fintech $5M+/yr, Taco Project - social community). Give strategic advice when relevant.`

export async function POST(req: NextRequest) {
  const { messages, campaign } = await req.json()
  const db = await getDb()

  // Fetch context
  const campaigns = await db.collection('campaigns').find({}).toArray()
  const stats = campaign ? await db.collection('outreach_records').aggregate([
    { $match: { campaign } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]).toArray() : []

  const contextMsg = `Current campaigns: ${JSON.stringify(campaigns.map(c => ({ name: c.name, slug: c.slug, active: c.active })))}
Active campaign context: ${campaign || 'none'}
Stats: ${JSON.stringify(stats)}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM + '\n\nCurrent system context:\n' + contextMsg,
      messages,
    }),
  })

  const data = await response.json()
  const text = data.content?.[0]?.text ?? 'Error'

  // Parse and execute any actions
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
        await db.collection('campaigns').updateOne(
          { slug: action.campaign },
          { $set: { ...action.data, updatedAt: new Date() } }
        )
        results.push({ type: 'update_campaign', ok: true })
      } else if (action.type === 'trigger_run') {
        const ghRes = await fetch(
          `https://api.github.com/repos/${action.repo}/actions/workflows/${action.workflow}/dispatches`,
          { method: 'POST', headers: { Authorization: `token ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' }, body: JSON.stringify({ ref: 'main' }) }
        )
        results.push({ type: 'trigger_run', ok: ghRes.ok })
      }
    } catch {}
  }

  const cleanText = text.replace(/<action>[\s\S]*?<\/action>/g, '').trim()
  return NextResponse.json({ reply: cleanText, actions: results })
}
