import type { MetadataRoute } from 'next';
import { isIndexableBuild, site } from '@/lib/site';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  if (!isIndexableBuild()) return { rules: { userAgent: '*', disallow: '/' } };
  return { rules: { userAgent: '*', allow: '/' }, sitemap: new URL('/sitemap.xml', site.url).toString() };
}
