import type { Metadata } from 'next'

// Favicon comes from the colocated app/ups/icon.png
// (Next.js App Router auto-detects icon.png/jpg/svg inside a route segment.)
export const metadata: Metadata = {
  title: 'UPS x Sire Contract',
}

export default function UpsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
