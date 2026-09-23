import { ContentPage, PreviewNotice } from '@/components/content-page';
import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata('Términos', 'Información sobre los términos de uso de MANITO.', '/terminos/');

export default function TermsPage() {
  return <><ContentPage breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Términos' }]} eyebrow="Información legal" title="Términos de uso de MANITO." lead="Esta página está en preparación para la revisión de la web pública." tone="paper" />
    <div className="content-wrap legal-content"><PreviewNotice>El texto aprobado debe publicarse antes del lanzamiento. Esta página preliminar no reemplaza las condiciones vigentes que se muestran en MANITO.</PreviewNotice></div>
  </>;
}
