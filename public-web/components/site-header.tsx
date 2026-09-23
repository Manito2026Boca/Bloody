'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppLink } from '@/components/ui';

const links = [
  { href: '/servicios/', label: 'Servicios' },
  { href: '/como-funciona/', label: 'Cómo funciona' },
  { href: '/confianza/', label: 'Confianza' },
  { href: '/profesionales/', label: 'Para profesionales' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('manito:public-analytics', {
      detail: { name: 'public_page_view', path: pathname },
    }));
  }, [pathname]);

  useEffect(() => {
    const track = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLElement>('[data-public-event]');
      if (!link) return;
      window.dispatchEvent(new CustomEvent('manito:public-analytics', {
        detail: {
          name: link.dataset.publicEvent,
          service: link.dataset.service || undefined,
          intent: link.dataset.intent || undefined,
        },
      }));
    };
    document.addEventListener('click', track);
    return () => document.removeEventListener('click', track);
  }, []);

  function closeMenu() {
    setOpen(false);
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand-link" aria-label="MANITO, inicio">
          <Image src="/brand/manito-reference-horizontal.png" alt="MANITO" width={245} height={70} priority />
        </Link>
        <nav className={`main-nav${open ? ' is-open' : ''}`} id="public-navigation" aria-label="Navegación principal">
          {links.map((link) => <Link key={link.href} href={link.href} onClick={closeMenu}>{link.label}</Link>)}
          <AppLink intent="login" className="nav-login mobile-login">Entrar</AppLink>
        </nav>
        <div className="header-actions">
          <AppLink intent="login" className="nav-login desktop-login">Entrar</AppLink>
          <button
            className="menu-toggle"
            type="button"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-controls="public-navigation"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >{open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}</button>
        </div>
      </div>
    </header>
  );
}
