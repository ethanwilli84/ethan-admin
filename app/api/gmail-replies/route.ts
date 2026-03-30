export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

// Fetches Gmail threads that are replies to our outreach emails
// Uses Gmail API with OAuth2 refresh token stored in env vars
async function getGmailToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  })
  const d = await res.json()
  return d.access_token
}

export async function GET(req: NextRequest) {
  const campaign = req.nextUrl.searchParams.get('campaign') || 'influence-outreach'

  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_REFRESH_TOKEN) {
    return NextResponse.json({ ok: false, error: 'Gmail not configured', replies: [], needsSetup: true })
  }

  try {
    const token = await getGmailToken()
    const db = await getDb()

    // Search for replies to our subject line
    const query = encodeURIComponent('subject:"Guest Appearance - Ethan Williams" in:inbox')
    const searchRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${query}&maxResults=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const searchData = await searchRes.json()
    const threads = searchData.threads || []

    const replies = []
    for (const thread of threads.slice(0, 20)) {
      const threadRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${thread.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const threadData = await threadRes.json()
      const msgs = threadData.messages || []
      if (msgs.length < 2) continue // no reply yet

      const lastMsg = msgs[msgs.length - 1]
      const headers = lastMsg.payload?.headers || []
      const from = headers.find((h: { name: string }) => h.name === 'From')?.value || ''
      const subject = headers.find((h: { name: string }) => h.name === 'Subject')?.value || ''
      const date = headers.find((h: { name: string }) => h.name === 'Date')?.value || ''

      // Only include if reply is from someone else (not us)
      if (from.includes('ethan@sireapp.io')) continue

      // Get the full last message body
      const fullRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${lastMsg.id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const fullData = await fullRes.json()
      let body = ''
      const parts = fullData.payload?.parts || [fullData.payload]
      for (const part of parts) {
        if (part?.mimeType === 'text/plain' && part?.body?.data) {
          body = Buffer.from(part.body.data, 'base64').toString('utf-8').substring(0, 1000)
          break
        }
      }

      replies.push({ threadId: thread.id, from, subject, date, preview: body.substring(0, 200), messageCount: msgs.length })

      // Update matching outreach record
      const name = from.split('@')[1]?.split('.')[0] || from
      await db.collection('outreach_records').updateOne(
        { campaign, status: 'Sent', $or: [
          { emailsSent: { $regex: from.split('<')[1]?.replace('>','') || from, $options: 'i' } },
          { name: { $regex: name, $options: 'i' } }
        ]},
        { $set: { status: 'Replied', repliedAt: new Date(date), replyFrom: from, replyPreview: body.substring(0, 200), threadId: thread.id } }
      )
    }

    return NextResponse.json({ ok: true, replies, count: replies.length })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: String(e), replies: [] })
  }
}
