import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { isIndexableBuild, site } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: 'MANITO | Servicios para tu casa en Mar del Plata', template: '%s' },
  description: site.description,
  applicationName: 'MANITO',
  icons: {
    icon: [
      { url: '/brand/manito-favicon-64.png', sizes: '64x64', type: 'image/png' },
      { url: '/brand/manito-icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  robots: isIndexableBuild() ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: {
    type: 'website', locale: 'es_AR', siteName: 'MANITO',
    title: 'MANITO | Servicios para tu casa en Mar del Plata',
    description: site.description,
    images: [{ url: '/brand/manito-reference-horizontal.png', width: 980, height: 280, alt: 'MANITO' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, themeColor: '#07514d',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-AR"><body>
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <SiteHeader />
    <main id="contenido">{children}</main>
    <SiteFooter />
  </body></html>;
}
