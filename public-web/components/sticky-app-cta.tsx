'use client';

import { useEffect, useState } from 'react';
import { appIntentUrl } from '@/lib/site';

export function StickyAppCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const anchor = document.getElementById('hero-primary');
    if (!anchor) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), { threshold: 0.05 });
    observer.observe(anchor);
    return () => observer.disconnect();
  }, []);

  return <a
    className={`mobile-sticky-cta${visible ? ' is-visible' : ''}`}
    href={appIntentUrl('request')}
    tabIndex={visible ? 0 : -1}
    aria-hidden={!visible}
    data-public-event="public_cta_to_app"
    data-intent="request"
  >Buscar un profesional</a>;
}
