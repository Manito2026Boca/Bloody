'use client';

import type { Session } from '@supabase/supabase-js';
import Image from 'next/image';
import {
  BadgeCheck,
  Banknote,
  Bell,
  BriefcaseBusiness,
  Camera,
  Check,
  CircleDot,
  Clock,
  CreditCard,
  Download,
  Heart,
  Home,
  KeyRound,
  LocateFixed,
  LogOut,
  MapPin,
  MessageCircle,
  PlugZap,
  Save,
  Search,
  SendHorizontal,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  acceptV6Proposal,
  acceptV6Order,
  addV6Complaint,
  addV6OrderPhoto,
  addV6OrderExtra,
  addV6PortfolioItem,
  addV6Rating,
  addV6PaymentProfile,
  advanceV6Order,
  cancelV6Order,
  completeV6Profile,
  createV6Order,
  decideV6OrderExtra,
  getV6Profile,
  getV6MediaSignedUrl,
  getV6ProfessionalOnboarding,
  getV6ProfessionalPayoutDetails,
  getV6ProfessionalProfile,
  listV6AdminSettings,
  listV6ClientAddresses,
  listV6Messages,
  listV6OrderExtras,
  listV6OrderPhotos,
  listV6OrderProposals,
  listV6Orders,
  listV6PaymentProfiles,
  listV6Portfolio,
  listV6PublicProfessionals,
  listV6ProfessionalDocuments,
  listV6ProfessionalServices,
  listV6ProfessionalSpecialties,
  listV6Services,
  listV6Specialties,
  removeV6Channel,
  sendV6OrderProposal,
  saveV6ProfessionalServices,
  saveV6ProfessionalSpecialties,
  sendV6Message,
  setV6Availability,
  subscribeV6Messages,
  subscribeV6Orders,
  updateV6Profile,
  uploadV6MediaFile,
  upsertV6ClientAddress,
  upsertV6ProfessionalDocument,
  upsertV6ProfessionalOnboarding,
  upsertV6ProfessionalPayoutDetails,
  upsertV6ProfessionalProfile,
} from '../lib/v6Api';
import {
  clearStoredConfig,
  getV6Supabase,
  isV6SupabaseConfigured,
  saveStoredConfig,
} from '../lib/v6Supabase';
import type {
  V6AdminSetting,
  V6Message,
  V6Mode,
  V6Order,
  V6OrderExtra,
  V6OrderPhoto,
  V6OrderProposal,
  V6PaymentProfile,
  V6PortfolioItem,
  V6OrderStatus,
  V6Profile,
  V6ProfessionalDocument,
  V6ProfessionalOnboarding,
  V6ProfessionalProfile,
  V6ProfessionalService,
  V6ProfessionalSpecialty,
  V6PublicProfessional,
  V6Role,
  V6Service,
  V6Specialty,
} from '../lib/v6Types';
import { V6_MODE_LABEL, V6_STATUS_LABEL } from '../lib/v6Types';

type Tab = 'home' | 'search' | 'orders' | 'favorites' | 'profile' | 'account';
type AuthMode = 'login' | 'signup';
type AssignmentMode = 'auto' | 'manual';
type PaymentMethod = 'card' | 'wallet' | 'cash';
type AppMode = 'client' | 'professional';
type ProfessionalOrderMatch = {
  order: V6Order;
  score: number;
  reasons: string[];
  distanceKm: number | null;
};
type NavigatorWithStandalone = Navigator & { standalone?: boolean };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};
type SavedAddress = {
  id: string;
  label: string;
  line: string;
  city: string | null;
  lat: number | null;
  lng: number | null;
};
type ProfessionalCandidate = {
  professional: V6PublicProfessional;
  score: number;
  reasons: string[];
  specialtyNames: string[];
  priceFrom: number | null;
  etaMinutes: number | null;
  distanceKm: number | null;
};
type ServiceGroupId =
  | 'all'
  | 'home'
  | 'projects'
  | 'technology'
  | 'learning'
  | 'events'
  | 'automotive';
type ServiceGroup = {
  id: ServiceGroupId;
  label: string;
  slugs: string[];
};

const statusFlow: V6OrderStatus[] = [
  'accepted',
  'en_camino',
  'en_sitio',
  'completed',
];
const deployedAppUrl =
  'https://bloody-eta.vercel.app';
const paymentOptions: Array<{ id: PaymentMethod; label: string; icon: ReactNode }> = [
  { id: 'card', label: 'Tarjeta', icon: <CreditCard size={17} aria-hidden="true" /> },
  { id: 'wallet', label: 'Cuenta DNI / billetera', icon: <Wallet size={17} aria-hidden="true" /> },
  { id: 'cash', label: 'Efectivo', icon: <Banknote size={17} aria-hidden="true" /> },
];

function paymentLabel(method?: string | null) {
  if (method === 'transfer') return 'Transferencia';
  return paymentOptions.find((option) => option.id === method)?.label || 'A coordinar';
}

function isRequestPaymentMethod(method: string): method is PaymentMethod {
  return method === 'card' || method === 'wallet' || method === 'cash';
}

function paymentProfileDisplay(payment: V6PaymentProfile) {
  if (payment.type === 'wallet') return 'Cuenta DNI / billetera digital';
  if (payment.type === 'cash') return 'Efectivo';
  if (payment.type === 'transfer') return 'Transferencia';
  return payment.last4 ? `${payment.label} terminada en ${payment.last4}` : payment.label;
}

function paymentProfileIcon(payment: V6PaymentProfile) {
  if (payment.type === 'wallet') return <Wallet size={15} aria-hidden="true" />;
  if (payment.type === 'cash') return <Banknote size={15} aria-hidden="true" />;
  return <CreditCard size={15} aria-hidden="true" />;
}

function photoStageLabel(stage: V6OrderPhoto['stage']) {
  if (stage === 'before') return 'Antes';
  if (stage === 'after') return 'Después';
  return 'Durante';
}

function timeInputValue(value?: string | null, fallback = '08:00') {
  if (!value) return fallback;
  return value.slice(0, 5);
}

const requiredDocuments = [
  { kind: 'dni_front', label: 'DNI frente' },
  { kind: 'dni_back', label: 'DNI dorso' },
  { kind: 'selfie', label: 'Selfie de verificación' },
  { kind: 'tax', label: 'Constancia fiscal' },
  { kind: 'insurance', label: 'Seguro o matrícula' },
];
const serviceGroups: ServiceGroup[] = [
  { id: 'all', label: 'Todos', slugs: [] },
  {
    id: 'home',
    label: 'Hogar',
    slugs: [
      'plomeria',
      'electricidad',
      'gas',
      'cerrajeria',
      'limpieza',
      'pintura',
      'jardin',
      'arreglos',
      'aire',
      'electro',
      'mudanzas',
      'carpinteria',
      'fumigacion',
      'albanileria',
      'pileta',
    ],
  },
  {
    id: 'projects',
    label: 'Proyectos',
    slugs: [
      'arquitectura',
      'ingenieria',
      'diseno_interiores',
      'albanileria',
      'carpinteria',
      'pintura',
      'mudanzas',
    ],
  },
  {
    id: 'technology',
    label: 'Tecnología',
    slugs: ['tecnologia', 'soporte_remoto', 'electro'],
  },
  {
    id: 'learning',
    label: 'Aprendizaje',
    slugs: ['profesores_particulares'],
  },
  {
    id: 'events',
    label: 'Eventos',
    slugs: ['fotografia'],
  },
  {
    id: 'automotive',
    label: 'Automotor',
    slugs: ['mecanica_automotor', 'gomeria', 'chapa_pintura_auto'],
  },
];
const serviceKeywords: Record<string, string[]> = {
  plomeria: ['plomero', 'plomeria', 'agua', 'canilla', 'bano', 'inodoro', 'perdida', 'gotera', 'cano', 'destapar'],
  electricidad: ['electricista', 'electricidad', 'luz', 'enchufe', 'corto', 'termica', 'disyuntor', 'cable', 'tablero'],
  gas: ['gas', 'gasista', 'calefon', 'termotanque', 'estufa', 'olor', 'perdida gas', 'matriculado'],
  cerrajeria: ['cerrajero', 'cerradura', 'llave', 'puerta', 'traba', 'candado', 'abrir'],
  limpieza: ['limpieza', 'limpiar', 'mucama', 'profunda', 'departamento', 'oficina'],
  pintura: ['pintor', 'pintura', 'pintar', 'pared', 'humedad', 'enduir', 'color'],
  jardin: ['jardinero', 'jardineria', 'pasto', 'cesped', 'plantas', 'podar', 'jardin', 'riego'],
  arreglos: ['arreglos', 'mueble', 'colocar', 'perforar', 'montaje', 'mantenimiento general'],
  aire: ['aire', 'acondicionado', 'split', 'frio', 'calor', 'filtro', 'instalar aire'],
  electro: ['heladera', 'lavarropas', 'horno', 'microondas', 'electrodomestico', 'lavavajillas'],
  mudanzas: ['mudanza', 'flete', 'embalaje', 'traslado', 'desarmar muebles'],
  carpinteria: ['carpintero', 'mueble', 'madera', 'puerta', 'bisagra', 'estante', 'placard'],
  fumigacion: ['fumigacion', 'cucaracha', 'hormiga', 'roedor', 'desinsectacion'],
  tecnologia: ['pc', 'notebook', 'wifi', 'redes', 'impresora', 'software', 'computadora'],
  albanileria: ['albanil', 'revoque', 'piso', 'pared', 'obra', 'reparacion'],
  pileta: ['pileta', 'piscina', 'bomba', 'filtro', 'cloro', 'mantenimiento'],
  arquitectura: ['arquitecto', 'arquitectura', 'plano', 'planos', 'reforma', 'ampliacion', 'obra', 'proyecto', 'regularizacion', 'render', 'direccion de obra'],
  ingenieria: ['ingeniero', 'ingenieria', 'calculo', 'estructura', 'estructural', 'peritaje', 'seguridad e higiene', 'instalacion', 'industrial', 'civil', 'mecanica electrica'],
  diseno_interiores: ['disenador', 'diseno interior', 'interiores', 'decoracion', 'ambientacion', 'mobiliario', 'iluminacion decorativa', 'terminaciones'],
  fotografia: ['fotografo', 'fotografia', 'foto', 'fotos', 'evento', 'producto', 'retrato', 'video', 'edicion', 'inmueble'],
  profesores_particulares: ['profesor', 'particular', 'clase', 'apoyo escolar', 'matematica', 'ingles', 'portugues', 'universitario', 'musica', 'examen'],
  soporte_remoto: ['soporte remoto', 'asistencia remota', 'computadora', 'pc', 'notebook', 'wifi', 'red', 'software', 'celular', 'backup', 'seguridad'],
  mecanica_automotor: ['mecanico', 'mecanica', 'auto', 'automotor', 'motor', 'freno', 'embrague', 'bateria', 'arranque', 'service'],
  gomeria: ['gomeria', 'goma', 'cubierta', 'neumatico', 'pinchadura', 'balanceo', 'alineacion', 'rueda', 'auto', 'automotor'],
  chapa_pintura_auto: ['chapista', 'chapa', 'pintura auto', 'choque', 'abolladura', 'paragolpe', 'rayon', 'carroceria', 'auto', 'automotor'],
};

function money(value: number | null | undefined) {
  if (value == null) return 'A definir';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function appointmentDate(order: V6Order) {
  return order.scheduled_at || order.accepted_at || order.created_at;
}

function orderTrackingText(order: V6Order) {
  const lines = [
    `MANITO - ${serviceDisplayName(order.service)}`,
    `Estado: ${V6_STATUS_LABEL[order.status]}`,
    `Dirección: ${order.address}`,
    order.scheduled_at ? `Turno: ${shortDate(order.scheduled_at)}` : null,
    order.eta_minutes ? `ETA: ${order.eta_minutes} min` : null,
    order.professional?.full_name ? `Prestador: ${order.professional.full_name}` : 'Prestador: pendiente de asignacion',
  ].filter(Boolean);
  return lines.join('\n');
}

function serviceIcon(slug: string) {
  if (slug === 'cerrajeria') return <KeyRound size={20} aria-hidden="true" />;
  if (slug === 'electricidad') return <PlugZap size={20} aria-hidden="true" />;
  if (['arquitectura', 'ingenieria', 'diseno_interiores'].includes(slug)) {
    return <BriefcaseBusiness size={20} aria-hidden="true" />;
  }
  if (slug === 'fotografia') return <Camera size={20} aria-hidden="true" />;
  if (slug === 'profesores_particulares') return <Users size={20} aria-hidden="true" />;
  if (slug === 'soporte_remoto') return <PlugZap size={20} aria-hidden="true" />;
  if (['mecanica_automotor', 'gomeria', 'chapa_pintura_auto'].includes(slug)) {
    return <Wrench size={20} aria-hidden="true" />;
  }
  return <Wrench size={20} aria-hidden="true" />;
}

function serviceDisplayName(service?: Pick<V6Service, 'slug' | 'name'> | null) {
  if (!service) return 'Servicio';
  const names: Record<string, string> = {
    plomeria: 'Plomería',
    cerrajeria: 'Cerrajería',
    jardin: 'Jardinería',
    gas: 'Gasista',
    electro: 'Electrodomésticos',
    tecnologia: 'PC y tecnología',
    albanileria: 'Albañilería',
    pileta: 'Piletas',
    arquitectura: 'Arquitectura',
    ingenieria: 'Ingeniería',
    diseno_interiores: 'Diseño de interiores',
    fotografia: 'Fotografía',
    profesores_particulares: 'Profesores particulares',
    soporte_remoto: 'Soporte tecnológico remoto',
    mecanica_automotor: 'Mecánica automotor',
    gomeria: 'Gomería',
    chapa_pintura_auto: 'Chapa y pintura',
  };
  return names[service.slug] || service.name;
}

function serviceInitials(service: V6Service) {
  return serviceDisplayName(service)
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2);
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function serviceScore(service: V6Service, query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery.trim()) return 0;
  const keywords = [
    service.slug,
    service.name,
    ...(serviceKeywords[service.slug] || []),
  ].map(normalizeText);
  return keywords.reduce((score, keyword) => {
    if (!keyword) return score;
    if (normalizedQuery.includes(keyword)) return score + 4;
    if (keyword.split(' ').some((part) => part.length > 3 && normalizedQuery.includes(part))) {
      return score + 2;
    }
    return score;
  }, 0);
}

const specialtyKeywordHints: Record<string, string[]> = {
  'perdidas de agua': ['pierde agua', 'perdida', 'fuga', 'gotea', 'humedad', 'agua'],
  destapaciones: ['destapar', 'tapado', 'cloaca', 'desagote', 'bacha', 'inodoro'],
  griferias: ['canilla', 'grifo', 'monocomando', 'mezcladora'],
  sanitarios: ['inodoro', 'bidet', 'bano', 'mochila'],
  termotanques: ['termotanque', 'agua caliente'],
  'bombas de agua': ['bomba', 'presion de agua', 'tanque'],
  cortocircuitos: ['corto', 'salta', 'chispazo', 'disyuntor'],
  'tableros y termicas': ['tablero', 'termica', 'disyuntor'],
  'tomas y enchufes': ['toma', 'enchufe', 'ficha'],
  iluminacion: ['luz', 'lampara', 'aplique', 'iluminacion'],
  cableado: ['cable', 'cableado', 'instalacion electrica'],
  calefones: ['calefon', 'agua caliente'],
  cocinas: ['cocina', 'hornalla', 'horno'],
  estufas: ['estufa', 'calefactor'],
  'pruebas de hermeticidad': ['hermeticidad', 'matricula', 'metrogas'],
  aperturas: ['abrir', 'quede afuera', 'perdi la llave'],
  'cambio de cerraduras': ['cambiar cerradura', 'cerradura rota'],
  llaves: ['llave', 'copia de llave'],
  humedad: ['humedad', 'mancha', 'filtracion'],
  'corte de cesped': ['cesped', 'pasto', 'cortar pasto'],
  poda: ['poda', 'podar', 'rama'],
  'instalacion de split': ['instalar aire', 'split', 'aire acondicionado'],
  'carga de gas': ['carga de gas', 'no enfria', 'frio'],
  heladeras: ['heladera', 'freezer', 'no enfria'],
  lavarropas: ['lavarropas', 'centrifuga', 'desagota'],
  'wi-fi y redes': ['wifi', 'internet', 'red'],
  'pc y notebooks': ['pc', 'notebook', 'computadora'],
  bombas: ['bomba', 'pileta'],
  filtros: ['filtro', 'pileta'],
  'proyecto de vivienda': ['casa', 'vivienda', 'proyecto', 'construir'],
  'reformas y ampliaciones': ['reforma', 'ampliacion', 'agrandar', 'remodelar'],
  planos: ['plano', 'planos', 'municipal', 'obra'],
  regularizaciones: ['regularizar', 'regularizacion', 'habilitar', 'municipal'],
  'direccion de obra': ['direccion de obra', 'obra', 'seguimiento'],
  relevamientos: ['relevar', 'medir', 'relevamiento'],
  'consultas tecnicas': ['consulta tecnica', 'asesoria', 'opinion profesional'],
  'computo y presupuesto': ['computo', 'presupuesto', 'materiales'],
  'renderizado / visualizacion': ['render', 'renderizado', 'visualizacion'],
  'ingenieria civil': ['civil', 'estructura', 'obra'],
  'ingenieria electrica': ['ingeniero electrico', 'instalacion electrica', 'potencia'],
  'ingenieria mecanica': ['mecanica', 'maquina', 'equipo'],
  'seguridad e higiene': ['seguridad e higiene', 'higiene', 'riesgo laboral'],
  'calculo estructural': ['calculo', 'estructura', 'estructural'],
  peritajes: ['peritaje', 'informe tecnico', 'dano'],
  consultoria: ['consultoria', 'asesoria'],
  ambientacion: ['ambientacion', 'decoracion'],
  'distribucion de espacios': ['distribucion', 'espacio', 'layout'],
  mobiliario: ['mueble', 'mobiliario'],
  'iluminacion decorativa': ['iluminacion decorativa', 'luces', 'ambiente'],
  eventos: ['evento', 'cumpleanos', 'casamiento', 'fiesta'],
  producto: ['producto', 'catalogo', 'marca'],
  retratos: ['retrato', 'perfil', 'book'],
  inmuebles: ['inmueble', 'departamento', 'casa en venta'],
  'video corto': ['video', 'reel', 'redes'],
  edicion: ['editar', 'edicion', 'retoque'],
  'apoyo escolar': ['apoyo escolar', 'tarea', 'primaria', 'secundaria'],
  matematica: ['matematica', 'algebra', 'analisis'],
  ingles: ['ingles', 'idioma'],
  portugues: ['portugues', 'idioma'],
  universitario: ['universidad', 'facultad', 'parcial', 'final'],
  musica: ['musica', 'guitarra', 'piano'],
  'instalacion de software': ['instalar programa', 'software', 'windows'],
  'configuracion de celulares': ['celular', 'telefono', 'configurar'],
  'asistencia remota': ['remoto', 'teamviewer', 'anydesk'],
  'backup y seguridad': ['backup', 'copia', 'seguridad', 'virus'],
};

function specialtyScore(specialty: V6Specialty, query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery.trim()) return 0;
  const normalizedName = normalizeText(specialty.name);
  const terms = [specialty.name, ...(specialtyKeywordHints[normalizedName] || [])]
    .map(normalizeText)
    .filter(Boolean);

  return terms.reduce((score, term) => {
    if (normalizedQuery.includes(term)) return score + (term.includes(' ') ? 6 : 4);
    const termParts = term.split(' ').filter((part) => part.length > 3);
    const partialHits = termParts.filter((part) => normalizedQuery.includes(part)).length;
    return score + partialHits;
  }, 0);
}

