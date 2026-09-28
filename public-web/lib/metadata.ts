import type { Metadata } from 'next';
import { canonical, isIndexableBuild, site } from './site';

export function pageMetadata(title: string, description: string, path: string): Metadata {
  const fullTitle = title === 'MANITO' ? title : `${title} | MANITO`;
  const indexable = isIndexableBuild();
  return {
    title: fullTitle,
    description,
    alternates: { canonical: canonical(path) },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      type: 'website',
      locale: 'es_AR',
      siteName: site.name,
      title: fullTitle,
      description,
      url: canonical(path),
      images: [{ url: '/brand/manito-reference-horizontal.png', width: 980, height: 280, alt: 'MANITO' }],
    },
    twitter: { card: 'summary_large_image', title: fullTitle, description },
  };
}
