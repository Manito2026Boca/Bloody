import Link from 'next/link';
import {
  ArrowRight, ClipboardCheck, FileText, MessageCircle, ShieldCheck, Wrench,
} from 'lucide-react';
import { AppLink, SectionIntro, ServiceIcon } from '@/components/ui';
import { StickyAppCta } from '@/components/sticky-app-cta';
import { pageMetadata } from '@/lib/metadata';
import { services, site } from '@/lib/site';

export const metadata = pageMetadata('MANITO', site.description, '/');

const featuredSlugs = ['plomeria', 'electricidad', 'limpieza', 'pintura', 'aire', 'arreglos'];
const featuredServices = featuredSlugs.map((slug) => services.find((item) => item.slug === slug)!).filter(Boolean);

const faqs = [
  { question: '¿El precio que veo antes de contratar es definitivo?', answer: 'Una estimación orienta. El acuerdo con el profesional define el alcance y el precio; los adicionales aprobados se registran por separado.' },
  { question: '¿Tengo que instalar una aplicación?', answer: 'Podés empezar desde el navegador. La app reúne la solicitud y el seguimiento del trabajo.' },
  { question: '¿Cómo se registran los pagos?', answer: 'MANITO muestra el estado informado y confirmado según el flujo disponible para cada trabajo. La plataforma no funciona como una cuenta de depósito.' },
  { question: '¿Qué pasa si surge un problema?', answer: 'El trabajo conserva el acuerdo y el historial. Cuando corresponde, se puede iniciar una revisión según las condiciones de Protección MANITO.' },
];

