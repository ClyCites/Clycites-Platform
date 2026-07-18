import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ClyCites Collection',
    short_name: 'ClyCites',
    description: 'Offline coffee collection and verifiable farmer receipts.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f7f4ec',
    theme_color: '#153f2e',
    orientation: 'portrait',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
