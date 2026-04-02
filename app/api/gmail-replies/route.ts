export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export async function GET(req: NextRequest) {
  const campaign = req.nextUrl.searchParams.get('campaign') || 'influence-outreach'
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD_IMAP

  if (!user || !pass) {
    return NextResponse.json({ ok: false, error: 'Gmail not configured', replies: [], needsSetup: true })
  }

  try {
    const { ImapFlow } = await import('imapflow')
    const db = await getDb()

    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false,
    })

    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    const replies: { from: string; subject: string; date: string; preview: string; uid: number }[] = []

    try {
      // Search for replies to our outreach subject
      const uidsResult = await client.search({ subject: 'Guest Appearance - Ethan Williams' })

      const uids = Array.isArray(uidsResult) ? uidsResult : []
      for (const uid of uids.slice(-30)) {
        const msg = await client.fetchOne(uid.toString(), { envelope: true, bodyParts: ['1'] })
        if (!msg) continue

        const from = msg.envelope?.from?.[0]?.address || ''
        const fromName = msg.envelope?.from?.[0]?.name || ''
        const subject = msg.envelope?.subject || ''
        const date = msg.envelope?.date?.toISOString().split('T')[0] || ''

        // Skip emails we sent (only capture replies FROM others)
        if (from === user) continue

        // Get preview text - decode base64 and strip HTML
        let preview = ''
        try {
          const bodyPart = msg.bodyParts?.get('1')
          if (bodyPart) {
            let raw = Buffer.from(bodyPart).toString('utf-8')
            // Detect base64 encoded body (common in HTML emails)
            const b64match = raw.match(/^([A-Za-z0-9+/=\s]{40,})$/)
            if (b64match) {
              try {
                raw = Buffer.from(raw.replace(/\s/g, ''), 'base64').toString('utf-8')
              } catch {}
            }
            // Decode quoted-printable: soft line breaks (=\r?\n) and hex codes (=E2=80=99)
            raw = raw.replace(/=\r?\n/g, '')  // remove soft line breaks first
            raw = raw.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
            // Strip HTML tags and entities
            raw = raw.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&[a-z]+;/gi, '')
            // Remove MIME boundaries and headers that leaked through
            raw = raw.replace(/--[a-f0-9-]{10,}[\s\S]*?Content-Type[^\n]+/gi, '')
            raw = raw.replace(/Content-Transfer-Encoding[^\n]+/gi, '')
            // Collapse whitespace
            raw = raw.replace(/\s+/g, ' ').trim()
            preview = raw.substring(0, 400)
          }
        } catch {}

        replies.push({ from: fromName ? `${fromName} <${from}>` : from, subject, date, preview, uid })

        // Match to outreach record and update — always refresh preview even if already Replied
        const emailDomain = from.split('@')[1]?.split('.')[0] || ''
        if (emailDomain) {
          // First try exact email match
          const exactMatch = await db.collection('outreach_records').findOne({
            campaign,
            $or: [
              { emailsSent: { $regex: from.split('<').pop()?.replace('>','').trim() || from, $options: 'i' } },
              { replyFrom: { $regex: emailDomain, $options: 'i' } },
            ]
          })
          const filter = exactMatch
            ? { _id: exactMatch._id }
            : {
                campaign,
                status: { $in: ['Sent', 'Send Failed', 'Replied'] },
                $or: [
                  { emailsSent: { $regex: emailDomain, $options: 'i' } },
                  { name: { $regex: emailDomain, $options: 'i' } },
                ]
              }
          await db.collection('outreach_records').updateOne(
            filter,
            { $set: { status: 'Replied', repliedAt: new Date(date), replyFrom: from, replyPreview: preview } }
          )
        }
      }
    } finally {
      lock.release()
    }

    await client.logout()
    return NextResponse.json({ ok: true, replies, count: replies.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg, replies: [] })
  }
}
