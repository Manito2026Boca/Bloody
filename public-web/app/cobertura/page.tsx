import { ContentPage, ContentSection } from '@/components/content-page';
import { AppLink } from '@/components/ui';
import { pageMetadata } from '@/lib/metadata';
import { site } from '@/lib/site';

export const metadata = pageMetadata('Cobertura MANITO', `Información de cobertura de MANITO en ${site.city}.`, '/cobertura/');

export default function CoveragePage() {
  return <>
    <ContentPage breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Cobertura' }]} eyebrow="Zona inicial" title={`MANITO empieza en ${site.city}.`} lead="La compatibilidad se revisa para cada solicitud según el servicio, la ubicación y la modalidad." tone="mint">
      <AppLink>Buscar un profesional</AppLink>
    </ContentPage>
    <div className="content-wrap service-detail">
      <ContentSection title="La cobertura puede variar por solicitud."><p>La ciudad de referencia no significa que siempre haya profesionales compatibles para cada dirección, especialidad o momento. MANITO revisa la solicitud con los datos disponibles.</p></ContentSection>
      <ContentSection title="Tu lugar de trabajo es parte de la solicitud."><p>Confirmá la dirección o localidad del trabajo al empezar. La cobertura del profesional y la ubicación elegida se consideran para buscar compatibilidad.</p></ContentSection>
      <ContentSection title="Si no aparecen opciones."><p>Podés revisar los datos de la solicitud y cambiar lo que corresponda antes de volver a buscar.</p></ContentSection>
    </div>
  </>;
}
