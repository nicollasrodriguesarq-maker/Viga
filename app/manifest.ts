import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'VIGA — Gestão Integrada',
    short_name: 'VIGA',
    description: 'Sistema de gestão para construção civil',
    start_url: '/m',
    display: 'standalone',
    background_color: '#0f141b',
    theme_color: '#0f141b',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
