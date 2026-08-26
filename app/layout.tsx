import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MANITO',
  applicationName: 'MANITO',
  description:
    'Contratá, seguí y gestioná servicios para el hogar en Argentina.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
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
      'El flujo tipo delivery para resolver servicios del hogar con profesionales verificados.',
    type: 'website',
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
