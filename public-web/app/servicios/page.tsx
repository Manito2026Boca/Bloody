import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ContentPage } from '@/components/content-page';
import { ServiceIcon } from '@/components/ui';
import { pageMetadata } from '@/lib/metadata';
import { services, site } from '@/lib/site';

export const metadata = pageMetadata('Servicios para el hogar', `Conocé los servicios publicados en MANITO para ${site.city}.`, '/servicios/');

export default function ServicesPage() {
  return <>
    <ContentPage breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Servicios' }]} eyebrow={site.city} title="Servicios para resolver cosas de todos los días." lead="Elegí un rubro para conocer cómo organizar una solicitud y acordar el trabajo." tone="mint">
      <p className="catalog-note">Los servicios están sujetos a cobertura y compatibilidad con cada solicitud. La disponibilidad puede variar según el lugar y el momento.</p>
    </ContentPage>
    <section className="catalog-wrap" aria-label="Catálogo de servicios"><div className="service-grid catalog-grid">
      {services.map((service) => <Link className="service-link" href={`/servicios/${service.slug}/`} key={service.slug} data-public-event="public_service_selected" data-service={service.slug}>
        <span className="service-symbol"><ServiceIcon service={service} /></span><span><span className="service-name">{service.name}</span><span className="service-summary">{service.summary}</span></span><ArrowRight className="service-arrow" size={17} aria-hidden="true" />
      </Link>)}
    </div></section>
  </>;
}
