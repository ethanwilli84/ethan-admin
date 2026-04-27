import { NextRequest, NextResponse } from 'next/server'

// Subdomain routing: ups.sireapp.io -> /ups (and /api/ups)
export function middleware(req: NextRequest) {
  const host = req.headers.get('host') || ''
  const url = req.nextUrl.clone()

  if (host.startsWith('ups.sireapp.io') || host.startsWith('ups.sireapp.io.')) {
    // Allow API + asset passthrough
    if (
      url.pathname.startsWith('/api/ups') ||
      url.pathname.startsWith('/_next') ||
      url.pathname.startsWith('/favicon') ||
      url.pathname === '/icon.svg'
    ) {
      return NextResponse.next()
    }
    // Anything else under ups.sireapp.io routes to /ups
    if (!url.pathname.startsWith('/ups')) {
      url.pathname = '/ups' + (url.pathname === '/' ? '' : url.pathname)
      return NextResponse.rewrite(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
