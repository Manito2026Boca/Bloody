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
  listV6ProfessionalDocuments,
  listV6ProfessionalServices,
  listV6Services,
  removeV6Channel,
  sendV6OrderProposal,
  saveV6ProfessionalServices,
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
  V6Role,
  V6Service,
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
type FeaturedProfessional = {
  id: string;
  name: string;
  trade: string;
  rating: number;
  jobs: number;
  distance: string;
  etaMinutes: number;
  specialties: string[];
  verified: boolean;
  pro: boolean;
  priceDelta: number;
};
type ServiceGroupId = 'all' | 'home' | 'automotive';
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

const featuredProfessionals: FeaturedProfessional[] = [
  {
    id: 'pro-martin',
    name: 'Martin Ledesma',
    trade: 'Plomeria y gas',
    rating: 4.9,
    jobs: 186,
    distance: '1,8 km',
    etaMinutes: 28,
    specialties: ['Urgencias', 'Pérdidas', 'Termotanques'],
    verified: true,
    pro: true,
    priceDelta: 2500,
  },
  {
    id: 'pro-sofia',
    name: 'Sofia Pereira',
    trade: 'Electricidad',
    rating: 4.8,
    jobs: 143,
    distance: '2,4 km',
    etaMinutes: 35,
    specialties: ['Tableros', 'Cortos', 'Instalaciones'],
    verified: true,
    pro: false,
    priceDelta: 0,
  },
  {
    id: 'pro-diego',
    name: 'Diego Mena',
    trade: 'Mantenimiento',
    rating: 4.7,
    jobs: 98,
    distance: '3,1 km',
    etaMinutes: 42,
    specialties: ['Cerrajeria', 'Hogar', 'Reparaciones'],
    verified: true,
    pro: false,
    priceDelta: -1000,
  },
];
const requiredDocuments = [
  { kind: 'dni_front', label: 'DNI frente' },
  { kind: 'dni_back', label: 'DNI dorso' },
  { kind: 'selfie', label: 'Selfie de verificacion' },
  { kind: 'tax', label: 'Constancia fiscal' },
  { kind: 'insurance', label: 'Seguro o matricula' },
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
      'jardineria',
      'aire',
      'electrodomesticos',
      'carpinteria',
    ],
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
  jardineria: ['jardinero', 'jardineria', 'pasto', 'cesped', 'plantas', 'podar', 'jardin'],
  aire: ['aire', 'acondicionado', 'split', 'frio', 'calor', 'filtro', 'instalar aire'],
  electrodomesticos: ['heladera', 'lavarropas', 'horno', 'microondas', 'electrodomestico', 'lavavajillas'],
  carpinteria: ['carpintero', 'mueble', 'madera', 'puerta', 'bisagra', 'estante', 'placard'],
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
    jardineria: 'Jardinería',
    gas: 'Gasista',
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

function filterServicesByGroup(services: V6Service[], groupId: ServiceGroupId) {
  const group = serviceGroups.find((item) => item.id === groupId);
  if (!group || group.id === 'all') return services;
  return services.filter((service) => group.slugs.includes(service.slug));
}

function serviceGroupFromQuery(query: string): ServiceGroupId {
  const normalizedQuery = normalizeText(query);
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
  return profile.city || 'Agregar ubicación';
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

  return {
    order,
    reasons,
    distanceKm: distance,
    score: Math.min(98, score),
  };
}

