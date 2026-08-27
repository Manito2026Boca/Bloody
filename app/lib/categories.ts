import type { ServiceMode } from './types';

export type CategoryHeuristic = {
  slug: string;
  name: string;
  icon: string;
  preferredMode: ServiceMode;
  keywords: string[];
};

export const CATEGORY_HEURISTICS: CategoryHeuristic[] = [
  {
    slug: 'plomeria',
    name: 'Plomeria',
    icon: 'Droplets',
    preferredMode: 'immediate',
    keywords: [
      'agua',
      'canilla',
      'cocina',
      'destapar',
      'flexible',
      'inodoro',
      'pierde',
      'plomero',
      'sanitario',
      'termotanque',
    ],
  },
  {
    slug: 'electricidad',
    name: 'Electricidad',
    icon: 'Zap',
    preferredMode: 'immediate',
    keywords: [
      'cable',
      'corto',
      'electricidad',
      'enchufe',
      'habitacion',
      'luz',
      'llave',
      'no tengo',
      'termica',
    ],
  },
  {
    slug: 'gas',
    name: 'Gasista',
    icon: 'Flame',
    preferredMode: 'scheduled',
    keywords: ['calefon', 'estufa', 'gas', 'gasista', 'matricula', 'olor'],
  },
  {
    slug: 'cerrajeria',
    name: 'Cerrajeria',
    icon: 'KeyRound',
    preferredMode: 'immediate',
    keywords: ['afuera', 'cerradura', 'cerrajero', 'llave', 'puerta'],
  },
  {
    slug: 'limpieza',
    name: 'Limpieza',
    icon: 'Sparkles',
    preferredMode: 'scheduled',
    keywords: ['limpieza', 'limpiar', 'profunda', 'semanal'],
  },
  {
    slug: 'pintura',
    name: 'Pintura',
    icon: 'Paintbrush',
    preferredMode: 'quote',
    keywords: ['departamento', 'pared', 'pintar', 'pintura', 'techo'],
  },
  {
    slug: 'jardin',
    name: 'Jardinería',
    icon: 'Flower2',
    preferredMode: 'scheduled',
    keywords: ['cesped', 'jardin', 'jardineria', 'plantas', 'poda'],
  },
  {
    slug: 'aire',
    name: 'Aire acondicionado',
    icon: 'Wind',
    preferredMode: 'scheduled',
    keywords: ['aire', 'split', 'frio', 'calor', 'filtro'],
  },
  {
    slug: 'electro',
    name: 'Electrodomésticos',
    icon: 'WashingMachine',
    preferredMode: 'scheduled',
    keywords: ['heladera', 'lavarropas', 'microondas', 'no enfria'],
  },
  {
    slug: 'carpinteria',
    name: 'Carpinteria',
    icon: 'Hammer',
    preferredMode: 'quote',
    keywords: ['madera', 'mueble', 'placard', 'puerta', 'carpintero'],
  },
  {
    slug: 'albanileria',
    name: 'Albanileria',
    icon: 'BrickWall',
    preferredMode: 'quote',
    keywords: ['albanil', 'pared', 'reforma', 'revoque', 'obra'],
  },
  {
    slug: 'mudanzas',
    name: 'Mudanzas',
    icon: 'Truck',
    preferredMode: 'quote',
    keywords: ['camion', 'flete', 'mudanza', 'mudar'],
  },
  {
    slug: 'fumigacion',
    name: 'Fumigacion',
    icon: 'Bug',
    preferredMode: 'scheduled',
    keywords: ['cucaracha', 'fumigar', 'hormigas', 'insectos', 'ratas'],
  },
  {
    slug: 'tecnologia',
    name: 'PC y tecnología',
    icon: 'MonitorCog',
    preferredMode: 'scheduled',
    keywords: ['computadora', 'internet', 'notebook', 'pc', 'wifi'],
  },
  {
    slug: 'pileta',
    name: 'Piletas',
    icon: 'Waves',
    preferredMode: 'scheduled',
    keywords: ['bomba', 'cloro', 'pileta', 'piscina', 'verde'],
  },
  {
    slug: 'mecanica_automotor',
    name: 'Mecánica automotor',
    icon: 'CarFront',
    preferredMode: 'scheduled',
    keywords: ['auto', 'automotor', 'bateria', 'frenos', 'mecanico', 'motor', 'service'],
  },
  {
    slug: 'gomeria',
    name: 'Gomería',
    icon: 'CircleGauge',
    preferredMode: 'immediate',
    keywords: ['alineacion', 'auxilio', 'balanceo', 'cubierta', 'goma', 'gomeria', 'pinchadura', 'rueda'],
  },
  {
    slug: 'chapa_pintura_auto',
    name: 'Chapa y pintura',
    icon: 'Car',
    preferredMode: 'quote',
    keywords: ['abolladura', 'auto', 'carroceria', 'chapa', 'pintura auto', 'rayon'],
  },
];

export const statusOrder = [
  'requested',
  'searching_professional',
  'confirmed',
  'professional_en_route',
  'professional_arrived',
  'work_started',
  'completed',
  'paid',
] as const;
