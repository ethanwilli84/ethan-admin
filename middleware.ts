import { NextRequest, NextResponse } from 'next/server'

// Subdomain routing: ups.sireapp.io -> /ups (and /api/ups)
// Also exposes pathname to server components via x-pathname header.
export function middleware(req: NextRequest) {
  const host = req.headers.get('host') || ''
  const url = req.nextUrl.clone()

  const isUpsHost =
    host.startsWith('ups.sireapp.io') || host.startsWith('ups.sireapp.io.')

  // Build the "effective" pathname after any rewrite — used by layout to
  // skip the admin sidebar on public pages.
  let effectivePath = url.pathname

  if (isUpsHost) {
    // Allow API + asset passthrough
    if (
      url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/_next') ||
      url.pathname.startsWith('/favicon') ||
      url.pathname === '/icon.svg'
    ) {
      const headers = new Headers(req.headers)
      headers.set('x-pathname', url.pathname)
      headers.set('x-public-host', '1')
      return NextResponse.next({ request: { headers } })
    }

    // Anything else under ups.sireapp.io routes to /ups
    if (!url.pathname.startsWith('/ups')) {
      url.pathname = '/ups' + (url.pathname === '/' ? '' : url.pathname)
      effectivePath = url.pathname
      const headers = new Headers(req.headers)
      headers.set('x-pathname', effectivePath)
      headers.set('x-public-host', '1')
      return NextResponse.rewrite(url, { request: { headers } })
    }
  }

  // For all other requests, expose pathname so layout can detect /ups
  const headers = new Headers(req.headers)
  headers.set('x-pathname', effectivePath)
  if (isUpsHost) headers.set('x-public-host', '1')
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