function professionalForService(service: V6Service | null) {
  const slug = service?.slug || '';
  if (slug === 'electricidad') return featuredProfessionals[1];
  if (slug === 'plomeria' || slug === 'gas') return featuredProfessionals[0];
  if (['mecanica_automotor', 'gomeria', 'chapa_pintura_auto'].includes(slug)) {
    return featuredProfessionals[2];
  }
  return featuredProfessionals[2];
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

export default function ManitoV6App() {
  const [configured, setConfigured] = useState(() => isV6SupabaseConfigured());
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<V6Profile | null>(null);
  const [services, setServices] = useState<V6Service[]>([]);
  const [proServices, setProServices] = useState<V6ProfessionalService[]>([]);
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
  const [clientSelectedService, setClientSelectedService] = useState<V6Service | null>(null);
  const [clientProblemQuery, setClientProblemQuery] = useState('');

  const loadData = useCallback(async (userId: string) => {
    setProfileLoading(true);
    try {
      const [nextProfile, nextServices, nextOrders] = await Promise.all([
        getV6Profile(userId),
        listV6Services(),
        listV6Orders(),
      ]);
      setError(null);
      setProfile(nextProfile);
      setServices(nextServices);
      setOrders(nextOrders);
      setProServices(await listV6ProfessionalServices(userId));
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
              role: V6Role;
            };
            await completeV6Profile(parsed);
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
        setNotice('Pedido actualizado en tiempo real.');
      });
    });
    return () => removeV6Channel(channel);
  }, [profile]);

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
          <p className="v6-location">
            <MapPin size={13} aria-hidden="true" /> {currentLocation}
          </p>
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
              proServices={proServices}
              matchingOrders={matchingOrders}
              activeOrders={professionalOrders}
              setProfile={setProfile}
              setProServices={setProServices}
              setOrders={setOrders}
              setChatOrder={setChatOrder}
              setError={setError}
              setNotice={setNotice}
            />
          ) : (
            <ClientHome
              profile={viewProfile}
              services={services}
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
            proServices={proServices}
            setProfile={setProfile}
            setProServices={setProServices}
            setNotice={setNotice}
            setError={setError}
            refreshProfile={refreshProfile}
          />
        )}

        {tab === 'favorites' && (
          <FavoritesPanel
            onPickProfessional={(professional) => {
              setClientSelectedService(
                services.find((service) =>
                  professional.trade.toLowerCase().includes(service.name.toLowerCase()),
                ) || services[0] || null,
              );
              setClientProblemQuery(professional.trade);
              setTab('home');
            }}
          />
        )}

        {tab === 'account' && (
          <AccountPanel
            profile={profile}
            canInstall={Boolean(installPrompt) && !isStandalone}
            onInstall={installApp}
            onOpenProfile={() => setTab('profile')}
            setNotice={setNotice}
          />
        )}
      </div>

      <nav className="v6-bottom" aria-label="Navegacion principal">
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
  const [role, setRole] = useState<V6Role>('client');
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
        JSON.stringify({ fullName, role }),
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
        await completeV6Profile({ fullName, role });
      } else {
        setLocalNotice('Cuenta creada. Te mandamos un email para confirmar y entrar a MANITO.');
        setNotice('Cuenta creada. Revisa tu email para confirmar el acceso.');
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
        <h1>{mode === 'login' ? 'Entra a MANITO.' : 'Crea tu cuenta.'}</h1>
        <p className="v6-muted">
          Probá el circuito como cliente y profesional desde la misma cuenta.
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
              <label className="v6-field">
                <span>Tipo de cuenta</span>
                <select value={role} onChange={(event) => setRole(event.target.value as V6Role)}>
                  <option value="client">Quiero contratar servicios</option>
                  <option value="professional">Quiero trabajar con MANITO</option>
                </select>
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
  const [selectedProfessionalId, setSelectedProfessionalId] = useState(featuredProfessionals[0].id);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [paymentProfiles, setPaymentProfiles] = useState<V6PaymentProfile[]>([]);
  const [serviceGroup, setServiceGroup] = useState<ServiceGroupId>('all');
  const [creatingOrder, setCreatingOrder] = useState(false);
  const requestFormRef = useRef<HTMLElement | null>(null);
  const selectedProfessional = featuredProfessionals.find(
    (professional) => professional.id === selectedProfessionalId,
  );
  const selectedBasePrice = selectedService?.base_price ?? 0;
  const estimatedPrice = selectedService
    ? selectedBasePrice +
      (mode === 'scheduled' ? 2000 : 0) +
      (assignmentMode === 'manual' ? selectedProfessional?.priceDelta || 0 : 0)
    : null;
  const etaText =
    mode === 'scheduled'
      ? 'Horario reservado'
      : selectedProfessional
        ? `${selectedProfessional.etaMinutes} min`
        : '30-45 min';
  const scoredServices = useMemo(
    () =>
      services
        .map((service) => ({ service, score: serviceScore(service, problemQuery) }))
        .sort((left, right) => right.score - left.score),
    [problemQuery, services],
  );
  const recommendedService = scoredServices.find((item) => item.score > 0)?.service || null;
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
  const recommendedProfessional = professionalForService(recommendedService);
  const photoNames = photoFiles.map((file) => file.name);

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
        `Asignación: ${
          assignmentMode === 'manual' && selectedProfessional
            ? `prefiero a ${selectedProfessional.name}`
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
        assignmentMode,
        preferredProfessionalId: null,
        paymentMethod,
        guaranteeDays: 7,
        etaMinutes: selectedProfessional?.etaMinutes || null,
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
    const professional = professionalForService(service);
    const label = serviceDisplayName(service);
    setSelectedService(service);
    setProblemQuery(nextProblem);
    setDescription(nextProblem.trim() || `Necesito ayuda con ${label}.`);
    setAssignmentMode('manual');
    setSelectedProfessionalId(professional.id);
    setNotice(`${label} seleccionado. Completá los datos y publicá el pedido.`);
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
              <small>
                {recommendedProfessional.name} - {recommendedProfessional.rating} estrellas - {recommendedProfessional.etaMinutes} min
              </small>
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
            { id: 'immediate', title: 'Ahora', body: 'Profesional disponible lo antes posible', icon: <PlugZap size={22} aria-hidden="true" /> },
            { id: 'scheduled', title: 'Programar', body: 'Elegí día y horario', icon: <Clock size={22} aria-hidden="true" /> },
            { id: 'quote', title: 'Presupuestar', body: 'Compara propuestas antes de decidir', icon: <MessageCircle size={22} aria-hidden="true" /> },
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
              <span>{assignmentMode === 'manual' ? 'Elegís vos' : 'MANITO asigna'}</span>
            </div>
            <div className="v6-choice-grid">
              <button
                type="button"
                className="v6-choice"
                aria-pressed={assignmentMode === 'auto'}
                onClick={() => setAssignmentMode('auto')}
              >
                <Users size={18} aria-hidden="true" />
                Automático
              </button>
              <button
                type="button"
                className="v6-choice"
                aria-pressed={assignmentMode === 'manual'}
                onClick={() => setAssignmentMode('manual')}
              >
                <Star size={18} aria-hidden="true" />
                Elegir profesional
              </button>
            </div>

            {assignmentMode === 'manual' && (
              <div className="v6-pro-list">
                {featuredProfessionals.map((professional) => (
                  <button
                    className="v6-pro-card"
                    type="button"
                    aria-pressed={selectedProfessionalId === professional.id}
                    key={professional.id}
                    onClick={() => setSelectedProfessionalId(professional.id)}
                  >
                    <span className="v6-pro-avatar">{professional.name.slice(0, 1)}</span>
                    <span>
                      <strong>{professional.name}</strong>
                      <small>{professional.trade}</small>
                      <small>
                        {professional.rating} estrellas - {professional.jobs} trabajos - {professional.distance} - {professional.etaMinutes} min
                      </small>
                      <em>{professional.specialties.join(' - ')}</em>
                    </span>
                    <span className="v6-badges">
                      {professional.verified && <BadgeCheck size={17} aria-label="Verificado" />}
                      {professional.pro && <b>PRO</b>}
                      <Heart size={17} aria-label="Favorito" />
                    </span>
                  </button>
                ))}
              </div>
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
            {paymentProfiles.length > 0 && (
              <div className="v6-file-list">
                {paymentProfiles.map((payment) => (
                  <span key={payment.id}>
                    {paymentProfileIcon(payment)} {paymentProfileDisplay(payment)}
                  </span>
                ))}
              </div>
            )}
            {paymentMethod === 'wallet' && (
              <p className="v6-note">
                Para pruebas, MANITO registra Cuenta DNI/billetera como método preferido. El cobro real se coordina por QR o link hasta integrar un proveedor de pagos.
              </p>
            )}

            {mode === 'quote' && selectedService && (
              <div className="v6-quote-list">
                {featuredProfessionals.map((professional) => (
                  <article className="v6-quote-card" key={professional.id}>
                    <strong>{professional.name}</strong>
                    <span>{professional.rating} estrellas - disponible hoy - visita {money(6500)}</span>
                    <p>
                      Mano de obra {money(Math.max(0, selectedBasePrice + professional.priceDelta))}
                      {' '}+ fee MANITO {money(2500)}
                    </p>
                  </article>
                ))}
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
            onClick={() => openAccountShortcut('En Cuenta tenes tu codigo de referido para compartir.')}
          >
            Referir amigo con promo
          </button>
          <button className="done" type="button" onClick={shareTracking}>
            Compartir seguimiento
          </button>
          <button
            className="done"
            type="button"
            onClick={() => openAccountShortcut('En Cuenta podes configurar tu contacto de confianza.')}
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
                <small>Desde {money(service.base_price)} - {professionalForService(service).etaMinutes} min</small>
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

  return (
    <section className="v6-appointment">
      <div>
        <p className="v6-live">
          <Clock size={14} aria-hidden="true" /> Cita pendiente
        </p>
        <h2>{serviceDisplayName(nextOrder.service)}</h2>
        <p>
          {appointmentLabel} · {nextOrder.address}
        </p>
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
  onPickProfessional,
}: {
  onPickProfessional: (professional: FeaturedProfessional) => void;
}) {
  return (
    <>
      <section className="v6-card v6-referral">
        <h2>Favoritos</h2>
        <p>Volves a contratar rapido a quienes ya te dieron confianza.</p>
      </section>
      <section className="v6-section v6-flat-section">
        <div className="v6-section-head">
          <h2>Profesionales recomendados</h2>
          <span>Ver todos</span>
        </div>
        <div className="v6-pro-list">
          {featuredProfessionals.map((professional) => (
            <button className="v6-pro-card v6-public-pro" type="button" key={professional.id} onClick={() => onPickProfessional(professional)}>
              <span className="v6-pro-avatar">{professional.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
              <span>
                <strong>{professional.name}</strong>
                <small>{professional.rating} estrellas - {professional.jobs} trabajos - {professional.trade}</small>
                <em>{professional.specialties.join(' - ')}</em>
              </span>
              <span className="v6-badges">
                {professional.pro && <b>PRO</b>}
                <Heart size={17} aria-label="Favorito" />
              </span>
            </button>
          ))}
        </div>
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
  if (slug === 'mecanica_automotor') return 'Diagnóstico, frenos, batería, arranque, service y fallas generales.';
  if (slug === 'gomeria') return 'Pinchaduras, cubiertas, alineación, balanceo y auxilio de ruedas.';
  if (slug === 'chapa_pintura_auto') return 'Chapa, pintura, rayones, abolladuras y arreglos de carrocería.';
  return 'Profesionales verificados para resolver tareas del hogar.';
}

function ProfessionalHome({
  profile,
  services,
  proServices,
  matchingOrders,
  activeOrders,
  setProfile,
  setProServices,
  setOrders,
  setChatOrder,
  setError,
  setNotice,
}: {
  profile: V6Profile;
  services: V6Service[];
  proServices: V6ProfessionalService[];
  matchingOrders: V6Order[];
  activeOrders: V6Order[];
  setProfile: (profile: V6Profile) => void;
  setProServices: (services: V6ProfessionalService[]) => void;
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
        .map((order) => evaluateProfessionalOrderMatch(order, profile, professionalProfile, proServices))
        .filter((match): match is ProfessionalOrderMatch => Boolean(match))
        .sort((a, b) => b.score - a.score),
    [matchingOrders, proServices, professionalProfile, profile],
  );

  async function toggleAvailable() {
    try {
      setProfile(await setV6Availability(profile.id, !profile.is_available));
      setNotice(!profile.is_available ? 'Ahora estas disponible.' : 'Disponibilidad desactivada.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cambiar disponibilidad.');
    }
  }

  async function toggleService(serviceId: number) {
    const current = new Set(proServices.map((item) => item.service_id));
    if (current.has(serviceId)) current.delete(serviceId);
    else current.add(serviceId);
    try {
      setProServices(await saveV6ProfessionalServices(profile.id, [...current], services));
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
          <strong>{profile.is_available ? 'Estas disponible' : 'No estas recibiendo pedidos'}</strong>
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
        {!profile.is_available && <Empty title="Estas desconectado" body="Activa Disponible para ver pedidos abiertos." />}
        {profile.is_available && !compatibleMatches.length && <Empty title="No hay pedidos compatibles" body="Cuando un cliente publique un servicio dentro de tu zona y horario aparecera aca." />}
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
          <textarea value={proposalNote} onChange={(event) => setProposalNote(event.target.value)} aria-label="Observacion" />
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
        {order.professional_id && (
          <button className="v6-secondary" type="button" onClick={() => setChatOrder(order)}>
            <MessageCircle size={16} aria-hidden="true" /> Abrir chat
          </button>
        )}
        {canShareTracking && (
          <button className="v6-secondary" type="button" onClick={shareOrderTracking}>
            <SendHorizontal size={16} aria-hidden="true" /> Compartir seguimiento
          </button>
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
  proServices,
  setProfile,
  setProServices,
  setNotice,
  setError,
}: {
  profile: V6Profile;
  services: V6Service[];
  proServices: V6ProfessionalService[];
  setProfile: (profile: V6Profile) => void;
  setProServices: (services: V6ProfessionalService[]) => void;
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
  const [portfolioDescription, setPortfolioDescription] = useState('Antes y despues documentado para el cliente.');
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
      .then(([nextProfessionalProfile, nextPayoutDetails, nextOnboarding, nextDocuments, nextPortfolio]) => {
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
      return 'Por ahora sube fotos JPG, PNG o WebP. Para PDF, pega un link.';
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
    try {
      setProServices(await saveV6ProfessionalServices(profile.id, [...current], services, serviceRatesFor([...current])));
      setNotice('Servicios guardados.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se guardaron servicios.');
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
    'Perfil publico',
    'Datos personales',
    'Documentos',
    'Portfolio',
    'Zona y tarifas',
    'Revision',
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

  const selectedServiceIds = new Set(proServices.map((item) => item.service_id));
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
                {proServices.length} servicios · {completedDocuments}/{requiredDocuments.length} documentos · paso interno {onboarding?.current_step || 1}/16
              </small>
            </div>
            <div className="v6-wizard-actions">
              <button
                className="v6-secondary"
                type="button"
                onClick={() => goToProfessionalStep(professionalStep - 1)}
                disabled={professionalStep === 1}
              >
                Atras
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
                  {submittingOnboarding ? 'Enviando...' : 'Enviar a verificacion'}
                </button>
              )}
            </div>
      </section>

      {professionalStep === 1 && (
          <section className="v6-card">
            <h2>Servicios que ofreces</h2>
            <p className="v6-help-text">
              Elegi los rubros donde queres recibir pedidos. Despues vas a poder definir zona, horarios y tarifas.
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
            <div className="v6-summary">
              <span>
                <BriefcaseBusiness size={17} aria-hidden="true" /> Servicios seleccionados
              </span>
              <small>{proServices.length ? `${proServices.length} rubros activos` : 'Todavia no elegiste rubros'}</small>
            </div>
          </section>
      )}

      {professionalStep === 2 && (
          <section className="v6-card">
            <h2>Perfil público</h2>
            <form className="v6-stack" onSubmit={saveProfessionalSurface}>
              <label className="v6-field">
                <span>Titulo</span>
                <input value={headline} onChange={(event) => setHeadline(event.target.value)} />
              </label>
              <label className="v6-field">
                <span>Descripcion</span>
                <textarea value={bio} onChange={(event) => setBio(event.target.value)} />
              </label>
              <div className="v6-split">
                <label className="v6-field">
                  <span>Años de experiencia</span>
                  <input value={yearsExperience} onChange={(event) => setYearsExperience(event.target.value)} />
                </label>
                <label className="v6-field">
                  <span>Seguro / matricula</span>
                  <input value={insuranceLabel} onChange={(event) => setInsuranceLabel(event.target.value)} />
                </label>
              </div>
              <div className="v6-summary">
                <span>
                  <BadgeCheck size={17} aria-hidden="true" /> Vista publica
                </span>
                <strong>{professionalProfile?.rating_avg || 4.8} estrellas</strong>
                <small>{professionalProfile?.jobs_completed || 0} trabajos · {professionalProfile?.manito_pro ? 'MANITO PRO' : 'Verificacion en curso'}</small>
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
              Sube fotos JPG, PNG o WebP. Si tenes PDF o carpeta compartida, pega el link.
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
                      <span>Foto</span>
                      <input name={`${item.kind}-file`} type="file" accept="image/jpeg,image/png,image/webp" />
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
                <span>Titulo del trabajo</span>
                <input value={portfolioTitle} onChange={(event) => setPortfolioTitle(event.target.value)} />
              </label>
              <label className="v6-field">
                <span>Descripcion</span>
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
                  <span>Foto despues</span>
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
                    {renderEvidence(item.after_path, 'Despues')}
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
              Ajusta donde trabajas, cuando estas disponible y cuanto queres cobrar desde cada rubro.
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
            <h2>Revision MANITO</h2>
            <div className="v6-summary">
              <span>
                <BadgeCheck size={17} aria-hidden="true" /> Resumen de alta
              </span>
              <small>
                {proServices.length} servicios · {completedDocuments}/{requiredDocuments.length} documentos · {portfolio.length} trabajos en portfolio
              </small>
            </div>
            <div className="v6-step-grid">
              <span className={proServices.length ? 'done' : ''}>Servicios cargados</span>
              <span className={professionalProfile ? 'done' : ''}>Perfil publico guardado</span>
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
              {submittingOnboarding ? 'Enviando...' : 'Enviar alta a verificacion'}
            </button>
          </section>
      )}
    </>
  );
}

function AccountPanel({
  profile,
  canInstall,
  onInstall,
  onOpenProfile,
  setNotice,
}: {
  profile: V6Profile;
  canInstall: boolean;
  onInstall: () => void;
  onOpenProfile: () => void;
  setNotice: (message: string) => void;
}) {
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
    setNotice('Conexion borrada.');
    window.location.reload();
  }

  function saveAccountPreferences() {
    window.localStorage.setItem(`manito_v6_account_type:${profile.id}`, accountType);
    window.localStorage.setItem(`manito_v6_tax_id:${profile.id}`, taxId);
    window.localStorage.setItem(`manito_v6_trusted:${profile.id}`, trustedContact);
    window.localStorage.setItem(`manito_v6_hide_phone:${profile.id}`, String(hidePhoneInChat));
    setNotice('Cuenta actualizada.');
  }

  async function copyReferralCode() {
    try {
      await navigator.clipboard?.writeText(referralCode);
      setNotice('Código de referido copiado.');
    } catch {
      setNotice(`Tu código de referido es ${referralCode}.`);
    }
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
      });
      setPaymentProfiles(await listV6PaymentProfiles(profile.id));
      setNotice(alreadySaved ? 'Medio de pago actualizado.' : 'Medio de pago guardado.');
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
            <input value={trustedContact} onChange={(event) => setTrustedContact(event.target.value)} />
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
        <p className="v6-muted">Guardamos un método por tipo para evitar duplicados.</p>
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
            <span key={payment.id}>
              {paymentProfileIcon(payment)} {paymentProfileDisplay(payment)}
            </span>
          ))}
        </div>
      </section>
      <section className="v6-card">
        <h2>Beneficios</h2>
        <div className="v6-step-grid">
          <span className="done">Referidos: invita y gana credito</span>
          <span className="done">Recurrentes: repetir servicios habituales</span>
          <span className="done">Favoritos: volver a contratar profesionales</span>
          <span className="done">Compartir seguimiento con contacto de confianza</span>
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
              <span>Operacion realtime</span>
            </article>
            <article>
              <strong>Profesionales</strong>
              <span>Alta, documentos y suspension</span>
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
