export const dynamic = 'force-dynamic'

import { getDb } from '@/lib/mongodb'

// Index page — last 30 briefs. Served as raw HTML so the ethan-admin layout
// doesn't wrap it.
export async function GET() {
  const db = await getDb()
  const docs = await db
    .collection('briefs')
    .find({}, { projection: { slug: 1, date: 1, kept_count: 1, errors: 1 } })
    .sort({ slug: -1 })
    .limit(30)
    .toArray()

  const rows = docs
    .map((d) => {
      const kept = (d.kept_count as number) ?? 0
      const errored = Array.isArray(d.errors) && d.errors.length > 0
      const tag = errored ? '<span class="t err">errors</span>' : `<span class="t">${kept} items</span>`
      return `<li><a href="/brief/${d.slug}"><span class="d">${formatDate(d.date as string)}</span>${tag}<span class="s">${(d.slug as string).slice(-4)}</span></a></li>`
    })
    .join('')

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>Briefs</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 40px auto; padding: 0 16px; color: #111; background: #fff; }
  @media (prefers-color-scheme: dark) { body { background: #0b0b0c; color: rgba(255,255,255,.92); } }
  h1 { font-size: 22px; letter-spacing: -.01em; margin-bottom: 4px; }
  p.sub { color: rgba(0,0,0,.5); margin-bottom: 24px; font-size: 13px; }
  @media (prefers-color-scheme: dark) { p.sub { color: rgba(255,255,255,.5); } }
  ul { list-style: none; padding: 0; }
  li { border-top: 1px solid rgba(0,0,0,.08); }
  li:last-child { border-bottom: 1px solid rgba(0,0,0,.08); }
  @media (prefers-color-scheme: dark) { li, li:last-child { border-color: rgba(255,255,255,.08); } }
  a { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: center; padding: 14px 4px; text-decoration: none; color: inherit; }
  a:hover { background: rgba(0,0,0,.03); }
  @media (prefers-color-scheme: dark) { a:hover { background: rgba(255,255,255,.04); } }
  .d { font-weight: 500; }
  .t { font-size: 11px; color: rgba(0,0,0,.5); text-transform: uppercase; letter-spacing: .06em; }
  @media (prefers-color-scheme: dark) { .t { color: rgba(255,255,255,.5); } }
  .t.err { color: #dc2626; }
  .s { font-family: monospace; color: rgba(0,0,0,.4); font-size: 12px; }
  @media (prefers-color-scheme: dark) { .s { color: rgba(255,255,255,.4); } }
  .empty { color: rgba(0,0,0,.5); font-style: italic; padding: 14px 4px; }
</style>
</head><body>
<h1>Briefs</h1>
<p class="sub">Last 30 days</p>
<ul>${rows || '<li class="empty">No briefs yet.</li>'}</ul>
</body></html>`

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  try {
    const [y, m, d] = iso.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, d))
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    })
  } catch {
    return iso
  }
}
