import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Roboto, Roboto_Mono } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import DevPanel from '@/components/DevPanel'

// Body stack — Roboto is Sire's production body font.
// CSS-var names kept backward-compatible (--font-dm-sans, --font-syne, --font-dm-mono)
// via aliases in globals.css so legacy pages keep working.
const roboto = Roboto({
  subsets: ['latin'],
  variable: '--font-roboto',
  weight: ['300', '400', '500', '700'],
  display: 'swap',
})

const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  variable: '--font-roboto-mono',
  weight: ['400', '500'],
  display: 'swap',
})

export const metadata: Metadata = { title: 'Ethan Admin' }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers()
  const pathname = h.get('x-pathname') || ''
  const publicHost = h.get('x-public-host') === '1'

  // /ups is partner-facing — render without admin chrome.
  const isPublic = publicHost || pathname.startsWith('/ups')

  return (
    <html lang="en" className={`${roboto.variable} ${robotoMono.variable}`}>
      <body>
        {isPublic ? (
          children
        ) : (
          <>
            <div style={{ display: 'flex', minHeight: '100vh' }}>
              <Sidebar />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                {children}
              </div>
            </div>
            <DevPanel />
          </>
        )}
      </body>
    </html>
  )
}
