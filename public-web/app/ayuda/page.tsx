import Link from 'next/link';
import { ContentPage, ContentSection } from '@/components/content-page';
import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata('Ayuda', 'Respuestas iniciales sobre solicitudes, acuerdos y trabajos en MANITO.', '/ayuda/');

export default function HelpPage() {
  return <>
    <ContentPage breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Ayuda' }]} eyebrow="Estamos para orientarte" title="¿En qué momento del trabajo estás?" lead="Estas respuestas te ayudan a ubicar el siguiente paso en MANITO." tone="mint" />
    <div className="content-wrap service-detail">
      <ContentSection title="Todavía no publiqué una solicitud."><p>Elegí el servicio, contá qué necesitás y completá la información del lugar. Antes de publicar, vas a poder revisar los datos.</p></ContentSection>
      <ContentSection title="Estoy esperando una respuesta."><p>Consultá el estado de la solicitud. Si no hay opciones compatibles, podés revisar la búsqueda disponible en la app.</p></ContentSection>
      <ContentSection title="Ya tengo un trabajo en curso."><p>Abrí el trabajo para consultar el estado, el acuerdo y la conversación asociada cuando estén disponibles.</p></ContentSection>
      <ContentSection title="Quiero revisar Protección MANITO."><p>Las condiciones y el estado aplicables se consultan desde el trabajo. <Link href="/proteccion/">Leé cómo funciona Protección MANITO.</Link></p></ContentSection>
    </div>
  </>;
}
