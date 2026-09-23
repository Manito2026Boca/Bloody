import { AppLink, SectionIntro } from '@/components/ui';
import { ContentPage } from '@/components/content-page';
import { pageMetadata } from '@/lib/metadata';
import { site } from '@/lib/site';

export const metadata = pageMetadata('Trabajar como profesional', 'Conocé cómo MANITO organiza solicitudes, propuestas y trabajos para profesionales en Mar del Plata.', '/profesionales/');

const benefits = [
  ['01', 'Revisá solicitudes', 'Consultá los datos disponibles para decidir si una oportunidad corresponde a tus servicios y tu zona.'],
  ['02', 'Respondé según la modalidad', 'Aceptá una solicitud o enviá una propuesta cuando el flujo lo permita. Una propuesta puede incluir alcance, componentes y condiciones.'],
  ['03', 'Organizá los trabajos', 'Consultá los pasos, la agenda y la conversación asociada a cada trabajo desde MANITO.'],
];

export default function ProfessionalsPage() {
  return <>
    <ContentPage breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Para profesionales' }]} eyebrow="Para quienes trabajan por su cuenta" title="Trabajos y organización para profesionales." lead="Recibí solicitudes compatibles, respondé propuestas y organizá tus trabajos en MANITO." tone="forest">
      <div className="hero-actions"><AppLink intent="professional" className="button button-light">Crear mi perfil profesional</AppLink><AppLink intent="professional" className="button button-quiet-light">Ya tengo cuenta</AppLink></div>
    </ContentPage>
    <section className="section"><div className="section-wrap">
      <SectionIntro eyebrow="Tu trabajo, con contexto" title="Desde la solicitud hasta el cierre." />
      <div className="how-grid pro-how-grid">{benefits.map(([number, title, text]) => <article className="how-step" key={number}><span className="step-count">{number}</span><h2>{title}</h2><p>{text}</p></article>)}</div>
    </div></section>
    <section className="section section-modes"><div className="section-wrap modes-wrap"><div><p className="eyebrow">Incorporación profesional</p><h2>Completá tu información para iniciar la revisión.</h2><p>Crear un perfil no equivale a estar habilitado para operar. MANITO informa el estado del proceso y los pasos pendientes cuando corresponden.</p><AppLink intent="professional">Crear mi perfil profesional</AppLink></div><div className="process-list compact-process"><article><span>01</span><div><h3>Completá el perfil</h3><p>Contanos sobre vos y los servicios que ofrecés.</p></div></article><article><span>02</span><div><h3>Agregá la información solicitada</h3><p>La documentación se presenta según los requisitos del proceso vigente.</p></div></article><article><span>03</span><div><h3>Consultá el estado</h3><p>La revisión puede requerir una acción antes de operar.</p></div></article></div></div></section>
  </>;
}
