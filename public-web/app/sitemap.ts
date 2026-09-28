import type { MetadataRoute } from 'next';
import { canonical, isIndexableBuild, services } from '@/lib/site';

export const dynamic = 'force-static';

const staticPaths = ['/', '/servicios/', '/como-funciona/', '/profesionales/', '/confianza/', '/proteccion/', '/cobertura/', '/ayuda/', '/terminos/', '/privacidad/'];

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isIndexableBuild()) return [];
  const paths = [...staticPaths, ...services.map((service) => `/servicios/${service.slug}/`)];
  return paths.map((path) => ({ url: canonical(path), changeFrequency: path === '/' ? 'weekly' : 'monthly', priority: path === '/' ? 1 : path.startsWith('/servicios/') ? 0.7 : 0.6 }));
}
