import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'UPS x Sire Contract',
  icons: {
    icon: [
      {
        url: 'https://sireship.com/assets/images/logo.png',
        type: 'image/png',
      },
    ],
    shortcut: 'https://sireship.com/assets/images/logo.png',
    apple: 'https://sireship.com/assets/images/logo.png',
  },
}

export default function UpsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
