import { site } from '@/lib/site';

export const metadata = { title: 'Administración MANITO', robots: { index: false, follow: false } };

export default function LegacyAdminPage() {
  return <section className="section"><div className="section-wrap">
    <h1>El panel de administración se mudó</h1>
    <p>Entrá a MANITO con tu cuenta para continuar.</p>
    <a className="button" href={new URL('/admin', site.appUrl).toString()}>Abrir administración</a>
  </div></section>;
}