function detectSpecialtiesForService(
  service: Pick<V6Service, 'id'> | null | undefined,
  specialties: V6Specialty[],
  query: string,
) {
  if (!service) return [];
  return specialties
    .filter((specialty) => specialty.service_id === service.id)
    .map((specialty) => ({ specialty, score: specialtyScore(specialty, query) }))
    .filter((match) => match.score > 1)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
}

function publicProfessionalName(professional: V6PublicProfessional) {
  return professional.profile.full_name || 'Profesional MANITO';
}

function publicProfessionalTrade(
  professional: V6PublicProfessional,
  services: V6Service[],
) {
  const names = professional.services
    .map((item) => services.find((service) => service.id === item.service_id))
    .filter((service): service is V6Service => Boolean(service))
    .slice(0, 2)
    .map(serviceDisplayName);
  return names.length ? names.join(' + ') : 'Servicios MANITO';
}

function professionalCandidatesForService({
  service,
  professionals,
  specialties,
  query,
  clientCoords,
}: {
  service: V6Service | null;
  professionals: V6PublicProfessional[];
  specialties: V6Specialty[];
  query: string;
  clientCoords: { lat: number; lng: number } | null;
}) {
  if (!service) return [];
  const detectedSpecialties = detectSpecialtiesForService(service, specialties, query);
  const detectedIds = new Set(detectedSpecialties.map((match) => match.specialty.id));

  return professionals
    .map((professional) => {
      const proService = professional.services.find((item) => item.service_id === service.id);
      if (!proService) return null;
      const distance = clientCoords
        ? distanceKm(
            professional.profile.lat,
            professional.profile.lng,
            clientCoords.lat,
            clientCoords.lng,
          )
        : null;
      const radius = professional.professional_profile?.service_radius_km || 8;
      if (distance != null && distance > radius) return null;

      const matchedSpecialties = professional.specialties
        .filter((item) => item.service_id === service.id && detectedIds.has(item.specialty_id))
        .map((item) => specialties.find((specialty) => specialty.id === item.specialty_id))
        .filter((item): item is V6Specialty => Boolean(item));
      const specialtyNames = matchedSpecialties.map((item) => item.name);
      const reasons = [
        'Disponible',
        professional.professional_profile?.verified ? 'Verificado' : 'Verificación pendiente',
        distance != null
          ? `${distance < 1 ? 'Menos de 1' : distance.toFixed(1)} km`
          : professional.professional_profile?.work_city || professional.profile.city || null,
        specialtyNames[0] ? `Especialidad: ${specialtyNames.slice(0, 2).join(', ')}` : null,
      ].filter(Boolean) as string[];
      const score =
        62 +
        (professional.professional_profile?.verified ? 12 : 0) +
        Math.min(12, professional.professional_profile?.jobs_completed || 0) +
        (matchedSpecialties.length ? 14 : detectedSpecialties.length ? 2 : 0) +
        (distance != null ? Math.max(0, 10 - Math.round(distance)) : 3);

      return {
        professional,
        score: Math.min(98, score),
        reasons,
        specialtyNames,
        priceFrom: proService.price_from,
        etaMinutes: professional.professional_profile?.response_minutes || null,
        distanceKm: distance,
      };
    })
    .filter((candidate): candidate is ProfessionalCandidate => Boolean(candidate))
    .sort((left, right) => right.score - left.score);
}

function filterServicesByGroup(services: V6Service[], groupId: ServiceGroupId) {
  const group = serviceGroups.find((item) => item.id === groupId);
  if (!group || group.id === 'all') return services;
  return services.filter((service) => group.slugs.includes(service.slug));
}

function serviceGroupFromQuery(query: string): ServiceGroupId {
  const normalizedQuery = normalizeText(query);
  if (
    ['arquitecto', 'arquitectura', 'ingeniero', 'ingenieria', 'plano', 'reforma', 'obra', 'render', 'interiorismo', 'diseno interior'].some((keyword) =>
      normalizedQuery.includes(keyword),
    )
  ) {
    return 'projects';
  }
  if (
    ['pc', 'notebook', 'wifi', 'internet', 'software', 'soporte remoto', 'celular', 'computadora'].some((keyword) =>
      normalizedQuery.includes(keyword),
    )
  ) {
    return 'technology';
  }
  if (
    ['profesor', 'clase', 'apoyo escolar', 'matematica', 'ingles', 'portugues', 'examen'].some((keyword) =>
      normalizedQuery.includes(keyword),
    )
  ) {
    return 'learning';
  }
  if (
    ['fotografo', 'fotografia', 'fotos', 'evento', 'retrato', 'video'].some((keyword) =>
      normalizedQuery.includes(keyword),
    )
  ) {
    return 'events';
  }
  if (
    ['auto', 'automotor', 'mecanico', 'mecanica', 'chapista', 'gomeria', 'cubierta', 'neumatico'].some((keyword) =>
      normalizedQuery.includes(keyword),
    )
  ) {
    return 'automotive';
  }
  return 'all';
}

function formatAddress(line?: string | null, city?: string | null) {
  const cleanLine = (line || '').trim();
  const cleanCity = (city || '').trim();
  if (!cleanLine) return cleanCity;
  if (!cleanCity) return cleanLine;
  return normalizeText(cleanLine).includes(normalizeText(cleanCity))
    ? cleanLine
    : `${cleanLine}, ${cleanCity}`;
}

function splitStoredAddress(value: string, fallbackCity?: string | null) {
  const cleanValue = value.trim();
  const city = (fallbackCity || '').trim();
  if (city && normalizeText(cleanValue).endsWith(normalizeText(`, ${city}`))) {
    return {
      line: cleanValue.slice(0, cleanValue.length - city.length - 2),
      city,
    };
  }
  const parts = cleanValue.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    return {
      line: parts.slice(0, -1).join(', '),
      city: parts[parts.length - 1],
    };
  }
  return { line: cleanValue, city };
}

function headerLocation(profile: V6Profile) {
  const location = (profile.city || '').trim();
  if (!location) return 'Agregar ciudad';
  if (location.includes(',')) {
    return location.split(',').map((part) => part.trim()).filter(Boolean).at(-1) || 'Agregar ciudad';
  }
  const looksLikeStreetAddress =
    /\d/.test(location) &&
    /\b(av\.?|avenida|calle|boulevard|bulevar|pasaje|ruta|diag\.?|diagonal)\b/i.test(location);
  return looksLikeStreetAddress ? 'Configurar ciudad' : location;
}

function distanceKm(
  fromLat: number | null | undefined,
  fromLng: number | null | undefined,
  toLat: number | null | undefined,
  toLng: number | null | undefined,
) {
  if (
    fromLat == null ||
    fromLng == null ||
    toLat == null ||
    toLng == null
  ) {
    return null;
  }
  const radius = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) *
      Math.cos(toRad(toLat)) *
      Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeDayLabel(value: string) {
  return normalizeText(value).slice(0, 3);
}

function scheduledDayLabel(value: string) {
  return ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'][new Date(value).getDay()];
}

function timeInRange(value: string, start?: string | null, end?: string | null) {
  if (!start || !end) return true;
  const minutes = (time: string) => {
    const [hours = '0', mins = '0'] = time.split(':');
    return Number(hours) * 60 + Number(mins);
  };
  const target = minutes(value);
  const startMinutes = minutes(start);
  const endMinutes = minutes(end);
  if (startMinutes <= endMinutes) {
    return target >= startMinutes && target <= endMinutes;
  }
  return target >= startMinutes || target <= endMinutes;
}

function evaluateProfessionalOrderMatch(
  order: V6Order,
  profile: V6Profile,
  professionalProfile: V6ProfessionalProfile | null,
  proServices: V6ProfessionalService[],
  proSpecialties: V6ProfessionalSpecialty[],
  specialties: V6Specialty[],
): ProfessionalOrderMatch | null {
  if (!profile.is_available || order.status !== 'open') return null;
  const service = proServices.find((item) => item.service_id === order.service_id);
  if (!service) return null;

  const reasons = ['Rubro activo'];
  let score = 70;
  const distance = distanceKm(profile.lat, profile.lng, order.client_lat, order.client_lng);
  const radius = professionalProfile?.service_radius_km || 8;
  const city = professionalProfile?.work_city || profile.city;

  if (distance != null) {
    if (distance > radius) return null;
    score += Math.max(0, 18 - Math.round(distance));
    reasons.push(`${distance < 1 ? 'Menos de 1' : distance.toFixed(1)} km`);
  } else if (city) {
    const orderAddress = normalizeText(order.address || '');
    const normalizedCity = normalizeText(city);
    if (orderAddress && !orderAddress.includes(normalizedCity)) return null;
    reasons.push(`Zona ${city}`);
    score += 8;
  } else {
    reasons.push('Zona a confirmar');
  }

  if (order.scheduled_at) {
    const scheduled = new Date(order.scheduled_at);
    const activeDays = professionalProfile?.work_days?.length
      ? professionalProfile.work_days
      : ['Lun', 'Mar', 'Mie', 'Jue', 'Vie'];
    const scheduledDay = normalizeDayLabel(scheduledDayLabel(order.scheduled_at));
    const worksThatDay = activeDays.map(normalizeDayLabel).includes(scheduledDay);
    const scheduledTime = scheduled.toTimeString().slice(0, 5);
    if (!worksThatDay) return null;
    if (!timeInRange(scheduledTime, professionalProfile?.work_starts_at, professionalProfile?.work_ends_at)) {
      return null;
    }
    reasons.push(`Horario ${scheduledTime}`);
    score += 7;
  } else {
    reasons.push('Pedido para coordinar');
    score += 5;
  }

  if (service.price_from) {
    reasons.push(`Tu tarifa desde ${money(service.price_from)}`);
    score += 4;
  }

  const orderSpecialties = detectSpecialtiesForService(
    order.service,
    specialties,
    order.description,
  );
  if (orderSpecialties.length) {
    const selectedSpecialtyIds = new Set(proSpecialties.map((item) => item.specialty_id));
    const matchedSpecialties = orderSpecialties.filter((match) =>
      selectedSpecialtyIds.has(match.specialty.id),
    );
    if (matchedSpecialties.length) {
      const names = matchedSpecialties.map((match) => match.specialty.name).slice(0, 2);
      reasons.push(`Especialidad: ${names.join(', ')}`);
      score += Math.min(14, 8 + matchedSpecialties.length * 3);
    } else if (proSpecialties.some((item) => item.service_id === order.service_id)) {
      reasons.push('Especialidad no marcada');
      score -= 6;
    } else {
      reasons.push('Especialidad a confirmar');
    }
  }

  return {
    order,
    reasons,
    distanceKm: distance,
    score: Math.min(98, score),
  };
}

function pendingProfileKey(email: string) {
  return `manito_v6_pending_profile:${email.toLowerCase()}`;
}

function savedAddressesKey(profileId: string) {
  return `manito_v6_addresses:${profileId}`;
}

function getAuthRedirectUrl() {
  if (typeof window === 'undefined') return deployedAppUrl;
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (configuredUrl) return configuredUrl;
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return deployedAppUrl;
  }
  return window.location.origin;
}

function getAuthCallbackUrl() {
  return `${getAuthRedirectUrl().replace(/\/$/, '')}/auth/callback`;
}

function loadSavedAddresses(profileId: string): SavedAddress[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(savedAddressesKey(profileId));
    return raw ? (JSON.parse(raw) as SavedAddress[]) : [];
  } catch {
    return [];
  }
}

