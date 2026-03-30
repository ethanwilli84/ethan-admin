import type { Metadata } from 'next'
import { Geist_Mono } from 'next/font/google'
import './globals.css'

const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'Ethan Admin',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${mono.variable} bg-[#0a0a0a] text-white min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
