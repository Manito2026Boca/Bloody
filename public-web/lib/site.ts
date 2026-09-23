export const site = {
  name: 'MANITO',
  url: process.env.PUBLIC_SITE_URL || 'https://manitoapp.com.ar',
  appUrl: process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://bloody-eta.vercel.app',
  city: 'Mar del Plata',
  description:
    'Contá qué necesitás, acordá el trabajo y seguí cada paso desde MANITO.',
};

export function appIntentUrl(intent: 'request' | 'professional' | 'login', service?: string) {
  const target = new URL(site.appUrl);
  target.searchParams.set('public_intent', intent);
  target.searchParams.set('public_source', 'web');
  if (service) target.searchParams.set('service', service);
  return target.toString();
}

export function canonical(path: string) {
  return new URL(path, site.url).toString();
}

export function isIndexableBuild() {
  return process.env.VERCEL_ENV === 'production' && process.env.PUBLIC_WEB_INDEXABLE === 'true';
}

export type PublicService = {
  slug: string;
  name: string;
  category: string;
  summary: string;
  detail: string;
  icon: 'wrench' | 'zap' | 'sparkles' | 'paint' | 'snow' | 'hammer' | 'leaf' | 'flame' | 'key' | 'plug' | 'truck' | 'monitor' | 'bug' | 'brick' | 'waves' | 'home';
};

export const services: PublicService[] = [
  { slug: 'plomeria', name: 'Plomería', category: 'Agua e instalaciones', summary: 'Pérdidas, griferías e instalaciones de agua.', detail: 'Describí qué está pasando y qué necesitás revisar. El profesional puede conversar el alcance y dejar el precio acordado antes de empezar.', icon: 'wrench' },
  { slug: 'electricidad', name: 'Electricidad', category: 'Instalaciones del hogar', summary: 'Instalaciones y problemas eléctricos del hogar.', detail: 'Contá qué necesitás resolver y agregá el contexto que ayude a entender el trabajo. El alcance final se acuerda antes de iniciar.', icon: 'zap' },
  { slug: 'limpieza', name: 'Limpieza', category: 'Hogar', summary: 'Encontrá ayuda para tareas de limpieza.', detail: 'Detallá los ambientes y tareas que querés incluir. El alcance y las condiciones se conversan en la solicitud.', icon: 'sparkles' },
  { slug: 'gas', name: 'Gasista', category: 'Instalaciones del hogar', summary: 'Ayuda para trabajos relacionados con gas.', detail: 'Explicá la necesidad con claridad. La información del perfil y la documentación disponible se presentan según el estado informado en MANITO.', icon: 'flame' },
  { slug: 'cerrajeria', name: 'Cerrajería', category: 'Hogar', summary: 'Ayuda para resolver trabajos de cerrajería.', detail: 'Describí el problema y el lugar del trabajo. El profesional puede revisar la solicitud antes de aceptar o enviar una propuesta.', icon: 'key' },
  { slug: 'pintura', name: 'Pintura', category: 'Hogar', summary: 'Organizá un trabajo de pintura con alcance claro.', detail: 'Indicá qué espacios querés pintar y cualquier detalle relevante. Materiales y tareas incluidos deben quedar aclarados en el acuerdo.', icon: 'paint' },
  { slug: 'jardin', name: 'Jardinería', category: 'Exterior', summary: 'Ayuda para tareas de jardín y exterior.', detail: 'Contá el estado del espacio y qué tareas querés resolver. La propuesta o el acuerdo especifica el alcance de cada trabajo.', icon: 'leaf' },
  { slug: 'arreglos', name: 'Arreglos', category: 'Hogar', summary: 'Reparaciones y tareas de mantenimiento del hogar.', detail: 'Describí el arreglo con el mayor contexto útil. Si hay varias tareas, se pueden detallar por separado para acordarlas con claridad.', icon: 'hammer' },
  { slug: 'aire', name: 'Aire acondicionado', category: 'Instalaciones del hogar', summary: 'Ayuda para trabajos de aire acondicionado.', detail: 'Indicá qué equipo o situación requiere atención. El trabajo específico y sus condiciones se confirman en la solicitud.', icon: 'snow' },
  { slug: 'electro', name: 'Electrodomésticos', category: 'Hogar', summary: 'Ayuda con trabajos de electrodomésticos.', detail: 'Contá qué equipo tenés y qué problema presenta. Evitá incluir datos personales en una descripción pública.', icon: 'plug' },
  { slug: 'mudanzas', name: 'Mudanzas', category: 'Traslados', summary: 'Organizá una mudanza o un traslado.', detail: 'Indicá el tipo de traslado y los detalles que ayuden a describirlo. La propuesta debe dejar claro qué tareas contempla.', icon: 'truck' },
  { slug: 'carpinteria', name: 'Carpintería', category: 'Hogar', summary: 'Trabajos de carpintería y madera.', detail: 'Describí la reparación o el trabajo que buscás. Si hay materiales involucrados, acordá expresamente cómo se consideran.', icon: 'hammer' },
  { slug: 'fumigacion', name: 'Fumigación', category: 'Hogar', summary: 'Ayuda para trabajos de fumigación.', detail: 'Explicá el contexto y el lugar del trabajo. Las condiciones concretas deben quedar conversadas con el profesional.', icon: 'bug' },
  { slug: 'tecnologia', name: 'PC y tecnología', category: 'Tecnología', summary: 'Ayuda con computadoras y tecnología.', detail: 'Describí el equipo y el inconveniente sin publicar contraseñas, códigos ni información privada.', icon: 'monitor' },
  { slug: 'albanileria', name: 'Albañilería', category: 'Hogar', summary: 'Trabajos de albañilería y construcción.', detail: 'Contá qué espacio requiere trabajo y qué querés resolver. El alcance, los materiales y el precio se aclaran antes de iniciar.', icon: 'brick' },
  { slug: 'pileta', name: 'Piletas', category: 'Exterior', summary: 'Ayuda para trabajos relacionados con piletas.', detail: 'Describí la tarea y el estado actual de la pileta. El profesional puede revisar la solicitud y definir el alcance a acordar.', icon: 'waves' },
];

export function serviceBySlug(slug: string) {
  return services.find((service) => service.slug === slug);
}
