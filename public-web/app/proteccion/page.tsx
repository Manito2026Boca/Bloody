import { ContentPage, ContentSection } from '@/components/content-page';
import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata('Protección MANITO', 'Conocé el registro y el proceso de revisión asociado a Protección MANITO.', '/proteccion/');

export default function ProtectionPage() {
  return <>
    <ContentPage breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Protección MANITO' }]} eyebrow="Registro y revisión" title="El acuerdo y el historial, a mano cuando los necesitás." lead="MANITO conserva información del trabajo para consultar lo acordado y gestionar reclamos cuando corresponda." tone="forest" />
    <div className="content-wrap service-detail">
      <ContentSection title="Un registro asociado al trabajo."><p>El trabajo conserva su acuerdo y su historial en MANITO. Después de la finalización, puede quedar disponible una constancia para iniciar el flujo de Protección, según el estado y las condiciones aplicables.</p></ContentSection>
      <ContentSection title="Un reclamo puede requerir revisión."><p>La solicitud de revisión sigue las condiciones vigentes y el caso concreto. MANITO evalúa la información disponible; el resultado no está garantizado.</p></ContentSection>
      <ContentSection title="Consultá las condiciones del caso."><p>La disponibilidad, la ventana para iniciar un reclamo y los pasos que corresponden dependen de las condiciones aplicables al trabajo. Revisalas desde el propio pedido en MANITO.</p></ContentSection>
    </div>
  </>;
}
