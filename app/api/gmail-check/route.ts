/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

// In-memory domain cache — cleared on server restart (DO restarts once/day)
// Prevents re-scanning Gmail for same domains within a 24h period
const domainCache = new Map<string, { result: Record<string, unknown>; cachedAt: number }>()
const CACHE_TTL = 23 * 60 * 60 * 1000  // 23 hours

export async function POST(req: NextRequest) {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD_IMAP
  if (!user || !pass) return NextResponse.json({ error: 'Gmail not configured' }, { status: 500 })

  const { email, domain, name } = await req.json()
  if (!email && !domain && !name) return NextResponse.json({ error: 'Need email, domain, or name' }, { status: 400 })

  const searchDomain = domain || (email?.includes('@') ? email.split('@')[1] : null)
  const cacheKey = searchDomain || email || 'unknown'
  const cached = domainCache.get(cacheKey)
  if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL) {
    return NextResponse.json({ ...cached.result, fromCache: true })
  }
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

        // FIX: Only use precise address/to/from queries — NO text: search
        // text: searches full email bodies causing massive false positives
        // e.g. domain "accel.com" matching unrelated emails that mention accel in body
        const queries: any[] = []

        if (isSent) {
          // For sent mail: did we send TO this specific email or domain?
          if (email) queries.push({ to: email })
          // Domain search via 'to' only — much more precise than text:
          if (searchDomain) queries.push({ to: `@${searchDomain}` })
        } else {
          // For inbox: did they email US FROM this domain?
          if (email) queries.push({ from: email })
          if (searchDomain) queries.push({ from: `@${searchDomain}` })
        }

        for (const query of queries) {
          try {
            const uids: number[] = await client.search(query) as number[]
            if (!Array.isArray(uids) || !uids.length) continue

            for (const uid of uids.slice(-5)) {
              try {
                const msg: any = await client.fetchOne(String(uid), { envelope: true })
                if (!msg?.envelope) continue

                const env = msg.envelope
                const subject: string = env.subject || ''
                const date: string = env.date?.toISOString?.()?.split('T')[0] || ''
                const key = `${subject}|${date}`

                if (isSent) {
                  const to: string = (env.to || []).map((t: any) => t.address || '').join(', ')
                  // Extra validation: confirm the matched address actually has the domain
                  const toAddresses = (env.to || []).map((t: any) => (t.address || '').toLowerCase())
                  const actualMatch = toAddresses.some((addr: string) =>
                    (email && addr === email.toLowerCase()) ||
                    (searchDomain && addr.endsWith(`@${searchDomain.toLowerCase()}`))
                  )
                  if (!actualMatch) continue  // False positive — skip

                  if (!sentMatches.find(m => `${m.subject}|${m.date}` === key)) {
                    const matchedTerm = email && toAddresses.includes(email.toLowerCase()) ? email : `@${searchDomain}`
                    sentMatches.push({ subject: subject.substring(0, 80), to: to.substring(0, 60), date, matchedTerm })
                  }
                } else {
                  const from: string = (env.from || []).map((f: any) => f.address || '').join(', ')
                  const fromAddresses = (env.from || []).map((f: any) => (f.address || '').toLowerCase())
                  const actualMatch = fromAddresses.some((addr: string) =>
                    (email && addr === email.toLowerCase()) ||
                    (searchDomain && addr.endsWith(`@${searchDomain.toLowerCase()}`))
                  )
                  if (!actualMatch) continue

                  if (!receivedMatches.find(m => `${m.subject}|${m.date}` === key)) {
                    receivedMatches.push({ subject: subject.substring(0, 80), from: from.substring(0, 60), date, matchedTerm: from })
                  }
                }
              } catch {}
            }
          } catch {}
        }
      } catch {}
      finally { try { lock?.release() } catch {} }
    }

    await searchFolder('[Gmail]/Sent Mail', true)
    if (sentMatches.length === 0) await searchFolder('Sent Messages', true)
    // Only check inbox for received — used for info only, NOT for skip decision
    await searchFolder('INBOX', false)

    await client.logout()
  } catch (e: any) {
    // FIX: On failure, don't skip — allow the send. Failing safe = missing outreach.
    return NextResponse.json({
      ok: false,
      shouldSkip: false,
      error: e.message,
      verdict: 'ALLOW — could not verify (defaulting to send)',
      summary: { sentCount: 0, receivedCount: 0 },
    })
  }

  // FIX: Only skip based on SENT history — we sent to them before
  // Do NOT skip based on received — newsletters/auto-emails/Elavon notifications are not prior contact
  const hasPriorSent = sentMatches.length > 0
  const hasPriorReceived = receivedMatches.length > 0
  const shouldSkip = hasPriorSent  // FIX: was: hasPriorSent || hasPriorReceived

  const result = {
    ok: true, shouldSkip,
    summary: { sentCount: sentMatches.length, receivedCount: receivedMatches.length, searchedFor: { email, domain: searchDomain, name } },
    sentHistory: sentMatches.slice(0, 5), receivedHistory: receivedMatches.slice(0, 3),
    verdict: hasPriorSent ? ('SKIP — sent to this domain ' + sentMatches.length + 'x before') : hasPriorReceived ? 'ALLOW — they emailed us but we have not sent to them' : 'ALLOW — no prior sent history',
  }
  // Cache by domain to skip re-checking same domains in same run
  if (cacheKey) domainCache.set(cacheKey, { result, cachedAt: Date.now() })
  return NextResponse.json(result)
}