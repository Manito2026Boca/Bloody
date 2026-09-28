import Link from 'next/link';

export default function NotFound() {
  return <section className="not-found"><p className="eyebrow">404 · Página no encontrada</p><h1>No encontramos esta página.</h1><p>Volvé al inicio o explorá los servicios de MANITO.</p><div><Link className="button button-primary" href="/">Ir al inicio</Link><Link className="text-link" href="/servicios/">Ver servicios</Link></div></section>;
}
