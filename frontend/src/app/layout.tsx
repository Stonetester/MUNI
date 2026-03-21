import type { Metadata, Viewport } from 'next'
import { DM_Sans, DM_Serif_Display, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { ViewModeProvider } from '@/lib/viewMode'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const dmSerif = DM_Serif_Display({
  weight: ['400'],
  subsets: ['latin'],
  variable: '--font-dm-serif',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f1117',
}

export const metadata: Metadata = {
  title: 'Muni',
  description: 'Personal finance forecasting tool',
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': 'Muni',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`dark ${dmSans.variable} ${dmSerif.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-background text-text-primary antialiased font-sans">
        <ViewModeProvider>
          {children}
        </ViewModeProvider>
      </body>
    </html>
  )
}
