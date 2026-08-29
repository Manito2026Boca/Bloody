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
      { url: '/favicon.png', sizes: '64x64', type: 'image/png' },
      { url: '/logo-icon.png', sizes: '512x512', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
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
    images: [{ url: '/logo-main.jpg', width: 560, height: 584, alt: 'MANITO - Tu ayuda de confianza' }],
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
