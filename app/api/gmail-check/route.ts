export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

// Gmail history check — searches IMAP for any prior contact with a domain, email, or name
// Used by outreach script before sending to prevent re-contacting people you've already talked to

export async function POST(req: NextRequest) {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD_IMAP

  if (!user || !pass) return NextResponse.json({ error: 'Gmail not configured' }, { status: 500 })

  const { email, domain, name } = await req.json()
  if (!email && !domain && !name) return NextResponse.json({ error: 'Need email, domain, or name' }, { status: 400 })

  try {
    const { ImapFlow } = await import('imapflow')
    const client = new ImapFlow({
      host: 'imap.gmail.com', port: 993, secure: true,
      auth: { user, pass }, logger: false,
    })
    await client.connect()

    const results: {
      folder: string
      matches: { from: string; to: string; subject: string; date: string; preview: string }[]
    }[] = []

    // Extract domain from email if not provided
    const searchDomain = domain || email?.split('@')[1]

    // Build IMAP search queries
    // We'll search in both INBOX (received) and [Gmail]/Sent Mail (sent)
    const folders = [
      { path: 'INBOX', label: 'received' },
      { path: '[Gmail]/Sent Mail', label: 'sent' },
      { path: '[Gmail]/All Mail', label: 'all' },
    ]

    // Search criteria — any match is a hit
    const searchCriteria: string[] = []
    if (searchDomain) searchCriteria.push(searchDomain)
    if (email && email !== searchDomain) searchCriteria.push(email)
    if (name) searchCriteria.push(name)

    for (const folder of folders) {
      let lock
      try {
        lock = await client.getMailboxLock(folder.path)
        const folderMatches: typeof results[0]['matches'] = []

        for (const term of searchCriteria) {
          // Search by from, to, subject, and body containing the term
          const searchQueries = [
            { from: term },
            { to: term },
            { subject: term },
          ]


          for (const query of searchQueries) {
            try {
              const uids = await client.search(query)
              if (!Array.isArray(uids) || !uids.length) continue

              // Get last 5 matches from each query
              for (const uid of uids.slice(-5)) {
                const msg = await client.fetchOne(uid.toString(), { envelope: true })
                if (!msg || !msg.envelope) continue

                const fromAddr = msg.envelope.from?.[0]?.address || ''
                const toAddrs = (msg.envelope.to || []).map((t: {address?: string; name?: string}) => t.address || "").join(", ")
                const subject = msg.envelope.subject || ''
                const date = msg.envelope.date?.toISOString().split('T')[0] || ''

                // Deduplicate within folder results
                const key = `${fromAddr}|${subject}|${date}`
                const alreadyAdded = folderMatches.some(m => `${m.from}|${m.subject}|${m.date}` === key)
                if (!alreadyAdded) {
                  folderMatches.push({ from: fromAddr, to: toAddrs, subject: subject.substring(0, 80), date, preview: '' })
                }
              }
            } catch {} // Some folders don't support all search types
          }
        }

        if (folderMatches.length > 0) {
          results.push({ folder: folder.label, matches: folderMatches.slice(0, 10) })
        }
      } catch {} // Folder might not exist
      finally { lock?.release() }
    }

    await client.logout()

    // Determine if previously contacted
    const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0)
    const sentMatches = results.find(r => r.folder === 'sent')?.matches || []
    const receivedMatches = results.find(r => r.folder === 'received')?.matches || []

    return NextResponse.json({
      ok: true,
      alreadyContacted: totalMatches > 0,
      summary: {
        totalMatches,
        sentCount: sentMatches.length,
        receivedCount: receivedMatches.length,
        searchedFor: { email, domain: searchDomain, name },
      },
      results,
      // Easy flag for outreach script
      shouldSkip: sentMatches.length > 0, // Only block if YOU sent to them — receiving from them is ok to re-contact
    })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
