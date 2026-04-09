export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { objective } = await req.json()

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `You generate outreach campaign configurations for Ethan Williams (20yo NYC founder, $5M/yr software company, Alpine BNPL fintech, Taco Project social community). Return ONLY valid JSON, no other text.`,
      messages: [{
        role: 'user',
        content: `Based on this objective, generate a campaign config:

"${objective}"

Return JSON:
{
  "name": "Campaign Name",
  "slug": "campaign-slug",
  "description": "Short description",
  "icon": "emoji",
  "researchPrompt": "Detailed prompt for finding 15 relevant outreach targets per run. Be specific about the type of platforms, audience, and fit.",
  "template": "Personalized email template that incorporates the objective and sounds like Ethan. Keep his casual but confident voice. End with his sig.",
  "sendTime": "09:00",
  "sendDays": ["mon","tue","wed","thu","fri"],
  "perSession": 15,
  "suggestedEndDate": "YYYY-MM-DD or null",
  "rationale": "Why these settings make sense for this objective"
}`
      }],
    }),
  })

  const data = await response.json()
  const text = data.content?.[0]?.text ?? '{}'
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    return NextResponse.json({ ok: true, campaign: JSON.parse(clean) })
  } catch {
    return NextResponse.json({ ok: false, error: 'Parse failed', raw: text })
  }
}
