import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#0f141b',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