function makeClientId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}`;
}

function isInstalledDisplayMode() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as NavigatorWithStandalone).standalone)
  );
}

function isJwtTimingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes('jwt issued at future');
}

function friendlySessionError(error: unknown, fallback: string) {
  if (isJwtTimingError(error)) {
    return 'Tu sesión quedó trabada porque el dispositivo tiene la hora desfasada. Activá fecha y hora automática y volvé a entrar a MANITO.';
  }
  return error instanceof Error ? error.message : fallback;
}

function requestPhonePosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('geolocation-unavailable'));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 60000,
      timeout: 12000,
    });
  });
}

function phoneLocationErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === 'geolocation-unavailable') {
    return 'Este navegador no permite usar GPS. Cargá la ciudad manualmente.';
  }

  const code = typeof error === 'object' && error !== null && 'code' in error
    ? Number((error as { code?: unknown }).code)
    : 0;

  if (code === 1) {
    return 'Permiso de ubicación rechazado. Activá permisos de ubicación o cargá la ciudad manualmente.';
  }
  if (code === 2) {
    return 'No pude obtener el GPS. Activá la ubicación del teléfono o cargá la ciudad manualmente.';
  }
  if (code === 3) {
    return 'El GPS tardó demasiado. Probá de nuevo o cargá la ciudad manualmente.';
  }
  return 'No se pudo obtener GPS. Cargá la ciudad manualmente.';
}

export default function ManitoV6App() {
  const [configured, setConfigured] = useState(() => isV6SupabaseConfigured());
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<V6Profile | null>(null);
  const [services, setServices] = useState<V6Service[]>([]);
  const [specialties, setSpecialties] = useState<V6Specialty[]>([]);
  const [proServices, setProServices] = useState<V6ProfessionalService[]>([]);
  const [proSpecialties, setProSpecialties] = useState<V6ProfessionalSpecialty[]>([]);
  const [publicProfessionals, setPublicProfessionals] = useState<V6PublicProfessional[]>([]);
  const [orders, setOrders] = useState<V6Order[]>([]);
  const [tab, setTab] = useState<Tab>('home');
  const [appMode, setAppMode] = useState<AppMode>('client');
  const [loading, setLoading] = useState(() => isV6SupabaseConfigured());
  const [profileLoading, setProfileLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatOrder, setChatOrder] = useState<V6Order | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(() => isInstalledDisplayMode());
  const [savingPhoneLocation, setSavingPhoneLocation] = useState(false);
  const [clientSelectedService, setClientSelectedService] = useState<V6Service | null>(null);
  const [clientProblemQuery, setClientProblemQuery] = useState('');
  const lastRealtimeNoticeAt = useRef(0);

  const loadData = useCallback(async (userId: string) => {
    setProfileLoading(true);
    try {
      const [
        nextProfile,
        nextServices,
        nextSpecialties,
        nextOrders,
        nextProServices,
        nextProSpecialties,
        nextPublicProfessionals,
      ] = await Promise.all([
        getV6Profile(userId),
        listV6Services(),
        listV6Specialties(),
        listV6Orders(),
        listV6ProfessionalServices(userId),
        listV6ProfessionalSpecialties(userId),
        listV6PublicProfessionals(),
      ]);
      setError(null);
      setProfile(nextProfile);
      setServices(nextServices);
      setSpecialties(nextSpecialties);
      setOrders(nextOrders);
      setProServices(nextProServices);
      setProSpecialties(nextProSpecialties);
      setPublicProfessionals(nextPublicProfessionals);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const resetSession = useCallback(async () => {
    try {
      await getV6Supabase().auth.signOut({ scope: 'local' });
    } catch {
      // If the token is rejected because of clock skew, clearing UI state is enough.
    }
    setSession(null);
    setProfile(null);
    setOrders([]);
    setProServices([]);
    setProSpecialties([]);
    setPublicProfessionals([]);
    setError(null);
    setNotice('Listo. Activá fecha y hora automática si vuelve a pasar, y entrá de nuevo.');
  }, []);

  useEffect(() => {
    if (!configured) {
      return;
    }

    const supabase = getV6Supabase();
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        setSession(data.session);
        if (data.session?.user.id) {
          const email = data.session.user.email || '';
          const pending = window.localStorage.getItem(pendingProfileKey(email));
          if (pending) {
            const parsed = JSON.parse(pending) as {
              fullName: string;
              role?: V6Role;
            };
            await completeV6Profile({ fullName: parsed.fullName, role: parsed.role || 'client' });
            window.localStorage.removeItem(pendingProfileKey(email));
          }
          await loadData(data.session.user.id);
        }
      })
      .catch((caught) => {
        setSession(null);
        setProfile(null);
        setError(friendlySessionError(caught, 'No se pudo iniciar.'));
      })
      .finally(() => setLoading(false));

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        if (nextSession?.user.id) {
          void loadData(nextSession.user.id).catch((caught) =>
            setError(friendlySessionError(caught, 'No se pudo cargar tu perfil.')),
          );
        } else {
          setProfileLoading(false);
          setProfile(null);
          setOrders([]);
          setProServices([]);
          setProSpecialties([]);
          setPublicProfessionals([]);
        }
      },
    );

    return () => listener.subscription.unsubscribe();
  }, [configured, loadData]);

  useEffect(() => {
    if (!profile) return undefined;
    const channel = subscribeV6Orders(() => {
      void listV6Orders().then((nextOrders) => {
        setOrders(nextOrders);
        const now = Date.now();
        if (now - lastRealtimeNoticeAt.current > 15000) {
          lastRealtimeNoticeAt.current = now;
          setNotice('Pedido actualizado en tiempo real.');
        }
      });
    });
    return () => removeV6Channel(channel);
  }, [profile]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!error) return undefined;
    const timeout = window.setTimeout(() => setError(null), 9000);
    return () => window.clearTimeout(timeout);
  }, [error]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js');
    }
  }, []);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    }

    function handleInstalled() {
      setInstallPrompt(null);
      setIsStandalone(true);
      setNotice('MANITO instalado.');
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const installApp = useCallback(async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setNotice('MANITO instalado.');
      }
      setInstallPrompt(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo instalar.');
    }
  }, [installPrompt]);

  const clientOrders = useMemo(
    () => orders.filter((order) => order.client_id === profile?.id),
    [orders, profile?.id],
  );
  const professionalOrders = useMemo(
    () => orders.filter((order) => order.professional_id === profile?.id),
    [orders, profile?.id],
  );
  const matchingOrders = useMemo(() => {
    const serviceIds = new Set(
      proServices.map((service) => String(service.service_id)),
    );
    return orders.filter(
      (order) => order.status === 'open' && serviceIds.has(String(order.service_id)),
    );
  }, [orders, proServices]);

  async function refreshProfile() {
    if (!profile) return;
    const nextProfile = await getV6Profile(profile.id);
    setProfile(nextProfile);
  }

  async function usePhoneLocation() {
    if (!profile || savingPhoneLocation) return;

    setSavingPhoneLocation(true);
    setNotice('Permití el acceso a la ubicación del teléfono.');
    try {
      const position = await requestPhonePosition();
      const displayedCity = headerLocation(profile);
      const hasUsefulCity =
        displayedCity !== 'Agregar ciudad' &&
        displayedCity !== 'Configurar ciudad' &&
        displayedCity !== 'Ubicación actual';
      const updated = await updateV6Profile(profile.id, {
        full_name: profile.full_name,
        phone: profile.phone,
        city: hasUsefulCity ? profile.city : 'Ubicación actual',
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });

      setProfile(updated);
      if (hasUsefulCity) {
        setNotice('GPS actualizado. Vamos a usar tu ubicación actual para ordenar profesionales cercanos.');
      } else {
        setTab('account');
        setNotice('GPS guardado. Agregá tu ciudad para mostrarla correctamente en la app.');
      }
    } catch (caught) {
      setTab('account');
      setNotice(phoneLocationErrorMessage(caught));
    } finally {
      setSavingPhoneLocation(false);
    }
  }

  if (!configured) {
    return <SetupScreen onConnected={() => setConfigured(true)} />;
  }

  if (loading || profileLoading) {
    return (
      <main className="v6-app v6-center">
        <section className="v6-card">
          <p className="v6-live">
            <CircleDot size={14} aria-hidden="true" /> MANITO V6
          </p>
          <h1>{profileLoading ? 'Cargando perfil...' : 'Cargando backend...'}</h1>
        </section>
      </main>
    );
  }

  if (!session) {
    return <AuthScreen setNotice={setNotice} />;
  }

  if (!profile) {
    const profileError = error
      ? friendlySessionError(error, 'No se encontró tu perfil.')
      : 'No se encontró tu perfil.';
    const canResetSession =
      profileError.includes('hora desfasada') ||
      profileError.toLowerCase().includes('jwt issued at future');
    return (
      <main className="v6-app v6-center">
        <section className="v6-card">
          <p className="v6-alert">{profileError}</p>
          {canResetSession && (
            <button className="v6-primary" type="button" onClick={resetSession}>
              Volver a ingresar
            </button>
          )}
        </section>
      </main>
    );
  }

  const viewProfile = { ...profile, role: appMode } as V6Profile;
  const activeOrders =
    appMode === 'professional' ? professionalOrders : clientOrders;
  const currentLocation = headerLocation(profile);

  return (
    <main className="v6-app">
      <header className="v6-top">
        <div>
          <strong>
            MANI<span>TO</span>
          </strong>
          <p className="v6-kicker">Tu ubicación</p>
          <button
            className="v6-location"
            type="button"
            disabled={savingPhoneLocation}
            onClick={usePhoneLocation}
          >
            <MapPin size={13} aria-hidden="true" /> {savingPhoneLocation ? 'Ubicando...' : currentLocation}
          </button>
          <div className="v6-mode-switch" aria-label="Modo de uso">
            <button
              type="button"
              aria-pressed={appMode === 'client'}
              onClick={() => {
                setAppMode('client');
                setTab('home');
              }}
            >
              Cliente
            </button>
            <button
              type="button"
              aria-pressed={appMode === 'professional'}
              onClick={() => {
                setAppMode('professional');
                setTab('home');
              }}
            >
              Profesional
            </button>
          </div>
        </div>
        <button className="v6-icon-button" type="button" aria-label="Notificaciones">
          <Bell size={19} aria-hidden="true" />
        </button>
      </header>

      <div className="v6-content">
        {notice && (
          <button className="v6-toast" type="button" onClick={() => setNotice(null)}>
            {notice}
          </button>
        )}
        {error && (
          <button className="v6-toast error" type="button" onClick={() => setError(null)}>
            {error}
          </button>
        )}

        {tab === 'home' &&
          (appMode === 'professional' ? (
            <ProfessionalHome
              profile={viewProfile}
              services={services}
              specialties={specialties}
              proServices={proServices}
              proSpecialties={proSpecialties}
              matchingOrders={matchingOrders}
              activeOrders={professionalOrders}
              setProfile={setProfile}
              setProServices={setProServices}
              setProSpecialties={setProSpecialties}
              setOrders={setOrders}
              setChatOrder={setChatOrder}
              setError={setError}
              setNotice={setNotice}
            />
          ) : (
            <ClientHome
              profile={viewProfile}
              services={services}
              specialties={specialties}
              publicProfessionals={publicProfessionals}
              clientOrders={clientOrders}
              selectedService={clientSelectedService}
              setSelectedService={setClientSelectedService}
              problemQuery={clientProblemQuery}
              setProblemQuery={setClientProblemQuery}
              setOrders={setOrders}
              setChatOrder={setChatOrder}
              setError={setError}
              setNotice={setNotice}
              onNavigate={setTab}
            />
          ))}

        {tab === 'search' && (
          <SearchPanel
            services={services}
            selectedService={clientSelectedService}
            problemQuery={clientProblemQuery}
            setProblemQuery={setClientProblemQuery}
            onPickService={(service) => {
              setClientSelectedService(service);
              setClientProblemQuery((current) => current || serviceDisplayName(service));
              setTab('home');
            }}
          />
        )}

        {tab === 'orders' && (
          <OrdersList
            profile={viewProfile}
            orders={activeOrders}
            setOrders={setOrders}
            setChatOrder={setChatOrder}
            setError={setError}
            setNotice={setNotice}
          />
        )}

        {tab === 'profile' && (
          <ProfilePanel
            profile={profile}
            services={services}
            specialties={specialties}
            proServices={proServices}
            proSpecialties={proSpecialties}
            setProfile={setProfile}
            setProServices={setProServices}
            setProSpecialties={setProSpecialties}
            setNotice={setNotice}
            setError={setError}
            refreshProfile={refreshProfile}
          />
        )}

        {tab === 'favorites' && (
          <FavoritesPanel
            professionals={publicProfessionals}
            services={services}
            specialties={specialties}
            onPickProfessional={(professional) => {
              const service = services.find((item) => item.id === professional.services[0]?.service_id) || null;
              setClientSelectedService(service);
              setClientProblemQuery(publicProfessionalTrade(professional, services));
              setTab('home');
            }}
          />
        )}

        {tab === 'account' && (
          <AccountPanel
            key={`${profile.id}:${profile.city || ''}:${profile.phone || ''}`}
            profile={profile}
            clientOrders={clientOrders}
            canInstall={Boolean(installPrompt) && !isStandalone}
            onInstall={installApp}
            onUsePhoneLocation={usePhoneLocation}
            onNavigate={setTab}
            onProfileChange={setProfile}
            onOpenProfile={() => setTab('profile')}
            savingPhoneLocation={savingPhoneLocation}
            setNotice={setNotice}
          />
        )}
      </div>

      <nav className="v6-bottom" aria-label="Navegación principal">
        <NavButton active={tab === 'home'} onClick={() => setTab('home')} icon={<Home size={18} />}>
          Inicio
        </NavButton>
        <NavButton active={tab === 'search'} onClick={() => setTab('search')} icon={<Search size={18} />}>
          Buscar
        </NavButton>
        <NavButton
          active={tab === 'orders'}
          onClick={() => setTab('orders')}
          icon={<BriefcaseBusiness size={18} />}
        >
          {appMode === 'professional' ? 'Trabajos' : 'Pedidos'}
        </NavButton>
        <NavButton
          active={tab === 'favorites'}
          onClick={() => setTab('favorites')}
          icon={<Heart size={18} />}
        >
          Favoritos
        </NavButton>
        <NavButton
          active={tab === 'account'}
          onClick={() => setTab('account')}
          icon={<Settings size={18} />}
        >
          Cuenta
        </NavButton>
      </nav>

      {chatOrder && (
        <ChatSheet
          order={chatOrder}
          profile={profile}
          onClose={() => setChatOrder(null)}
          setError={setError}
        />
      )}
    </main>
  );
}

function SetupScreen({ onConnected }: { onConnected: () => void }) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');

  function connect() {
    if (!url.trim() || !key.trim()) return;
    saveStoredConfig({ url: url.trim(), key: key.trim() });
    onConnected();
    window.location.reload();
  }

  return (
    <main className="v6-app v6-center">
      <section className="v6-card">
        <p className="v6-live">
          <CircleDot size={14} aria-hidden="true" /> V6 backend real
        </p>
        <h1>Conecta MANITO con Supabase.</h1>
        <p className="v6-muted">
          Usa la URL del proyecto y la publishable key. La seguridad queda en
          RLS; nunca pegues service role en el navegador.
        </p>
        <label className="v6-field">
          <span>Supabase URL</span>
          <input value={url} onChange={(event) => setUrl(event.target.value)} />
        </label>
        <label className="v6-field">
          <span>Publishable key</span>
          <textarea value={key} onChange={(event) => setKey(event.target.value)} />
        </label>
        <button className="v6-primary" type="button" onClick={connect}>
          Guardar y conectar
        </button>
      </section>
    </main>
  );
}

function AuthScreen({ setNotice }: { setNotice: (message: string) => void }) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [localNotice, setLocalNotice] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLocalNotice(null);
    try {
      const supabase = getV6Supabase();
      if (mode === 'login') {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (loginError) throw loginError;
        return;
      }

      window.localStorage.setItem(
        pendingProfileKey(email),
        JSON.stringify({ fullName, role: 'client' }),
      );
      const { data, error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: getAuthCallbackUrl(),
        },
      });
      if (signupError) throw signupError;
      if (data.session) {
        await completeV6Profile({ fullName, role: 'client' });
      } else {
        setLocalNotice('Cuenta creada. Te mandamos un email para confirmar y entrar a MANITO.');
        setNotice('Cuenta creada. Revisá tu email para confirmar el acceso.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo ingresar.');
    }
  }

  return (
    <main className="v6-app v6-center">
      <section className="v6-card">
        <p className="v6-logo">
          MANI<span>TO</span>
        </p>
        <h1>{mode === 'login' ? 'Entra a MANITO.' : 'Crea tu cuenta MANITO.'}</h1>
        <p className="v6-muted">
          Entrás como cliente. Después podés activar tu perfil profesional desde Cuenta.
        </p>
        <div className="v6-tabs">
          <button type="button" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>
            Ingresar
          </button>
          <button type="button" aria-pressed={mode === 'signup'} onClick={() => setMode('signup')}>
            Registrarme
          </button>
        </div>
        <form className="v6-stack" onSubmit={submit}>
          {mode === 'signup' && (
            <>
              <label className="v6-field">
                <span>Nombre y apellido</span>
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
              </label>
            </>
          )}
          <label className="v6-field">
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="v6-field">
            <span>Contrasena</span>
            <input
              type="password"
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="v6-alert">{error}</p>}
          {localNotice && <p className="v6-note">{localNotice}</p>}
          <button className="v6-primary" type="submit">
            {mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </button>
        </form>
      </section>
    </main>
  );
}

function ClientHome({
  profile,
  services,
  specialties,
  publicProfessionals,
  clientOrders,
  selectedService,
  setSelectedService,
  problemQuery,
  setProblemQuery,
  setOrders,
  setChatOrder,
  setError,
  setNotice,
  onNavigate,
}: {
  profile: V6Profile;
  services: V6Service[];
  specialties: V6Specialty[];
  publicProfessionals: V6PublicProfessional[];
  clientOrders: V6Order[];
  selectedService: V6Service | null;
  setSelectedService: (service: V6Service | null) => void;
  problemQuery: string;
  setProblemQuery: (query: string) => void;
  setOrders: (orders: V6Order[]) => void;
  setChatOrder: (order: V6Order) => void;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  onNavigate: (tab: Tab) => void;
}) {
  const [description, setDescription] = useState('Necesito un plomero.');
  const [address, setAddress] = useState('');
  const [addressCity, setAddressCity] = useState(profile.city || '');
  const [mode, setMode] = useState<V6Mode>('immediate');
  const [scheduledAt, setScheduledAt] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>(() =>
    loadSavedAddresses(profile.id),
  );
  const [addressLabel, setAddressLabel] = useState('Casa');
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('auto');
  const [selectedProfessionalId, setSelectedProfessionalId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [paymentProfiles, setPaymentProfiles] = useState<V6PaymentProfile[]>([]);
  const [serviceGroup, setServiceGroup] = useState<ServiceGroupId>('all');
  const [creatingOrder, setCreatingOrder] = useState(false);
  const requestFormRef = useRef<HTMLElement | null>(null);
  const selectedBasePrice = selectedService?.base_price ?? 0;
  const candidateProfessionals = useMemo(
    () =>
      professionalCandidatesForService({
        service: selectedService,
        professionals: publicProfessionals,
        specialties,
        query: `${problemQuery}\n${description}`,
        clientCoords: coords,
      }),
    [coords, description, problemQuery, publicProfessionals, selectedService, specialties],
  );
  const selectedProfessionalCandidate =
    candidateProfessionals.find((candidate) => candidate.professional.profile.id === selectedProfessionalId) ||
    candidateProfessionals[0] ||
    null;
  const effectiveAssignmentMode =
    assignmentMode === 'manual' && candidateProfessionals.length ? 'manual' : 'auto';
  const estimatedPrice = selectedService
    ? (effectiveAssignmentMode === 'manual' && selectedProfessionalCandidate?.priceFrom
        ? selectedProfessionalCandidate.priceFrom
        : selectedBasePrice) + (mode === 'scheduled' ? 2000 : 0)
    : null;
  const etaText =
    mode === 'scheduled'
      ? 'Horario reservado'
      : selectedProfessionalCandidate?.etaMinutes
        ? `${selectedProfessionalCandidate.etaMinutes} min`
        : '30-45 min';
  const scoredServices = useMemo(
    () =>
      services
        .map((service) => ({ service, score: serviceScore(service, problemQuery) }))
        .sort((left, right) => right.score - left.score),
    [problemQuery, services],
  );
  const recommendedService = scoredServices.find((item) => item.score > 0)?.service || null;
  const recommendedSpecialties = recommendedService
    ? detectSpecialtiesForService(recommendedService, specialties, `${problemQuery}\n${description}`)
    : [];
  const selectedServiceSpecialties = selectedService
    ? specialties.filter((specialty) => specialty.service_id === selectedService.id)
    : [];
  const selectedServiceSpecialtyMatches = selectedService
    ? detectSpecialtiesForService(selectedService, specialties, `${problemQuery}\n${description}`)
    : [];
  const query = normalizeText(problemQuery);
  const scoreMatches = scoredServices
    .filter((item) => item.score > 0)
    .map((item) => item.service);
  const queryGroup = serviceGroupFromQuery(problemQuery);
  const activeServiceGroup = query.trim() && queryGroup !== 'all' ? queryGroup : serviceGroup;
  const queryFilteredServices = !query.trim()
    ? services
    : scoreMatches.length
      ? scoreMatches
      : services.filter((service) =>
          normalizeText(`${service.name} ${service.slug}`).includes(query),
        );
  const filteredServices = filterServicesByGroup(queryFilteredServices, activeServiceGroup);
  const recommendedProfessional =
      professionalCandidatesForService({
        service: recommendedService,
        professionals: publicProfessionals,
        specialties,
        query: `${problemQuery}\n${description}`,
        clientCoords: coords,
    })[0] || null;
  const photoNames = photoFiles.map((file) => file.name);
  const selectedPaymentProfile = paymentProfiles.find((payment) => payment.type === paymentMethod);

  const scrollToRequestForm = useCallback(() => {
    window.requestAnimationFrame(() => {
      requestFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  useEffect(() => {
    if (selectedService) scrollToRequestForm();
  }, [scrollToRequestForm, selectedService]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listV6ClientAddresses(profile.id),
      listV6PaymentProfiles(profile.id),
    ])
      .then(([remoteAddresses, remotePaymentProfiles]) => {
        if (!alive) return;
        if (remoteAddresses.length) {
          setSavedAddresses(remoteAddresses.map((item) => ({
            id: item.id,
            label: item.label,
            line: item.line,
            city: item.city,
            lat: item.lat,
            lng: item.lng,
          })));
        }
        setPaymentProfiles(remotePaymentProfiles);
        const preferredPayment =
          remotePaymentProfiles.find((payment) => payment.is_default) || remotePaymentProfiles[0];
        if (preferredPayment && isRequestPaymentMethod(preferredPayment.type)) {
          setPaymentMethod(preferredPayment.type);
        }
      })
      .catch(() => {
        if (alive) setPaymentProfiles([]);
      });
    return () => {
      alive = false;
    };
  }, [profile.id]);

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creatingOrder) return;
    if (!selectedService) {
      setError('Elegí un servicio.');
      return;
    }
    if (!address.trim()) {
      setError('Escribí la dirección del servicio.');
      return;
    }
    if (!addressCity.trim()) {
      setError('Escribí la ciudad.');
      return;
    }
    setCreatingOrder(true);
    try {
      const orderAddress = formatAddress(address, addressCity);
      const orderDescription = [
        description,
        recommendedSpecialties.length
          ? `Especialidad sugerida: ${recommendedSpecialties.map((match) => match.specialty.name).join(', ')}`
          : null,
        `Asignación: ${
          effectiveAssignmentMode === 'manual' && selectedProfessionalCandidate
            ? `prefiero a ${publicProfessionalName(selectedProfessionalCandidate.professional)}`
            : 'automática MANITO'
        }`,
        `Pago: ${paymentLabel(paymentMethod)}`,
        photoNames.length ? `Fotos cargadas: ${photoNames.join(', ')}` : null,
        'Garantía MANITO: 7 días',
      ]
        .filter(Boolean)
        .join('\n');
      const createdOrder = await createV6Order({
        clientId: profile.id,
        serviceId: selectedService.id,
        description: orderDescription,
        address: orderAddress,
        mode,
        assignmentMode: effectiveAssignmentMode,
        preferredProfessionalId:
          effectiveAssignmentMode === 'manual' && selectedProfessionalCandidate
            ? selectedProfessionalCandidate.professional.profile.id
            : null,
        paymentMethod,
        guaranteeDays: 7,
        etaMinutes: selectedProfessionalCandidate?.etaMinutes || null,
        scheduledAt: mode === 'scheduled' && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        price: estimatedPrice,
        lat: coords?.lat || null,
        lng: coords?.lng || null,
      });
      let photoUploadFailed = false;
      if (photoFiles.length) {
        try {
          await Promise.all(
            photoFiles.map(async (file) => {
              const filePath = await uploadV6MediaFile({
                ownerId: profile.id,
                area: 'orders',
                file,
              });
              await addV6OrderPhoto({
                orderId: createdOrder.id,
                uploadedBy: profile.id,
                stage: 'before',
                filePath,
                caption: file.name,
              });
            }),
          );
        } catch {
          photoUploadFailed = true;
        }
      }
      setOrders(await listV6Orders());
      setNotice(
        photoUploadFailed
          ? 'Pedido publicado. Algunas fotos no se pudieron subir; podés compartirlas por chat.'
          : 'Pedido publicado. Ya puede verlo un profesional disponible.',
      );
      setPhotoFiles([]);
      onNavigate('orders');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo publicar.');
    } finally {
      setCreatingOrder(false);
    }
  }

  function captureLocation() {
    navigator.geolocation?.getCurrentPosition(
      (position) =>
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      () => setError('No se pudo obtener GPS.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function saveAddress() {
    if (!address.trim()) {
      setError('Escribí una dirección para guardarla.');
      return;
    }
    if (!addressCity.trim()) {
      setError('Escribí la ciudad.');
      return;
    }
    try {
      const remoteAddress = await upsertV6ClientAddress({
        clientId: profile.id,
        label: addressLabel.trim() || 'Dirección',
        line: address.trim(),
        city: addressCity.trim(),
        lat: coords?.lat || null,
        lng: coords?.lng || null,
      });
      const nextAddress: SavedAddress = {
        id: remoteAddress.id,
        label: remoteAddress.label,
        line: remoteAddress.line,
        city: remoteAddress.city,
        lat: remoteAddress.lat,
        lng: remoteAddress.lng,
      };
      const nextAddresses = [nextAddress, ...savedAddresses.filter((item) => item.id !== nextAddress.id)].slice(0, 5);
      setSavedAddresses(nextAddresses);
      window.localStorage.setItem(savedAddressesKey(profile.id), JSON.stringify(nextAddresses));
      setNotice('Dirección guardada en tu cuenta.');
    } catch {
      const nextAddress: SavedAddress = {
        id: makeClientId('addr'),
        label: addressLabel.trim() || 'Dirección',
        line: address.trim(),
        city: addressCity.trim(),
        lat: coords?.lat || null,
        lng: coords?.lng || null,
      };
      const nextAddresses = [nextAddress, ...savedAddresses].slice(0, 5);
      setSavedAddresses(nextAddresses);
      window.localStorage.setItem(savedAddressesKey(profile.id), JSON.stringify(nextAddresses));
      setNotice('Dirección guardada en este dispositivo.');
    }
  }

  function chooseSavedAddress(addressId: string) {
    const savedAddress = savedAddresses.find((item) => item.id === addressId);
    if (!savedAddress) return;
    setAddress(savedAddress.line);
    setAddressCity(savedAddress.city || profile.city || '');
    setAddressLabel(savedAddress.label);
    if (savedAddress.lat != null && savedAddress.lng != null) {
      setCoords({ lat: savedAddress.lat, lng: savedAddress.lng });
    }
  }

  function updatePhotos(files: FileList | null) {
    const nextFiles = Array.from(files || [])
      .slice(0, 3);
    setPhotoFiles(nextFiles);
  }

  function applyRecommendation(service: V6Service, nextProblem = problemQuery) {
    const candidate = professionalCandidatesForService({
      service,
      professionals: publicProfessionals,
      specialties,
      query: `${nextProblem}\n${description}`,
      clientCoords: coords,
    })[0] || null;
    const label = serviceDisplayName(service);
    setSelectedService(service);
    setProblemQuery(nextProblem);
    setDescription(nextProblem.trim() || `Necesito ayuda con ${label}.`);
    setAssignmentMode(candidate ? 'manual' : 'auto');
    setSelectedProfessionalId(candidate?.professional.profile.id || '');
    setNotice(
      candidate
        ? `${label} seleccionado. Te muestro profesionales compatibles reales.`
        : `${label} seleccionado. Publicalo en automático hasta que haya profesionales disponibles.`,
    );
    scrollToRequestForm();
  }

  function applyExample(example: string) {
    const match =
      services
        .map((service) => ({ service, score: serviceScore(service, example) }))
        .sort((left, right) => right.score - left.score)
        .find((item) => item.score > 0)?.service || null;
    if (match) {
      applyRecommendation(match, example);
      return;
    }
    setProblemQuery(example);
    setNotice('Describí un poco más el problema y MANITO te recomienda una categoría.');
  }

  function chooseService(service: V6Service) {
    setSelectedService(service);
    if (!problemQuery.trim()) {
      setProblemQuery(serviceDisplayName(service));
    }
    setDescription((current) =>
      current.trim() && current !== 'Necesito un plomero.'
        ? current
        : `Necesito ayuda con ${serviceDisplayName(service)}.`,
    );
    setNotice(`${serviceDisplayName(service)} seleccionado. Completá el pedido.`);
    scrollToRequestForm();
  }

  function addSpecialtyToRequest(specialty: V6Specialty) {
    setDescription((current) => {
      if (normalizeText(current).includes(normalizeText(specialty.name))) return current;
      const prefix = current.trim() ? `${current.trim()}\n` : '';
      return `${prefix}Detalle: ${specialty.name}`;
    });
    setProblemQuery(
      normalizeText(problemQuery).includes(normalizeText(specialty.name))
        ? problemQuery
        : `${problemQuery.trim()} ${specialty.name}`.trim(),
    );
    setNotice(`${specialty.name} agregado al pedido.`);
  }

  function repeatLastOrder() {
    const lastOrder = clientOrders[0];
    if (!lastOrder) {
      setNotice('Todavía no hay pedidos para repetir. Elegí un servicio y creamos el primero.');
      scrollToRequestForm();
      return;
    }
    const lastService = services.find((service) => service.id === lastOrder.service_id) || null;
    if (lastService) setSelectedService(lastService);
    const parsedAddress = splitStoredAddress(lastOrder.address, profile.city);
    setDescription(lastOrder.description.split('\n')[0] || `Necesito ayuda con ${lastService ? serviceDisplayName(lastService) : 'un servicio'}.`);
    setAddress(parsedAddress.line);
    setAddressCity(parsedAddress.city);
    setMode(lastOrder.mode);
    setPaymentMethod(
      lastOrder.payment_method === 'wallet' || lastOrder.payment_method === 'cash'
        ? lastOrder.payment_method
        : 'card',
    );
    setNotice('Copié tu último pedido. Revisalo y publicalo de nuevo.');
    scrollToRequestForm();
  }

  async function shareTracking() {
    const activeOrder = clientOrders.find((order) => !['completed', 'cancelled'].includes(order.status));
    if (!activeOrder) {
      setNotice('Cuando tengas un pedido en curso vas a poder compartir el seguimiento.');
      return;
    }
    const text = orderTrackingText(activeOrder);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Seguimiento MANITO', text });
        setNotice('Seguimiento compartido.');
        return;
      }
      await navigator.clipboard?.writeText(text);
      setNotice('Seguimiento copiado. Pegalo en WhatsApp o donde quieras compartirlo.');
    } catch {
      setNotice('Abrí el pedido en curso para ver y compartir el seguimiento.');
    }
    onNavigate('orders');
  }

  function openAccountShortcut(message: string) {
    onNavigate('account');
    setNotice(message);
  }

  return (
    <>
      <section className="v6-hero">
        <p className="v6-live">
          <CircleDot size={14} aria-hidden="true" /> Backend conectado
        </p>
        <h1>Hola {profile.full_name || 'Jeremías'}, ¿qué necesitás resolver?</h1>
        <p>Publicá un pedido real. Un profesional conectado desde otro dispositivo puede aceptarlo.</p>
      </section>

      <AppointmentNotice
        orders={clientOrders}
        profile={profile}
        setChatOrder={setChatOrder}
      />

      <section className="v6-card v6-finder">
        <label className="v6-field">
          <span>Buscar por profesión o describir problema</span>
          <div className="v6-search-box">
            <Search size={18} aria-hidden="true" />
            <textarea
              value={problemQuery}
              onChange={(event) => setProblemQuery(event.target.value)}
              placeholder="Ej: pierde agua el baño, se cortó la luz, necesito pintar una pared"
            />
            <button
              className="v6-orange-button"
              type="button"
              disabled={!recommendedService}
              onClick={() => recommendedService && applyRecommendation(recommendedService)}
            >
              Analizar
            </button>
          </div>
        </label>
        <div className="v6-chip-row">
          {['Plomero', 'Electricista', 'Perdí la llave', 'No enfría el aire'].map((example) => (
            <button type="button" key={example} onClick={() => applyExample(example)}>
              {example}
            </button>
          ))}
          {['Mecánico automotor', 'Gomería', 'Chapista'].map((example) => (
            <button type="button" key={example} onClick={() => applyExample(example)}>
              {example}
            </button>
          ))}
        </div>
        {recommendedService && (
          <article className="v6-recommendation">
            <div>
              <span className="v6-order-icon">{serviceIcon(recommendedService.slug)}</span>
            </div>
            <div>
              <p>
                <Sparkles size={15} aria-hidden="true" /> MANITO recomienda
              </p>
              <strong>{serviceDisplayName(recommendedService)}</strong>
              {recommendedProfessional ? (
                <small>
                  {publicProfessionalName(recommendedProfessional.professional)} - {' '}
                  {recommendedProfessional.professional.professional_profile?.rating_avg || 4.8} estrellas - {' '}
                  {recommendedProfessional.etaMinutes || recommendedProfessional.professional.professional_profile?.response_minutes || 35} min
                </small>
              ) : (
                <small>Sin profesionales disponibles para elegir ahora. Podés publicarlo en automático.</small>
              )}
              {recommendedSpecialties[0] && (
                <small>Especialidad sugerida: {recommendedSpecialties[0].specialty.name}</small>
              )}
            </div>
            <button className="v6-primary" type="button" onClick={() => applyRecommendation(recommendedService)}>
              Pedir
            </button>
          </article>
        )}
        {problemQuery.trim().length > 2 && !recommendedService && (
          <p className="v6-muted">No encontré una coincidencia exacta. Podés elegir un servicio abajo y describirlo igual.</p>
        )}
      </section>

      <section className="v6-section v6-flat-section">
        <div className="v6-section-head">
          <h2>¿Cómo lo necesitás?</h2>
          <span>elegí modalidad</span>
        </div>
        <div className="v6-mode-grid">
          {([
            { id: 'immediate', title: 'Ahora', body: 'Lo antes posible', icon: <PlugZap size={20} aria-hidden="true" /> },
            { id: 'scheduled', title: 'Programar', body: 'Día y horario', icon: <Clock size={20} aria-hidden="true" /> },
            { id: 'quote', title: 'Presupuestar', body: 'Comparar precios', icon: <MessageCircle size={20} aria-hidden="true" /> },
          ] as Array<{ id: V6Mode; title: string; body: string; icon: ReactNode }>).map((item) => (
            <button
              className="v6-mode-card"
              type="button"
              aria-pressed={mode === item.id}
              key={item.id}
              onClick={() => setMode(item.id)}
            >
              {item.icon}
              <strong>{item.title}</strong>
              <small>{item.body}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="v6-section">
        <div className="v6-section-head">
          <h2>Servicios</h2>
          <span>{filteredServices.length} disponibles</span>
        </div>
        <div className="v6-chip-row nowrap">
          {serviceGroups.map((group) => (
            <button
              type="button"
              key={group.id}
              aria-pressed={activeServiceGroup === group.id}
              onClick={() => {
                setServiceGroup(group.id);
                setProblemQuery('');
              }}
            >
              {group.label}
            </button>
          ))}
        </div>
        <div className="v6-services">
          {filteredServices.map((service) => (
            <button
              className="v6-service"
              type="button"
              aria-pressed={selectedService?.id === service.id}
              key={service.id}
              onClick={() => chooseService(service)}
            >
              <span>{serviceIcon(service.slug)}</span>
              <strong>{serviceDisplayName(service)}</strong>
              <small>Desde {money(service.base_price)}</small>
            </button>
          ))}
        </div>
      </section>

      {selectedService && (
        <section className="v6-card" ref={requestFormRef}>
          <h2>{serviceDisplayName(selectedService)}</h2>
          <form className="v6-stack" onSubmit={createOrder}>
            <label className="v6-field">
              <span>Que necesitas?</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} required />
            </label>
            {selectedServiceSpecialties.length > 0 && (
              <div className="v6-specialty-panel compact">
                <div className="v6-section-head compact">
                  <h2>Especialidad</h2>
                  <span>
                    {selectedServiceSpecialtyMatches[0]
                      ? `detecté ${selectedServiceSpecialtyMatches[0].specialty.name}`
                      : 'opcional'}
                  </span>
                </div>
                <div className="v6-chip-list">
                  {selectedServiceSpecialties.map((specialty) => (
                    <button
                      type="button"
                      key={specialty.id}
                      aria-pressed={selectedServiceSpecialtyMatches.some((match) => match.specialty.id === specialty.id)}
                      onClick={() => addSpecialtyToRequest(specialty)}
                    >
                      {specialty.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="v6-split">
              <label className="v6-field">
                <span>Direcciones guardadas</span>
                <select defaultValue="" onChange={(event) => chooseSavedAddress(event.target.value)}>
                  <option value="" disabled>
                    {savedAddresses.length ? 'Elegir dirección' : 'Todavía no guardaste direcciones'}
                  </option>
                  {savedAddresses.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.label} - {formatAddress(item.line, item.city)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="v6-field">
                <span>Nombre</span>
                <input value={addressLabel} onChange={(event) => setAddressLabel(event.target.value)} />
              </label>
            </div>
            <label className="v6-field">
              <span>Dirección</span>
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Calle, número, piso o referencia"
                required
              />
            </label>
            <label className="v6-field">
              <span>Ciudad</span>
              <input
                value={addressCity}
                onChange={(event) => setAddressCity(event.target.value)}
                placeholder="Ej: Tres Arroyos"
                required
              />
            </label>
            <div className="v6-actions-row">
              <button className="v6-secondary" type="button" onClick={captureLocation}>
                <LocateFixed size={17} aria-hidden="true" />
                {coords ? 'GPS capturado' : 'Usar GPS'}
              </button>
              <button className="v6-secondary" type="button" onClick={saveAddress}>
                <MapPin size={17} aria-hidden="true" />
                Guardar dirección
              </button>
            </div>
            {mode === 'scheduled' && (
              <label className="v6-field">
                <span>Fecha y hora</span>
                <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
              </label>
            )}

            <label className="v6-field">
              <span>Fotos del problema</span>
              <input type="file" accept="image/*" multiple onChange={(event) => updatePhotos(event.target.files)} />
            </label>
            {photoNames.length > 0 && (
              <div className="v6-file-list">
                {photoNames.map((name) => (
                  <span key={name}>
                    <Camera size={15} aria-hidden="true" /> {name}
                  </span>
                ))}
              </div>
            )}

            <div className="v6-section-head compact">
              <h2>Asignación</h2>
              <span>{effectiveAssignmentMode === 'manual' ? 'Elegís vos' : 'MANITO asigna'}</span>
            </div>
            <div className="v6-choice-grid">
              <button
                type="button"
                className="v6-choice"
                aria-pressed={effectiveAssignmentMode === 'auto'}
                onClick={() => setAssignmentMode('auto')}
              >
                <Users size={18} aria-hidden="true" />
                Automático
              </button>
              <button
                type="button"
                className="v6-choice"
                aria-pressed={effectiveAssignmentMode === 'manual'}
                disabled={!candidateProfessionals.length}
                onClick={() => setAssignmentMode('manual')}
              >
                <Star size={18} aria-hidden="true" />
                Elegir profesional
              </button>
            </div>

            {effectiveAssignmentMode === 'manual' && (
              <div className="v6-pro-list">
                {candidateProfessionals.map((candidate) => (
                  <button
                    className="v6-pro-card"
                    type="button"
                    aria-pressed={selectedProfessionalCandidate?.professional.profile.id === candidate.professional.profile.id}
                    key={candidate.professional.profile.id}
                    onClick={() => setSelectedProfessionalId(candidate.professional.profile.id)}
                  >
                    <span className="v6-pro-avatar">{publicProfessionalName(candidate.professional).slice(0, 1)}</span>
                    <span>
                      <strong>{publicProfessionalName(candidate.professional)}</strong>
                      <small>{publicProfessionalTrade(candidate.professional, services)}</small>
                      <small>
                        {candidate.professional.professional_profile?.rating_avg || 4.8} estrellas - {' '}
                        {candidate.professional.professional_profile?.jobs_completed || 0} trabajos - {' '}
                        {candidate.distanceKm != null
                          ? `${candidate.distanceKm < 1 ? 'menos de 1' : candidate.distanceKm.toFixed(1)} km`
                          : candidate.professional.professional_profile?.work_city || candidate.professional.profile.city || 'zona a confirmar'} - {' '}
                        {candidate.etaMinutes || candidate.professional.professional_profile?.response_minutes || 35} min
                      </small>
                      <em>{candidate.reasons.join(' - ')}</em>
                    </span>
                    <span className="v6-badges">
                      {candidate.professional.professional_profile?.verified && <BadgeCheck size={17} aria-label="Verificado" />}
                      {candidate.professional.professional_profile?.manito_pro && <b>PRO</b>}
                      <Heart size={17} aria-label="Favorito" />
                    </span>
                  </button>
                ))}
              </div>
            )}
            {!candidateProfessionals.length && selectedService && (
              <p className="v6-muted">
                Todavía no hay profesionales disponibles para elegir en {serviceDisplayName(selectedService)}. Publicalo en automático para que aparezca cuando haya uno conectado.
              </p>
            )}

            <div className="v6-section-head compact">
              <h2>Pago</h2>
              <span>Método preferido</span>
            </div>
            <div className="v6-choice-grid three">
              {paymentOptions.map((option) => (
                <button
                  type="button"
                  className="v6-choice"
                  aria-pressed={paymentMethod === option.id}
                  key={option.id}
                  onClick={() => setPaymentMethod(option.id)}
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
            </div>
            {selectedPaymentProfile && (
              <div className="v6-file-list">
                <span className="active">
                  {paymentProfileIcon(selectedPaymentProfile)} {paymentProfileDisplay(selectedPaymentProfile)}
                  <b>Se usará en este pedido</b>
                </span>
              </div>
            )}
            {!selectedPaymentProfile && (
              <p className="v6-muted">Este método se usará solo para este pedido. Podés guardarlo desde Cuenta.</p>
            )}
            {paymentMethod === 'wallet' && (
              <p className="v6-note">
                Para pruebas, MANITO registra Cuenta DNI/billetera como método preferido. El cobro real se coordina por QR o link hasta integrar un proveedor de pagos.
              </p>
            )}

            {mode === 'quote' && selectedService && (
              <div className="v6-quote-list">
                {candidateProfessionals.slice(0, 3).map((candidate) => (
                  <article className="v6-quote-card" key={candidate.professional.profile.id}>
                    <strong>{publicProfessionalName(candidate.professional)}</strong>
                    <span>
                      {candidate.professional.professional_profile?.rating_avg || 4.8} estrellas - {' '}
                      {candidate.etaMinutes ? `${candidate.etaMinutes} min` : 'horario a coordinar'} - visita {money(6500)}
                    </span>
                    <p>
                      Mano de obra {money(candidate.priceFrom || selectedBasePrice)}
                      {' '}+ fee MANITO {money(2500)}
                    </p>
                  </article>
                ))}
                {!candidateProfessionals.length && (
                  <article className="v6-quote-card">
                    <strong>Presupuesto abierto</strong>
                    <span>Se publicará para profesionales disponibles del rubro.</span>
                    <p>Cuando un prestador real responda, vas a poder comparar su propuesta.</p>
                  </article>
                )}
              </div>
            )}

            <div className="v6-summary">
              <span>
                <ShieldCheck size={17} aria-hidden="true" /> Garantía MANITO 7 días
              </span>
              <strong>{money(estimatedPrice)}</strong>
              <small>ETA {etaText} - {paymentLabel(paymentMethod)}</small>
            </div>
            <button className="v6-primary" type="submit" disabled={creatingOrder}>
              {creatingOrder ? 'Publicando...' : 'Publicar pedido'}
            </button>
          </form>
        </section>
      )}

      <section className="v6-card">
        <div className="v6-section-head">
          <h2>Atajos</h2>
          <span>Cuenta y seguridad</span>
        </div>
        <div className="v6-step-grid">
          <button className="done" type="button" onClick={repeatLastOrder}>
            Repetir pedido habitual
          </button>
          <button className="done" type="button" onClick={() => onNavigate('favorites')}>
            Profesionales favoritos
          </button>
          <button
            className="done"
            type="button"
            onClick={() => openAccountShortcut('En Cuenta tenés tu código de referido para compartir.')}
          >
            Referir amigo con promo
          </button>
          <button className="done" type="button" onClick={shareTracking}>
            Compartir seguimiento
          </button>
          <button
            className="done"
            type="button"
            onClick={() => openAccountShortcut('En Cuenta podés configurar tu contacto de confianza.')}
          >
            Contacto de confianza
          </button>
          <button
            className="done"
            type="button"
            onClick={() => openAccountShortcut('En Cuenta dejamos visible la opción de privacidad del teléfono.')}
          >
            Ocultar teléfono en chat
          </button>
        </div>
      </section>

      <section className="v6-section">
        <div className="v6-section-head">
          <h2>Pedidos recientes</h2>
          <span>Realtime</span>
        </div>
        {clientOrders.slice(0, 4).map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            profile={profile}
            setOrders={setOrders}
            setChatOrder={setChatOrder}
            setError={setError}
            setNotice={setNotice}
          />
        ))}
        {!clientOrders.length && <Empty title="Todavía no pediste nada" body="Elegí un servicio para crear el primer pedido real." />}
      </section>
    </>
  );
}

function SearchPanel({
  services,
  selectedService,
  problemQuery,
  setProblemQuery,
  onPickService,
}: {
  services: V6Service[];
  selectedService: V6Service | null;
  problemQuery: string;
  setProblemQuery: (query: string) => void;
  onPickService: (service: V6Service) => void;
}) {
  const [serviceGroup, setServiceGroup] = useState<ServiceGroupId>('all');
  const scoredServices = useMemo(
    () =>
      services
        .map((service) => ({ service, score: serviceScore(service, problemQuery) }))
        .sort((left, right) => right.score - left.score),
    [problemQuery, services],
  );
  const queryGroup = serviceGroupFromQuery(problemQuery);
  const activeServiceGroup = problemQuery.trim() && queryGroup !== 'all' ? queryGroup : serviceGroup;
  const filteredServicesByQuery = problemQuery.trim()
    ? scoredServices.filter((item) => item.score > 0).map((item) => item.service)
    : services;
  const filteredServices = filterServicesByGroup(filteredServicesByQuery, activeServiceGroup);
  const visibleServices = filteredServices.length
    ? filteredServices
    : filterServicesByGroup(services, activeServiceGroup);

  return (
    <>
      <section className="v6-card v6-search-page">
        <label className="v6-field">
          <span>Buscar un servicio</span>
          <div className="v6-search-box line">
            <Search size={18} aria-hidden="true" />
            <input
              value={problemQuery}
              onChange={(event) => setProblemQuery(event.target.value)}
              placeholder="Buscar un servicio"
            />
            <button
              className="v6-orange-button"
              type="button"
              onClick={() => visibleServices[0] && onPickService(visibleServices[0])}
            >
              Buscar
            </button>
          </div>
        </label>
      </section>

      <section className="v6-section v6-flat-section">
        <div className="v6-section-head">
          <h2>Categorías</h2>
          <span>{visibleServices.length} resultados</span>
        </div>
        <div className="v6-chip-row nowrap">
          {serviceGroups.map((group) => (
            <button
              type="button"
              key={group.id}
              aria-pressed={activeServiceGroup === group.id}
              onClick={() => {
                setServiceGroup(group.id);
                setProblemQuery('');
              }}
            >
              {group.label}
            </button>
          ))}
        </div>
        <div className="v6-chip-row nowrap">
          {visibleServices.slice(0, 7).map((service) => (
            <button type="button" key={service.id} onClick={() => setProblemQuery(serviceDisplayName(service))}>
              {serviceDisplayName(service)}
            </button>
          ))}
        </div>
        <div className="v6-service-list">
          {visibleServices.map((service) => (
            <article className="v6-list-service" key={service.id}>
              <span>{serviceInitials(service)}</span>
              <div>
                <strong>{serviceDisplayName(service)}</strong>
                <p>{serviceDescription(service.slug)}</p>
                <small>Desde {money(service.base_price)} - ETA según disponibilidad</small>
              </div>
              <button
                className={selectedService?.id === service.id ? 'v6-orange-button' : 'v6-primary'}
                type="button"
                onClick={() => onPickService(service)}
              >
                Pedir
              </button>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function AppointmentNotice({
  orders,
  profile,
  setChatOrder,
}: {
  orders: V6Order[];
  profile: V6Profile;
  setChatOrder: (order: V6Order) => void;
}) {
  const nextOrder = [...orders]
    .filter((order) =>
      ['accepted', 'en_camino', 'en_sitio'].includes(order.status) ||
      (order.status === 'open' && Boolean(order.scheduled_at)),
    )
    .sort(
      (left, right) =>
        new Date(appointmentDate(left)).getTime() -
        new Date(appointmentDate(right)).getTime(),
    )[0];

  if (!nextOrder) return null;

  const counterpart = profile.role === 'client' ? nextOrder.professional : nextOrder.client;
  const counterpartLabel = profile.role === 'client' ? 'Prestador' : 'Cliente';
  const canChat = Boolean(nextOrder.professional_id);
  const appointmentLabel = nextOrder.scheduled_at
    ? shortDate(nextOrder.scheduled_at)
    : nextOrder.status === 'accepted'
      ? 'Coordinación pendiente'
      : V6_STATUS_LABEL[nextOrder.status];
  const appointmentTitle =
    nextOrder.status === 'open'
      ? 'Pedido programado pendiente de prestador'
      : profile.role === 'client'
        ? 'Tenés una cita con un prestador'
        : 'Tenés una cita con un cliente';

  return (
    <section className="v6-appointment">
      <div>
        <p className="v6-live">
          <Clock size={14} aria-hidden="true" /> Cita pendiente
        </p>
        <h2>{appointmentTitle}</h2>
        <p>
          {serviceDisplayName(nextOrder.service)} · {appointmentLabel}
        </p>
        <p>{nextOrder.address}</p>
        <div className="v6-meta-row">
          <span>{V6_STATUS_LABEL[nextOrder.status]}</span>
          {nextOrder.payment_method && <span>Pago {paymentLabel(nextOrder.payment_method)}</span>}
          {nextOrder.eta_minutes && <span>ETA {nextOrder.eta_minutes} min</span>}
        </div>
        <small>
          {counterpart
            ? `${counterpartLabel}: ${counterpart.full_name || 'Usuario MANITO'}`
            : 'Cuando un prestador acepte, se habilita el chat.'}
        </small>
      </div>
      {canChat && (
        <button className="v6-secondary" type="button" onClick={() => setChatOrder(nextOrder)}>
          <MessageCircle size={16} aria-hidden="true" /> Chat
        </button>
      )}
    </section>
  );
}

function FavoritesPanel({
  professionals,
  services,
  specialties,
  onPickProfessional,
}: {
  professionals: V6PublicProfessional[];
  services: V6Service[];
  specialties: V6Specialty[];
  onPickProfessional: (professional: V6PublicProfessional) => void;
}) {
  return (
    <>
      <section className="v6-card v6-referral">
        <h2>Favoritos</h2>
        <p>Volvés a contratar rápido a quienes ya te dieron confianza.</p>
      </section>
      <section className="v6-section v6-flat-section">
        <div className="v6-section-head">
          <h2>Profesionales disponibles</h2>
          <span>{professionals.length}</span>
        </div>
        <div className="v6-pro-list">
          {professionals.map((professional) => {
            const specialtyNames = professional.specialties
              .map((item) => specialties.find((specialty) => specialty.id === item.specialty_id)?.name)
              .filter((name): name is string => Boolean(name))
              .slice(0, 4);
            return (
            <button className="v6-pro-card v6-public-pro" type="button" key={professional.profile.id} onClick={() => onPickProfessional(professional)}>
              <span className="v6-pro-avatar">
                {publicProfessionalName(professional).split(' ').map((part) => part[0]).join('').slice(0, 2)}
              </span>
              <span>
                <strong>{publicProfessionalName(professional)}</strong>
                <small>
                  {professional.professional_profile?.rating_avg || 4.8} estrellas - {' '}
                  {professional.professional_profile?.jobs_completed || 0} trabajos - {' '}
                  {publicProfessionalTrade(professional, services)}
                </small>
                <em>{specialtyNames.length ? specialtyNames.join(' - ') : 'Especialidades a confirmar'}</em>
              </span>
              <span className="v6-badges">
                {professional.professional_profile?.manito_pro && <b>PRO</b>}
                <Heart size={17} aria-label="Favorito" />
              </span>
            </button>
            );
          })}
        </div>
        {!professionals.length && (
          <Empty title="Sin profesionales disponibles" body="Cuando haya cuentas de prueba con rubros activos van a aparecer acá." />
        )}
      </section>
    </>
  );
}

function serviceDescription(slug: string) {
  if (slug === 'plomeria') return 'Pérdidas, cañerías, griferías, destapes y reparaciones generales.';
  if (slug === 'electricidad') return 'Cortes, tomas, térmicas, luces y reparaciones eléctricas domiciliarias.';
  if (slug === 'limpieza') return 'Limpieza general, profunda, post obra y servicios por hora.';
  if (slug === 'gas') return 'Revisión, pérdidas, calefones, cocinas y trabajos con gasistas.';
  if (slug === 'cerrajeria') return 'Aperturas, cambios de cerradura y urgencias de acceso.';
  if (slug === 'pintura') return 'Pintura interior y exterior, retoques y ambientes completos.';
  if (slug === 'jardin') return 'Corte de césped, poda, mantenimiento, terrenos y riego.';
  if (slug === 'arreglos') return 'Armado de muebles, colocaciones, perforaciones, montajes y mantenimiento.';
  if (slug === 'aire') return 'Instalación, limpieza, carga de gas, diagnóstico y mantenimiento de splits.';
  if (slug === 'electro') return 'Heladeras, lavarropas, hornos, microondas y diagnóstico de equipos.';
  if (slug === 'mudanzas') return 'Fletes, mudanzas completas, embalaje, armado y desarmado.';
  if (slug === 'carpinteria') return 'Muebles a medida, puertas, estantes y reparaciones de madera.';
  if (slug === 'fumigacion') return 'Control de cucarachas, hormigas, roedores y desinsectación.';
  if (slug === 'tecnologia') return 'PC, notebooks, Wi-Fi, redes, impresoras e instalación de software.';
  if (slug === 'albanileria') return 'Revoques, pisos, paredes y reparaciones de albañilería.';
  if (slug === 'pileta') return 'Limpieza, bombas, filtros y mantenimiento de piletas.';
  if (slug === 'mecanica_automotor') return 'Diagnóstico, frenos, batería, arranque, service y fallas generales.';
  if (slug === 'gomeria') return 'Pinchaduras, cubiertas, alineación, balanceo y auxilio de ruedas.';
  if (slug === 'chapa_pintura_auto') return 'Chapa, pintura, rayones, abolladuras y arreglos de carrocería.';
  return 'Profesionales verificados para resolver tareas del hogar.';
}

function ProfessionalHome({
  profile,
  services,
  specialties,
  proServices,
  proSpecialties,
  matchingOrders,
  activeOrders,
  setProfile,
  setProServices,
  setProSpecialties,
  setOrders,
  setChatOrder,
  setError,
  setNotice,
}: {
  profile: V6Profile;
  services: V6Service[];
  specialties: V6Specialty[];
  proServices: V6ProfessionalService[];
  proSpecialties: V6ProfessionalSpecialty[];
  matchingOrders: V6Order[];
  activeOrders: V6Order[];
  setProfile: (profile: V6Profile) => void;
  setProServices: (services: V6ProfessionalService[]) => void;
  setProSpecialties: (specialties: V6ProfessionalSpecialty[]) => void;
  setOrders: (orders: V6Order[]) => void;
  setChatOrder: (order: V6Order) => void;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
}) {
  const [professionalProfile, setProfessionalProfile] = useState<V6ProfessionalProfile | null>(null);

  useEffect(() => {
    let active = true;
    getV6ProfessionalProfile(profile.id)
      .then((nextProfile) => {
        if (active) setProfessionalProfile(nextProfile);
      })
      .catch(() => {
        if (active) setProfessionalProfile(null);
      });
    return () => {
      active = false;
    };
  }, [profile.id]);

  const compatibleMatches = useMemo(
    () =>
      matchingOrders
        .map((order) =>
          evaluateProfessionalOrderMatch(
            order,
            profile,
            professionalProfile,
            proServices,
            proSpecialties,
            specialties,
          ),
        )
        .filter((match): match is ProfessionalOrderMatch => Boolean(match))
        .sort((a, b) => b.score - a.score),
    [matchingOrders, proServices, proSpecialties, professionalProfile, profile, specialties],
  );

  async function toggleAvailable() {
    try {
      setProfile(await setV6Availability(profile.id, !profile.is_available));
      setNotice(!profile.is_available ? 'Ahora estás disponible.' : 'Disponibilidad desactivada.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cambiar disponibilidad.');
    }
  }

  async function toggleService(serviceId: number) {
    const current = new Set(proServices.map((item) => item.service_id));
    if (current.has(serviceId)) current.delete(serviceId);
    else current.add(serviceId);
    const nextServiceIds = [...current];
    const nextSpecialtyIds = proSpecialties
      .filter((item) => current.has(item.service_id))
      .map((item) => item.specialty_id);
    try {
      setProServices(await saveV6ProfessionalServices(profile.id, nextServiceIds, services));
      setProSpecialties(await saveV6ProfessionalSpecialties(profile.id, nextSpecialtyIds, specialties));
      setNotice('Servicios guardados.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se guardaron servicios.');
    }
  }

  async function accept(orderId: string) {
    try {
      const acceptedOrder = await acceptV6Order(orderId);
      setOrders(await listV6Orders());
      setChatOrder(acceptedOrder);
      setNotice('Trabajo aceptado. Usá el chat del pedido para coordinar con el cliente.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'El pedido ya no está disponible.');
    }
  }

  const grossIncome = activeOrders.reduce(
    (total, order) => total + Number(order.price || order.service?.base_price || 0),
    0,
  );
  const commission = Math.round(grossIncome * 0.12);
  const netIncome = Math.max(0, grossIncome - commission);
  const completedJobs = activeOrders.filter((order) => order.status === 'completed').length;
  const proProgress = Math.min(100, completedJobs * 10 + proServices.length * 8);

  return (
    <>
      <section className="v6-available">
        <div>
          <strong>{profile.is_available ? 'Estás disponible' : 'No estás recibiendo pedidos'}</strong>
          <p>{profile.is_available ? 'MANITO muestra trabajos compatibles.' : 'Activa disponibilidad cuando quieras trabajar.'}</p>
        </div>
        <button className="v6-switch" type="button" aria-pressed={profile.is_available} onClick={toggleAvailable}>
          <span />
        </button>
      </section>

      <AppointmentNotice
        orders={activeOrders}
        profile={profile}
        setChatOrder={setChatOrder}
      />

      <section className="v6-card">
        <div className="v6-section-head">
          <h2>Panel profesional</h2>
          <span>MANITO PRO {proProgress}%</span>
        </div>
        <div className="v6-admin-grid">
          <article>
            <strong>{money(grossIncome)}</strong>
            <span>Bruto</span>
          </article>
          <article>
            <strong>{money(commission)}</strong>
            <span>Comisión MANITO</span>
          </article>
          <article>
            <strong>{money(netIncome)}</strong>
            <span>Neto estimado</span>
          </article>
          <article>
            <strong>{compatibleMatches.length}</strong>
            <span>Pedidos cercanos</span>
          </article>
        </div>
        <div className="v6-progress">
          <span style={{ width: `${proProgress}%` }} />
        </div>
      </section>

      <section className="v6-card">
        <h2>Mis servicios</h2>
        <div className="v6-check-grid">
          {services.map((service) => (
            <button
              className="v6-check-service"
              type="button"
              key={service.id}
              aria-pressed={proServices.some((item) => item.service_id === service.id)}
              onClick={() => toggleService(service.id)}
            >
              {serviceIcon(service.slug)} {serviceDisplayName(service)}
            </button>
          ))}
        </div>
      </section>

      <section className="v6-section">
        <div className="v6-section-head">
          <h2>Pedidos disponibles</h2>
          <span>{compatibleMatches.length} compatibles</span>
        </div>
        {profile.is_available &&
          compatibleMatches.map((match) =>
            match.order.mode === 'quote' ? (
              <div className="v6-match-card" key={match.order.id}>
                <MatchSummary match={match} />
                <OrderCard
                  order={match.order}
                  profile={profile}
                  setOrders={() => undefined}
                  setChatOrder={setChatOrder}
                  setError={setError}
                  setNotice={setNotice}
                />
              </div>
            ) : (
              <article className="v6-order" key={match.order.id}>
                <div className="v6-order-top">
                  <span className="v6-order-icon">{serviceIcon(match.order.service?.slug || '')}</span>
                  <div>
                    <strong>{serviceDisplayName(match.order.service)}</strong>
                    <p>{match.order.description}</p>
                    <small>Match {match.score}% · {V6_MODE_LABEL[match.order.mode]}</small>
                    <small>
                      <MapPin size={13} aria-hidden="true" /> {match.order.address}
                    </small>
                  </div>
                  <b>{money(match.order.service?.base_price)}</b>
                </div>
                <MatchSummary match={match} />
                <button className="v6-primary" type="button" onClick={() => accept(match.order.id)}>
                  Aceptar trabajo
                </button>
              </article>
            ),
          )}
        {!profile.is_available && <Empty title="Estás desconectado" body="Activá Disponible para ver pedidos abiertos." />}
        {profile.is_available && !compatibleMatches.length && <Empty title="No hay pedidos compatibles" body="Cuando un cliente publique un servicio dentro de tu zona y horario aparecerá acá." />}
      </section>

      <section className="v6-section">
        <div className="v6-section-head">
          <h2>Trabajos activos</h2>
          <span>{activeOrders.length}</span>
        </div>
        {activeOrders
          .filter((order) => !['completed', 'cancelled'].includes(order.status))
          .map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              profile={profile}
              setOrders={() => undefined}
              setChatOrder={setChatOrder}
              setError={setError}
              setNotice={setNotice}
            />
          ))}
      </section>
    </>
  );
}

function MatchSummary({ match }: { match: ProfessionalOrderMatch }) {
  return (
    <div className="v6-match-summary" aria-label="Motivos de compatibilidad">
      {match.reasons.map((reason) => (
        <span key={reason}>{reason}</span>
      ))}
    </div>
  );
}

function OrdersList(props: {
  profile: V6Profile;
  orders: V6Order[];
  setOrders: (orders: V6Order[]) => void;
  setChatOrder: (order: V6Order) => void;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
}) {
  return (
    <>
      <AppointmentNotice
        orders={props.orders}
        profile={props.profile}
        setChatOrder={props.setChatOrder}
      />
      <section className="v6-section">
        <div className="v6-section-head">
          <h2>{props.profile.role === 'professional' ? 'Mis trabajos' : 'Mis pedidos'}</h2>
          <span>{props.orders.length}</span>
        </div>
        {props.orders.map((order) => (
          <OrderCard key={order.id} order={order} {...props} />
        ))}
        {!props.orders.length && <Empty title="Todavía está vacío" body="Los pedidos aparecerán acá y se sincronizarán entre dispositivos." />}
      </section>
    </>
  );
}

function OrderCard({
  order,
  profile,
  setOrders,
  setChatOrder,
  setError,
  setNotice,
}: {
  order: V6Order;
  profile: V6Profile;
  setOrders: (orders: V6Order[]) => void;
  setChatOrder: (order: V6Order) => void;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
}) {
  const other = profile.role === 'client' ? order.professional : order.client;
  const nextLabel =
    order.status === 'accepted'
      ? 'Salir hacia domicilio'
      : order.status === 'en_camino'
        ? 'Marcar llegada'
        : 'Finalizar trabajo';
  const [proposals, setProposals] = useState<V6OrderProposal[]>([]);
  const [extras, setExtras] = useState<V6OrderExtra[]>([]);
  const [photos, setPhotos] = useState<Array<V6OrderPhoto & { signedUrl: string | null }>>([]);
  const [evidenceStage, setEvidenceStage] = useState<V6OrderPhoto['stage']>('during');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [proposalLabor, setProposalLabor] = useState(String(order.service?.base_price || 18000));
  const [proposalMaterials, setProposalMaterials] = useState('0');
  const [proposalVisit, setProposalVisit] = useState('6500');
  const [proposalNote, setProposalNote] = useState('Puedo verlo hoy y confirmar materiales antes de empezar.');
  const [extraTitle, setExtraTitle] = useState('Material adicional');
  const [extraAmount, setExtraAmount] = useState('4500');
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [complaintDetail, setComplaintDetail] = useState('');

  const refreshCommercialData = useCallback(async () => {
    const [nextProposals, nextExtras] = await Promise.all([
      listV6OrderProposals(order.id),
      listV6OrderExtras(order.id),
    ]);
    setProposals(nextProposals);
    setExtras(nextExtras);
  }, [order.id]);

  const refreshPhotos = useCallback(async () => {
    const nextPhotos = await listV6OrderPhotos(order.id);
    const photosWithUrls = await Promise.all(
      nextPhotos.map(async (photo) => ({
        ...photo,
        signedUrl: await getV6MediaSignedUrl(photo.file_path),
      })),
    );
    setPhotos(photosWithUrls);
  }, [order.id]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listV6OrderProposals(order.id),
      listV6OrderExtras(order.id),
    ])
      .then(async ([nextProposals, nextExtras]) => {
        if (!alive) return;
        setProposals(nextProposals);
        setExtras(nextExtras);
        if (alive) await refreshPhotos();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [order.id, refreshPhotos]);

  async function advance() {
    try {
      await advanceV6Order(order.id);
      setOrders(await listV6Orders());
      setNotice('Estado actualizado.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo avanzar.');
    }
  }

  async function cancel() {
    try {
      await cancelV6Order(order.id);
      setOrders(await listV6Orders());
      setNotice('Pedido cancelado.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cancelar.');
    }
  }

  async function sendProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await sendV6OrderProposal({
        orderId: order.id,
        professionalId: profile.id,
        laborPrice: Number(proposalLabor) || 0,
        materialsPrice: Number(proposalMaterials) || 0,
        visitPrice: Number(proposalVisit) || 0,
        manitoFee: 2500,
        estimatedMinutes: 90,
        availabilityLabel: 'Hoy',
        observation: proposalNote,
      });
      await refreshCommercialData();
      setNotice('Presupuesto enviado.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo enviar presupuesto.');
    }
  }

  async function acceptProposal(proposalId: string) {
    try {
      await acceptV6Proposal(proposalId);
      setOrders(await listV6Orders());
      await refreshCommercialData();
      setNotice('Presupuesto aceptado.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo aceptar presupuesto.');
    }
  }

  async function createExtra(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order.professional_id) return;
    try {
      await addV6OrderExtra({
        orderId: order.id,
        professionalId: order.professional_id,
        title: extraTitle,
        amount: Number(extraAmount) || 0,
      });
      await refreshCommercialData();
      setNotice('Adicional enviado para aprobación.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo crear adicional.');
    }
  }

  async function decideExtra(extraId: string, status: 'approved' | 'rejected') {
    try {
      await decideV6OrderExtra(extraId, status);
      await refreshCommercialData();
      setNotice(status === 'approved' ? 'Adicional aprobado.' : 'Adicional rechazado.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo responder el adicional.');
    }
  }

  async function submitRating(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order.professional_id) {
      setError('Este pedido no tiene profesional asignado.');
      return;
    }
    try {
      await addV6Rating({
        orderId: order.id,
        clientId: profile.id,
        professionalId: order.professional_id,
        stars: ratingStars,
        comment: ratingComment,
      });
      setNotice('Calificación enviada.');
      setRatingComment('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo calificar.');
    }
  }

  async function submitComplaint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await addV6Complaint({
        orderId: order.id,
        openedBy: profile.id,
        reason: 'Garantía MANITO',
        detail: complaintDetail,
      });
      setNotice('Reclamo abierto. MANITO revisa la garantía.');
      setComplaintDetail('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo abrir reclamo.');
    }
  }

  async function uploadOrderEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!evidenceFile) {
      setError('Elegí una foto para subir al seguimiento.');
      return;
    }
    setUploadingEvidence(true);
    try {
      const filePath = await uploadV6MediaFile({
        ownerId: profile.id,
        area: 'orders',
        file: evidenceFile,
      });
      await addV6OrderPhoto({
        orderId: order.id,
        uploadedBy: profile.id,
        stage: evidenceStage,
        filePath,
        caption: evidenceFile.name,
      });
      await refreshPhotos();
      setEvidenceFile(null);
      event.currentTarget.reset();
      setNotice('Evidencia agregada al seguimiento.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo subir la evidencia.');
    } finally {
      setUploadingEvidence(false);
    }
  }

  const canUploadEvidence =
    order.professional_id === profile.id &&
    ['accepted', 'en_camino', 'en_sitio'].includes(order.status);
  const canChat = Boolean(order.professional_id);
  const canShareTracking = !['completed', 'cancelled'].includes(order.status);

  async function shareOrderTracking() {
    const text = orderTrackingText(order);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Seguimiento MANITO', text });
        setNotice('Seguimiento compartido.');
        return;
      }
      await navigator.clipboard?.writeText(text);
      setNotice('Seguimiento copiado.');
    } catch {
      setNotice('No se pudo compartir automáticamente. Copiá el estado desde el pedido.');
    }
  }

  return (
    <article className="v6-order">
      <div className="v6-order-top">
        <span className="v6-order-icon">{serviceIcon(order.service?.slug || '')}</span>
        <div>
          <strong>{serviceDisplayName(order.service)}</strong>
          <p>{order.address} · {shortDate(order.created_at)}</p>
          {other && <small>{profile.role === 'client' ? 'Profesional' : 'Cliente'}: {other.full_name || 'Usuario'}</small>}
          <Status status={order.status} />
          {order.professional_id ? (
            <small className="v6-order-hint">
              <MessageCircle size={13} aria-hidden="true" />
              {profile.role === 'client'
                ? 'Coordiná con el prestador por el chat del pedido.'
                : 'Coordiná con el cliente por el chat del pedido.'}
            </small>
          ) : (
            profile.role === 'client' && (
              <small className="v6-order-hint">
                <MessageCircle size={13} aria-hidden="true" />
                Cuando un prestador acepte, se habilita el chat.
              </small>
            )
          )}
        </div>
        <b>{money(order.price || order.service?.base_price)}</b>
      </div>
      <StatusSteps status={order.status} />
      <div className="v6-meta-row">
        <span><ShieldCheck size={14} aria-hidden="true" /> Garantía {order.guarantee_days || 7} días</span>
        {order.payment_method && <span>Pago {paymentLabel(order.payment_method)}</span>}
        {order.eta_minutes && <span>ETA {order.eta_minutes} min</span>}
        {order.status === 'accepted' && <span>PIN inicio {order.start_pin || 'pendiente'}</span>}
      </div>
      {order.payment_method === 'wallet' && !['completed', 'cancelled'].includes(order.status) && (
        <p className="v6-note">
          {profile.role === 'client'
            ? 'Pago con Cuenta DNI/billetera: cuando el prestador acepte, coordiná QR o link por el chat.'
            : 'Este pedido prefiere Cuenta DNI/billetera. Compartí tu QR o link de pago por el chat antes de finalizar.'}
        </p>
      )}
      {(canChat || canShareTracking) && (
        <div className="v6-order-contact">
          {canChat && (
            <button className="v6-secondary" type="button" onClick={() => setChatOrder(order)}>
              <MessageCircle size={16} aria-hidden="true" /> Abrir chat
            </button>
          )}
          {canShareTracking && (
            <button className="v6-secondary" type="button" onClick={shareOrderTracking}>
              <SendHorizontal size={16} aria-hidden="true" /> Compartir seguimiento
            </button>
          )}
        </div>
      )}
      {photos.length > 0 && (
        <div className="v6-photo-strip">
          {photos.map((photo) => (
            <figure className="v6-photo-item" key={photo.id}>
              {photo.signedUrl ? (
                <Image
                  src={photo.signedUrl}
                  alt={photo.caption || 'Foto del pedido'}
                  width={88}
                  height={88}
                  unoptimized
                />
              ) : (
                <span>
                  <Camera size={15} aria-hidden="true" /> {photo.caption || 'Foto del pedido'}
                </span>
              )}
              <figcaption>{photoStageLabel(photo.stage)}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {canUploadEvidence && (
        <form className="v6-inline-form v6-evidence-form" onSubmit={uploadOrderEvidence}>
          <div className="v6-section-head compact">
            <h2>Seguimiento visual</h2>
            <span>{photos.length} fotos</span>
          </div>
          <div className="v6-split">
            <label className="v6-field">
              <span>Etapa</span>
              <select
                value={evidenceStage}
                onChange={(event) => setEvidenceStage(event.target.value as V6OrderPhoto['stage'])}
              >
                <option value="during">Durante</option>
                <option value="after">Después</option>
              </select>
            </label>
            <label className="v6-field">
              <span>Foto</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setEvidenceFile(event.target.files?.[0] || null)}
              />
            </label>
          </div>
          <button className="v6-secondary" type="submit" disabled={uploadingEvidence}>
            {uploadingEvidence ? 'Subiendo...' : 'Agregar evidencia'}
          </button>
        </form>
      )}
      {order.mode === 'quote' && proposals.length > 0 && (
        <div className="v6-quote-list">
          {proposals.map((proposal) => (
            <article className="v6-quote-card" key={proposal.id}>
              <strong>{proposal.professional?.full_name || 'Profesional MANITO'}</strong>
              <span>{proposal.availability_label || 'A coordinar'} - {proposal.estimated_minutes || 90} min</span>
              <p>
                Visita {money(proposal.visit_price)} + mano de obra {money(proposal.labor_price)}
                {' '}+ materiales {money(proposal.materials_price)} + fee {money(proposal.manito_fee)}
              </p>
              {proposal.observation && <p>{proposal.observation}</p>}
              {profile.role === 'client' && order.status === 'open' && proposal.status === 'sent' && (
                <button className="v6-primary" type="button" onClick={() => acceptProposal(proposal.id)}>
                  Aceptar presupuesto
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {profile.role === 'professional' && order.mode === 'quote' && order.status === 'open' && (
        <form className="v6-inline-form" onSubmit={sendProposal}>
          <input value={proposalLabor} onChange={(event) => setProposalLabor(event.target.value)} aria-label="Mano de obra" />
          <input value={proposalMaterials} onChange={(event) => setProposalMaterials(event.target.value)} aria-label="Materiales" />
          <input value={proposalVisit} onChange={(event) => setProposalVisit(event.target.value)} aria-label="Visita" />
          <textarea value={proposalNote} onChange={(event) => setProposalNote(event.target.value)} aria-label="Observación" />
          <button className="v6-secondary" type="submit">Enviar presupuesto</button>
        </form>
      )}
      {extras.length > 0 && (
        <div className="v6-quote-list">
          {extras.map((extra) => (
            <article className="v6-quote-card" key={extra.id}>
              <strong>{extra.title}</strong>
              <span>{money(extra.amount)} - {extra.status}</span>
              {profile.role === 'client' && extra.status === 'pending' && (
                <div className="v6-actions">
                  <button className="v6-primary" type="button" onClick={() => decideExtra(extra.id, 'approved')}>Aprobar</button>
                  <button className="v6-danger" type="button" onClick={() => decideExtra(extra.id, 'rejected')}>Rechazar</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {profile.role === 'professional' && order.professional_id === profile.id && order.status === 'en_sitio' && (
        <form className="v6-inline-form" onSubmit={createExtra}>
          <input value={extraTitle} onChange={(event) => setExtraTitle(event.target.value)} aria-label="Detalle adicional" />
          <input value={extraAmount} onChange={(event) => setExtraAmount(event.target.value)} aria-label="Monto adicional" />
          <button className="v6-secondary" type="submit">Pedir adicional</button>
        </form>
      )}
      {profile.role === 'client' && order.status === 'completed' && order.professional_id && (
        <div className="v6-aftercare">
          <form className="v6-inline-form" onSubmit={submitRating}>
            <select value={ratingStars} onChange={(event) => setRatingStars(Number(event.target.value))} aria-label="Estrellas">
              {[5, 4, 3, 2, 1].map((value) => (
                <option value={value} key={value}>{value} estrellas</option>
              ))}
            </select>
            <input value={ratingComment} onChange={(event) => setRatingComment(event.target.value)} placeholder="Comentario" />
            <button className="v6-secondary" type="submit">Calificar</button>
          </form>
          <form className="v6-inline-form" onSubmit={submitComplaint}>
            <input value={complaintDetail} onChange={(event) => setComplaintDetail(event.target.value)} placeholder="Reclamo o garantía" />
            <button className="v6-danger" type="submit">Usar garantía</button>
          </form>
        </div>
      )}
      <div className="v6-actions">
        {profile.role === 'client' && ['open', 'accepted'].includes(order.status) && (
          <button className="v6-danger" type="button" onClick={cancel}>Cancelar</button>
        )}
        {profile.role === 'professional' &&
          order.professional_id === profile.id &&
          !['completed', 'cancelled'].includes(order.status) && (
            <button className="v6-primary" type="button" onClick={advance}>
              {nextLabel}
            </button>
          )}
      </div>
    </article>
  );
}

function ProfilePanel({
  profile,
  services,
  specialties,
  proServices,
  proSpecialties,
  setProfile,
  setProServices,
  setProSpecialties,
  setNotice,
  setError,
}: {
  profile: V6Profile;
  services: V6Service[];
  specialties: V6Specialty[];
  proServices: V6ProfessionalService[];
  proSpecialties: V6ProfessionalSpecialty[];
  setProfile: (profile: V6Profile) => void;
  setProServices: (services: V6ProfessionalService[]) => void;
  setProSpecialties: (specialties: V6ProfessionalSpecialty[]) => void;
  setNotice: (message: string) => void;
  setError: (message: string) => void;
  refreshProfile: () => Promise<void>;
}) {
  const [fullName, setFullName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone || '');
  const [city, setCity] = useState(profile.city || '');
  const [documentNumber, setDocumentNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [professionalProfile, setProfessionalProfile] = useState<V6ProfessionalProfile | null>(null);
  const [onboarding, setOnboarding] = useState<V6ProfessionalOnboarding | null>(null);
  const [documents, setDocuments] = useState<V6ProfessionalDocument[]>([]);
  const [portfolio, setPortfolio] = useState<V6PortfolioItem[]>([]);
  const [professionalStep, setProfessionalStep] = useState(1);
  const [headline, setHeadline] = useState('Tecnico verificado para urgencias del hogar');
  const [bio, setBio] = useState('Trabajo con turnos puntuales, presupuesto claro y garantía MANITO.');
  const [yearsExperience, setYearsExperience] = useState('3');
  const [insuranceLabel, setInsuranceLabel] = useState('Responsabilidad civil vigente');
  const [workZone, setWorkZone] = useState(profile.city || 'Mar del Plata');
  const [workRadius, setWorkRadius] = useState('8');
  const [workDays, setWorkDays] = useState<string[]>(['Lun', 'Mar', 'Mié', 'Jue', 'Vie']);
  const [workStart, setWorkStart] = useState('08:00');
  const [workEnd, setWorkEnd] = useState('18:00');
  const [payoutAlias, setPayoutAlias] = useState('');
  const [payoutCbu, setPayoutCbu] = useState('');
  const [walletPaymentLink, setWalletPaymentLink] = useState('');
  const [serviceRates, setServiceRates] = useState<Record<number, string>>({});
  const [portfolioTitle, setPortfolioTitle] = useState('Trabajo terminado');
  const [portfolioDescription, setPortfolioDescription] = useState('Antes y después documentado para el cliente.');
  const [portfolioLink, setPortfolioLink] = useState('');
  const [portfolioBeforeFile, setPortfolioBeforeFile] = useState<File | null>(null);
  const [portfolioAfterFile, setPortfolioAfterFile] = useState<File | null>(null);
  const [documentLinks, setDocumentLinks] = useState<Record<string, string>>({});
  const [savingDocumentKind, setSavingDocumentKind] = useState<string | null>(null);
  const [savingPortfolio, setSavingPortfolio] = useState(false);
  const [submittingOnboarding, setSubmittingOnboarding] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      getV6ProfessionalProfile(profile.id),
      getV6ProfessionalPayoutDetails(profile.id),
      getV6ProfessionalOnboarding(profile.id),
      listV6ProfessionalDocuments(profile.id),
      listV6Portfolio(profile.id),
    ])
      .then(([
        nextProfessionalProfile,
        nextPayoutDetails,
        nextOnboarding,
        nextDocuments,
        nextPortfolio,
      ]) => {
        if (!alive) return;
        setProfessionalProfile(nextProfessionalProfile);
        setOnboarding(nextOnboarding);
        setDocuments(nextDocuments);
        setPortfolio(nextPortfolio);
        if (nextProfessionalProfile) {
          setHeadline((current) => nextProfessionalProfile.headline || current);
          setBio((current) => nextProfessionalProfile.bio || current);
          setYearsExperience(String(nextProfessionalProfile.years_experience || 0));
          setInsuranceLabel((current) => nextProfessionalProfile.insurance_label || current);
          setWorkZone((current) => nextProfessionalProfile.work_city || current);
          setWorkRadius(String(nextProfessionalProfile.service_radius_km || 8));
          setWorkDays(nextProfessionalProfile.work_days?.length ? nextProfessionalProfile.work_days : ['Lun', 'Mar', 'Mié', 'Jue', 'Vie']);
          setWorkStart(timeInputValue(nextProfessionalProfile.work_starts_at, '08:00'));
          setWorkEnd(timeInputValue(nextProfessionalProfile.work_ends_at, '18:00'));
        }
        if (nextPayoutDetails) {
          setPayoutAlias(nextPayoutDetails.payout_alias || '');
          setPayoutCbu(nextPayoutDetails.payout_cbu || '');
          setWalletPaymentLink(nextPayoutDetails.wallet_payment_link || '');
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [profile.id]);

  const visibleServiceRates = useMemo(() => {
    const next = { ...serviceRates };
    for (const item of proServices) {
      if (next[item.service_id] === undefined && item.price_from !== null) {
        next[item.service_id] = String(item.price_from);
      }
    }
    return next;
  }, [proServices, serviceRates]);

  const selectedServiceIds = useMemo(
    () => new Set(proServices.map((item) => item.service_id)),
    [proServices],
  );
  const selectedSpecialtyIds = useMemo(
    () => new Set(proSpecialties.map((item) => item.specialty_id)),
    [proSpecialties],
  );
  const specialtiesByService = useMemo(
    () =>
      specialties.reduce<Record<number, V6Specialty[]>>((groups, specialty) => {
        groups[specialty.service_id] = [...(groups[specialty.service_id] || []), specialty];
        return groups;
      }, {}),
    [specialties],
  );
  const selectedSpecialtyNames = useMemo(
    () =>
      proSpecialties
        .map((item) => specialties.find((specialty) => specialty.id === item.specialty_id)?.name)
        .filter((name): name is string => Boolean(name)),
    [proSpecialties, specialties],
  );

  const uploadedDocumentKinds = useMemo(
    () =>
      new Set(
        documents
          .filter(
            (document) =>
              Boolean(document.file_path) &&
              ['uploaded', 'approved'].includes(document.status),
          )
          .map((document) => document.kind),
      ),
    [documents],
  );

  function shortEvidencePath(path: string | null) {
    if (!path) return 'Sin evidencia';
    if (path.startsWith('http')) {
      return path.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }
    return path.split('/').pop() || 'Archivo guardado';
  }

  function renderEvidence(path: string | null, label: string) {
    if (!path) return null;
    const text = `${label}: ${shortEvidencePath(path)}`;
    if (path.startsWith('http')) {
      return (
        <a className="v6-evidence-link" href={path} target="_blank" rel="noreferrer">
          {text}
        </a>
      );
    }
    return <span className="v6-evidence-link">{text}</span>;
  }

  function uploadErrorMessage(caught: unknown) {
    const message = caught instanceof Error ? caught.message : '';
    if (message.toLowerCase().includes('mime') || message.toLowerCase().includes('type')) {
      return 'Subí JPG, PNG, WebP o PDF de hasta 10 MB. También podés pegar un link.';
    }
    if (message.toLowerCase().includes('bucket') || message.toLowerCase().includes('storage')) {
      return 'No se pudo subir el archivo. Pega un link mientras revisamos Storage.';
    }
    return message || 'No se pudo subir el archivo.';
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const changedProfile = await updateV6Profile(profile.id, { full_name: fullName, phone, city });
      setProfile(changedProfile);
      setNotice('Perfil actualizado.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar perfil.');
    }
  }

  async function toggleService(serviceId: number) {
    const current = new Set(proServices.map((item) => item.service_id));
    if (current.has(serviceId)) current.delete(serviceId);
    else current.add(serviceId);
    const nextServiceIds = [...current];
    const nextSpecialtyIds = proSpecialties
      .filter((item) => current.has(item.service_id))
      .map((item) => item.specialty_id);
    try {
      const nextServices = await saveV6ProfessionalServices(profile.id, nextServiceIds, services, serviceRatesFor(nextServiceIds));
      setProServices(nextServices);
      setProSpecialties(await saveV6ProfessionalSpecialties(profile.id, nextSpecialtyIds, specialties));
      setNotice('Servicios guardados.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se guardaron servicios.');
    }
  }

  async function toggleSpecialty(specialty: V6Specialty) {
    if (!selectedServiceIds.has(specialty.service_id)) return;
    const current = new Set(proSpecialties.map((item) => item.specialty_id));
    if (current.has(specialty.id)) current.delete(specialty.id);
    else current.add(specialty.id);
    try {
      setProSpecialties(await saveV6ProfessionalSpecialties(profile.id, [...current], specialties));
      setNotice('Especialidades guardadas.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se guardaron especialidades.');
    }
  }

  function serviceRatesFor(serviceIds: number[]) {
    return serviceIds.reduce<Record<number, number | null>>((rates, serviceId) => {
      const parsed = Number(String(visibleServiceRates[serviceId] || '').replace(/\D+/g, ''));
      rates[serviceId] = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      return rates;
    }, {});
  }

  const professionalSteps = [
    'Servicios',
    'Perfil público',
    'Datos personales',
    'Documentos',
    'Portfolio',
    'Zona y tarifas',
    'Revisión',
  ];

  async function saveOnboardingProgress(nextStep: number) {
    try {
      const mappedStep = Math.max(1, Math.min(16, Math.ceil((nextStep / professionalSteps.length) * 16)));
      setOnboarding(await upsertV6ProfessionalOnboarding({
        professionalId: profile.id,
        status: onboarding?.status || 'draft',
        currentStep: Math.max(onboarding?.current_step || 1, mappedStep),
        notes: 'Alta profesional en progreso.',
      }));
    } catch {}
  }

  function goToProfessionalStep(nextStep: number) {
    const boundedStep = Math.max(1, Math.min(professionalSteps.length, nextStep));
    setProfessionalStep(boundedStep);
    void saveOnboardingProgress(boundedStep);
  }

  function toggleWorkDay(day: string) {
    setWorkDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day],
    );
  }

  async function saveProfessionalSurface(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const nextProfile = await upsertV6ProfessionalProfile({
        professionalId: profile.id,
        headline,
        bio,
        yearsExperience: Number(yearsExperience) || 0,
        responseMinutes: 35,
        insuranceLabel,
        workCity: workZone.trim(),
        serviceRadiusKm: Number(workRadius) || 8,
        workDays,
        workStartsAt: workStart,
        workEndsAt: workEnd,
      });
      await upsertV6ProfessionalPayoutDetails({
        professionalId: profile.id,
        payoutAlias: payoutAlias.trim(),
        payoutCbu: payoutCbu.trim(),
        walletPaymentLink: walletPaymentLink.trim(),
      });
      const nextOnboarding = await upsertV6ProfessionalOnboarding({
        professionalId: profile.id,
        status: onboarding?.status || 'draft',
        currentStep: Math.max(onboarding?.current_step || 1, 8),
        notes: 'Perfil público iniciado por el profesional.',
      });
      setProfessionalProfile(nextProfile);
      setOnboarding(nextOnboarding);
      setNotice('Perfil profesional guardado.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Aplicá la migración V7 para guardar alta profesional.');
    }
  }

  async function saveProfessionalAvailability() {
    try {
      const selectedIds = proServices.map((item) => item.service_id);
      const nextProfile = await upsertV6ProfessionalProfile({
        professionalId: profile.id,
        headline,
        bio,
        yearsExperience: Number(yearsExperience) || 0,
        responseMinutes: professionalProfile?.response_minutes || 35,
        insuranceLabel,
        workCity: workZone.trim(),
        serviceRadiusKm: Number(workRadius) || 8,
        workDays,
        workStartsAt: workStart,
        workEndsAt: workEnd,
      });
      await upsertV6ProfessionalPayoutDetails({
        professionalId: profile.id,
        payoutAlias: payoutAlias.trim(),
        payoutCbu: payoutCbu.trim(),
        walletPaymentLink: walletPaymentLink.trim(),
      });
      setProfessionalProfile(nextProfile);
      setProServices(await saveV6ProfessionalServices(profile.id, selectedIds, services, serviceRatesFor(selectedIds)));
      setProSpecialties(await saveV6ProfessionalSpecialties(
        profile.id,
        proSpecialties
          .filter((item) => selectedIds.includes(item.service_id))
          .map((item) => item.specialty_id),
        specialties,
      ));
      setOnboarding(await upsertV6ProfessionalOnboarding({
        professionalId: profile.id,
        status: onboarding?.status || 'draft',
        currentStep: Math.max(onboarding?.current_step || 1, 13),
        notes: 'Servicios, zona, horarios y tarifas guardados.',
      }));
      setNotice('Zona, horarios y tarifas guardados.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar disponibilidad.');
    }
  }

  async function saveDocumentEvidence(event: FormEvent<HTMLFormElement>, kind: string, label: string) {
    event.preventDefault();
    const fileInput = new FormData(event.currentTarget).get(`${kind}-file`);
    const file = fileInput instanceof File && fileInput.size > 0 ? fileInput : null;
    const link = (documentLinks[kind] || '').trim();
    if (!file && !link) {
      setError(`Agrega una foto o un link para ${label}.`);
      return;
    }
    setSavingDocumentKind(kind);
    try {
      const filePath = link || (file ? await uploadV6MediaFile({
        ownerId: profile.id,
        area: 'documents',
        file,
      }) : null);
      const current = documents.find((document) => document.kind === kind);
      await upsertV6ProfessionalDocument({
        id: current?.id,
        professionalId: profile.id,
        kind,
        label,
        status: 'uploaded',
        filePath,
        observation: link ? 'Link aportado por el profesional.' : file?.name || null,
      });
      setDocuments(await listV6ProfessionalDocuments(profile.id));
      setDocumentLinks((currentLinks) => ({ ...currentLinks, [kind]: '' }));
      event.currentTarget.reset();
      setNotice(`${label} guardado para revisión.`);
    } catch (caught) {
      setError(uploadErrorMessage(caught));
    } finally {
      setSavingDocumentKind(null);
    }
  }

  async function submitOnboarding() {
    const missingDocuments = requiredDocuments.filter((item) => !uploadedDocumentKinds.has(item.kind));
    if (missingDocuments.length) {
      setError(`Faltan documentos: ${missingDocuments.map((item) => item.label).join(', ')}.`);
      return;
    }
    if (!proServices.length) {
      setError('Elegí al menos un servicio para que el alta tenga sentido.');
      return;
    }
    setSubmittingOnboarding(true);
    try {
      setOnboarding(await upsertV6ProfessionalOnboarding({
        professionalId: profile.id,
        status: 'submitted',
        currentStep: 16,
        notes: 'Alta enviada para revisión.',
      }));
      setNotice('Alta enviada para revisión MANITO.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo enviar alta.');
    } finally {
      setSubmittingOnboarding(false);
    }
  }

  async function savePortfolio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!portfolioTitle.trim()) {
      setError('Ponele un titulo al trabajo del portfolio.');
      return;
    }
    setSavingPortfolio(true);
    try {
      const link = portfolioLink.trim();
      const beforePath = portfolioBeforeFile
        ? await uploadV6MediaFile({ ownerId: profile.id, area: 'portfolio', file: portfolioBeforeFile })
        : link || null;
      const afterPath = portfolioAfterFile
        ? await uploadV6MediaFile({ ownerId: profile.id, area: 'portfolio', file: portfolioAfterFile })
        : null;
      await addV6PortfolioItem({
        professionalId: profile.id,
        title: portfolioTitle.trim(),
        description: portfolioDescription.trim(),
        beforePath,
        afterPath,
      });
      setPortfolio(await listV6Portfolio(profile.id));
      setPortfolioLink('');
      setPortfolioBeforeFile(null);
      setPortfolioAfterFile(null);
      event.currentTarget.reset();
      setNotice('Portfolio actualizado.');
    } catch (caught) {
      setError(uploadErrorMessage(caught));
    } finally {
      setSavingPortfolio(false);
    }
  }

  const professionalProgress = Math.round((professionalStep / professionalSteps.length) * 100);
  const completedDocuments = requiredDocuments.filter((item) =>
    uploadedDocumentKinds.has(item.kind),
  ).length;

  return (
    <>
      <section className="v6-card">
            <div className="v6-section-head">
              <h2>Alta profesional</h2>
              <span>{onboarding?.status || 'borrador'} · {professionalProgress}%</span>
            </div>
            <div className="v6-progress">
              <span style={{ width: `${professionalProgress}%` }} />
            </div>
            <div className="v6-step-grid v6-wizard-tabs">
              {professionalSteps.map((step, index) => (
                <button
                  className={index + 1 <= professionalStep ? 'done' : ''}
                  type="button"
                  key={step}
                  aria-pressed={professionalStep === index + 1}
                  onClick={() => goToProfessionalStep(index + 1)}
                >
                  {index + 1}. {step}
                </button>
              ))}
            </div>
            <div className="v6-summary">
              <span>
                <BadgeCheck size={17} aria-hidden="true" /> Checklist de alta
              </span>
              <small>
                {proServices.length} rubros · {proSpecialties.length} especialidades · {completedDocuments}/{requiredDocuments.length} documentos · paso interno {onboarding?.current_step || 1}/16
              </small>
            </div>
            <div className="v6-wizard-actions">
              <button
                className="v6-secondary"
                type="button"
                onClick={() => goToProfessionalStep(professionalStep - 1)}
                disabled={professionalStep === 1}
              >
                Atrás
              </button>
              {professionalStep < professionalSteps.length ? (
                <button
                  className="v6-primary"
                  type="button"
                  onClick={() => goToProfessionalStep(professionalStep + 1)}
                >
                  Continuar
                </button>
              ) : (
                <button
                  className="v6-primary"
                  type="button"
                  onClick={submitOnboarding}
                  disabled={submittingOnboarding}
                >
                  {submittingOnboarding ? 'Enviando...' : 'Enviar a verificación'}
                </button>
              )}
            </div>
      </section>

      {professionalStep === 1 && (
          <section className="v6-card">
            <h2>Servicios que ofrecés</h2>
            <p className="v6-help-text">
              Elegí los rubros donde querés recibir pedidos. Después vas a poder definir zona, horarios y tarifas.
            </p>
            <div className="v6-check-grid">
              {services.map((service) => (
                <button
                  className="v6-check-service"
                  type="button"
                  key={service.id}
                  aria-pressed={selectedServiceIds.has(service.id)}
                  onClick={() => toggleService(service.id)}
                >
                  {serviceIcon(service.slug)} {serviceDisplayName(service)}
                </button>
              ))}
            </div>
            {proServices.length > 0 && (
              <div className="v6-specialty-panel">
                <div className="v6-section-head compact">
                  <h2>Especialidades</h2>
                  <span>opcional</span>
                </div>
                <p className="v6-help-text">
                  Marcá las tareas que mejor hacés. MANITO las usa para recomendarte pedidos más compatibles.
                </p>
                {proServices.map((item) => {
                  const service = services.find((candidate) => candidate.id === item.service_id);
                  const serviceSpecialties = specialtiesByService[item.service_id] || [];
                  if (!service || !serviceSpecialties.length) return null;
                  return (
                    <div className="v6-specialty-group" key={item.service_id}>
                      <strong>{serviceDisplayName(service)}</strong>
                      <div className="v6-chip-list">
                        {serviceSpecialties.map((specialty) => (
                          <button
                            type="button"
                            key={specialty.id}
                            aria-pressed={selectedSpecialtyIds.has(specialty.id)}
                            onClick={() => toggleSpecialty(specialty)}
                          >
                            {specialty.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="v6-summary">
              <span>
                <BriefcaseBusiness size={17} aria-hidden="true" /> Servicios seleccionados
              </span>
              <small>
                {proServices.length
                  ? `${proServices.length} rubros · ${proSpecialties.length} especialidades`
                  : 'Todavía no elegiste rubros'}
              </small>
            </div>
          </section>
      )}

      {professionalStep === 2 && (
          <section className="v6-card">
            <h2>Perfil público</h2>
            <form className="v6-stack" onSubmit={saveProfessionalSurface}>
              <label className="v6-field">
                <span>Título</span>
                <input value={headline} onChange={(event) => setHeadline(event.target.value)} />
              </label>
              <label className="v6-field">
                <span>Descripción</span>
                <textarea value={bio} onChange={(event) => setBio(event.target.value)} />
              </label>
              <div className="v6-split">
                <label className="v6-field">
                  <span>Años de experiencia</span>
                  <input value={yearsExperience} onChange={(event) => setYearsExperience(event.target.value)} />
                </label>
                <label className="v6-field">
                  <span>Seguro / matrícula</span>
                  <input value={insuranceLabel} onChange={(event) => setInsuranceLabel(event.target.value)} />
                </label>
              </div>
              <div className="v6-summary">
                <span>
                  <BadgeCheck size={17} aria-hidden="true" /> Vista pública
                </span>
                <strong>{professionalProfile?.rating_avg || 4.8} estrellas</strong>
                <small>{professionalProfile?.jobs_completed || 0} trabajos · {professionalProfile?.manito_pro ? 'MANITO PRO' : 'Verificación en curso'}</small>
              </div>
              <button className="v6-primary" type="submit">
                Guardar perfil profesional
              </button>
            </form>
          </section>
      )}

      {professionalStep === 3 && (
      <section className="v6-card">
        <h2>Datos personales</h2>
        <form className="v6-stack" onSubmit={saveProfile}>
          <label className="v6-field">
            <span>Nombre</span>
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
          </label>
          <label className="v6-field">
            <span>Telefono</span>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </label>
          <label className="v6-field">
            <span>Ciudad</span>
            <input value={city} onChange={(event) => setCity(event.target.value)} />
          </label>
          <div className="v6-split">
            <label className="v6-field">
              <span>DNI</span>
              <input
                value={documentNumber}
                onChange={(event) => setDocumentNumber(event.target.value)}
                inputMode="numeric"
                placeholder="Para el alta profesional"
              />
            </label>
            <label className="v6-field">
              <span>Fecha de nacimiento</span>
              <input
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
                type="date"
              />
            </label>
          </div>
          <button className="v6-primary" type="submit">
            <Save size={16} aria-hidden="true" /> Guardar datos
          </button>
        </form>
      </section>
      )}

      {professionalStep === 4 && (
          <section className="v6-card">
            <h2>Documentos</h2>
            <p className="v6-help-text">
              Subí fotos JPG, PNG, WebP o PDF. También podés pegar un link de Drive o carpeta compartida.
            </p>
            <div className="v6-upload-list">
              {requiredDocuments.map((item) => {
                const current = documents.find((document) => document.kind === item.kind);
                const uploaded = current?.status === 'uploaded' || current?.status === 'approved';
                return (
                  <form
                    className="v6-upload-card"
                    key={item.kind}
                    onSubmit={(event) => saveDocumentEvidence(event, item.kind, item.label)}
                  >
                    <div className="v6-upload-head">
                      <strong>{item.label}</strong>
                      <span data-state={uploaded ? 'uploaded' : 'pending'}>
                        {uploaded ? 'Cargado' : 'Pendiente'}
                      </span>
                    </div>
                    {renderEvidence(current?.file_path || null, 'Evidencia')}
                    <label className="v6-field">
                      <span>Archivo</span>
                      <input name={`${item.kind}-file`} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" />
                    </label>
                    <label className="v6-field">
                      <span>Link opcional</span>
                      <input
                        value={documentLinks[item.kind] || ''}
                        onChange={(event) =>
                          setDocumentLinks((links) => ({ ...links, [item.kind]: event.target.value }))
                        }
                        placeholder="https://drive.google.com/..."
                      />
                    </label>
                    <button
                      className="v6-secondary"
                      type="submit"
                      disabled={savingDocumentKind === item.kind}
                    >
                      {savingDocumentKind === item.kind ? 'Guardando...' : 'Guardar documento'}
                    </button>
                  </form>
                );
              })}
            </div>
          </section>
      )}

      {professionalStep === 5 && (
          <section className="v6-card">
            <h2>Portfolio</h2>
            <form className="v6-stack" onSubmit={savePortfolio}>
              <label className="v6-field">
                <span>Título del trabajo</span>
                <input value={portfolioTitle} onChange={(event) => setPortfolioTitle(event.target.value)} />
              </label>
              <label className="v6-field">
                <span>Descripción</span>
                <textarea value={portfolioDescription} onChange={(event) => setPortfolioDescription(event.target.value)} />
              </label>
              <label className="v6-field">
                <span>Link a fotos o trabajo</span>
                <input
                  value={portfolioLink}
                  onChange={(event) => setPortfolioLink(event.target.value)}
                  placeholder="https://..."
                />
              </label>
              <div className="v6-split">
                <label className="v6-field">
                  <span>Foto antes</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => setPortfolioBeforeFile(event.target.files?.[0] || null)}
                  />
                </label>
                <label className="v6-field">
                  <span>Foto después</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => setPortfolioAfterFile(event.target.files?.[0] || null)}
                  />
                </label>
              </div>
              <button className="v6-secondary" type="submit" disabled={savingPortfolio}>
                {savingPortfolio ? 'Guardando...' : 'Agregar al portfolio'}
              </button>
            </form>
            <div className="v6-quote-list">
              {portfolio.map((item) => (
                <article className="v6-quote-card" key={item.id}>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                  <div className="v6-file-list">
                    {renderEvidence(item.before_path, item.after_path ? 'Antes' : 'Link')}
                    {renderEvidence(item.after_path, 'Después')}
                  </div>
                </article>
              ))}
            </div>
          </section>
      )}

      {professionalStep === 6 && (
          <section className="v6-card">
            <h2>Zona, horarios y tarifas</h2>
            <p className="v6-help-text">
              Ajustá dónde trabajás, cuándo estás disponible y cuánto querés cobrar desde cada rubro.
            </p>
            <div className="v6-split">
              <label className="v6-field">
                <span>Ciudad o zona de trabajo</span>
                <input value={workZone} onChange={(event) => setWorkZone(event.target.value)} />
              </label>
              <label className="v6-field">
                <span>Radio aproximado en km</span>
                <input
                  value={workRadius}
                  onChange={(event) => setWorkRadius(event.target.value)}
                  inputMode="numeric"
                />
              </label>
            </div>
            <div className="v6-work-days" aria-label="Dias de trabajo">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => (
                <button
                  type="button"
                  key={day}
                  aria-pressed={workDays.includes(day)}
                  onClick={() => toggleWorkDay(day)}
                >
                  {day}
                </button>
              ))}
            </div>
            <div className="v6-split">
              <label className="v6-field">
                <span>Desde</span>
                <input value={workStart} onChange={(event) => setWorkStart(event.target.value)} type="time" />
              </label>
              <label className="v6-field">
                <span>Hasta</span>
                <input value={workEnd} onChange={(event) => setWorkEnd(event.target.value)} type="time" />
              </label>
            </div>
            <div className="v6-section-head compact">
              <h2>Cobro</h2>
              <span>para coordinar pagos</span>
            </div>
            <div className="v6-split">
              <label className="v6-field">
                <span>Alias o CVU/CBU</span>
                <input
                  value={payoutAlias}
                  onChange={(event) => setPayoutAlias(event.target.value)}
                  placeholder="ej: manito.plomero"
                />
              </label>
              <label className="v6-field">
                <span>CBU/CVU completo</span>
                <input
                  value={payoutCbu}
                  onChange={(event) => setPayoutCbu(event.target.value)}
                  inputMode="numeric"
                  placeholder="opcional"
                />
              </label>
            </div>
            <label className="v6-field">
              <span>Link de pago o QR de Cuenta DNI</span>
              <input
                value={walletPaymentLink}
                onChange={(event) => setWalletPaymentLink(event.target.value)}
                placeholder="https://..."
              />
            </label>
            <p className="v6-note">
              Estos datos sirven para coordinar cobros con billetera o transferencia. MANITO todavía no captura pagos automáticamente.
            </p>
            {proServices.length > 0 && (
              <div className="v6-rate-list">
                {proServices.map((item) => {
                  const service = services.find((candidate) => candidate.id === item.service_id);
                  if (!service) return null;
                  return (
                    <label className="v6-field" key={item.service_id}>
                      <span>Tarifa desde: {serviceDisplayName(service)}</span>
                      <input
                        value={visibleServiceRates[item.service_id] ?? String(item.price_from || service.base_price || '')}
                        onChange={(event) =>
                          setServiceRates((current) => ({
                            ...current,
                            [item.service_id]: event.target.value,
                          }))
                        }
                        inputMode="numeric"
                      />
                    </label>
                  );
                })}
              </div>
            )}
            {!proServices.length && (
              <p className="v6-alert">
                Primero elegi al menos un servicio en el paso 1 para poder cargar tarifas.
              </p>
            )}
            <div className="v6-summary">
              <span>
                <Clock size={17} aria-hidden="true" /> Disponibilidad
              </span>
              <small>
                {workZone || 'Zona sin definir'} · {workRadius || 8} km · {workDays.join(', ')} · {workStart} a {workEnd}
              </small>
            </div>
            <button className="v6-primary" type="button" onClick={saveProfessionalAvailability}>
              Guardar zona y tarifas
            </button>
          </section>
      )}

      {professionalStep === 7 && (
          <section className="v6-card">
            <h2>Revisión MANITO</h2>
            <div className="v6-summary">
              <span>
                <BadgeCheck size={17} aria-hidden="true" /> Resumen de alta
              </span>
              <small>
                {proServices.length} rubros · {proSpecialties.length} especialidades · {completedDocuments}/{requiredDocuments.length} documentos · {portfolio.length} trabajos en portfolio
              </small>
            </div>
            <div className="v6-step-grid">
              <span className={proServices.length ? 'done' : ''}>Servicios cargados</span>
              <span className={selectedSpecialtyNames.length ? 'done' : ''}>
                {selectedSpecialtyNames.length ? `${selectedSpecialtyNames.length} especialidades` : 'Especialidades opcionales'}
              </span>
              <span className={professionalProfile ? 'done' : ''}>Perfil público guardado</span>
              <span className={phone && city ? 'done' : ''}>Datos personales</span>
              <span className={completedDocuments === requiredDocuments.length ? 'done' : ''}>Documentos completos</span>
              <span className={portfolio.length ? 'done' : ''}>Portfolio</span>
              <span className={workZone && workDays.length ? 'done' : ''}>Zona y horarios</span>
              <span className={payoutAlias || payoutCbu || walletPaymentLink ? 'done' : ''}>Datos de cobro</span>
            </div>
            <button
              className="v6-primary"
              type="button"
              onClick={submitOnboarding}
              disabled={submittingOnboarding}
            >
              {submittingOnboarding ? 'Enviando...' : 'Enviar alta a verificación'}
            </button>
          </section>
      )}
    </>
  );
}

function AccountPanel({
  profile,
  clientOrders,
  canInstall,
  onInstall,
  onUsePhoneLocation,
  onNavigate,
  onProfileChange,
  onOpenProfile,
  savingPhoneLocation,
  setNotice,
}: {
  profile: V6Profile;
  clientOrders: V6Order[];
  canInstall: boolean;
  onInstall: () => void;
  onUsePhoneLocation: () => void;
  onNavigate: (tab: Tab) => void;
  onProfileChange: (profile: V6Profile) => void;
  onOpenProfile: () => void;
  savingPhoneLocation: boolean;
  setNotice: (message: string) => void;
}) {
  const [locationCity, setLocationCity] = useState(profile.city || '');
  const [locationPhone, setLocationPhone] = useState(profile.phone || '');
  const [savingLocation, setSavingLocation] = useState(false);
  const [accountType, setAccountType] = useState(() => {
    if (typeof window === 'undefined') return 'particular';
    return window.localStorage.getItem(`manito_v6_account_type:${profile.id}`) || 'particular';
  });
  const [taxId, setTaxId] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(`manito_v6_tax_id:${profile.id}`) || '';
  });
  const [trustedContact, setTrustedContact] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(`manito_v6_trusted:${profile.id}`) || '';
  });
  const [hidePhoneInChat, setHidePhoneInChat] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(`manito_v6_hide_phone:${profile.id}`) !== 'false';
  });
  const [paymentProfiles, setPaymentProfiles] = useState<V6PaymentProfile[]>([]);
  const [savingPaymentType, setSavingPaymentType] = useState<PaymentMethod | null>(null);
  const [adminSettings, setAdminSettings] = useState<V6AdminSetting[]>([]);
  const referralCode = `MANITO-${normalizeText(profile.full_name || profile.email || profile.id)
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 6)
    .toUpperCase() || 'AMIGO'}`;

  useEffect(() => {
    let alive = true;
    Promise.all([
      listV6PaymentProfiles(profile.id),
      profile.role === 'admin' ? listV6AdminSettings() : Promise.resolve([]),
    ])
      .then(([nextPayments, nextSettings]) => {
        if (!alive) return;
        setPaymentProfiles(nextPayments);
        setAdminSettings(nextSettings);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [profile.id, profile.role]);

  async function logout() {
    await getV6Supabase().auth.signOut();
  }

  function resetConfig() {
    clearStoredConfig();
    setNotice('Conexión borrada.');
    window.location.reload();
  }

  function saveAccountPreferences() {
    window.localStorage.setItem(`manito_v6_account_type:${profile.id}`, accountType);
    window.localStorage.setItem(`manito_v6_tax_id:${profile.id}`, taxId);
    window.localStorage.setItem(`manito_v6_trusted:${profile.id}`, trustedContact);
    window.localStorage.setItem(`manito_v6_hide_phone:${profile.id}`, String(hidePhoneInChat));
    setNotice('Cuenta actualizada.');
  }

  async function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingLocation) return;
    if (!locationCity.trim()) {
      setNotice('Escribí tu ciudad.');
      return;
    }
    setSavingLocation(true);
    try {
      const updated = await updateV6Profile(profile.id, {
        full_name: profile.full_name,
        phone: locationPhone.trim() || null,
        city: locationCity.trim(),
      });
      onProfileChange(updated);
      setNotice('Ubicación principal actualizada.');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'No se pudo guardar la ubicación.');
    } finally {
      setSavingLocation(false);
    }
  }

  async function copyReferralCode() {
    try {
      await navigator.clipboard?.writeText(referralCode);
      setNotice('Código de referido copiado.');
    } catch {
      setNotice(`Tu código de referido es ${referralCode}.`);
    }
  }

  function goToRecurringOrders() {
    const hasOrders = clientOrders.length > 0;
    onNavigate(hasOrders ? 'orders' : 'home');
    setNotice(
      hasOrders
        ? 'Abrí un pedido anterior para repetirlo o usarlo como referencia.'
        : 'Todavía no hay pedidos habituales. Creá el primero desde Inicio.',
    );
  }

  async function shareActiveTracking() {
    const activeOrder = clientOrders.find((order) => !['completed', 'cancelled'].includes(order.status));
    if (!activeOrder) {
      onNavigate('orders');
      setNotice('Cuando tengas un pedido en curso vas a poder compartir el seguimiento.');
      return;
    }

    const text = orderTrackingText(activeOrder);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Seguimiento MANITO', text });
        setNotice('Seguimiento compartido.');
        return;
      }
      await navigator.clipboard?.writeText(text);
      setNotice('Seguimiento copiado. Pegalo en WhatsApp o donde quieras compartirlo.');
    } catch {
      setNotice('Abrí el pedido en curso para ver y compartir el seguimiento.');
    }
    onNavigate('orders');
  }

  function focusTrustedContact() {
    const target = document.getElementById('trusted-contact-input');
    target?.focus();
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setNotice('Cargá un contacto de confianza para compartirle seguimientos.');
  }

  async function addPayment(type: PaymentMethod) {
    if (savingPaymentType) return;
    setSavingPaymentType(type);
    try {
      const alreadySaved = paymentProfiles.some((payment) => payment.type === type);
      await addV6PaymentProfile({
        profileId: profile.id,
        type,
        label: type === 'cash' ? 'Efectivo' : type === 'wallet' ? 'Cuenta DNI / billetera' : 'Tarjeta personal',
        last4: type === 'card' ? '1234' : null,
        isDefault: true,
      });
      setPaymentProfiles(await listV6PaymentProfiles(profile.id));
      setNotice(alreadySaved ? 'Medio de pago preferido actualizado.' : 'Medio de pago preferido guardado.');
    } catch {
      setNotice('Aplicá la migración V7 para guardar medios de pago.');
    } finally {
      setSavingPaymentType(null);
    }
  }

  return (
    <>
      <section className="v6-account">
        <h1>{profile.full_name || 'Usuario MANITO'}</h1>
        <p>{profile.email} · cuenta MANITO</p>
      </section>
      <section className="v6-card v6-account-cta">
        <h2>Tu cuenta de cliente</h2>
        <p>Guardá direcciones, favoritos, pedidos recurrentes y datos de facturación.</p>
        <button className="v6-primary" type="button" onClick={onOpenProfile}>
          Editar perfil
        </button>
      </section>
      <section className="v6-card">
        <h2>Ubicación principal</h2>
        <p className="v6-muted">
          MANITO usa la ciudad para mostrarla arriba y el GPS para ordenar profesionales cercanos.
        </p>
        {profile.lat != null && profile.lng != null && (
          <p className="v6-muted">GPS guardado para esta cuenta.</p>
        )}
        <form className="v6-stack" onSubmit={saveLocation}>
          <label className="v6-field">
            <span>Ciudad</span>
            <input
              value={locationCity}
              onChange={(event) => setLocationCity(event.target.value)}
              placeholder="Ej: Mar del Plata"
              required
            />
          </label>
          <label className="v6-field">
            <span>Teléfono</span>
            <input
              value={locationPhone}
              onChange={(event) => setLocationPhone(event.target.value)}
              placeholder="Opcional"
            />
          </label>
          <div className="v6-actions-row">
            <button
              className="v6-secondary"
              type="button"
              disabled={savingPhoneLocation}
              onClick={onUsePhoneLocation}
            >
              <LocateFixed size={16} aria-hidden="true" /> {savingPhoneLocation ? 'Buscando...' : 'Usar GPS'}
            </button>
            <button className="v6-secondary" type="submit" disabled={savingLocation}>
              {savingLocation ? 'Guardando...' : 'Guardar ciudad'}
            </button>
          </div>
        </form>
      </section>
      <section className="v6-card">
        <h2>Datos de cuenta</h2>
        <div className="v6-stack">
          <label className="v6-field">
            <span>Tipo</span>
            <select value={accountType} onChange={(event) => setAccountType(event.target.value)}>
              <option value="particular">Particular</option>
              <option value="empresa">Empresa</option>
              <option value="consorcio">Consorcio</option>
            </select>
          </label>
          <label className="v6-field">
            <span>CUIT / CUIL</span>
            <input value={taxId} onChange={(event) => setTaxId(event.target.value)} />
          </label>
          <label className="v6-field">
            <span>Contacto de confianza</span>
            <input
              id="trusted-contact-input"
              value={trustedContact}
              onChange={(event) => setTrustedContact(event.target.value)}
            />
          </label>
          <label className="v6-toggle-row">
            <span>
              <strong>Ocultar teléfono en chat</strong>
              <small>El prestador coordina por el chat del pedido salvo que vos decidas compartirlo.</small>
            </span>
            <input
              type="checkbox"
              checked={hidePhoneInChat}
              onChange={(event) => setHidePhoneInChat(event.target.checked)}
            />
          </label>
          <button className="v6-secondary" type="button" onClick={saveAccountPreferences}>
            Guardar cuenta
          </button>
        </div>
      </section>
      <section className="v6-card v6-account-cta">
        <div className="v6-section-head compact">
          <h2>Referidos</h2>
          <span>crecé con MANITO</span>
        </div>
        <p>Compartí tu código y dejalo listo para una promo de prueba.</p>
        <button className="v6-secondary" type="button" onClick={copyReferralCode}>
          {referralCode}
        </button>
      </section>
      <section className="v6-card">
        <div className="v6-section-head">
          <h2>Pagos</h2>
          <span>{paymentProfiles.length}</span>
        </div>
        <p className="v6-muted">
          Guardamos un método preferido. Cuenta DNI/billetera queda como coordinación por QR o link hasta integrar una pasarela real.
        </p>
        <div className="v6-choice-grid three">
          {paymentOptions.map((option) => (
            <button
              className="v6-choice"
              type="button"
              key={option.id}
              onClick={() => addPayment(option.id)}
              disabled={Boolean(savingPaymentType)}
            >
              {option.icon}
              {savingPaymentType === option.id ? 'Guardando...' : option.label}
            </button>
          ))}
        </div>
        <div className="v6-file-list">
          {paymentProfiles.map((payment) => (
            <span className={payment.is_default ? 'active' : ''} key={payment.id}>
              {paymentProfileIcon(payment)} {paymentProfileDisplay(payment)}
              {payment.is_default && <b>Preferido</b>}
            </span>
          ))}
        </div>
      </section>
      <section className="v6-card">
        <h2>Beneficios</h2>
        <div className="v6-step-grid">
          <button className="done" type="button" onClick={copyReferralCode}>
            Referidos: invitá y ganá crédito
          </button>
          <button className="done" type="button" onClick={goToRecurringOrders}>
            Recurrentes: repetir servicios habituales
          </button>
          <button className="done" type="button" onClick={() => onNavigate('favorites')}>
            Favoritos: volver a contratar profesionales
          </button>
          <button className="done" type="button" onClick={shareActiveTracking}>
            Compartir seguimiento con contacto de confianza
          </button>
          <button className="done" type="button" onClick={focusTrustedContact}>
            Configurar contacto de confianza
          </button>
        </div>
      </section>
      <section className="v6-card v6-account-cta">
        <h2>Trabaja con MANITO</h2>
        <p>Creá tu perfil profesional, mostrá qué hacés y empezá a recibir pedidos cuando tu cuenta sea aprobada.</p>
        <button className="v6-secondary" type="button" onClick={onOpenProfile}>
          Quiero ser profesional
        </button>
      </section>
      {profile.role === 'admin' && (
        <section className="v6-card">
          <h2>Admin</h2>
          <div className="v6-admin-grid">
            <article>
              <strong>Pedidos</strong>
              <span>Operación realtime</span>
            </article>
            <article>
              <strong>Profesionales</strong>
              <span>Alta, documentos y suspensión</span>
            </article>
            <article>
              <strong>Comercial</strong>
              <span>{adminSettings.length ? 'Config desde Supabase' : 'Pendiente de migración V7'}</span>
            </article>
          </div>
          {adminSettings.map((setting) => (
            <pre className="v6-admin-setting" key={setting.key}>{setting.key}: {JSON.stringify(setting.value, null, 2)}</pre>
          ))}
        </section>
      )}
      <section className="v6-menu">
        {canInstall && (
          <button type="button" onClick={onInstall}>
            <Download size={17} aria-hidden="true" /> Instalar app
          </button>
        )}
        <button type="button" onClick={logout}>
          <LogOut size={17} aria-hidden="true" /> Cerrar sesión
        </button>
        <button type="button" onClick={resetConfig}>
          <Settings size={17} aria-hidden="true" /> Cambiar backend
        </button>
      </section>
    </>
  );
}

function ChatSheet({
  order,
  profile,
  onClose,
  setError,
}: {
  order: V6Order;
  profile: V6Profile;
  onClose: () => void;
  setError: (message: string) => void;
}) {
  const [messages, setMessages] = useState<V6Message[]>([]);
  const [body, setBody] = useState('');

  useEffect(() => {
    listV6Messages(order.id)
      .then(setMessages)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : 'No se cargo el chat.'),
      );
    const channel = subscribeV6Messages(order.id, (message) => {
      setMessages((current) =>
        current.some((item) => item.id === message.id)
          ? current
          : [...current, message],
      );
    });
    return () => removeV6Channel(channel);
  }, [order.id, setError]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    try {
      await sendV6Message(order.id, profile.id, body.trim());
      setBody('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo enviar.');
    }
  }

  return (
    <div className="v6-modal">
      <section className="v6-sheet">
        <div className="v6-section-head">
          <div>
            <h2>Chat del pedido</h2>
            <span>{serviceDisplayName(order.service)}</span>
          </div>
          <button className="v6-icon-button" type="button" onClick={onClose} aria-label="Cerrar chat">
            ×
          </button>
        </div>
        <div className="v6-chat-list">
          {messages.map((message) => (
            <article className={message.sender_id === profile.id ? 'v6-bubble mine' : 'v6-bubble'} key={message.id}>
              {message.body}
              <small>{shortDate(message.created_at)}</small>
            </article>
          ))}
          {!messages.length && <Empty title="Sin mensajes" body="El chat se actualiza en tiempo real." />}
        </div>
        <form className="v6-chat-form" onSubmit={send}>
          <input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Escribi un mensaje" />
          <button type="submit" aria-label="Enviar mensaje">
            <SendHorizontal size={18} aria-hidden="true" />
          </button>
        </form>
      </section>
    </div>
  );
}

function Status({ status }: { status: V6OrderStatus }) {
  return <span className={`v6-status ${status}`}>{V6_STATUS_LABEL[status]}</span>;
}

function StatusSteps({ status }: { status: V6OrderStatus }) {
  if (status === 'open' || status === 'cancelled') return null;
  const activeIndex = statusFlow.indexOf(status);
  return (
    <div className="v6-steps">
      {statusFlow.map((item, index) => (
        <span className={index < activeIndex ? 'done' : index === activeIndex ? 'current' : ''} key={item}>
          <b>{index < activeIndex ? <Check size={13} /> : index + 1}</b>
          {V6_STATUS_LABEL[item]}
        </span>
      ))}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="v6-empty">
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function NavButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button className={active ? 'active' : ''} type="button" onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}
