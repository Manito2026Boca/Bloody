import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  BrickWall, Bug, Flame, Hammer, KeyRound, Leaf, Lightbulb, Monitor, PaintRoller,
  Plug, Snowflake, Sparkles, Truck, Waves, Wrench, type LucideIcon,
} from 'lucide-react';
import { appIntentUrl, type PublicService } from '@/lib/site';

const iconMap: Record<PublicService['icon'], LucideIcon> = {
  wrench: Wrench, zap: Lightbulb, sparkles: Sparkles, paint: PaintRoller,
  snow: Snowflake, hammer: Hammer, leaf: Leaf, flame: Flame, key: KeyRound,
  plug: Plug, truck: Truck, monitor: Monitor, bug: Bug, brick: BrickWall, waves: Waves,
  home: Wrench,
};

export function ServiceIcon({ service, size = 23 }: { service: PublicService; size?: number }) {
  const Icon = iconMap[service.icon];
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}

export function AppLink({
  children, intent = 'request', service, className = 'button button-primary', id,
}: { children: ReactNode; intent?: 'request' | 'professional' | 'login'; service?: string; className?: string; id?: string }) {
  return (
    <a
      id={id}
      className={className}
      href={appIntentUrl(intent, service)}
      data-public-event={intent === 'professional' ? 'public_professional_cta' : 'public_cta_to_app'}
      data-intent={intent}
      data-service={service}
    >{children}</a>
  );
}

export function SectionIntro({ eyebrow, title, children, align = 'left' }: {
  eyebrow?: string; title: string; children?: ReactNode; align?: 'left' | 'center';
}) {
  return <div className={`section-intro ${align === 'center' ? 'is-centered' : ''}`}>
    {eyebrow && <p className="eyebrow">{eyebrow}</p>}
    <h2>{title}</h2>
    {children && <p className="section-lede">{children}</p>}
  </div>;
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return <nav className="breadcrumbs" aria-label="Estás en">
    <ol>{items.map((item, index) => <li key={`${item.label}-${index}`}>
      {index > 0 && <span aria-hidden="true">/</span>}
      {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
    </li>)}</ol>
  </nav>;
}
