import { ContentPage, PreviewNotice } from '@/components/content-page';
import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata('Privacidad', 'Información sobre privacidad y uso de datos en MANITO.', '/privacidad/');

export default function PrivacyPage() {
  return <><ContentPage breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Privacidad' }]} eyebrow="Información legal" title="Privacidad en MANITO." lead="Esta página está en preparación para la revisión de la web pública." tone="paper" />
    <div className="content-wrap legal-content"><PreviewNotice>El aviso aprobado debe publicarse antes del lanzamiento. Esta página preliminar no reemplaza la política de privacidad vigente que se muestra en MANITO.</PreviewNotice></div>
  </>;
}
