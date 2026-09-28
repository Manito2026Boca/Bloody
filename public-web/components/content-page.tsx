import type { ReactNode } from 'react';
import { Breadcrumbs } from '@/components/ui';

export function ContentPage({
  breadcrumbs, eyebrow, title, lead, children, tone = 'mint',
}: {
  breadcrumbs: { label: string; href?: string }[];
  eyebrow: string;
  title: string;
  lead: string;
  children?: ReactNode;
  tone?: 'mint' | 'forest' | 'paper';
}) {
  return <>
    <div className="page-hero-wrap"><div className={`page-hero tone-${tone}`}>
      <Breadcrumbs items={breadcrumbs} />
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="page-lede">{lead}</p>
    </div></div>
    <div className="content-wrap">{children}</div>
  </>;
}

export function ContentSection({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return <section className="content-section" id={id}><h2>{title}</h2>{children}</section>;
}

export function PreviewNotice({ children }: { children: ReactNode }) {
  return <p className="preview-notice" role="note"><strong>Versión de preview.</strong> {children}</p>;
}
