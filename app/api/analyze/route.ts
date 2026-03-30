export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export async function POST(req: NextRequest) {
  const { recordId, threadContent, emailSubject, platformName } = await req.json()

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: `You analyze email thread replies to podcast/speaking guest outreach. Classify the reply and return ONLY valid JSON, no other text.`,
      messages: [{
        role: 'user',
        content: `Platform: ${platformName}
Subject: ${emailSubject}
Thread: ${threadContent}

Return JSON: {"status": "Promising"|"Not Promising"|"Converted"|"Not Interested"|"Auto Reply", "summary": "1 sentence summary", "confidence": "high"|"medium"|"low", "nextStep": "what to do next"}`
      }],
    }),
  })

  const data = await response.json()
  const text = data.content?.[0]?.text ?? '{}'

  try {
    const analysis = JSON.parse(text)
    if (recordId) {
      const db = await getDb()
      await db.collection('outreach_records').updateOne(
        { _id: new ObjectId(recordId) },
        { $set: { aiStatus: analysis.status, aiSummary: analysis.summary, aiNextStep: analysis.nextStep, aiConfidence: analysis.confidence, analyzedAt: new Date() } }
      )
    }
    return NextResponse.json({ ok: true, analysis })
  } catch {
    return NextResponse.json({ ok: false, error: 'Parse failed', raw: text })
  }
}
