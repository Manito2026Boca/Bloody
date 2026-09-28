import Image from 'next/image';
import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <Image src="/brand/manito-reference-horizontal.png" alt="MANITO" width={210} height={60} />
          <p>Un lugar para organizar el trabajo, desde la solicitud hasta el cierre.</p>
        </div>
        <div className="footer-links">
          <div><strong>MANITO</strong><Link href="/como-funciona/">Cómo funciona</Link><Link href="/confianza/">Confianza</Link><Link href="/proteccion/">Protección MANITO</Link></div>
          <div><strong>Explorá</strong><Link href="/servicios/">Servicios</Link><Link href="/cobertura/">Cobertura</Link><Link href="/profesionales/">Para profesionales</Link></div>
          <div><strong>Ayuda y condiciones</strong><Link href="/ayuda/">Ayuda</Link><Link href="/terminos/">Términos</Link><Link href="/privacidad/">Privacidad</Link></div>
        </div>
      </div>
      <div className="footer-bottom"><span>MANITO · Mar del Plata</span><span>El alcance y precio se acuerdan para cada trabajo.</span></div>
    </footer>
  );
}
