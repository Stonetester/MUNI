import type { Metadata } from 'next'
import './globals.css'
import { ViewModeProvider } from '@/lib/viewMode'

export const metadata: Metadata = {
  title: 'Muni',
  description: 'Personal finance forecasting tool',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
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
