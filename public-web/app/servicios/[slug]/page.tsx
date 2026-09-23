import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppLink } from '@/components/ui';
import { ContentPage, ContentSection } from '@/components/content-page';
import { pageMetadata } from '@/lib/metadata';
import { services, serviceBySlug, site } from '@/lib/site';

export const dynamicParams = false;
export function generateStaticParams() { return services.map(({ slug }) => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const service = serviceBySlug(slug);
  if (!service) return {};
  return pageMetadata(`${service.name} en ${site.city}`, service.summary, `/servicios/${service.slug}/`);
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = serviceBySlug(slug);
  if (!service) notFound();
  return <>
    <ContentPage breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Servicios', href: '/servicios/' }, { label: service.name }]} eyebrow={`${service.category} · ${site.city}`} title={`${service.name} para tu casa.`} lead={service.summary} tone="mint">
      <AppLink service={service.slug}>{service.name === 'Gasista' ? 'Buscar un profesional' : `Buscar ${service.name.toLowerCase()}`}</AppLink>
    </ContentPage>
    <div className="content-wrap service-detail">
      <ContentSection title="Empezá por contar qué necesitás."><p>{service.detail}</p><p>Si tenés una foto que ayude a explicar el problema, podés agregarla al iniciar la solicitud en MANITO.</p></ContentSection>
      <ContentSection title="Acordá el trabajo antes de empezar."><p>La solicitud describe la necesidad inicial. El acuerdo con el profesional define el alcance y el precio del trabajo. Los materiales y las condiciones relevantes se aclaran antes de iniciar; un adicional aprobado queda registrado por separado.</p></ContentSection>
      <ContentSection title="¿Cómo querés avanzar?"><p>Podés buscar a alguien disponible lo antes posible, elegir una fecha para programar o recibir propuestas antes de contratar. La disponibilidad depende de la compatibilidad de cada solicitud.</p></ContentSection>
      <AppLink service={service.slug}>Empezar una solicitud</AppLink>
    </div>
  </>;
}
