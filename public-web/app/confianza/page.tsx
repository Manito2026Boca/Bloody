import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ContentPage, ContentSection } from '@/components/content-page';
import { pageMetadata } from '@/lib/metadata';
import { site } from '@/lib/site';

export const metadata = pageMetadata('Confianza e información', 'Qué información muestra MANITO sobre perfiles, acuerdos e historial de un trabajo.', '/confianza/');

export default function TrustPage() {
  return <>
    <ContentPage breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Confianza' }]} eyebrow="Información con contexto" title="Saber qué estás viendo también da confianza." lead="MANITO presenta información del perfil, el acuerdo y el historial para acompañar cada trabajo." tone="mint" />
    <div className="content-wrap service-detail">
      <ContentSection title="Identidad y documentación son estados distintos."><p>La información de perfil y el estado de los documentos se presentan por separado. Cada etiqueta indica únicamente lo que describe ese estado en MANITO.</p></ContentSection>
      <ContentSection title="Una profesión no se infiere de una insignia."><p>Una señal de identidad o documentación no demuestra por sí sola una matrícula, certificación, habilitación profesional ni resultado garantizado. La información específica se muestra cuando corresponde al servicio y está disponible.</p></ContentSection>
      <ContentSection title="El acuerdo queda asociado al trabajo."><p>Cliente y Profesional consultan el alcance y el precio acordados. Los cambios aprobados, como un adicional, quedan registrados separadamente.</p></ContentSection>
      <ContentSection title="La reputación necesita contexto."><p>Las calificaciones se vinculan a la experiencia en MANITO. No publicamos un ranking ni presentamos valoraciones sin contexto como garantía de un resultado futuro.</p></ContentSection>
      <div className="related-links"><Link className="text-link" href="/proteccion/">Conocer Protección MANITO <ArrowRight size={17} aria-hidden="true" /></Link><Link className="text-link" href="/como-funciona/">Ver cómo funciona <ArrowRight size={17} aria-hidden="true" /></Link></div>
    </div>
  </>;
}
