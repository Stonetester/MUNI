import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ViewModeProvider } from '@/lib/viewMode'

export const metadata: Metadata = {
  title: 'Muni',
  description: 'Personal finance tracking and forecasting',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MUNI',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#10B981',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-text-primary antialiased">
        <ViewModeProvider>
          {children}
        </ViewModeProvider>
      </body>
    </html>
  )
}