export default function HomePage() {
  return <div className="home-page">
    <section className="hero-section">
      <div className="hero-copy">
        <p className="eyebrow light-eyebrow">Servicios para tu casa · {site.city}</p>
        <h1>Encontrá ayuda para resolver eso que quedó pendiente.</h1>
        <p className="hero-lede">Contá qué necesitás, acordá el trabajo y seguí cada paso desde MANITO.</p>
        <div className="hero-actions">
          <AppLink id="hero-primary">Buscar un profesional</AppLink>
          <Link className="button button-quiet-light" href="/como-funciona/">Cómo funciona <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
        <p className="hero-note">Podés empezar desde el navegador.</p>
      </div>
      <div className="hero-visual" aria-label="Ejemplo de cómo MANITO organiza un trabajo">
        <div className="visual-mark"><Wrench size={24} aria-hidden="true" /><span>Una solicitud clara</span></div>
        <div className="work-steps" aria-label="Solicitud, acuerdo y seguimiento">
          <div><span className="step-number">01</span><span>Necesidad</span><span className="step-state">Contada</span></div>
          <div><span className="step-number">02</span><span>Acuerdo</span><span className="step-state">A la vista</span></div>
          <div><span className="step-number">03</span><span>Trabajo</span><span className="step-state">En seguimiento</span></div>
        </div>
        <p className="visual-caption">Área de imagen editorial pendiente de fotografía real.</p>
      </div>
      <span className="hero-edge" aria-hidden="true" />
    </section>

    <section className="section section-services" aria-labelledby="services-heading">
      <div className="section-wrap">
        <SectionIntro eyebrow="Empezá por lo que necesitás" title="¿Qué necesitás resolver?">
          Elegí un servicio para conocer cómo podés organizar el trabajo.
        </SectionIntro>
        <div className="service-grid featured-grid">
          {featuredServices.map((service) => <Link className="service-link" href={`/servicios/${service.slug}/`} key={service.slug} data-public-event="public_service_selected" data-service={service.slug}>
            <span className="service-symbol"><ServiceIcon service={service} /></span>
            <span className="service-name">{service.name}</span>
            <ArrowRight className="service-arrow" size={17} aria-hidden="true" />
          </Link>)}
        </div>
        <Link className="text-link" href="/servicios/">Ver todos los servicios <ArrowRight size={17} aria-hidden="true" /></Link>
      </div>
    </section>

    <section className="section section-how" aria-labelledby="how-heading">
      <div className="section-wrap">
        <SectionIntro eyebrow="De principio a fin" title="Un solo lugar para organizar el trabajo." align="center" />
        <div className="how-grid">
          <article className="how-step"><span className="step-count">01</span><ClipboardCheck size={25} aria-hidden="true" /><h3>Contá qué necesitás</h3><p>Elegí el servicio, describí el problema y definí dónde y cuándo.</p></article>
          <article className="how-step"><span className="step-count">02</span><FileText size={25} aria-hidden="true" /><h3>Acordá antes de empezar</h3><p>Revisá el alcance y el precio con el profesional antes de iniciar.</p></article>
          <article className="how-step"><span className="step-count">03</span><MessageCircle size={25} aria-hidden="true" /><h3>Seguí cada paso</h3><p>Conversá sobre el trabajo y consultá su estado hasta el cierre.</p></article>
        </div>
      </div>
    </section>

    <section className="section section-modes" aria-labelledby="modes-heading">
      <div className="section-wrap modes-wrap">
        <SectionIntro eyebrow="A tu manera" title="Elegí cómo avanzar.">La modalidad aparece cuando empezás tu solicitud.</SectionIntro>
        <div className="mode-list">
          <div><span className="mode-dot mode-now" /><div><h3>Ahora</h3><p>Buscá alguien disponible lo antes posible.</p></div><span className="mode-arrow"><ArrowRight size={18} aria-hidden="true" /></span></div>
          <div><span className="mode-dot mode-scheduled" /><div><h3>Programar</h3><p>Elegí un día y horario.</p></div><span className="mode-arrow"><ArrowRight size={18} aria-hidden="true" /></span></div>
          <div><span className="mode-dot mode-quotes" /><div><h3>Presupuestar</h3><p>Recibí propuestas antes de contratar.</p></div><span className="mode-arrow"><ArrowRight size={18} aria-hidden="true" /></span></div>
        </div>
      </div>
    </section>

    <section className="section section-agreement" aria-labelledby="agreement-heading">
      <div className="section-wrap agreement-layout">
        <div className="agreement-copy">
          <p className="eyebrow">Claridad antes de empezar</p>
          <h2 id="agreement-heading">Lo acordado queda a la vista.</h2>
          <p>El alcance y el precio del trabajo se muestran como acuerdo. Si aparece un adicional, se conversa y se registra aparte.</p>
          <Link className="text-link" href="/como-funciona/">Conocé el proceso <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
        <div className="agreement-demo" aria-label="Demostración conceptual de un acuerdo MANITO">
          <div className="demo-top"><span>ACUERDO DE TRABAJO</span><span className="demo-status"><i /> Confirmado</span></div>
          <h3>Revisar pérdida bajo la pileta</h3>
          <div className="demo-row"><span>Alcance</span><strong>Revisión y reparación acordadas</strong></div>
          <div className="demo-row"><span>Precio acordado</span><strong>A la vista de ambas partes</strong></div>
          <div className="demo-separator" />
          <div className="demo-extra"><ShieldCheck size={19} aria-hidden="true" /><span>Los cambios se muestran por separado y requieren una decisión.</span></div>
          <p className="demo-caption">Ejemplo ilustrativo · no representa un trabajo ni un precio real.</p>
        </div>
      </div>
    </section>

    <section className="section section-trust" aria-labelledby="trust-heading">
      <div className="section-wrap trust-wrap">
        <SectionIntro eyebrow="Confianza con contexto" title="Más información para elegir. Más claridad para seguir.">
          Cada señal cuenta qué información hay disponible y qué significa para tu trabajo.
        </SectionIntro>
        <div className="trust-items">
          <article><span className="trust-number">01</span><h3>Información del profesional</h3><p>Consultá el perfil y el estado de la documentación que se informa en MANITO.</p></article>
          <article><span className="trust-number">02</span><h3>Acuerdo registrado</h3><p>Alcance y precio quedan disponibles para Cliente y Profesional.</p></article>
          <article><span className="trust-number">03</span><h3>Historial del trabajo</h3><p>Conversaciones y pasos del trabajo se consultan desde su contexto.</p></article>
        </div>
        <div className="trust-links"><Link className="text-link" href="/confianza/">Cómo se presenta la información <ArrowRight size={17} aria-hidden="true" /></Link><Link className="text-link" href="/proteccion/">Conocer Protección MANITO <ArrowRight size={17} aria-hidden="true" /></Link></div>
      </div>
    </section>

    <section className="professional-band" aria-labelledby="professional-heading">
      <div className="professional-band-mark"><Wrench size={26} aria-hidden="true" /></div>
      <div><p className="eyebrow light-eyebrow">Para quienes trabajan por su cuenta</p><h2 id="professional-heading">Tu oficio, mejor organizado.</h2><p>Recibí solicitudes compatibles, respondé propuestas y organizá tus trabajos desde MANITO.</p></div>
      <AppLink intent="professional" className="button button-light">Quiero trabajar con MANITO</AppLink>
    </section>

    <section className="section section-faq" aria-label="Preguntas frecuentes">
      <div className="section-wrap faq-layout">
        <SectionIntro eyebrow="Antes de empezar" title="Preguntas frecuentes." />
        <div className="faq-list">{faqs.map((faq) => <details key={faq.question}><summary>{faq.question}<span aria-hidden="true">+</span></summary><p>{faq.answer}</p></details>)}</div>
      </div>
    </section>

    <section className="final-cta" aria-labelledby="final-cta-heading">
      <p className="eyebrow light-eyebrow">MANITO · {site.city}</p>
      <h2 id="final-cta-heading">Empezá por contar qué necesitás.</h2>
      <AppLink id="final-primary" className="button button-light">Buscar un profesional</AppLink>
    </section>
    <StickyAppCta />
  </div>;
}
