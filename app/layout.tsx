import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://bloody-eta.vercel.app'),
  title: 'MANITO',
  applicationName: 'MANITO',
  description:
    'Tu ayuda de confianza para contratar, seguir y gestionar servicios en Argentina.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/brand/manito-favicon.svg', type: 'image/svg+xml' },
      { url: '/brand/manito-favicon-64.png', sizes: '64x64', type: 'image/png' },
      { url: '/brand/manito-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/brand/manito-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'MANITO',
    statusBarStyle: 'default',
  },
  openGraph: {
    title: 'MANITO',
    description:
      'Tu ayuda de confianza para resolver servicios con profesionales verificados.',
    type: 'website',
    images: [{ url: '/brand/manito-social.png', width: 1200, height: 630, alt: 'MANITO' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0f4b3f',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
