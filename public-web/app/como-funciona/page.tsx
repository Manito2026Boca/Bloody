import { AppLink, SectionIntro } from '@/components/ui';
import { ContentPage } from '@/components/content-page';
import { pageMetadata } from '@/lib/metadata';
import { site } from '@/lib/site';

export const metadata = pageMetadata('Cómo funciona MANITO', 'Conocé cómo se organiza una solicitud, el acuerdo y el seguimiento del trabajo en MANITO.', '/como-funciona/');

const steps = [
  ['01', 'Contá qué necesitás', 'Elegí un servicio, describí el problema y confirmá el lugar del trabajo. Después elegís si querés buscar ahora, programar o recibir propuestas.'],
  ['02', 'Revisá cómo avanzar', 'Según la modalidad, podés recibir una respuesta, elegir una fecha o comparar propuestas antes de decidir. Una solicitud todavía no es un contrato.'],
  ['03', 'Acordá antes de empezar', 'Cliente y Profesional consultan el alcance y el precio acordados. El detalle relevante, como los materiales, se aclara para ese trabajo.'],
  ['04', 'Seguí el trabajo', 'La conversación, los cambios aprobados y los pasos de ejecución permanecen asociados al trabajo.'],
  ['05', 'Cerrá con el historial disponible', 'Al finalizar, el trabajo conserva su registro y permite completar las acciones que correspondan a su estado.'],
];

export default function HowItWorksPage() {
  return <>
    <ContentPage breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Cómo funciona' }]} eyebrow="De principio a fin" title="El trabajo sigue en MANITO después de encontrar a alguien." lead="La solicitud, el acuerdo y el seguimiento se organizan en un mismo lugar." tone="forest">
      <AppLink>Buscar un profesional</AppLink>
    </ContentPage>
    <section className="section steps-section"><div className="section-wrap">
      <SectionIntro title="Cada momento tiene su lugar." />
      <div className="process-list">{steps.map(([number, title, text]) => <article key={number}><span>{number}</span><div><h2>{title}</h2><p>{text}</p></div></article>)}</div>
      <div className="process-modes"><h2>Elegí cómo avanzar</h2><div className="process-mode-grid"><article><h3>Ahora</h3><p>Buscá alguien disponible lo antes posible.</p></article><article><h3>Programar</h3><p>Elegí un día y horario.</p></article><article><h3>Presupuestar</h3><p>Recibí propuestas antes de contratar.</p></article></div></div>
    </div></section>
  </>;
}
