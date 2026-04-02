import type { Metadata } from 'next'
import { Syne, DM_Sans, DM_Mono } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import DevPanel from '@/components/DevPanel'

const syne = Syne({ subsets:['latin'], variable:'--font-syne', weight:['400','500','600','700','800'], display:'swap' })
const dmSans = DM_Sans({ subsets:['latin'], variable:'--font-dm-sans', weight:['300','400','500'], display:'swap' })
const dmMono = DM_Mono({ subsets:['latin'], variable:'--font-dm-mono', weight:['400','500'], display:'swap' })

export const metadata: Metadata = { title: 'Ethan Admin' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable} ${dmMono.variable}`}>
      <body>
        <div style={{ display:'flex', minHeight:'100vh' }}>
          <Sidebar />
          <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
            {children}
          </div>
        </div>
        <DevPanel />
      </body>
    </html>
  )
}
