/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD_IMAP
  if (!user || !pass) return NextResponse.json({ error: 'Gmail not configured' }, { status: 500 })

  const { email, domain, name } = await req.json()
  if (!email && !domain && !name) return NextResponse.json({ error: 'Need email, domain, or name' }, { status: 400 })

  const searchDomain = domain || (email?.includes('@') ? email.split('@')[1] : null)
  const terms: string[] = []
  if (email) terms.push(email)
  if (searchDomain) terms.push(searchDomain)
  if (name && name.length > 3) terms.push(name)

  const sentMatches: { subject: string; to: string; date: string; matchedTerm: string }[] = []
  const receivedMatches: { subject: string; from: string; date: string; matchedTerm: string }[] = []

  try {
    const { ImapFlow } = await import('imapflow')
    const client = new ImapFlow({
      host: 'imap.gmail.com', port: 993, secure: true,
      auth: { user, pass }, logger: false,
    })
    await client.connect()

    async function searchFolder(folderPath: string, isSent: boolean) {
      let lock: any
      try {
        lock = await client.getMailboxLock(folderPath)
        for (const term of terms) {
          // text: searches full message body + headers — catches manual outreach, contact forms, anything
          const queries: any[] = isSent
            ? [{ to: term }, { text: term }]   // sent: did we send TO them or mention them?
            : [{ from: term }, { text: term }]  // inbox: did they email us or are they mentioned?

          for (const query of queries) {
            try {
              const uids: number[] = await client.search(query) as number[]
              if (!Array.isArray(uids) || !uids.length) continue

              for (const uid of uids.slice(-10)) {
                try {
                  const msg: any = await client.fetchOne(String(uid), { envelope: true })
                  if (!msg?.envelope) continue

                  const env = msg.envelope
                  const subject: string = env.subject || ''
                  const date: string = env.date?.toISOString?.()?.split('T')[0] || ''
                  const key = `${subject}|${date}`

                  if (isSent) {
                    const to: string = (env.to || []).map((t: any) => t.address || '').join(', ')
                    if (!sentMatches.find(m => `${m.subject}|${m.date}` === key)) {
                      sentMatches.push({ subject: subject.substring(0, 80), to: to.substring(0, 60), date, matchedTerm: term })
                    }
                  } else {
                    const from: string = (env.from || []).map((f: any) => f.address || '').join(', ')
                    if (!receivedMatches.find(m => `${m.subject}|${m.date}` === key)) {
                      receivedMatches.push({ subject: subject.substring(0, 80), from: from.substring(0, 60), date, matchedTerm: term })
                    }
                  }
                } catch {}
              }
            } catch {} // unsupported query for this folder — skip
          }
        }
      } catch {} // folder doesn't exist — skip
      finally { try { lock?.release() } catch {} }
    }

    // Search sent mail — CRITICAL: did we SEND to them before?
    await searchFolder('[Gmail]/Sent Mail', true)
    // Fallback sent folder name
    if (sentMatches.length === 0) await searchFolder('Sent Messages', true)

    // Search inbox — did they email us?
    await searchFolder('INBOX', false)

    await client.logout()
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      shouldSkip: true, // safe default — skip if check fails
      error: e.message,
      verdict: 'SKIP — could not verify email history (safe default)',
      summary: { sentCount: 0, receivedCount: 0, searchedTerms: terms },
    })
  }

  const hasPriorSent = sentMatches.length > 0

  return NextResponse.json({
    ok: true,
    shouldSkip: hasPriorSent,
    summary: {
      sentCount: sentMatches.length,
      receivedCount: receivedMatches.length,
      searchedFor: { email, domain: searchDomain, name },
      searchedTerms: terms,
    },
    sentHistory: sentMatches.slice(0, 5),
    receivedHistory: receivedMatches.slice(0, 3),
    verdict: hasPriorSent
      ? `SKIP — found ${sentMatches.length} prior sent email(s) to this contact/domain`
      : receivedMatches.length > 0
        ? `PROCEED WITH CAUTION — they've emailed you ${receivedMatches.length}x but you haven't sent to them`
        : 'CLEAR — no prior email history found',
  })
}
