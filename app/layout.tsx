import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Video Downloader',
  description: 'Toplu video indirme aracı',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="tr">
      <body style={{
        margin: 0,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        backgroundColor: '#0a0a0a',
        color: '#fff',
        minHeight: '100vh'
      }}>
        {children}
      </body>
    </html>
  )
}
