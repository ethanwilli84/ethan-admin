export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export async function POST(req: NextRequest) {
  const { recordId, threadContent, emailSubject, platformName } = await req.json()

  if (!threadContent && !platformName) {
    return NextResponse.json({ ok: false, error: 'No content to analyze' }, { status: 400 })
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: `You analyze email replies to outreach messages. Return ONLY raw JSON with no markdown, no backticks, no explanation.`,
      messages: [{
        role: 'user',
        content: `Analyze this reply to a podcast/speaking guest outreach.

Platform: ${platformName || 'Unknown'}
Subject: ${emailSubject || 'Guest Appearance'}
Reply content: ${threadContent || '(no reply content — classify based on platform name only)'}

Return this exact JSON (no markdown, no backticks):
{"status":"Promising","summary":"one sentence","confidence":"high","nextStep":"what to do"}`
      }],
    }),
  })

  const data = await response.json()
  if (data.error) {
    return NextResponse.json({ ok: false, error: data.error.message }, { status: 500 })
  }

  let text = data.content?.[0]?.text ?? '{}'
  // Strip markdown code blocks if present
  text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()

  // Extract JSON if wrapped in other text
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) text = jsonMatch[0]

  try {
    const analysis = JSON.parse(text)
    // Normalize status
    const validStatuses = ['Promising', 'Not Promising', 'Converted', 'Not Interested', 'Auto Reply']
    if (!validStatuses.includes(analysis.status)) analysis.status = 'Not Promising'

    if (recordId) {
      const db = await getDb()
      await db.collection('outreach_records').updateOne(
        { _id: new ObjectId(recordId) },
        { $set: {
          aiStatus: analysis.status,
          aiSummary: analysis.summary,
          aiNextStep: analysis.nextStep,
          aiConfidence: analysis.confidence,
          analyzedAt: new Date()
        }}
      )
    }
    return NextResponse.json({ ok: true, analysis })
  } catch (e) {
    console.error('Analyze parse error:', text)
    return NextResponse.json({ ok: false, error: 'Parse failed', raw: text })
  }
}
