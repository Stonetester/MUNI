import type { Metadata } from 'next'
import './globals.css'

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
        {children}
      </body>
    </html>
  )
}
