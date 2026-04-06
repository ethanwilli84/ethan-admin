export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

// Bounce/delivery failure senders from Gmail
const BOUNCE_SENDERS = ['mailer-daemon@googlemail.com', 'mailer-daemon@google.com', 'postmaster@']
const BOUNCE_SUBJECTS = ['delivery status notification', 'message not delivered', 'undeliverable', 'delivery failure', 'mail delivery failed']

function isBounce(from: string, subject: string): boolean {
  const f = from.toLowerCase()
  const s = subject.toLowerCase()
  return BOUNCE_SENDERS.some(b => f.includes(b)) || BOUNCE_SUBJECTS.some(b => s.includes(b))
}

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
    let bouncesArchived = 0

    try {
      // Search for replies + bounces related to our outreach
      const [replyUids, bounceUids] = await Promise.all([
        client.search({ subject: 'Guest Appearance - Ethan Williams' }),
        client.search({ from: 'mailer-daemon' }),
      ])

      const allUids = [...new Set([
        ...(Array.isArray(replyUids) ? replyUids : []),
      ])]

      // Process bounce emails — archive them + mark outreach as Send Failed
      const bounceUidList = Array.isArray(bounceUids) ? bounceUids : []
      for (const uid of bounceUidList.slice(-50)) {
        try {
          const msg = await client.fetchOne(uid.toString(), { envelope: true, bodyParts: ['1'] })
          if (!msg) continue
          const from = msg.envelope?.from?.[0]?.address || ''
          const subject = msg.envelope?.subject || ''
          if (!isBounce(from, subject)) continue

          // Extract the failed recipient email from body
          let body = ''
          const bodyPart = msg.bodyParts?.get('1')
          if (bodyPart) body = Buffer.from(bodyPart).toString('utf-8').substring(0, 500)

          // Find email address in bounce body
          const emailMatch = body.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g)
          const failedEmail = emailMatch?.find(e => !e.includes('google') && !e.includes('mailer-daemon'))

          if (failedEmail) {
            // Mark outreach record as Send Failed
            await db.collection('outreach_records').updateOne(
              {
                campaign,
                emailsSent: { $regex: failedEmail, $options: 'i' },
                status: { $in: ['Sent', 'Replied'] },
              },
              { $set: { status: 'Send Failed', bounceAt: new Date() } }
            )
          }

          // Archive the bounce email (move out of inbox) + mark as read
          await client.messageMove(uid.toString(), '[Gmail]/All Mail')
          bouncesArchived++
        } catch {}
      }

      // Process real replies
      for (const uid of allUids.slice(-30)) {
        const msg = await client.fetchOne(uid.toString(), { envelope: true, bodyParts: ['1'] })
        if (!msg) continue

        const from = msg.envelope?.from?.[0]?.address || ''
        const fromName = msg.envelope?.from?.[0]?.name || ''
        const subject = msg.envelope?.subject || ''
        const date = msg.envelope?.date?.toISOString().split('T')[0] || ''

        // Skip our own sent emails
        if (from === user) continue
        // Skip bounces (already handled above)
        if (isBounce(from, subject)) continue

        // Decode body
        let preview = ''
        try {
          const bodyPart = msg.bodyParts?.get('1')
          if (bodyPart) {
            let raw = Buffer.from(bodyPart).toString('utf-8')
            const b64match = raw.match(/^([A-Za-z0-9+/=\s]{40,})$/)
            if (b64match) {
              try { raw = Buffer.from(raw.replace(/\s/g, ''), 'base64').toString('utf-8') } catch {}
            }
            raw = raw.replace(/=\r?\n/g, '')
            raw = raw.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
            raw = raw.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&[a-z]+;/gi, '')
            raw = raw.replace(/--[a-f0-9-]{10,}[\s\S]*?Content-Type[^\n]+/gi, '')
            raw = raw.replace(/Content-Transfer-Encoding[^\n]+/gi, '')
            raw = raw.replace(/\s+/g, ' ').trim()
            preview = raw.substring(0, 400)
          }
        } catch {}

        replies.push({ from: fromName ? `${fromName} <${from}>` : from, subject, date, preview, uid })

        // Match and update outreach record
        const emailDomain = from.split('@')[1]?.split('.')[0] || ''
        if (emailDomain) {
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
    return NextResponse.json({ ok: true, replies, count: replies.length, bouncesArchived })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg, replies: [] })
  }
}
