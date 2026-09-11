'use client';

import type { Session } from '@supabase/supabase-js';
import Image from 'next/image';
import { MatchingLocation, ProfessionalCoverage, CompleteMatchingLocation } from './MatchingLocation';
import { ProtectionAdminCase, ProtectionPanel } from './ProtectionManito';
import { RecurringServicesPanel, RecurringAdminPanel } from './RecurringServicesPanel';
import {
  ExperienceSwitch,
  ManitoBottomNavigation,
  RequestProgress,
  type ManitoExperience,
  type ManitoTab,
} from './ManitoUx';
import { subscribeV6Complaints } from '../lib/v6ProtectionApi';
import { subscribeV6OrderDetails } from '../lib/v6OrderRealtime';
import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  Bell,
  BriefcaseBusiness,
  Camera,
  Check,
  ChevronRight,
  CircleDot,
  Clock,
  CreditCard,
  Download,
  Heart,
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
  Ticket,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  acceptV6Proposal,
  acceptV6Order,
  addV6OrderPhoto,
  addV6OrderExtra,
  addV6PortfolioItem,
  addV6Rating,
  addV6PaymentProfile,
  advanceV6Order,
  cancelV6Order,
  chooseV6ManualOrderProfessional,
  completeV6Profile,
  completeTrackedV6Order,
  confirmV6ManualPayment,
  createV6RecurringServicePlan,
  createV6Order,
  decideV6OrderExtra,
  disputeV6ManualPayment,
  editV6UncontractedOrder,
  fallbackV6ManualOrderToAuto,
  getV6Profile,
  getV6MediaSignedUrl,
  getV6ProfessionalOnboarding,
  getV6ProfessionalPaymentAccount,
  getV6ProfessionalPayoutDetails,
  getV6ProfessionalProfile,
  getV6UserSecurityPreferences,
  listV6AdminComplaintReviews,
  listV6AdminSettings,
  listV6AdminProfessionalReviews,
  listV6ClientAddresses,
  listV6Messages,
  listV6Notifications,
  listV6OrderExtras,
  listV6OrderPhotos,
  listV6OrderProposals,
  listV6Orders,
  listV6PaymentsForOrder,
  listV6PaymentProfiles,
  listV6Portfolio,
  listV6PublicProfessionals,
  listV6ProfessionalDocuments,
  listV6ProfessionalServices,
  listV6ProfessionalSpecialties,
  listV6Services,
  listV6Specialties,
  markV6NotificationsRead,
  removeV6MediaFiles,
  removeV6Channel,
  reviewV6ProfessionalDocument,
  reviewV6ProfessionalOnboarding,
  rejectV6MatchingCandidate,
  rejectV6ManualOrderRequest,
  reportV6OrderPayment,
  retryV6ImmediateMatching,
  sendV6OrderProposal,
  saveV6ProfessionalServices,
  saveV6ProfessionalSpecialties,
  sendV6Message,
  setV6Availability,
  startV6Order,
  subscribeV6Messages,
  subscribeV6Orders,
  updateV6Profile,
  uploadV6MediaFile,
  uploadV6OrderEvidenceFile,
  upsertV6ClientAddress,
  upsertV6ProfessionalDocument,
  upsertV6ProfessionalOnboarding,
  upsertV6ProfessionalPayoutDetails,
  upsertV6ProfessionalProfile,
  upsertV6UserSecurityPreferences,
} from '../lib/v6Api';
import { MIN_PASSWORD_LENGTH, passwordHelpText, passwordSecurityMessage } from '../lib/security';
import {
  canProfessionalAdvanceOrder,
  nextProfessionalOrderAction,
  orderStatusFlow,
  visibleClientPin,
} from '../lib/orderFlow';
import { paymentCapabilities, type ManitoPaymentMethod } from '../lib/paymentCapabilities';
import {
  approvedExtrasTotal,
  orderCommissionAmount,
  orderDisplayAmount,
  orderEstimatedAmount,
  orderServiceTotal,
} from '../lib/economics';
import {
  missingBlockingRequirements,
  professionalOnboardingRequirements,
} from '../lib/professionalOnboarding';
import {
  clearStoredConfig,
  getV6Supabase,
  isV6SupabaseConfigured,
  saveStoredConfig,
} from '../lib/v6Supabase';
import type {
  V6AdminComplaintReview,
  V6AdminProfessionalReview,
  V6AdminReviewDocument,
  V6AdminReviewStatus,
  V6AdminSetting,
  V6CancellationReason,
  V6Message,
  V6Mode,
  V6Notification,
  V6Order,
  V6OrderExtra,
  V6OrderPhoto,
  V6OrderProposal,
  V6Payment,
  V6PaymentProfile,
  V6PaymentStatus,
  V6PortfolioItem,
  V6OrderStatus,
  V6Profile,
  V6ProfessionalDocument,
  V6ProfessionalOnboarding,
  V6ProfessionalPaymentAccount,
  V6ProfessionalProfile,
  V6ProfessionalService,
  V6ProfessionalSpecialty,
  V6PublicProfessional,
  V6Role,
  V6Service,
  V6Specialty,
  V6UserSecurityPreferences,
} from '../lib/v6Types';
import { V6_MODE_LABEL, V6_STATUS_LABEL } from '../lib/v6Types';
import { friendlyAuthError } from '../lib/authMessages';
import { isRecoverableMissingProfileError } from '../lib/profileRecovery';
import {
  authoritativeRequestCoordinates,
  type RequestLocationAuthority,
} from '../lib/requestLocation';

type Tab = ManitoTab;
type AuthMode = 'login' | 'signup' | 'reset';
type AssignmentMode = 'auto' | 'manual';
type PaymentMethod = ManitoPaymentMethod;
type AppMode = ManitoExperience;
type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly';
type RequestStep = 'need' | 'place' | 'mode' | 'resolution' | 'review';
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

const scheduledReservationDurationMinutes = 120;
const requestSteps: readonly RequestStep[] = ['need', 'place', 'mode', 'resolution', 'review'];
const requestStepLabels = ['Necesidad', 'Lugar', 'Modalidad', 'Resolución', 'Revisión'] as const;
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

const statusFlow = orderStatusFlow;
const deployedAppUrl =
  'https://bloody-eta.vercel.app';
const onlineCardEnabled = false;
const paymentOptionIcons: Record<PaymentMethod, ReactNode> = {
  card: <CreditCard size={17} aria-hidden="true" />,
  wallet: <Wallet size={17} aria-hidden="true" />,
  cash: <Banknote size={17} aria-hidden="true" />,
};

const clientCancellationReasons: Array<{ value: V6CancellationReason; label: string }> = [
  { value: 'service_no_longer_needed', label: 'Ya no necesito el servicio' },
  { value: 'schedule_changed', label: 'Cambié de horario' },
  { value: 'professional_unavailable_or_delayed', label: 'El profesional se demoró o no puede venir' },
  { value: 'other', label: 'Otro motivo' },
];

const professionalCancellationReasons: Array<{ value: V6CancellationReason; label: string }> = [
  { value: 'unavailable', label: 'No estoy disponible' },
  { value: 'schedule_problem', label: 'Problema de agenda' },
  { value: 'service_not_compatible', label: 'El trabajo no es compatible' },
  { value: 'emergency', label: 'Emergencia' },
  { value: 'other', label: 'Otro motivo' },
];

const paymentOptions = paymentCapabilities({ onlineCardEnabled }).map((option) => ({
  ...option,
  icon: paymentOptionIcons[option.id],
}));
const contractModeOptions: Array<{ id: V6Mode; title: string; body: string; icon: ReactNode }> = [
  { id: 'immediate', title: 'Ahora', body: 'Lo antes posible', icon: <PlugZap size={20} aria-hidden="true" /> },
  { id: 'scheduled', title: 'Programar', body: 'Día y horario', icon: <Clock size={20} aria-hidden="true" /> },
  { id: 'quote', title: 'Presupuestar', body: 'Comparar precios', icon: <MessageCircle size={20} aria-hidden="true" /> },
];
const recurrenceOptions: Array<{ id: RecurrenceFrequency; label: string }> = [
  { id: 'weekly', label: 'Semanal' },
  { id: 'biweekly', label: 'Quincenal' },
  { id: 'monthly', label: 'Mensual' },
];

function serviceSupportsMode(service: V6Service | null, mode: V6Mode) {
  if (!service) return true;
  if (mode === 'immediate') return service.allow_immediate !== false;
  if (mode === 'scheduled') return service.allow_scheduled !== false;
  return service.allow_quote !== false;
}

function isOpenOpportunityStatus(status: V6OrderStatus) {
  return status === 'open' || status === 'scheduled_open' || status === 'waiting_quotes';
}

function isPendingAutomaticMatchingInvitation(order: V6Order) {
  return (
    order.mode === 'immediate' &&
    (order.assignment_mode || 'auto') === 'auto' &&
    order.matching_candidate_status === 'pending' &&
    Boolean(order.matching_candidate_deadline_at)
  );
}

function firstSupportedMode(service: V6Service): V6Mode {
  return contractModeOptions.find((option) => serviceSupportsMode(service, option.id))?.id || 'scheduled';
}

function unsupportedModeMessage(service: V6Service, mode: V6Mode) {
  const modeName = contractModeOptions.find((option) => option.id === mode)?.title || 'esta modalidad';
  return `${serviceDisplayName(service)} no está disponible para ${modeName}. Elegí otra modalidad para este servicio.`;
}

function supportsRecurringService(service: V6Service | null) {
  return Boolean(service?.supports_recurring);
}

function paymentLabel(method?: string | null) {
  if (method === 'transfer') return 'Transferencia';
  return paymentOptions.find((option) => option.id === method)?.label || 'A coordinar';
}

function paymentStatusLabel(status?: V6PaymentStatus | null) {
  if (status === 'paid') return 'Pago confirmado';
  if (status === 'pending' || status === 'authorized') return 'Esperando confirmación';
  if (status === 'rejected') return 'Pago rechazado';
  if (status === 'refunded') return 'Reembolsado';
  if (status === 'partially_refunded') return 'Reembolso parcial';
  if (status === 'not_required') return 'Sin pago online';
  return 'Aún no pagado';
}

function paymentRecordStatusLabel(payment?: V6Payment | null) {
  if (!payment) return 'Sin reporte de pago';
  if (payment.status === 'reported') return 'Esperando confirmación del profesional';
  if (payment.status === 'confirmed' || payment.status === 'approved') return 'Pago confirmado';
  if (payment.status === 'disputed' || payment.status === 'rejected') return 'Pago en revisión';
  if (payment.status === 'initiated' || payment.status === 'pending' || payment.status === 'awaiting_client_action') {
    return 'Pago pendiente';
  }
  if (payment.status === 'cancelled') return 'Pago cancelado';
  if (payment.status === 'refunded') return 'Reembolsado';
  if (payment.status === 'partially_refunded') return 'Reembolso parcial';
  if (payment.status === 'expired') return 'Pago vencido';
  return 'Pago pendiente';
}

function isManualPaymentMethod(method?: string | null) {
  return method === 'cash' || method === 'wallet' || method === 'transfer';
}

function reportPaymentButtonLabel(method?: string | null) {
  if (method === 'cash') return 'Entregué el efectivo';
  if (method === 'wallet') return 'Transferencia Cuenta DNI realizada';
  return 'Transferencia realizada';
}

function paymentProviderLabel(provider?: string | null) {
  if (provider === 'mercado_pago') return 'Mercado Pago';
  if (provider === 'wallet') return 'Cuenta DNI / billetera';
  if (provider === 'cash') return 'Efectivo';
  return 'MANITO';
}

function paymentAccountStatusLabel(account: V6ProfessionalPaymentAccount | null) {
  if (!account) return 'No conectada';
  if (account.status === 'connected' && account.can_receive_online_payments) return 'Lista para pagos online';
  if (account.status === 'connected') return 'Conectada, falta habilitación';
  if (account.status === 'pending_oauth') return 'Vinculación pendiente';
  if (account.status === 'restricted') return 'Cuenta restringida';
  if (account.status === 'disconnected') return 'Desconectada';
  return 'No conectada';
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

function uniquePaymentProfiles(profiles: V6PaymentProfile[]) {
  const preferred = [...profiles].sort((left, right) => {
    if (left.is_default !== right.is_default) return left.is_default ? -1 : 1;
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
  const seen = new Set<string>();
  return preferred.filter((profile) => {
    if (seen.has(profile.type)) return false;
    seen.add(profile.type);
    return true;
  });
}

function photoStageLabel(stage: V6OrderPhoto['stage']) {
  if (stage === 'before') return 'Antes';
  if (stage === 'after') return 'Trabajo terminado';
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

function shortDateTime(value?: string | null) {
  if (!value) return 'A coordinar';
  return shortDate(value);
}

function dateTimeInputValue(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function proposalTotal(proposal: V6OrderProposal) {
  return proposal.visit_price + proposal.labor_price + proposal.materials_price + proposal.manito_fee;
}

function proposalIsExpiredByClock(proposal: V6OrderProposal) {
  return proposal.status === 'sent' && !!proposal.valid_until && new Date(proposal.valid_until).getTime() <= Date.now();
}

function proposalStatusLabel(proposal: V6OrderProposal) {
  if (proposal.status === 'accepted') return 'Aceptada';
  if (proposal.status === 'rejected') return 'No seleccionada';
  if (proposal.status === 'expired' || proposalIsExpiredByClock(proposal)) return 'Vencida';
  return 'Vigente';
}

function proposalAvailabilityText(proposal: V6OrderProposal) {
  if (proposal.available_from) return `Desde ${shortDate(proposal.available_from)}`;
  return proposal.availability_label || 'A coordinar';
}

function proposalMaterialsText(proposal: V6OrderProposal) {
  if (Number(proposal.materials_price) > 0) return `Materiales incluidos · ${money(proposal.materials_price)}`;
  if (normalizeText(proposal.observation || '').includes('no incluye materiales')) return 'Materiales no incluidos';
  return 'Materiales sin especificar';
}

function cityFromLocationLabel(value?: string | null) {
  const clean = (value || '').trim();
  if (!clean || clean.startsWith('GPS ')) return '';
  const parts = clean.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : clean;
}

function detailFromLocationLabel(value?: string | null) {
  const clean = (value || '').trim();
  if (!clean || clean.startsWith('GPS ')) return '';
  const parts = clean.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join(', ') : '';
}

function composeProfileLocation(city: string, detail: string) {
  const cleanCity = city.trim();
  const cleanDetail = detail.trim();
  if (!cleanDetail) return cleanCity;
  if (!cleanCity) return cleanDetail;
  return normalizeText(cleanDetail).includes(normalizeText(cleanCity))
    ? cleanDetail
    : `${cleanDetail}, ${cleanCity}`;
}

function paymentCoordinationHint(order: V6Order, role: V6Role) {
  if (order.payment_method === 'wallet') {
    return role === 'client'
      ? 'Pedile al prestador el QR o link por el chat. La app deja registrado el acuerdo.'
      : 'Mandá tu QR/link de Cuenta DNI o billetera por el chat antes de cerrar el trabajo.';
  }
  if (order.payment_method === 'cash') {
    return role === 'client'
      ? 'Pagá en efectivo al finalizar y dejá todo asentado en el seguimiento.'
      : 'Confirmá el cobro en efectivo dentro del pedido para que quede constancia.';
  }
  if (order.payment_method === 'card') {
    return 'El modelo queda preparado para Mercado Pago marketplace: cobro online, comisión MANITO y saldo al prestador.';
  }
  return 'El pago se coordina dentro del pedido para conservar chat, evidencia y Protección MANITO.';
}

function appointmentDate(order: V6Order) {
  return order.scheduled_at || order.accepted_at || order.created_at;
}

function orderTrackingText(order: V6Order) {
  const lines = [
    `MANITO - ${serviceDisplayName(order.service)}`,
    `Estado: ${orderStatusText(order)}`,
    `Dirección: ${order.address}`,
    order.scheduled_at ? `Turno: ${shortDate(order.scheduled_at)}` : null,
    order.eta_minutes ? `ETA: ${order.eta_minutes} min` : null,
    order.professional?.full_name ? `Prestador: ${order.professional.full_name}` : 'Prestador: pendiente de asignación',
  ].filter(Boolean);
  return lines.join('\n');
}

function orderStatusText(order: V6Order, proposalsCount = 0) {
  if (order.status === 'waiting_quotes' || (order.status === 'open' && order.mode === 'quote')) {
    return proposalsCount > 0 ? 'Propuestas recibidas' : 'Esperando presupuestos';
  }
  if (order.status === 'scheduled_open' || (order.status === 'open' && order.mode === 'scheduled')) return 'Buscando profesional para el día elegido';
  if (order.status === 'matching_failed') return 'Sin profesional disponible';
  if (order.status === 'open' && order.mode === 'immediate') return 'Buscando ahora';
  return V6_STATUS_LABEL[order.status];
}

function orderNextStepText(order: V6Order, role: V6Role) {
  if (order.status === 'open' && order.mode === 'immediate') return 'Ahora esperamos que un profesional disponible acepte.';
  if (order.status === 'scheduled_open' || (order.status === 'open' && order.mode === 'scheduled')) {
    return 'Ahora esperamos que un profesional confirme el día y horario.';
  }
  if (order.status === 'waiting_quotes' || (order.status === 'open' && order.mode === 'quote')) {
    return 'Vas a poder comparar las propuestas cuando lleguen.';
  }
  if (order.status === 'matching_failed') return 'Podés reintentar la búsqueda o cambiar cómo querés avanzar.';
  if (order.status === 'payment_pending') return role === 'client'
    ? 'Revisá el importe y completá la acción de pago correspondiente.'
    : 'Esperá la confirmación del pago antes de continuar.';
  if (order.status === 'accepted') return role === 'client'
    ? 'El profesional va a avisarte cuando salga hacia el domicilio.'
    : 'Cuando salgas, marcá que estás en camino.';
  if (order.status === 'en_camino') return role === 'client'
    ? 'Podés escribirle por el chat mientras llega.'
    : 'Al llegar, marcá tu llegada.';
  if (order.status === 'en_sitio') return role === 'client'
    ? 'Mostrale el PIN de inicio al profesional para comenzar.'
    : 'Pedile al cliente el PIN de inicio.';
  if (order.status === 'trabajando') return role === 'client'
    ? 'Revisá cualquier adicional y el trabajo antes de compartir el PIN final.'
    : 'Al terminar, cargá la evidencia requerida y pedí el PIN final.';
  if (order.status === 'completed') return role === 'client'
    ? 'Revisá el pago y calificá al profesional.'
    : 'Revisá que el pago figure correctamente.';
  if (order.status === 'cancelled') return 'El historial del servicio queda disponible en este trabajo.';
  return 'Abrí el trabajo para ver el próximo paso.';
}

function cancellationReasonLabel(reason?: string | null) {
  return (
    [...clientCancellationReasons, ...professionalCancellationReasons].find((option) => option.value === reason)?.label ||
    'Motivo no especificado'
  );
}

function cancellationResponsibilityLabel(responsibility?: string | null) {
  if (responsibility === 'client') return 'cliente';
  if (responsibility === 'professional') return 'profesional';
  if (responsibility === 'shared') return 'compartida';
  if (responsibility === 'manito') return 'MANITO';
  return 'a revisar';
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
  mode = 'immediate',
  scheduledAt = '',
}: {
  service: V6Service | null;
  professionals: V6PublicProfessional[];
  specialties: V6Specialty[];
  query: string;
  clientCoords: { lat: number; lng: number } | null;
  mode?: V6Mode;
  scheduledAt?: string;
}) {
  if (!service) return [];
  if (mode === 'scheduled' && !scheduledAt) return [];
  const detectedSpecialties = detectSpecialtiesForService(service, specialties, query);
  const detectedIds = new Set(detectedSpecialties.map((match) => match.specialty.id));

  return professionals
    .map((professional) => {
      const proService = professional.services.find((item) => item.service_id === service.id);
      if (!proService) return null;
      if (mode === 'immediate' && !professional.profile.is_available) return null;
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
      const reasons = [
        mode === 'immediate' ? 'Disponible ahora' : mode === 'scheduled' ? 'Agenda compatible' : 'Puede presupuestar',
        professional.professional_profile?.verified ? 'Verificado' : 'Verificación pendiente',
      ];

      if (mode === 'scheduled' && scheduledAt) {
        const scheduled = new Date(scheduledAt);
        const scheduledEnd = addMinutes(scheduled, scheduledReservationDurationMinutes);
        const activeDays = professional.professional_profile?.work_days?.length
          ? professional.professional_profile.work_days
          : ['Lun', 'Mar', 'Mie', 'Jue', 'Vie'];
        const scheduledDay = normalizeDayLabel(scheduledDayLabel(scheduledAt));
        const worksThatDay = activeDays.map(normalizeDayLabel).includes(scheduledDay);
        const scheduledTime = scheduled.toTimeString().slice(0, 5);
        const scheduledEndTime = scheduledEnd.toTimeString().slice(0, 5);
        if (!worksThatDay) return null;
        if (
          !timeInRange(scheduledTime, professional.professional_profile?.work_starts_at, professional.professional_profile?.work_ends_at) ||
          !timeInRange(scheduledEndTime, professional.professional_profile?.work_starts_at, professional.professional_profile?.work_ends_at)
        ) {
          return null;
        }
        reasons.push(`Horario ${scheduledTime}`);
      }

      const matchedSpecialties = professional.specialties
        .filter((item) => item.service_id === service.id && detectedIds.has(item.specialty_id))
        .map((item) => specialties.find((specialty) => specialty.id === item.specialty_id))
        .filter((item): item is V6Specialty => Boolean(item));
      const specialtyNames = matchedSpecialties.map((item) => item.name);
      const distanceReason =
        distance != null
          ? `${distance < 1 ? 'Menos de 1' : distance.toFixed(1)} km`
          : professional.professional_profile?.work_city || professional.profile.city || null;
      if (distanceReason) reasons.push(distanceReason);
      if (specialtyNames[0]) reasons.push(`Especialidad: ${specialtyNames.slice(0, 2).join(', ')}`);
      const score =
        62 +
        (professional.professional_profile?.verified ? 12 : 0) +
        Math.min(12, professional.professional_profile?.jobs_completed || 0) +
        (matchedSpecialties.length ? 14 : detectedSpecialties.length ? 2 : 0) +
        (distance != null ? Math.max(0, 10 - Math.round(distance)) : 3) +
        (mode === 'immediate' ? 4 : mode === 'scheduled' ? 2 : 0);

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
    const parts = location.split(',').map((part) => part.trim()).filter(Boolean);
    return parts.slice(0, 3).join(', ') || 'Agregar ciudad';
  }
  return location;
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

function addMinutes(date: Date, minutes: number) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
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

function manualRequestIsPending(order: V6Order) {
  return (
    order.assignment_mode === 'manual' &&
    !order.professional_id &&
    order.manual_response_status === 'pending'
  );
}

function manualRequestIsExpiredByClock(order: V6Order) {
  return (
    manualRequestIsPending(order) &&
    Boolean(order.manual_response_deadline_at) &&
    new Date(order.manual_response_deadline_at as string).getTime() <= Date.now()
  );
}

function manualRequestNeedsClientDecision(order: V6Order) {
  return (
    order.assignment_mode === 'manual' &&
    !order.professional_id &&
    (order.manual_response_status === 'awaiting_client_choice' ||
      order.manual_response_status === 'rejected' ||
      order.manual_response_status === 'expired' ||
      manualRequestIsExpiredByClock(order))
  );
}

function manualRequestCanBeRejectedBy(order: V6Order, profile: V6Profile) {
  return (
    profile.role === 'professional' &&
    manualRequestIsPending(order) &&
    order.preferred_professional_id === profile.id &&
    order.manual_requested_professional_id === profile.id &&
    !manualRequestIsExpiredByClock(order)
  );
}

function manualResponseLabel(order: V6Order) {
  if (order.manual_response_status === 'awaiting_client_choice') {
    return 'Tu profesional preferido no está disponible para esta visita.';
  }
  if (manualRequestIsExpiredByClock(order) || order.manual_response_status === 'expired') {
    return 'El profesional no respondió a tiempo.';
  }
  if (order.manual_response_status === 'rejected') {
    return 'El profesional no pudo tomar el trabajo.';
  }
  if (order.manual_response_status === 'pending' && order.manual_response_deadline_at) {
    return `Esperando respuesta hasta ${shortDate(order.manual_response_deadline_at)}.`;
  }
  return null;
}

function evaluateProfessionalOrderMatch(
  order: V6Order,
  profile: V6Profile,
  professionalProfile: V6ProfessionalProfile | null,
  proServices: V6ProfessionalService[],
  proSpecialties: V6ProfessionalSpecialty[],
  specialties: V6Specialty[],
): ProfessionalOrderMatch | null {
  if (!isOpenOpportunityStatus(order.status)) return null;
  if (order.match_score != null) {
    return {
      order,
      score: Math.min(98, Math.max(0, Number(order.match_score))),
      reasons: order.match_reasons?.length ? order.match_reasons : ['Compatible por MANITO'],
      distanceKm: order.distance_km ?? null,
    };
  }
  if (order.mode === 'immediate' && !profile.is_available) return null;
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
    const scheduledEnd = order.scheduled_end
      ? new Date(order.scheduled_end)
      : addMinutes(scheduled, order.estimated_duration_minutes || order.eta_minutes || scheduledReservationDurationMinutes);
    const activeDays = professionalProfile?.work_days?.length
      ? professionalProfile.work_days
      : ['Lun', 'Mar', 'Mie', 'Jue', 'Vie'];
    const scheduledDay = normalizeDayLabel(scheduledDayLabel(order.scheduled_at));
    const worksThatDay = activeDays.map(normalizeDayLabel).includes(scheduledDay);
    const scheduledTime = scheduled.toTimeString().slice(0, 5);
    const scheduledEndTime = scheduledEnd.toTimeString().slice(0, 5);
    if (!worksThatDay) return null;
    if (
      !timeInRange(scheduledTime, professionalProfile?.work_starts_at, professionalProfile?.work_ends_at) ||
      !timeInRange(scheduledEndTime, professionalProfile?.work_starts_at, professionalProfile?.work_ends_at)
    ) {
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

function profileNameFromSession(user: Session['user']) {
  const metadata = user.user_metadata as Record<string, unknown>;
  const metadataName = metadata.full_name;
  if (typeof metadataName === 'string' && metadataName.trim()) {
    return metadataName.trim();
  }
  const emailName = user.email?.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  return emailName || 'Usuario MANITO';
}

async function getOrRecoverV6Profile(user: Session['user']) {
  try {
    const existingProfile = await getV6Profile(user.id);
    if (existingProfile?.id) {
      return existingProfile;
    }
  } catch (caught) {
    if (!isRecoverableMissingProfileError(caught)) {
      throw caught;
    }
  }

  return completeV6Profile({
    fullName: profileNameFromSession(user),
    role: 'client',
  });
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

type ReverseGeocodeResult = {
  city: string | null;
  label: string | null;
};

type ReverseGeocodeResponse = {
  display_name?: string;
  address?: Record<string, string | undefined>;
};

type ForwardGeocodeResponse = Array<{
  lat?: string;
  lon?: string;
}>;

function coordinateFallback(lat: number, lng: number) {
  return `GPS ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

function readableReverseLocation(data: ReverseGeocodeResponse): ReverseGeocodeResult {
  const address = data.address || {};
  const city =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    address.state_district ||
    address.state ||
    null;
  const neighbourhood =
    address.neighbourhood ||
    address.suburb ||
    address.city_district ||
    address.quarter ||
    null;
  const road =
    address.road ||
    address.pedestrian ||
    address.footway ||
    address.path ||
    address.cycleway ||
    address.residential ||
    null;
  const street = road
    ? `${road}${address.house_number ? ` ${address.house_number}` : ''}`
    : null;
  const labelParts = [street, neighbourhood, city].filter(Boolean);
  const label = labelParts.length ? labelParts.join(', ') : data.display_name || null;
  return { city, label };
}

async function reverseGeocodePhoneLocation(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('zoom', '18');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('accept-language', 'es-AR,es');

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return null;
  return readableReverseLocation((await response.json()) as ReverseGeocodeResponse);
}

async function geocodeManualLocation(line: string, city: string) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'ar');
  url.searchParams.set('accept-language', 'es-AR,es');
  url.searchParams.set('q', formatAddress(line, city));

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return null;
  const [match] = (await response.json()) as ForwardGeocodeResponse;
  const lat = Number(match?.lat);
  const lng = Number(match?.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export default function ManitoV6App() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<V6Profile | null>(null);
  const [services, setServices] = useState<V6Service[]>([]);
  const [specialties, setSpecialties] = useState<V6Specialty[]>([]);
  const [proServices, setProServices] = useState<V6ProfessionalService[]>([]);
  const [proSpecialties, setProSpecialties] = useState<V6ProfessionalSpecialty[]>([]);
  const [publicProfessionals, setPublicProfessionals] = useState<V6PublicProfessional[]>([]);
  const [orders, setOrders] = useState<V6Order[]>([]);
  const [notifications, setNotifications] = useState<V6Notification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [appMode, setAppMode] = useState<AppMode>('client');
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatOrder, setChatOrder] = useState<V6Order | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [savingPhoneLocation, setSavingPhoneLocation] = useState(false);
  const [locationEditorOpen, setLocationEditorOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<V6Order | null>(null);
  const [clientSelectedService, setClientSelectedService] = useState<V6Service | null>(null);
  const [clientProblemQuery, setClientProblemQuery] = useState('');
  const lastAuthUser = useRef<string | null>(null);
  const dataLoadEpoch = useRef(0);

  useEffect(() => {
    const ready = isV6SupabaseConfigured();
    setConfigured(ready);
    if (!ready) setLoading(false);
    setIsStandalone(isInstalledDisplayMode());
  }, []);

  const loadData = useCallback(async (user: Session['user']) => {
    const epoch = ++dataLoadEpoch.current;
    setProfileLoading(true);
    try {
      const userId = user.id;
      const nextProfile = await getOrRecoverV6Profile(user);
      if (epoch !== dataLoadEpoch.current) return;
      setError(null);
      setProfile(nextProfile);

      const [
        nextServices,
        nextSpecialties,
        nextOrders,
        nextNotifications,
        nextProServices,
        nextProSpecialties,
        nextPublicProfessionals,
      ] = await Promise.allSettled([
        listV6Services(),
        listV6Specialties(),
        listV6Orders(),
        listV6Notifications(userId),
        listV6ProfessionalServices(userId),
        listV6ProfessionalSpecialties(userId),
        listV6PublicProfessionals(),
      ]);

      if (epoch !== dataLoadEpoch.current) return;
      if (nextServices.status === 'fulfilled') setServices(nextServices.value);
      if (nextSpecialties.status === 'fulfilled') setSpecialties(nextSpecialties.value);
      if (nextOrders.status === 'fulfilled') setOrders(nextOrders.value);
      if (nextNotifications.status === 'fulfilled') setNotifications(nextNotifications.value);
      if (nextProServices.status === 'fulfilled') setProServices(nextProServices.value);
      if (nextProSpecialties.status === 'fulfilled') setProSpecialties(nextProSpecialties.value);
      if (nextPublicProfessionals.status === 'fulfilled') {
        setPublicProfessionals(nextPublicProfessionals.value);
      }

      const secondaryLoadFailed = [
        nextServices,
        nextSpecialties,
        nextOrders,
        nextNotifications,
        nextProServices,
        nextProSpecialties,
        nextPublicProfessionals,
      ].some((result) => result.status === 'rejected');

      if (secondaryLoadFailed) {
        setNotice('Entraste correctamente. Algunos datos pueden tardar unos segundos en actualizar.');
      }
    } finally {
      if (epoch === dataLoadEpoch.current) setProfileLoading(false);
    }
  }, []);

  const resetSession = useCallback(async () => {
    dataLoadEpoch.current++;
    lastAuthUser.current = null;
    try {
      await getV6Supabase().auth.signOut({ scope: 'local' });
    } catch {
      // If the token is rejected because of clock skew, clearing UI state is enough.
    }
    setSession(null);
    setProfile(null);
    setOrders([]);
    setNotifications([]);
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
    let alive = true;
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!alive) return;
        setSession(data.session);
        if (data.session?.user.id) {
          let needsLoad = lastAuthUser.current !== data.session.user.id;
          lastAuthUser.current = data.session.user.id;
          const email = data.session.user.email || '';
          const pending = window.localStorage.getItem(pendingProfileKey(email));
          if (pending) {
            const parsed = JSON.parse(pending) as {
              fullName: string;
              role?: V6Role;
            };
            await completeV6Profile({ fullName: parsed.fullName, role: parsed.role || 'client' });
            window.localStorage.removeItem(pendingProfileKey(email));
            needsLoad = true;
          }
          if (needsLoad) await loadData(data.session.user);
        }
      })
      .catch((caught) => {
        if (!alive) return;
        setError(friendlySessionError(caught, 'No se pudo iniciar.'));
      })
      .finally(() => { if (alive) setLoading(false); });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        if (nextSession?.user.id) {
          if (lastAuthUser.current === nextSession.user.id && _event !== 'USER_UPDATED') return;
          lastAuthUser.current = nextSession.user.id;
          void loadData(nextSession.user).catch((caught) =>
            setError(friendlySessionError(caught, 'No se pudo cargar tu perfil.')),
          );
        } else {
          lastAuthUser.current = null;
          dataLoadEpoch.current++;
          setProfileLoading(false);
          setProfile(null);
          setOrders([]);
          setNotifications([]);
          setProServices([]);
          setProSpecialties([]);
          setPublicProfessionals([]);
        }
      },
    );

    return () => { alive = false; lastAuthUser.current = null; dataLoadEpoch.current++; listener.subscription.unsubscribe(); };
  }, [configured, loadData]);

  useEffect(() => {
    if (!profile) return undefined;
    let alive = true;
    let refreshing = false;
    let pending = false;
    const refresh = async () => {
      if (!alive) return;
      if (refreshing) { pending = true; return; }
      refreshing = true;
      try {
        const [nextOrders, nextNotifications] = await Promise.allSettled([
          listV6Orders(), listV6Notifications(profile.id),
        ]);
        if (!alive) return;
        if (nextOrders.status === 'fulfilled') setOrders(nextOrders.value);
        if (nextNotifications.status === 'fulfilled') setNotifications(nextNotifications.value);
        if (nextOrders.status === 'rejected' || nextNotifications.status === 'rejected') {
          setNotice('No pudimos actualizar todos los datos. Revisá tu conexión.');
        }
      } finally {
        refreshing = false;
        if (pending && alive) { pending = false; void refresh(); }
      }
    };
    const channel = subscribeV6Orders(() => { void refresh(); });
    const notificationChannel = getV6Supabase()
      .channel(`manito-v6-notifications-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${profile.id}`,
        },
        () => { void refresh(); },
      )
      .subscribe();
    // Opportunities are intentionally not readable through orders RLS before acceptance.
    // Their notifications trigger a safe RPC reload; visible polling also advances lazy deadlines.
    const refreshVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(refreshVisible, 15000);
    window.addEventListener('online', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('online', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
      removeV6Channel(channel);
      removeV6Channel(notificationChannel);
    };
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
      (order) => isOpenOpportunityStatus(order.status) && serviceIds.has(String(order.service_id)),
    );
  }, [orders, proServices]);
  const unreadNotifications = useMemo(
    () => notifications.filter((item) => !item.read_at).length,
    [notifications],
  );

  async function toggleNotifications() {
    const nextOpen = !notificationsOpen;
    setNotificationsOpen(nextOpen);
    if (nextOpen && profile && unreadNotifications > 0) {
      try {
        await markV6NotificationsRead(profile.id);
        setNotifications(await listV6Notifications(profile.id));
      } catch {
        // Notifications should never block the main app flow.
      }
    }
  }

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
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const reverseLocation = await reverseGeocodePhoneLocation(lat, lng).catch(() => null);
      const nextCity =
        reverseLocation?.label ||
        reverseLocation?.city ||
        (profile.city && profile.city !== 'Ubicación actual' ? profile.city : coordinateFallback(lat, lng));
      const updated = await updateV6Profile(profile.id, {
        full_name: profile.full_name,
        phone: profile.phone,
        city: nextCity,
        lat,
        lng,
      });

      setProfile(updated);
      setLocationEditorOpen(false);
      setNotice(
        reverseLocation?.label
          ? `Ubicación actualizada: ${reverseLocation.label}.`
          : 'GPS actualizado. No pude leer la ciudad exacta, pero guardé las coordenadas.',
      );
    } catch (caught) {
      setNotice(phoneLocationErrorMessage(caught));
    } finally {
      setSavingPhoneLocation(false);
    }
  }

  if (configured === false) {
    return <SetupScreen onConnected={() => setConfigured(true)} />;
  }

  if (loading || profileLoading) {
    return (
      <main className="v6-app v6-center">
        <section className="v6-card">
          <Image
            className="v6-logo-image v6-logo-image-compact"
            src="/logo-main.jpg"
            alt="MANITO - Tu ayuda de confianza"
            width={560}
            height={584}
            priority
          />
          <h1>{profileLoading ? 'Preparando tu cuenta...' : 'Abriendo MANITO...'}</h1>
        </section>
      </main>
    );
  }

  if (!session) {
    return <AuthScreen setNotice={setNotice} />;
  }

  if (!profile) {
    const profileError = error
      ? friendlySessionError(error, 'No pudimos cargar tu cuenta. Probá nuevamente.')
      : 'No pudimos cargar tu cuenta. Probá nuevamente.';
    return (
      <main className="v6-app v6-center">
        <section className="v6-card">
          <p className="v6-alert">{profileError}</p>
          <button className="v6-primary" type="button" onClick={() => {
            void loadData(session.user).catch(caught => setError(friendlySessionError(caught, 'No pudimos cargar tu cuenta.')));
          }}>Reintentar</button>
          <button className="v6-secondary" type="button" onClick={resetSession}>Volver a ingresar</button>
        </section>
      </main>
    );
  }

  const viewProfile = { ...profile, role: appMode } as V6Profile;
  const activeOrders =
    appMode === 'professional' ? professionalOrders : clientOrders;
  const currentLocation = headerLocation(profile);

  return (
    <main className={`v6-app ${tab === 'home' && appMode === 'client' && clientSelectedService ? 'v6-request-active' : ''}`}>
      <header className="v6-top">
        <div className="v6-top-brand">
          <Image
            className="v6-header-logo"
            src="/logo-main.jpg"
            alt="MANITO - Tu ayuda de confianza"
            width={560}
            height={584}
            priority
          />
          <button className="v6-header-location" type="button" onClick={() => setLocationEditorOpen(true)}>
            <small>Tu ubicación</small>
            <span><MapPin size={13} aria-hidden="true" /> {currentLocation}</span>
          </button>
        </div>
        <div className="v6-top-actions">
          <ExperienceSwitch
            experience={appMode}
            canUseProfessional
            onChange={(nextMode) => {
              setAppMode(nextMode);
              setTab('home');
            }}
          />
          <button
            className="v6-icon-button v6-bell-button"
            type="button"
            aria-label="Notificaciones"
            aria-expanded={notificationsOpen}
            onClick={toggleNotifications}
          >
            <Bell size={19} aria-hidden="true" />
            {unreadNotifications > 0 && <span>{unreadNotifications}</span>}
          </button>
        </div>
      </header>

      <div className="v6-content">
        {notificationsOpen && (
          <NotificationPanel
            notifications={notifications}
            onClose={() => setNotificationsOpen(false)}
            onOpenOrder={(orderId) => {
              const order = orders.find((item) => item.id === orderId);
              if (order) {
                setChatOrder(order);
                setNotificationsOpen(false);
              } else {
                setTab('orders');
                setNotificationsOpen(false);
              }
            }}
          />
        )}
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
              onNavigate={setTab}
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
              editingOrder={editingOrder}
              onEditingComplete={() => setEditingOrder(null)}
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
            publicProfessionals={publicProfessionals}
            setOrders={setOrders}
            setChatOrder={setChatOrder}
            setError={setError}
            setNotice={setNotice}
            onEditRequest={(order) => {
              const service = services.find((item) => item.id === order.service_id) || null;
              setEditingOrder(order);
              setClientSelectedService(service);
              setClientProblemQuery(service ? serviceDisplayName(service) : '');
              setTab('home');
            }}
          />
        )}

        {tab === 'messages' && appMode === 'client' && (
          <MessagesPanel
            orders={clientOrders}
            onOpenChat={setChatOrder}
          />
        )}

        {tab === 'agenda' && appMode === 'professional' && (
          <ProfessionalAgenda
            profile={viewProfile}
            orders={professionalOrders}
            onOpenChat={setChatOrder}
            onConfigure={() => setTab('profile')}
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
            experience={appMode}
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

      <ManitoBottomNavigation experience={appMode} activeTab={tab} onNavigate={setTab} />

      {chatOrder && (
        <ChatSheet
          order={chatOrder}
          profile={profile}
          onClose={() => setChatOrder(null)}
          setError={setError}
        />
      )}
      {locationEditorOpen && (
        <HeaderLocationSheet
          profile={profile}
          savingPhoneLocation={savingPhoneLocation}
          onUsePhoneLocation={usePhoneLocation}
          onClose={() => setLocationEditorOpen(false)}
          onSave={async (city, detail) => {
            const nextProfile = await updateV6Profile(profile.id, {
              full_name: profile.full_name,
              phone: profile.phone,
              city: formatAddress(detail, city),
              lat: null,
              lng: null,
            });
            setProfile(nextProfile);
            setLocationEditorOpen(false);
            setNotice('Ubicación guardada.');
          }}
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
          <CircleDot size={14} aria-hidden="true" /> Backend real
        </p>
        <Image
          className="v6-logo-image v6-logo-image-compact"
          src="/logo-main.jpg"
          alt="MANITO - Tu ayuda de confianza"
          width={560}
          height={584}
          priority
        />
        <h1>Conectá MANITO con Supabase.</h1>
        <p className="v6-muted">
          Usá la URL del proyecto y la publishable key. La seguridad queda en
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
  const [submitting, setSubmitting] = useState(false);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);

  async function resendConfirmation() {
    setError(null);
    setLocalNotice(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Escribí tu email para reenviar la confirmación.');
      return;
    }

    setResendingConfirmation(true);
    try {
      const supabase = getV6Supabase();
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: cleanEmail,
        options: {
          emailRedirectTo: getAuthCallbackUrl(),
        },
      });
      if (resendError) throw resendError;
      setLocalNotice('Si tu cuenta está pendiente de confirmación, te enviamos otro correo.');
      setNotice('Revisá tu email para confirmar el acceso.');
    } catch (caught) {
      setError(friendlyAuthError(caught, 'No pudimos enviar el correo de confirmación. Probá nuevamente en unos minutos.'));
    } finally {
      setResendingConfirmation(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLocalNotice(null);
    setSubmitting(true);
    try {
      const supabase = getV6Supabase();
      const cleanEmail = email.trim().toLowerCase();
      if (mode === 'reset') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: getAuthCallbackUrl(),
        });
        if (resetError) throw resetError;
        setLocalNotice('Te mandamos un link para crear una contraseña nueva.');
        setNotice('Revisá tu email para recuperar el acceso.');
        return;
      }

      if (mode === 'login') {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (loginError) throw loginError;
        return;
      }

      const passwordError = passwordSecurityMessage(password, cleanEmail);
      if (passwordError) {
        setError(passwordError);
        return;
      }

      window.localStorage.setItem(
        pendingProfileKey(cleanEmail),
        JSON.stringify({ fullName, role: 'client' }),
      );
      const { data, error: signupError } = await supabase.auth.signUp({
        email: cleanEmail,
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
      setError(friendlyAuthError(caught, 'No se pudo ingresar.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="v6-app v6-center">
      <section className="v6-card">
        <Image
          className="v6-logo-image"
          src="/logo-main.jpg"
          alt="MANITO - Tu ayuda de confianza"
          width={560}
          height={584}
          priority
        />
        <h1>
          {mode === 'login'
            ? 'Entra a MANITO.'
            : mode === 'reset'
              ? 'Recuperá el acceso.'
              : 'Crea tu cuenta MANITO.'}
        </h1>
        <p className="v6-muted">
          {mode === 'reset'
            ? 'Te mandamos un link para crear una contraseña nueva.'
            : 'Entrás como cliente. Después podés activar tu perfil profesional desde Cuenta.'}
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
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          {mode !== 'reset' && (
            <label className="v6-field">
              <span>Contraseña</span>
              <input
                type="password"
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
              {mode === 'signup' && <small>{passwordHelpText()}</small>}
            </label>
          )}
          {error && <p className="v6-alert">{error}</p>}
          {localNotice && <p className="v6-note">{localNotice}</p>}
          <button className="v6-primary" type="submit" disabled={submitting}>
            {submitting
              ? 'Procesando...'
              : mode === 'login'
                ? 'Ingresar'
                : mode === 'reset'
                  ? 'Mandar link'
                  : 'Crear cuenta'}
          </button>
          {mode !== 'reset' && (
            <button
              className="v6-secondary"
              type="button"
              onClick={resendConfirmation}
              disabled={resendingConfirmation}
            >
              {resendingConfirmation ? 'Enviando...' : 'Reenviar correo de confirmación'}
            </button>
          )}
          {mode === 'login' && (
            <button className="v6-text-button" type="button" onClick={() => setMode('reset')}>
              ¿No te acordás la contraseña?
            </button>
          )}
          {mode === 'reset' && (
            <button className="v6-text-button" type="button" onClick={() => setMode('login')}>
              Volver a ingresar
            </button>
          )}
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
  editingOrder,
  onEditingComplete,
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
  editingOrder: V6Order | null;
  onEditingComplete: () => void;
}) {
  const initialAddress = editingOrder ? splitStoredAddress(editingOrder.address, profile.city) : null;
  const [description, setDescription] = useState(editingOrder?.description || 'Necesito un plomero.');
  const [address, setAddress] = useState(initialAddress?.line || '');
  const [addressCity, setAddressCity] = useState(initialAddress?.city || profile.city || '');
  const [locationId, setLocationId] = useState(editingOrder?.location_id || '');
  const [requiredSpecialty, setRequiredSpecialty] = useState<V6Specialty | null>(() =>
    specialties.find((item) => item.id === editingOrder?.required_specialty_id) || null,
  );
  const requiredSpecialtyId = requiredSpecialty?.service_id === selectedService?.id ? requiredSpecialty?.id ?? null : null;
  const [eligibleResult, setEligibleResult] = useState<{ key: string; ids: string[] }>({ key: '', ids: [] });
  const [mode, setMode] = useState<V6Mode>(editingOrder?.mode || 'immediate');
  const [modeChosen, setModeChosen] = useState(Boolean(editingOrder));
  const [requestStep, setRequestStep] = useState<RequestStep>('need');
  const [showAllServices, setShowAllServices] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(dateTimeInputValue(editingOrder?.scheduled_at));
  const [repeatService, setRepeatService] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>('weekly');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(() =>
    editingOrder?.client_lat != null && editingOrder?.client_lng != null
      ? { lat: editingOrder.client_lat, lng: editingOrder.client_lng }
      : null,
  );
  const [detectedLocation, setDetectedLocation] = useState<{
    lat: number;
    lng: number;
    city: string | null;
    label: string | null;
  } | null>(null);
  const [locationAuthority, setLocationAuthority] = useState<RequestLocationAuthority | null>(() =>
    editingOrder ? (editingOrder.client_lat != null && editingOrder.client_lng != null ? 'gps' : 'manual') : null,
  );
  const [locationConfirmed, setLocationConfirmed] = useState(Boolean(editingOrder));
  const [locating, setLocating] = useState(false);
  const [confirmingLocation, setConfirmingLocation] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>(() =>
    loadSavedAddresses(profile.id),
  );
  const [addressLabel, setAddressLabel] = useState('Casa');
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>(editingOrder?.assignment_mode === 'manual' ? 'manual' : 'auto');
  const [selectedProfessionalId, setSelectedProfessionalId] = useState(editingOrder?.preferred_professional_id || '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    editingOrder?.payment_method === 'cash' ? 'cash' : editingOrder?.payment_method === 'card' ? 'card' : 'wallet',
  );
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [paymentProfiles, setPaymentProfiles] = useState<V6PaymentProfile[]>([]);
  const [serviceGroup, setServiceGroup] = useState<ServiceGroupId>('all');
  const [creatingOrder, setCreatingOrder] = useState(false);
  const requestFormRef = useRef<HTMLElement | null>(null);
  const manualLocationRef = useRef<HTMLInputElement | null>(null);
  const authoritativeCoords = authoritativeRequestCoordinates(locationAuthority, coords);
  const selectedBasePrice = selectedService?.base_price ?? 0;
  const eligibilityKey = JSON.stringify({ service_id: selectedService?.id, mode,
    location_id: locationId || null, required_specialty_id: requiredSpecialtyId,
    client_lat: authoritativeCoords?.lat ?? null, client_lng: authoritativeCoords?.lng ?? null,
    scheduled_at: mode === 'scheduled' && scheduledAt ? new Date(scheduledAt).toISOString() : null,
    estimated_duration_minutes: scheduledReservationDurationMinutes });
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      void getV6Supabase().rpc('list_eligible_request_professionals', { p_data: JSON.parse(eligibilityKey) })
        .then(({ data, error }) => {
          if (alive) setEligibleResult({ key: eligibilityKey, ids: error ? [] : data || [] });
        });
    }, 200);
    return () => { alive = false; clearTimeout(timer); };
  }, [eligibilityKey]);
  const rankedProfessionals = useMemo(
    () =>
      professionalCandidatesForService({
        service: selectedService,
        professionals: publicProfessionals,
        specialties,
        query: `${problemQuery}\n${description}`,
        clientCoords: authoritativeCoords,
        mode,
        scheduledAt,
      }),
    [authoritativeCoords, description, mode, problemQuery, publicProfessionals, scheduledAt, selectedService, specialties],
  );
  const candidateProfessionals = rankedProfessionals.filter(candidate =>
    eligibleResult.key === eligibilityKey && eligibleResult.ids.includes(candidate.professional.profile.id));
  const selectedProfessionalCandidate =
    candidateProfessionals.find((candidate) => candidate.professional.profile.id === selectedProfessionalId) ||
    candidateProfessionals[0] ||
    null;
  const effectiveAssignmentMode =
    mode !== 'quote' && assignmentMode === 'manual' && candidateProfessionals.length ? 'manual' : 'auto';
  const estimatedPrice = selectedService
    ? mode === 'quote'
      ? null
      : (effectiveAssignmentMode === 'manual' && selectedProfessionalCandidate?.priceFrom
        ? selectedProfessionalCandidate.priceFrom
        : selectedBasePrice)
    : null;
  const etaText =
    mode === 'quote'
      ? 'Profesionales envían propuestas'
      : mode === 'scheduled'
      ? 'Horario reservado'
      : selectedProfessionalCandidate?.etaMinutes
        ? `${selectedProfessionalCandidate.etaMinutes} min`
        : '30-45 min';
  const modeIsSupported = serviceSupportsMode(selectedService, mode);
  const canRepeatSelectedService = mode === 'scheduled' && supportsRecurringService(selectedService);
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
  const recommendedProfessional = recommendedService?.id === selectedService?.id
    ? candidateProfessionals[0] || null : null;
  const photoNames = photoFiles.map((file) => file.name);
  const selectedPaymentProfile = paymentProfiles.find((payment) => payment.type === paymentMethod);
  const activeClientOrder = clientOrders.find((order) => !['completed', 'cancelled'].includes(order.status)) || null;
  const requestStepIndex = requestSteps.indexOf(requestStep);

  const scrollToRequestForm = useCallback(() => {
    window.requestAnimationFrame(() => {
      requestFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

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
        const nextPaymentProfiles = uniquePaymentProfiles(remotePaymentProfiles);
        setPaymentProfiles(nextPaymentProfiles);
        const preferredPayment =
          nextPaymentProfiles.find((payment) => payment.is_default) || nextPaymentProfiles[0];
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
    if (!modeChosen) {
      setError('Elegí cómo querés avanzar.');
      setRequestStep('mode');
      return;
    }
    if (!modeIsSupported) {
      setError(unsupportedModeMessage(selectedService, mode));
      return;
    }
    if (selectedServiceSpecialties.length > 0 && !requiredSpecialtyId) {
      setError('Elegí la especialidad que mejor describe el trabajo.');
      setRequestStep('need');
      return;
    }
    if (!address.trim()) {
      setError('Escribí la dirección del servicio.');
      return;
    }
    if (!addressCity.trim() && locationAuthority !== 'gps') {
      setError('Escribí la ciudad.');
      return;
    }
    if (!authoritativeCoords && !locationId) {
      setError('Elegí la localidad del servicio o usá GPS.');
      return;
    }
    if (assignmentMode === 'manual' && !selectedProfessionalCandidate && mode !== 'quote') {
      setError('Elegí un profesional disponible o cambiá a búsqueda automática.');
      return;
    }
    if (mode === 'scheduled') {
      if (!scheduledAt) {
        setError('Elegí día y horario para programar el servicio.');
        return;
      }
      if (new Date(scheduledAt).getTime() <= new Date().getTime()) {
        setError('Elegí una fecha futura para programar el servicio.');
        return;
      }
    }
    if (mode === 'quote' && description.trim().length < 20 && photoFiles.length === 0) {
      setError('Para presupuestar, agregá más detalle o fotos para que el profesional pueda cotizar.');
      return;
    }
    setCreatingOrder(true);
    try {
      const orderAddress = formatAddress(address, addressCity);
      const orderDescription = description.trim();
      const orderInput: Parameters<typeof createV6Order>[0] = {
        clientId: profile.id,
        serviceId: selectedService.id,
        locationId: locationId || null,
        requiredSpecialtyId,
        description: orderDescription,
        address: orderAddress,
        mode,
        assignmentMode: mode === 'quote' ? 'auto' : effectiveAssignmentMode,
        preferredProfessionalId:
          mode !== 'quote' && effectiveAssignmentMode === 'manual' && selectedProfessionalCandidate
            ? selectedProfessionalCandidate.professional.profile.id
            : null,
        paymentMethod: mode === 'quote' ? null : paymentMethod,
        etaMinutes: mode === 'quote' ? null : selectedProfessionalCandidate?.etaMinutes || null,
        scheduledAt: mode === 'scheduled' && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        estimatedDurationMinutes: mode === 'scheduled' ? scheduledReservationDurationMinutes : null,
        price: estimatedPrice,
        estimatedPrice,
        lat: authoritativeCoords?.lat ?? null,
        lng: authoritativeCoords?.lng ?? null,
      };
      const createdOrder = editingOrder
        ? await editV6UncontractedOrder({
            orderId: editingOrder.id,
            locationId: orderInput.locationId,
            requiredSpecialtyId: orderInput.requiredSpecialtyId,
            description: orderInput.description,
            address: orderInput.address,
            mode: orderInput.mode,
            assignmentMode: orderInput.assignmentMode || 'auto',
            preferredProfessionalId: orderInput.preferredProfessionalId,
            paymentMethod: orderInput.paymentMethod,
            scheduledAt: orderInput.scheduledAt,
            estimatedDurationMinutes: orderInput.estimatedDurationMinutes,
            lat: orderInput.lat,
            lng: orderInput.lng,
          })
        : await createV6Order(orderInput);
      let recurringPlanCreated = false;
      let recurringPlanFailed = false;
      if (!editingOrder && mode === 'scheduled' && repeatService && canRepeatSelectedService) {
        try {
          await createV6RecurringServicePlan({
            sourceOrderId: createdOrder.id,
            frequency: recurrenceFrequency,
          });
          recurringPlanCreated = true;
        } catch {
          recurringPlanCreated = false;
          recurringPlanFailed = true;
        }
      }
      let photoUploadFailed = false;
      if (photoFiles.length) {
        try {
          await Promise.all(
            photoFiles.map(async (file) => {
              const filePath = await uploadV6OrderEvidenceFile({
                orderId: createdOrder.id,
                ownerId: profile.id,
                file,
              });
              try {
                await addV6OrderPhoto({
                  orderId: createdOrder.id,
                  uploadedBy: profile.id,
                  stage: 'before',
                  filePath,
                  caption: file.name,
                });
              } catch (caught) {
                await removeV6MediaFiles([filePath]).catch(() => undefined);
                throw caught;
              }
            }),
          );
        } catch {
          photoUploadFailed = true;
        }
      }
      setOrders(await listV6Orders());
      setNotice(
        editingOrder
          ? 'Solicitud actualizada. MANITO volvió a buscar con los nuevos datos.'
          : recurringPlanFailed
          ? 'El pedido se publicó, pero no pudimos crear la repetición. Podés reintentarlo desde Cuenta, en Mis servicios recurrentes.'
          : photoUploadFailed
          ? 'Pedido publicado. Algunas fotos no se pudieron subir; podés compartirlas por chat.'
          : mode === 'quote'
            ? 'Solicitud de presupuesto publicada. Los profesionales compatibles pueden enviarte propuestas.'
            : mode === 'scheduled'
              ? recurringPlanCreated
                ? 'Solicitud programada enviada y plan recurrente creado.'
                : 'Solicitud programada enviada. El profesional debe aceptar para confirmarla.'
              : 'Pedido inmediato publicado. Un profesional disponible debe aceptarlo para confirmarlo.',
      );
      setPhotoFiles([]);
      setModeChosen(false);
      setRequestStep('need');
      onEditingComplete();
      onNavigate('orders');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo publicar.');
    } finally {
      setCreatingOrder(false);
    }
  }

  async function captureLocation() {
    if (!navigator.geolocation) {
      setError('Podés continuar eligiendo la localidad y escribiendo la dirección.');
      manualLocationRef.current?.focus();
      return;
    }
    setLocating(true);
    setDetectedLocation(null);
    try {
      const position = await requestPhonePosition();
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const reverse = await reverseGeocodePhoneLocation(lat, lng).catch(() => null);
      setDetectedLocation({ lat, lng, city: reverse?.city || null, label: reverse?.label || null });
    } catch {
      setError('No pudimos obtener tu ubicación. Ingresala manualmente para continuar.');
      window.requestAnimationFrame(() => manualLocationRef.current?.focus());
    } finally {
      setLocating(false);
    }
  }

  function confirmDetectedPhoneLocation() {
    if (!detectedLocation) return;
    setCoords({ lat: detectedLocation.lat, lng: detectedLocation.lng });
    setLocationAuthority('gps');
    setLocationConfirmed(true);
    setLocationId('');
    setAddressCity(detectedLocation.city || '');
    setAddress(detectedLocation.label || detectedLocation.city || coordinateFallback(detectedLocation.lat, detectedLocation.lng));
    setDetectedLocation(null);
  }

  function markManualLocation() {
    setDetectedLocation(null);
    setCoords(null);
    setLocationAuthority('manual');
    setLocationConfirmed(false);
  }

  function beginManualLocation() {
    markManualLocation();
    window.requestAnimationFrame(() => manualLocationRef.current?.focus());
  }

  async function confirmManualLocation() {
    setConfirmingLocation(true);
    try {
      const geocoded = await geocodeManualLocation(address.trim(), addressCity.trim()).catch(() => null);
      if (geocoded) {
        setCoords(geocoded);
        setLocationAuthority('manual_geocoded');
      } else {
        setCoords(null);
        setLocationAuthority('manual');
      }
      setDetectedLocation(null);
      setLocationConfirmed(Boolean(geocoded || locationId));
      return geocoded;
    } finally {
      setConfirmingLocation(false);
    }
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
        lat: authoritativeCoords?.lat || null,
        lng: authoritativeCoords?.lng || null,
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
        lat: authoritativeCoords?.lat || null,
        lng: authoritativeCoords?.lng || null,
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
    setLocationId('');
    setCoords(null);
    setAddress(savedAddress.line);
    setAddressCity(savedAddress.city || profile.city || '');
    setAddressLabel(savedAddress.label);
    setDetectedLocation(null);
    setLocationConfirmed(true);
    if (savedAddress.lat != null && savedAddress.lng != null) {
      setCoords({ lat: savedAddress.lat, lng: savedAddress.lng });
      setLocationAuthority('saved');
    } else {
      setLocationAuthority('manual');
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
      clientCoords: authoritativeCoords,
      mode,
      scheduledAt,
    })[0] || null;
    const nextMode = serviceSupportsMode(service, mode) ? mode : firstSupportedMode(service);
    const label = serviceDisplayName(service);
    setSelectedService(service);
    setRequiredSpecialty((current) => current?.service_id === service.id ? current : null);
    setRequestStep('need');
    if (nextMode !== mode) setMode(nextMode);
    setProblemQuery(nextProblem);
    setDescription(nextProblem.trim() || `Necesito ayuda con ${label}.`);
    setAssignmentMode(nextMode !== 'quote' && candidate ? 'manual' : 'auto');
    setSelectedProfessionalId(nextMode !== 'quote' ? candidate?.professional.profile.id || '' : '');
    setNotice(
      nextMode !== mode
        ? `${label} no soporta esa modalidad. Te pasé a ${contractModeOptions.find((item) => item.id === nextMode)?.title}.`
        : candidate && nextMode !== 'quote'
        ? `${label} seleccionado. Te muestro profesionales compatibles reales.`
        : nextMode === 'quote'
          ? `${label} seleccionado. Publicá una solicitud para comparar propuestas.`
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
    const nextMode = serviceSupportsMode(service, mode) ? mode : firstSupportedMode(service);
    setSelectedService(service);
    setRequiredSpecialty((current) => current?.service_id === service.id ? current : null);
    setRequestStep('need');
    if (nextMode !== mode) setMode(nextMode);
    if (!problemQuery.trim()) {
      setProblemQuery(serviceDisplayName(service));
    }
    setDescription((current) =>
      current.trim() && current !== 'Necesito un plomero.'
        ? current
        : `Necesito ayuda con ${serviceDisplayName(service)}.`,
    );
    setNotice(
      nextMode !== mode
        ? `${serviceDisplayName(service)} no soporta esa modalidad. Te pasé a ${contractModeOptions.find((item) => item.id === nextMode)?.title}.`
        : `${serviceDisplayName(service)} seleccionado. Completá el pedido.`,
    );
    scrollToRequestForm();
  }

  async function nextRequestStep() {
    if (requestStep === 'need') {
      if (!description.trim()) {
        setError('Contanos qué necesitás resolver.');
        return;
      }
      if (selectedServiceSpecialties.length > 0 && !requiredSpecialtyId) {
        setError('Elegí la especialidad que mejor describe el trabajo.');
        return;
      }
      setRequestStep('place');
      return;
    }
    if (requestStep === 'place') {
      if (!address.trim() || (!addressCity.trim() && locationAuthority !== 'gps')) {
        setError('Completá la dirección y la ciudad del trabajo, o confirmá el GPS.');
        return;
      }
      let confirmedCoordinates = authoritativeCoords;
      if (locationAuthority === 'manual' || !locationConfirmed) {
        confirmedCoordinates = await confirmManualLocation();
      }
      if (!confirmedCoordinates && !locationId) {
        setError('Elegí la localidad del servicio o usá GPS.');
        return;
      }
      setRequestStep('mode');
      return;
    }
    if (requestStep === 'mode') {
      if (!modeChosen) {
        setError('Elegí cómo querés avanzar.');
        return;
      }
      if (!selectedService || !serviceSupportsMode(selectedService, mode)) {
        setError(selectedService ? unsupportedModeMessage(selectedService, mode) : 'Elegí un servicio para continuar.');
        return;
      }
      setRequestStep('resolution');
      return;
    }
    if (requestStep === 'resolution') {
      if (mode === 'scheduled' && !scheduledAt) {
        setError('Elegí día y horario para programar el servicio.');
        return;
      }
      if (mode === 'scheduled' && new Date(scheduledAt).getTime() <= Date.now()) {
        setError('Elegí una fecha futura para programar el servicio.');
        return;
      }
      if (assignmentMode === 'manual' && mode !== 'quote' && !selectedProfessionalCandidate) {
        setError('Elegí un profesional disponible o usá búsqueda automática.');
        return;
      }
      setRequestStep('review');
    }
  }

  function previousRequestStep() {
    if (requestStepIndex <= 0) {
      if (editingOrder) onEditingComplete();
      setSelectedService(null);
      return;
    }
    setRequestStep(requestSteps[requestStepIndex - 1]);
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
    setLocationId(lastOrder.location_id || '');
    setRequiredSpecialty(specialties.find(s => s.id === lastOrder.required_specialty_id) || null);
    setCoords(lastOrder.client_lat != null && lastOrder.client_lng != null
      ? { lat: lastOrder.client_lat, lng: lastOrder.client_lng } : null);
    setLocationAuthority(lastOrder.client_lat != null && lastOrder.client_lng != null ? 'saved' : 'manual');
    setLocationConfirmed(true);
    const parsedAddress = splitStoredAddress(lastOrder.address, profile.city);
    setDescription(lastOrder.description.split('\n')[0] || `Necesito ayuda con ${lastService ? serviceDisplayName(lastService) : 'un servicio'}.`);
    setAddress(parsedAddress.line);
    setAddressCity(parsedAddress.city);
    setMode(lastOrder.mode);
    setPaymentMethod(
      lastOrder.payment_method === 'wallet' || lastOrder.payment_method === 'cash'
        ? lastOrder.payment_method
        : 'wallet',
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

  if (selectedService) {
    const modeOption = contractModeOptions.find((item) => item.id === mode);
    const expectedNextStep = mode === 'quote'
      ? 'Los profesionales compatibles podrán enviarte propuestas para comparar.'
      : mode === 'scheduled'
        ? 'La solicitud quedará pendiente hasta que un profesional confirme el horario.'
        : 'MANITO buscará un profesional disponible para aceptar el trabajo.';

    return (
      <section className="v6-request-shell" ref={requestFormRef}>
        <header className="v6-request-header">
          <button className="v6-back-button" type="button" onClick={previousRequestStep} aria-label="Volver">
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <div>
            <span>{serviceDisplayName(selectedService)}</span>
            <strong>{editingOrder ? 'Editar solicitud' : 'Nuevo trabajo'}</strong>
          </div>
        </header>

        <RequestProgress steps={requestStepLabels} current={requestStepIndex} />

        <form className="v6-request-form" onSubmit={createOrder}>
          {requestStep === 'need' && (
            <section className="v6-request-stage">
              <div className="v6-stage-heading">
                <span className="v6-stage-icon">{serviceIcon(selectedService.slug)}</span>
                <div>
                  <h1>¿Qué necesitás resolver?</h1>
                  <p>Contanos lo necesario para que el profesional entienda el trabajo.</p>
                </div>
              </div>
              <label className="v6-field">
                <span>Descripción del problema</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Ej: pierde agua debajo de la pileta desde ayer"
                  autoFocus
                  required
                />
              </label>
              {selectedServiceSpecialties.length > 0 && (
                <div className="v6-specialty-panel compact">
                  <div className="v6-section-head compact">
                    <h2>Especialidad</h2>
                    <span>Elegí una</span>
                  </div>
                  <div className="v6-chip-list">
                    {selectedServiceSpecialties.map((specialty) => (
                      <button
                        type="button"
                        key={specialty.id}
                        aria-pressed={requiredSpecialtyId === specialty.id}
                        onClick={() => setRequiredSpecialty(requiredSpecialtyId === specialty.id ? null : specialty)}
                      >
                        {specialty.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <label className="v6-upload-field">
                <Camera size={20} aria-hidden="true" />
                <span>
                  <strong>Agregar fotos</strong>
                  <small>Ayudan a entender el problema antes de ir.</small>
                </span>
                <input type="file" accept="image/*" multiple onChange={(event) => updatePhotos(event.target.files)} />
              </label>
              {photoNames.length > 0 && (
                <div className="v6-file-list">
                  {photoNames.map((name) => <span key={name}><Camera size={15} aria-hidden="true" /> {name}</span>)}
                </div>
              )}
            </section>
          )}

          {requestStep === 'place' && (
            <section className="v6-request-stage">
              <div className="v6-stage-heading">
                <span className="v6-stage-icon"><MapPin size={22} aria-hidden="true" /></span>
                <div>
                  <h1>¿Dónde es el trabajo?</h1>
                  <p>Usá GPS o completá una ubicación manual válida.</p>
                </div>
              </div>
              {savedAddresses.length > 0 && (
                <label className="v6-field">
                  <span>Dirección guardada</span>
                  <select defaultValue="" onChange={(event) => chooseSavedAddress(event.target.value)}>
                    <option value="" disabled>Elegir dirección</option>
                    {savedAddresses.map((item) => (
                      <option value={item.id} key={item.id}>{item.label} · {formatAddress(item.line, item.city)}</option>
                    ))}
                  </select>
                </label>
              )}
              <button className="v6-location-action" type="button" onClick={captureLocation} disabled={locating}>
                <LocateFixed size={20} aria-hidden="true" />
                <span>
                  <strong>{locating ? 'Buscando tu ubicación...' : 'Usar ubicación del teléfono'}</strong>
                  <small>Te vamos a pedir permiso en este paso.</small>
                </span>
              </button>
              {detectedLocation && (
                <div className="v6-location-confirmation" role="status">
                  <span>Ubicación detectada</span>
                  <strong>{detectedLocation.label || detectedLocation.city || coordinateFallback(detectedLocation.lat, detectedLocation.lng)}</strong>
                  {detectedLocation.city && detectedLocation.label !== detectedLocation.city && <small>{detectedLocation.city}</small>}
                  <div className="v6-actions compact">
                    <button className="v6-primary" type="button" onClick={confirmDetectedPhoneLocation}>Usar esta ubicación</button>
                    <button className="v6-secondary" type="button" onClick={beginManualLocation}>Cambiar</button>
                  </div>
                </div>
              )}
              {locationConfirmed && !detectedLocation && (
                <div className="v6-location-confirmation confirmed">
                  <span>{locationAuthority === 'gps' ? 'Ubicación GPS confirmada' : 'Ubicación manual confirmada'}</span>
                  <strong>{formatAddress(address, addressCity) || (authoritativeCoords ? coordinateFallback(authoritativeCoords.lat, authoritativeCoords.lng) : addressCity)}</strong>
                  <button className="v6-link-button" type="button" onClick={beginManualLocation}>Cambiar ubicación</button>
                </div>
              )}
              <div className="v6-field-grid-two">
                <label className="v6-field">
                  <span>Dirección</span>
                  <input
                    ref={manualLocationRef}
                    value={address}
                    onChange={(event) => { setAddress(event.target.value); markManualLocation(); }}
                    placeholder="Calle, número, piso"
                    required
                  />
                </label>
                <label className="v6-field">
                  <span>Ciudad</span>
                  <input
                    value={addressCity}
                    onChange={(event) => { setAddressCity(event.target.value); setLocationId(''); markManualLocation(); }}
                    placeholder="Ej: Mar del Plata"
                    required
                  />
                </label>
              </div>
              <MatchingLocation value={locationId} onChange={(id, name) => { markManualLocation(); setLocationId(id); if (name) setAddressCity(name); }} />
              <button className="v6-link-button" type="button" onClick={beginManualLocation}>Ingresar ubicación manualmente</button>
              <details className="v6-inline-details">
                <summary>Guardar esta dirección</summary>
                <div className="v6-inline-details-body">
                  <label className="v6-field">
                    <span>Nombre</span>
                    <input value={addressLabel} onChange={(event) => setAddressLabel(event.target.value)} placeholder="Casa" />
                  </label>
                  <button className="v6-secondary" type="button" onClick={saveAddress}>Guardar dirección</button>
                </div>
              </details>
            </section>
          )}

          {requestStep === 'mode' && (
            <section className="v6-request-stage">
              <div className="v6-stage-heading">
                <span className="v6-stage-icon"><Clock size={22} aria-hidden="true" /></span>
                <div>
                  <h1>¿Cómo querés avanzar?</h1>
                  <p>Elegí la opción que mejor se adapte a este trabajo.</p>
                </div>
              </div>
              <div className="v6-mode-list">
                {contractModeOptions.map((item) => {
                  const supported = serviceSupportsMode(selectedService, item.id);
                  return (
                    <button
                      type="button"
                      className="v6-mode-row"
                      aria-pressed={modeChosen && mode === item.id}
                      aria-disabled={!supported}
                      key={item.id}
                      onClick={() => {
                        if (!supported) {
                          setNotice(unsupportedModeMessage(selectedService, item.id));
                          return;
                        }
                        setMode(item.id);
                        setModeChosen(true);
                      }}
                    >
                      <span>{item.icon}</span>
                      <span><strong>{item.title}</strong><small>{item.body}</small></span>
                      <Check size={19} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {requestStep === 'resolution' && (
            <section className="v6-request-stage">
              <div className="v6-stage-heading">
                <span className="v6-stage-icon"><Users size={22} aria-hidden="true" /></span>
                <div>
                  <h1>{mode === 'quote' ? 'Prepará tu solicitud' : mode === 'scheduled' ? 'Elegí cuándo y quién' : 'Elegí cómo buscar'}</h1>
                  <p>{modeOption?.body}</p>
                </div>
              </div>
              {mode === 'scheduled' && (
                <>
                  <label className="v6-field">
                    <span>Día y horario solicitado</span>
                    <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} required />
                  </label>
                  {canRepeatSelectedService && (
                    <div className="v6-recurring-box">
                      <label className="v6-toggle-row">
                        <span><strong>Repetir este servicio</strong><small>Podés administrarlo después desde Trabajos.</small></span>
                        <input type="checkbox" checked={repeatService} onChange={(event) => setRepeatService(event.target.checked)} />
                      </label>
                      {repeatService && (
                        <div className="v6-choice-grid three">
                          {recurrenceOptions.map((option) => (
                            <button className="v6-choice" type="button" aria-pressed={recurrenceFrequency === option.id} key={option.id} onClick={() => setRecurrenceFrequency(option.id)}>
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {mode !== 'quote' ? (
                <>
                  <div className="v6-section-head compact"><h2>Asignación</h2><span>{candidateProfessionals.length} compatibles</span></div>
                  <div className="v6-choice-grid">
                    <button type="button" className="v6-choice" aria-pressed={effectiveAssignmentMode === 'auto'} onClick={() => setAssignmentMode('auto')}>
                      <Users size={18} aria-hidden="true" /> Búsqueda automática
                    </button>
                    <button type="button" className="v6-choice" aria-pressed={effectiveAssignmentMode === 'manual'} disabled={!candidateProfessionals.length} onClick={() => setAssignmentMode('manual')}>
                      <Star size={18} aria-hidden="true" /> Elegir profesional
                    </button>
                  </div>
                  {effectiveAssignmentMode === 'manual' && (
                    <div className="v6-pro-list">
                      {candidateProfessionals.map((candidate) => (
                        <button className="v6-pro-card" type="button" aria-pressed={selectedProfessionalCandidate?.professional.profile.id === candidate.professional.profile.id} key={candidate.professional.profile.id} onClick={() => setSelectedProfessionalId(candidate.professional.profile.id)}>
                          <span className="v6-pro-avatar">{publicProfessionalName(candidate.professional).slice(0, 1)}</span>
                          <span>
                            <strong>{publicProfessionalName(candidate.professional)}</strong>
                            <small>{candidate.professional.professional_profile?.rating_avg || 4.8} estrellas · {candidate.professional.professional_profile?.jobs_completed || 0} trabajos</small>
                            <small>{candidate.distanceKm != null ? `${candidate.distanceKm.toFixed(1)} km` : candidate.professional.professional_profile?.work_city || 'Zona a confirmar'}</small>
                          </span>
                          {candidate.professional.professional_profile?.verified && <BadgeCheck size={18} aria-label="Identidad verificada" />}
                        </button>
                      ))}
                    </div>
                  )}
                  {!candidateProfessionals.length && (
                    <div className="v6-empty-inline">
                      <strong>No encontramos profesionales compatibles con estos criterios.</strong>
                      <p>Podés publicar en automático o cambiar ubicación, especialidad o fecha.</p>
                      <button className="v6-secondary" type="button" onClick={() => setRequestStep('need')}>Editar búsqueda</button>
                    </div>
                  )}
                  <div className="v6-section-head compact"><h2>Medio de pago</h2><span>Preferencia para este trabajo</span></div>
                  <div className="v6-choice-grid three">
                    {paymentOptions.map((option) => (
                      <button type="button" className="v6-choice" aria-pressed={paymentMethod === option.id} aria-disabled={option.disabled} key={option.id} onClick={() => option.disabled ? setNotice(option.detail) : setPaymentMethod(option.id)}>
                        {option.icon}{option.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="v6-note">
                  Publicás la necesidad sin contratar. Después vas a comparar alcance, materiales, disponibilidad y total antes de elegir.
                </div>
              )}
            </section>
          )}

          {requestStep === 'review' && (
            <section className="v6-request-stage">
              <div className="v6-stage-heading">
                <span className="v6-stage-icon"><Check size={22} aria-hidden="true" /></span>
                <div>
                  <h1>{editingOrder ? 'Revisá los cambios' : 'Revisá antes de publicar'}</h1>
                  <p>{editingOrder ? 'El pedido volverá a buscar con estos datos.' : 'Estos son los datos que recibirán los profesionales.'}</p>
                </div>
              </div>
              <dl className="v6-review-list">
                <div><dt>Servicio</dt><dd>{serviceDisplayName(selectedService)}</dd></div>
                {requiredSpecialty && <div><dt>Especialidad</dt><dd>{requiredSpecialty.name}</dd></div>}
                <div><dt>Necesidad</dt><dd>{description}</dd></div>
                <div><dt>Ubicación</dt><dd>{formatAddress(address, addressCity)}</dd></div>
                <div><dt>Modalidad</dt><dd>{modeOption?.title}</dd></div>
                {mode === 'scheduled' && <div><dt>Horario solicitado</dt><dd>{shortDateTime(new Date(scheduledAt).toISOString())}</dd></div>}
                {mode !== 'quote' && <div><dt>Asignación</dt><dd>{effectiveAssignmentMode === 'manual' && selectedProfessionalCandidate ? publicProfessionalName(selectedProfessionalCandidate.professional) : 'Búsqueda automática'}</dd></div>}
                <div><dt>{mode === 'quote' ? 'Precio' : 'Estimación'}</dt><dd>{mode === 'quote' ? 'A definir en las propuestas' : `${money(estimatedPrice)} · importe orientativo`}</dd></div>
              </dl>
              <div className="v6-next-step"><strong>Qué pasa después</strong><p>{expectedNextStep}</p></div>
            </section>
          )}

          <footer className="v6-request-actions">
            <button className="v6-secondary" type="button" onClick={previousRequestStep}>Atrás</button>
            {requestStep !== 'review' ? (
              <button className="v6-primary" type="button" disabled={confirmingLocation} onClick={() => void nextRequestStep()}>{confirmingLocation ? 'Confirmando ubicación...' : 'Continuar'}</button>
            ) : (
              <button className="v6-primary" type="submit" disabled={creatingOrder}>
                {creatingOrder ? (editingOrder ? 'Guardando...' : 'Publicando...') : editingOrder ? 'Guardar y volver a buscar' : mode === 'quote' ? 'Publicar solicitud de presupuesto' : mode === 'scheduled' ? 'Enviar solicitud programada' : 'Buscar profesional ahora'}
              </button>
            )}
          </footer>
        </form>
      </section>
    );
  }

  return (
    <>
      {activeClientOrder && (
        <section className="v6-focus-card">
          <div className="v6-focus-card-head">
            <span className="v6-order-icon">{serviceIcon(activeClientOrder.service?.slug || '')}</span>
            <div>
              <small>TRABAJO ACTIVO</small>
              <h1>{orderStatusText(activeClientOrder)}</h1>
              <p>{serviceDisplayName(activeClientOrder.service)} · {activeClientOrder.address}</p>
            </div>
          </div>
          <div className="v6-next-step compact"><strong>Ahora</strong><p>{orderNextStepText(activeClientOrder, 'client')}</p></div>
          <button className="v6-primary" type="button" onClick={() => onNavigate('orders')}>Ver trabajo</button>
        </section>
      )}

      <section className="v6-home-intro">
        <span>{activeClientOrder ? '¿Necesitás otra cosa?' : `Hola ${profile.full_name?.split(' ')[0] || ''}`}</span>
        <h1>¿Qué necesitás resolver?</h1>
        <p>Buscá un servicio o contanos qué está pasando.</p>
      </section>

      <section className="v6-card v6-finder">
        <label className="v6-field">
          <span>Servicio o problema</span>
          <div className="v6-search-box">
            <Search size={18} aria-hidden="true" />
            <textarea
              value={problemQuery}
              onChange={(event) => setProblemQuery(event.target.value)}
              placeholder="Ej: pierde agua debajo de la pileta"
            />
            <button
              className="v6-orange-button"
              type="button"
              disabled={!recommendedService}
              onClick={() => recommendedService && applyRecommendation(recommendedService)}
            >
              Continuar
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

      <section className="v6-card v6-flow-card v6-legacy-home-hidden">
        <div className="v6-flow-step active">
          <span>1</span>
          <strong>Elegís</strong>
          <small>servicio, modalidad y zona</small>
        </div>
        <div className="v6-flow-step">
          <span>2</span>
          <strong>Coordinás</strong>
          <small>chat, horario y pago</small>
        </div>
        <div className="v6-flow-step">
          <span>3</span>
          <strong>Queda registrado</strong>
          <small>fotos, adicionales y Protección MANITO</small>
        </div>
      </section>

      <section className="v6-section v6-flat-section v6-legacy-home-hidden">
        <div className="v6-section-head">
          <h2>¿Cómo lo necesitás?</h2>
          <span>elegí modalidad</span>
        </div>
        <div className="v6-mode-grid">
          {contractModeOptions.map((item) => {
            const supported = serviceSupportsMode(selectedService, item.id);
            return (
              <button
                className="v6-mode-card"
                type="button"
                aria-pressed={mode === item.id}
                aria-disabled={!supported}
                key={item.id}
                onClick={() => {
                  if (!supported && selectedService) {
                    setNotice(unsupportedModeMessage(selectedService, item.id));
                    return;
                  }
                  setMode(item.id);
                }}
              >
                {item.icon}
                <strong>{item.title}</strong>
                <small>{supported ? item.body : 'No disponible'}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="v6-section">
        <div className="v6-section-head">
          <h2>Servicios</h2>
          <span>{showAllServices ? `${filteredServices.length} disponibles` : 'Los más buscados'}</span>
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
          {(showAllServices ? filteredServices : filteredServices.slice(0, 6)).map((service) => (
            <button
              className="v6-service"
              type="button"
              aria-pressed={false}
              key={service.id}
              onClick={() => chooseService(service)}
            >
              <span>{serviceIcon(service.slug)}</span>
              <strong>{serviceDisplayName(service)}</strong>
              <small>Desde {money(service.base_price)}</small>
            </button>
          ))}
        </div>
        {filteredServices.length > 6 && (
          <button className="v6-text-link" type="button" onClick={() => setShowAllServices((current) => !current)}>
            {showAllServices ? 'Ver menos servicios' : 'Ver todos los servicios'}
          </button>
        )}
      </section>

      {selectedService && (
        <section className="v6-card" ref={requestFormRef}>
          <div className="v6-section-head compact">
            <h2>{serviceDisplayName(selectedService)}</h2>
            <span>{contractModeOptions.find((item) => item.id === mode)?.title}</span>
          </div>
          <p className="v6-note">
            {mode === 'immediate'
              ? 'Buscamos profesionales disponibles ahora. El pedido se confirma recién cuando uno acepta.'
              : mode === 'scheduled'
                ? 'Enviamos una solicitud para el día y horario que elijas. El profesional debe aceptarla para confirmarla.'
                : 'Publicás una solicitud de presupuesto. No se asigna profesional ni se cobra hasta que elijas una propuesta.'}
          </p>
          <form className="v6-stack" onSubmit={createOrder}>
            <label className="v6-field">
              <span>{mode === 'quote' ? 'Describí el alcance del trabajo' : 'Qué necesitás'}</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} required />
            </label>
            {selectedServiceSpecialties.length > 0 && (
              <div className="v6-specialty-panel compact">
                <div className="v6-section-head compact">
                  <h2>Especialidad</h2>
                  <span>
                    opcional
                  </span>
                </div>
                <div className="v6-chip-list">
                  {selectedServiceSpecialties.map((specialty) => (
                    <button
                      type="button"
                      key={specialty.id}
                      aria-pressed={requiredSpecialtyId === specialty.id}
                      onClick={() => setRequiredSpecialty(requiredSpecialtyId === specialty.id ? null : specialty)}
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
                onChange={(event) => { setAddress(event.target.value); setCoords(null); }}
                placeholder="Calle, número, piso o referencia"
                required
              />
            </label>
            <label className="v6-field">
              <span>Ciudad</span>
              <input
                value={addressCity}
                onChange={(event) => { setAddressCity(event.target.value); setLocationId(''); setCoords(null); }}
                placeholder="Ej: Tres Arroyos"
                required
              />
            </label>
            <MatchingLocation value={locationId} onChange={(id, name) => { setLocationId(id); setCoords(null); if (name) setAddressCity(name); }} />
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
              <>
                <label className="v6-field">
                  <span>Fecha y hora</span>
                  <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} required />
                </label>
                {canRepeatSelectedService && (
                  <div className="v6-recurring-box">
                    <label className="v6-toggle-row">
                      <span>
                        <strong>Repetir este servicio</strong>
                        <small>Ideal para limpieza, jardinería, piletas y mantenimiento habitual.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={repeatService}
                        onChange={(event) => setRepeatService(event.target.checked)}
                      />
                    </label>
                    {repeatService && (
                      <div className="v6-choice-grid three">
                        {recurrenceOptions.map((option) => (
                          <button
                            className="v6-choice"
                            type="button"
                            aria-pressed={recurrenceFrequency === option.id}
                            key={option.id}
                            onClick={() => setRecurrenceFrequency(option.id)}
                          >
                            <Clock size={17} aria-hidden="true" />
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
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

            {mode !== 'quote' && (
              <>
                <div className="v6-section-head compact">
                  <h2>{mode === 'immediate' ? 'Profesionales disponibles ahora' : 'Profesionales para ese horario'}</h2>
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
              </>
            )}

            {mode !== 'quote' && effectiveAssignmentMode === 'manual' && (
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
            {mode !== 'quote' && !candidateProfessionals.length && selectedService && (
              <div className="v6-mode-fallback">
                <p className="v6-muted">
                  {mode === 'immediate'
                    ? `No hay profesionales disponibles ahora en ${serviceDisplayName(selectedService)}. Podés publicar en automático, cambiar a Programar o pedir presupuesto.`
                    : `No encontré profesionales para esa fecha/franja. Podés cambiar horario o publicar en automático para que respondan.`}
                </p>
                {mode === 'immediate' && (
                  <div className="v6-actions-row">
                    <button
                      className="v6-secondary"
                      type="button"
                      disabled={!serviceSupportsMode(selectedService, 'scheduled')}
                      onClick={() => setMode('scheduled')}
                    >
                      Programar
                    </button>
                    <button
                      className="v6-secondary"
                      type="button"
                      disabled={!serviceSupportsMode(selectedService, 'quote')}
                      onClick={() => setMode('quote')}
                    >
                      Presupuestar
                    </button>
                  </div>
                )}
              </div>
            )}
            {mode === 'quote' && (
              <div className="v6-quote-list">
                <article className="v6-quote-card">
                  <strong>Solicitud de presupuesto</strong>
                  <span>Los profesionales compatibles reciben el pedido y te envían propuestas separadas.</span>
                  <p>Vas a comparar visita, mano de obra, materiales, disponibilidad, duración y comentarios antes de elegir.</p>
                </article>
              </div>
            )}

            {mode !== 'quote' && (
              <>
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
                      aria-disabled={option.disabled}
                      key={option.id}
                      onClick={() => {
                        if (option.disabled) {
                          setNotice(option.detail);
                          return;
                        }
                        setPaymentMethod(option.id);
                      }}
                    >
                      {option.icon}
                      {option.label}
                      <small>{option.shortHint}</small>
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
                    {paymentOptions.find((option) => option.id === 'wallet')?.detail}
                  </p>
                )}
                {paymentMethod === 'cash' && (
                  <p className="v6-note">
                    {paymentOptions.find((option) => option.id === 'cash')?.detail}
                  </p>
                )}
              </>
            )}

            <div className="v6-summary">
              <span>
                <ShieldCheck size={17} aria-hidden="true" /> Protección MANITO incluida
              </span>
              <strong>{mode === 'quote' ? 'A cotizar' : money(estimatedPrice)}</strong>
              <small>
                {mode === 'quote'
                  ? 'Publicás sin elegir profesional. Comparás propuestas antes de contratar.'
                  : `ETA ${etaText} - ${paymentLabel(paymentMethod)} - todo queda registrado en la app`}
              </small>
            </div>
            <button className="v6-primary" type="submit" disabled={creatingOrder}>
              {creatingOrder
                ? 'Publicando...'
                : mode === 'quote'
                  ? 'Publicar solicitud'
                  : mode === 'scheduled'
                    ? 'Enviar solicitud programada'
                    : 'Buscar profesional ahora'}
            </button>
          </form>
        </section>
      )}

      <section className="v6-card v6-legacy-home-hidden">
        <div className="v6-section-head">
          <h2>Atajos</h2>
          <span>acciones rápidas</span>
        </div>
        <div className="v6-benefit-grid">
          <button type="button" onClick={repeatLastOrder}>
            <Clock size={17} aria-hidden="true" />
            <span>
              <strong>Repetir pedido</strong>
              <small>Usá datos del último servicio</small>
            </span>
          </button>
          <button type="button" onClick={() => onNavigate('favorites')}>
            <Heart size={17} aria-hidden="true" />
            <span>
              <strong>Favoritos</strong>
              <small>Volvé a contratar</small>
            </span>
          </button>
          <button
            type="button"
            onClick={() => openAccountShortcut('En Cuenta tenés tu código de referido para compartir.')}
          >
            <Ticket size={17} aria-hidden="true" />
            <span>
              <strong>Referidos</strong>
              <small>Copiá tu código de promo</small>
            </span>
          </button>
          <button type="button" onClick={shareTracking}>
            <SendHorizontal size={17} aria-hidden="true" />
            <span>
              <strong>Seguimiento</strong>
              <small>Compartilo por WhatsApp</small>
            </span>
          </button>
          <button
            type="button"
            onClick={() => openAccountShortcut('En Cuenta podés configurar tu contacto de confianza.')}
          >
            <ShieldCheck size={17} aria-hidden="true" />
            <span>
              <strong>Contacto seguro</strong>
              <small>Definilo en Cuenta</small>
            </span>
          </button>
          <button
            type="button"
            onClick={() => openAccountShortcut('En Cuenta dejamos visible la opción de privacidad del teléfono.')}
          >
            <MessageCircle size={17} aria-hidden="true" />
            <span>
              <strong>Privacidad</strong>
              <small>Teléfono oculto en chat</small>
            </span>
          </button>
        </div>
      </section>

      <section className="v6-section v6-legacy-home-hidden">
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
            publicProfessionals={publicProfessionals}
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
      (isOpenOpportunityStatus(order.status) && Boolean(order.scheduled_at)) ||
      order.status === 'payment_pending',
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
    nextOrder.status === 'payment_pending'
      ? 'Tenés un pago pendiente'
      : isOpenOpportunityStatus(nextOrder.status)
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
  onNavigate,
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
  onNavigate: (tab: Tab) => void;
}) {
  const [professionalProfile, setProfessionalProfile] = useState<V6ProfessionalProfile | null>(null);
  const [showAllOpportunities, setShowAllOpportunities] = useState(false);

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

  async function rejectManual(orderId: string) {
    try {
      await rejectV6ManualOrderRequest(orderId, 'no_disponible');
      setOrders(await listV6Orders());
      setNotice('Solicitud rechazada. El cliente va a poder elegir cómo seguir.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo rechazar la solicitud.');
    }
  }

  async function rejectAutomaticInvitation(orderId: string) {
    try {
      await rejectV6MatchingCandidate(orderId, 'no_disponible');
      setOrders(await listV6Orders());
      setNotice('Invitación rechazada. MANITO va a buscar otro profesional.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo rechazar la invitación.');
    }
  }

  const grossIncome = activeOrders.reduce(
    (total, order) => total + Number(orderServiceTotal(order) ?? orderDisplayAmount(order) ?? 0),
    0,
  );
  const commission = activeOrders.reduce(
    (total, order) => total + orderCommissionAmount(order),
    0,
  );
  const netIncome = Math.max(0, grossIncome - commission);
  const completedJobs = activeOrders.filter((order) => order.status === 'completed').length;
  const proProgress = Math.min(100, completedJobs * 10 + proServices.length * 8);
  const currentProfessionalOrders = activeOrders.filter((order) => !['completed', 'cancelled'].includes(order.status));
  const focusOrder = [...currentProfessionalOrders].sort((left, right) => {
    const priority: Record<string, number> = { trabajando: 0, en_sitio: 1, en_camino: 2, payment_pending: 3, accepted: 4 };
    return (priority[left.status] ?? 9) - (priority[right.status] ?? 9) ||
      new Date(appointmentDate(left)).getTime() - new Date(appointmentDate(right)).getTime();
  })[0] || null;

  return (
    <>
      <section className="v6-available">
        <div>
          <strong>{profile.is_available ? 'Disponible para pedidos Ahora' : 'Pedidos Ahora pausados'}</strong>
          <p>{profile.is_available ? 'Podés recibir oportunidades inmediatas compatibles.' : 'Tus trabajos aceptados y tu agenda no cambian.'}</p>
        </div>
        <button className="v6-switch" type="button" aria-pressed={profile.is_available} onClick={toggleAvailable}>
          <span />
        </button>
      </section>

      {focusOrder && (
        <section className="v6-focus-card professional">
          <div className="v6-focus-card-head">
            <span className="v6-order-icon">{serviceIcon(focusOrder.service?.slug || '')}</span>
            <div>
              <small>{focusOrder.status === 'trabajando' ? 'TRABAJO EN CURSO' : 'PRÓXIMO TRABAJO'}</small>
              <h1>{orderStatusText(focusOrder)}</h1>
              <p>{serviceDisplayName(focusOrder.service)} · {focusOrder.address}</p>
              {focusOrder.scheduled_at && <span>{shortDateTime(focusOrder.scheduled_at)}</span>}
            </div>
          </div>
          <div className="v6-next-step compact"><strong>Ahora</strong><p>{orderNextStepText(focusOrder, 'professional')}</p></div>
          <div className="v6-actions compact">
            <button className="v6-primary" type="button" onClick={() => onNavigate('orders')}>Ver trabajo</button>
            {focusOrder.professional_id && <button className="v6-secondary" type="button" onClick={() => setChatOrder(focusOrder)}>Abrir chat</button>}
          </div>
        </section>
      )}

      <section className="v6-card v6-professional-stats">
        <div className="v6-section-head">
          <h2>Resumen</h2>
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

      <section className="v6-card v6-legacy-home-hidden">
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
          <h2>Oportunidades</h2>
          <span>{compatibleMatches.length} compatibles</span>
        </div>
        {(showAllOpportunities ? compatibleMatches : compatibleMatches.slice(0, 3)).map((match) =>
            match.order.mode === 'quote' ? (
              <details className="v6-opportunity-details" key={match.order.id}>
                <summary>
                  <span className="v6-order-icon">{serviceIcon(match.order.service?.slug || '')}</span>
                  <span>
                    <strong>{serviceDisplayName(match.order.service)}</strong>
                    <small>{specialties.find((item) => item.id === match.order.required_specialty_id)?.name || 'Presupuesto solicitado'}</small>
                    <small>{cityFromLocationLabel(match.order.address)} · {match.distanceKm != null ? `${match.distanceKm.toFixed(1)} km` : 'Distancia no disponible'}</small>
                  </span>
                  <b>Enviar presupuesto</b>
                </summary>
                <div className="v6-opportunity-details-body">
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
              </details>
            ) : (
              <article className="v6-order" key={match.order.id}>
                <div className="v6-order-top">
                  <span className="v6-order-icon">{serviceIcon(match.order.service?.slug || '')}</span>
                  <div>
                    <strong>{serviceDisplayName(match.order.service)}</strong>
                    <p>{match.order.description}</p>
                    {match.order.required_specialty_id && <small>{specialties.find((item) => item.id === match.order.required_specialty_id)?.name}</small>}
                    <small>{V6_MODE_LABEL[match.order.mode]} · {match.distanceKm != null ? `${match.distanceKm.toFixed(1)} km` : cityFromLocationLabel(match.order.address)}</small>
                    <small>
                      <MapPin size={13} aria-hidden="true" /> {match.order.address}
                    </small>
                  </div>
                  <b>{money(orderEstimatedAmount(match.order))}</b>
                </div>
                <MatchSummary match={match} />
                <div className="v6-actions compact">
                  <button className="v6-primary" type="button" onClick={() => accept(match.order.id)}>
                    Aceptar trabajo
                  </button>
                  {manualRequestCanBeRejectedBy(match.order, profile) && (
                    <button className="v6-secondary" type="button" onClick={() => rejectManual(match.order.id)}>
                      Rechazar solicitud
                    </button>
                  )}
                  {isPendingAutomaticMatchingInvitation(match.order) && (
                    <button className="v6-secondary" type="button" onClick={() => rejectAutomaticInvitation(match.order.id)}>
                      No puedo tomarlo
                    </button>
                  )}
                </div>
              </article>
            ),
          )}
        {compatibleMatches.length > 3 && (
          <button className="v6-text-link" type="button" onClick={() => setShowAllOpportunities((current) => !current)}>
            {showAllOpportunities ? 'Ver menos oportunidades' : `Ver todas (${compatibleMatches.length})`}
          </button>
        )}
        {!compatibleMatches.length && (
          <Empty
            title={profile.is_available ? 'No hay pedidos compatibles' : 'Sin solicitudes programadas o presupuestos'}
            body={profile.is_available ? 'Cuando un cliente publique un servicio dentro de tu zona y horario aparecerá acá.' : 'Activá Disponible para ver pedidos inmediatos. Los presupuestos y programados aparecen aunque no estés disponible ahora.'}
          />
        )}
      </section>

      <section className="v6-section v6-legacy-home-hidden">
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
  publicProfessionals: V6PublicProfessional[];
  setOrders: (orders: V6Order[]) => void;
  setChatOrder: (order: V6Order) => void;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  onEditRequest?: (order: V6Order) => void;
}) {
  const [filter, setFilter] = useState<'current' | 'proposals' | 'history'>('current');
  const visibleOrders = props.orders.filter((order) => {
    if (filter === 'history') return ['completed', 'cancelled'].includes(order.status);
    if (filter === 'proposals') return order.mode === 'quote' && isOpenOpportunityStatus(order.status);
    return !['completed', 'cancelled'].includes(order.status) && (
      props.profile.role === 'client' || order.mode !== 'quote' || !isOpenOpportunityStatus(order.status)
    );
  });

  return (
    <>
      <section className="v6-section">
        <div className="v6-section-head">
          <h1>{props.profile.role === 'professional' ? 'Trabajos' : 'Tus trabajos'}</h1>
          <span>{visibleOrders.length}</span>
        </div>
        <div className="v6-filter-tabs" role="tablist" aria-label="Filtrar trabajos">
          <button type="button" role="tab" aria-selected={filter === 'current'} onClick={() => setFilter('current')}>
            {props.profile.role === 'professional' ? 'En curso' : 'Activos'}
          </button>
          {props.profile.role === 'professional' && (
            <button type="button" role="tab" aria-selected={filter === 'proposals'} onClick={() => setFilter('proposals')}>Propuestas</button>
          )}
          <button type="button" role="tab" aria-selected={filter === 'history'} onClick={() => setFilter('history')}>Historial</button>
        </div>
        {visibleOrders.map((order) => (
          <OrderCard key={order.id} order={order} {...props} />
        ))}
        {!visibleOrders.length && (
          <Empty
            title={filter === 'history' ? 'Todavía no hay historial' : filter === 'proposals' ? 'No tenés propuestas activas' : 'No tenés trabajos activos'}
            body={props.profile.role === 'client' ? 'Cuando publiques una necesidad, vas a seguirla desde acá.' : 'Tus próximos trabajos aparecerán acá.'}
          />
        )}
      </section>
    </>
  );
}

function MessagesPanel({
  orders,
  onOpenChat,
}: {
  orders: V6Order[];
  onOpenChat: (order: V6Order) => void;
}) {
  const chatOrders = useMemo(
    () => orders.filter((order) => Boolean(order.professional_id)),
    [orders],
  );
  const [lastMessages, setLastMessages] = useState<Record<string, V6Message | null>>({});

  useEffect(() => {
    let active = true;
    void Promise.all(chatOrders.map(async (order) => {
      const messages = await listV6Messages(order.id);
      return [order.id, messages[messages.length - 1] || null] as const;
    })).then((entries) => {
      if (active) setLastMessages(Object.fromEntries(entries));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [chatOrders]);

  return (
    <section className="v6-section v6-conversation-screen">
      <div className="v6-section-head"><h1>Mensajes</h1><span>{chatOrders.length}</span></div>
      <div className="v6-conversation-list">
        {chatOrders.map((order) => {
          const lastMessage = lastMessages[order.id];
          return (
            <button type="button" key={order.id} onClick={() => onOpenChat(order)}>
              <span className="v6-pro-avatar">{(order.professional?.full_name || 'M').slice(0, 1)}</span>
              <span>
                <strong>{order.professional?.full_name || 'Profesional MANITO'}</strong>
                <small>{serviceDisplayName(order.service)} · {orderStatusText(order)}</small>
                <p>{lastMessage?.body || 'Abrí la conversación para coordinar este trabajo.'}</p>
              </span>
              <span className="v6-conversation-time">{lastMessage ? shortDateTime(lastMessage.created_at) : ''}</span>
            </button>
          );
        })}
      </div>
      {!chatOrders.length && <Empty title="Todavía no hay conversaciones" body="El chat se habilita cuando un profesional queda asignado a tu trabajo." />}
    </section>
  );
}

function ProfessionalAgenda({
  profile,
  orders,
  onOpenChat,
  onConfigure,
}: {
  profile: V6Profile;
  orders: V6Order[];
  onOpenChat: (order: V6Order) => void;
  onConfigure: () => void;
}) {
  const [professionalProfile, setProfessionalProfile] = useState<V6ProfessionalProfile | null>(null);
  const [loadingProfessionalProfile, setLoadingProfessionalProfile] = useState(true);
  useEffect(() => {
    let active = true;
    void getV6ProfessionalProfile(profile.id).then((value) => {
      if (active) setProfessionalProfile(value);
    }).catch(() => undefined).finally(() => { if (active) setLoadingProfessionalProfile(false); });
    return () => { active = false; };
  }, [profile.id]);

  const scheduledOrders = [...orders]
    .filter((order) => order.scheduled_at && !['completed', 'cancelled'].includes(order.status))
    .sort((left, right) => new Date(left.scheduled_at || '').getTime() - new Date(right.scheduled_at || '').getTime());

  return (
    <>
      <section className="v6-section v6-agenda-summary">
        <div className="v6-section-head"><h1>Agenda</h1><span>{scheduledOrders.length} próximos</span></div>
        {loadingProfessionalProfile ? (
          <div className="v6-next-step compact"><strong>Cargando horario...</strong></div>
        ) : professionalProfile?.work_days?.length && professionalProfile.work_starts_at && professionalProfile.work_ends_at ? (
          <div className="v6-next-step compact">
            <strong>Tu horario habitual</strong>
            <p>{professionalProfile.work_days.join(', ')} · {professionalProfile.work_starts_at.slice(0, 5)} a {professionalProfile.work_ends_at.slice(0, 5)}</p>
            <button className="v6-secondary" type="button" onClick={onConfigure}>Editar horarios</button>
          </div>
        ) : (
          <div className="v6-empty-inline">
            <strong>Todavía no configuraste tus horarios.</strong>
            <p>Definí cuándo querés recibir trabajos programados.</p>
            <button className="v6-primary" type="button" onClick={onConfigure}>Configurar horarios</button>
          </div>
        )}
        <p className="v6-muted">La disponibilidad para pedidos Ahora se administra desde Hoy. Estos horarios organizan solicitudes programadas.</p>
      </section>
      <section className="v6-section">
        <div className="v6-section-head"><h2>Próximos trabajos</h2><span>Por fecha</span></div>
        <div className="v6-agenda-list">
          {scheduledOrders.map((order) => (
            <article key={order.id}>
              <time>{shortDateTime(order.scheduled_at)}</time>
              <div><strong>{serviceDisplayName(order.service)}</strong><p>{order.address}</p><small>{orderStatusText(order)}</small></div>
              {order.professional_id && <button className="v6-secondary" type="button" onClick={() => onOpenChat(order)}>Chat</button>}
            </article>
          ))}
        </div>
        {!scheduledOrders.length && <Empty title="No tenés trabajos programados" body="Las próximas reservas confirmadas van a aparecer en esta agenda." />}
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
  publicProfessionals = [],
  onEditRequest,
}: {
  order: V6Order;
  profile: V6Profile;
  setOrders: (orders: V6Order[]) => void;
  setChatOrder: (order: V6Order) => void;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  publicProfessionals?: V6PublicProfessional[];
  onEditRequest?: (order: V6Order) => void;
}) {
  const other = profile.role === 'client' ? order.professional : order.client;
  const nextAction = nextProfessionalOrderAction(order.status);
  const clientPin = visibleClientPin(order, profile.role);
  const [proposals, setProposals] = useState<V6OrderProposal[]>([]);
  const [extras, setExtras] = useState<V6OrderExtra[]>([]);
  const [payments, setPayments] = useState<V6Payment[]>([]);
  const [photos, setPhotos] = useState<Array<V6OrderPhoto & { signedUrl: string | null }>>([]);
  const [evidenceStage, setEvidenceStage] = useState<V6OrderPhoto['stage']>('during');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [proposalLabor, setProposalLabor] = useState(String(orderEstimatedAmount(order) ?? 0));
  const [proposalMaterials, setProposalMaterials] = useState('0');
  const [proposalVisit, setProposalVisit] = useState('0');
  const [proposalDuration, setProposalDuration] = useState('90');
  const [proposalAvailability, setProposalAvailability] = useState('');
  const [proposalAvailableFrom, setProposalAvailableFrom] = useState('');
  const [proposalNote, setProposalNote] = useState('');
  const [extraTitle, setExtraTitle] = useState('Material adicional');
  const [extraAmount, setExtraAmount] = useState('4500');
  const [submittingExtra, setSubmittingExtra] = useState(false);
  const extraRequestInFlight = useRef(false);
  const advancingOrder = useRef(false);
  const [pinActionError, setPinActionError] = useState<string | null>(null);
  const pinErrorElement = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (pinActionError) pinErrorElement.current?.scrollIntoView({ block: 'nearest' });
  }, [pinActionError]);
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [manualReplacementProfessionalId, setManualReplacementProfessionalId] = useState('');
  const [showCancellationForm, setShowCancellationForm] = useState(false);
  const cancellationReasonOptions = profile.role === 'professional' ? professionalCancellationReasons : clientCancellationReasons;
  const [cancellationReason, setCancellationReason] = useState<V6CancellationReason>(cancellationReasonOptions[0].value);
  const [cancellationNote, setCancellationNote] = useState('');
  const [retryingMatching, setRetryingMatching] = useState(false);
  const retryingMatchingRef = useRef(false);

  useEffect(() => {
    if (cancellationReasonOptions.some((option) => option.value === cancellationReason)) return;
    setCancellationReason(cancellationReasonOptions[0].value);
  }, [cancellationReason, cancellationReasonOptions]);

  const replacementKey = JSON.stringify({ service_id: order.service_id, mode: order.mode,
    location_id: order.location_id || null, required_specialty_id: order.required_specialty_id ?? null,
    client_lat: order.client_lat, client_lng: order.client_lng, scheduled_at: order.scheduled_at,
    estimated_duration_minutes: order.estimated_duration_minutes });
  const [replacementEligibility, setReplacementEligibility] = useState<{ key: string; ids: string[] }>({ key: '', ids: [] });
  useEffect(() => {
    if (order.client_id !== profile.id || order.professional_id || order.assignment_mode !== 'manual') return;
    let alive = true;
    void getV6Supabase().rpc('list_eligible_request_professionals', { p_data: JSON.parse(replacementKey) })
      .then(({ data, error }) => {
        if (alive) setReplacementEligibility({ key: replacementKey, ids: error ? [] : data || [] });
      });
    return () => { alive = false; };
  }, [replacementKey, order.client_id, order.professional_id, order.assignment_mode, profile.id]);
  const manualAlternatives = useMemo(
    () =>
      publicProfessionals.filter(
        (professional) =>
          replacementEligibility.key === replacementKey && replacementEligibility.ids.includes(professional.profile.id) &&
          professional.profile.id !== order.preferred_professional_id &&
          professional.services.some((service) => service.service_id === order.service_id) &&
          (order.mode !== 'immediate' || professional.profile.is_available),
      ),
    [order.mode, order.preferred_professional_id, order.service_id, publicProfessionals, replacementEligibility, replacementKey],
  );

  useEffect(() => {
    if (
      manualReplacementProfessionalId &&
      manualAlternatives.some((professional) => professional.profile.id === manualReplacementProfessionalId)
    ) {
      return;
    }
    setManualReplacementProfessionalId(manualAlternatives[0]?.profile.id || '');
  }, [manualAlternatives, manualReplacementProfessionalId]);

  const evidenceStageOptions = useMemo(() => {
    const options: Array<{ value: V6OrderPhoto['stage']; label: string }> = [];
    const isClient = order.client_id === profile.id;
    const isAssignedProfessional = order.professional_id === profile.id;
    const canAddBefore =
      (isClient || isAssignedProfessional) &&
      ['open', 'scheduled_open', 'waiting_quotes', 'payment_pending', 'accepted', 'en_camino', 'en_sitio'].includes(order.status);
    const canAddDuring =
      (isClient || isAssignedProfessional) &&
      ['accepted', 'en_camino', 'en_sitio', 'trabajando'].includes(order.status);
    const canAddAfter = isAssignedProfessional && order.status === 'trabajando';

    if (canAddBefore) options.push({ value: 'before', label: 'Antes' });
    if (canAddDuring) options.push({ value: 'during', label: 'Durante' });
    if (canAddAfter) options.push({ value: 'after', label: 'Trabajo terminado' });
    return options;
  }, [order.client_id, order.professional_id, order.status, profile.id]);

  useEffect(() => {
    if (!evidenceStageOptions.length) return;
    if (evidenceStageOptions.some((option) => option.value === evidenceStage)) return;
    setEvidenceStage(evidenceStageOptions[0].value);
  }, [evidenceStage, evidenceStageOptions]);

  const manualLabel = manualResponseLabel(order);
  const showManualClientDecision = profile.role === 'client' && manualRequestNeedsClientDecision(order);
  const showManualPendingNotice =
    profile.role === 'client' &&
    manualRequestIsPending(order) &&
    !manualRequestIsExpiredByClock(order);
  const canRejectManualRequest = manualRequestCanBeRejectedBy(order, profile);

  const refreshCommercialData = useCallback(async () => {
    const [nextProposals, nextExtras, nextPayments] = await Promise.all([
      listV6OrderProposals(order.id),
      listV6OrderExtras(order.id),
      listV6PaymentsForOrder(order.id),
    ]);
    setProposals(nextProposals);
    setExtras(nextExtras);
    setPayments(nextPayments);
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
    let running = false;
    let pending = false;
    const refresh = async () => {
      if (!alive) return;
      if (running) { pending = true; return; }
      running = true;
      try {
        const results = await Promise.allSettled([
          listV6OrderProposals(order.id), listV6OrderExtras(order.id),
          listV6PaymentsForOrder(order.id), listV6OrderPhotos(order.id).then(async rows =>
            Promise.all(rows.map(async photo => ({ ...photo, signedUrl: await getV6MediaSignedUrl(photo.file_path) })))),
        ]);
        if (!alive) return;
        if (results[0].status === 'fulfilled') setProposals(results[0].value);
        if (results[1].status === 'fulfilled') setExtras(results[1].value);
        if (results[2].status === 'fulfilled') setPayments(results[2].value);
        if (results[3].status === 'fulfilled') setPhotos(results[3].value);
        if (results.some(result => result.status === 'rejected')) {
          setNotice('No pudimos actualizar todos los datos del pedido. Revisá tu conexión.');
        }
      } finally {
        running = false;
        if (pending && alive) { pending = false; void refresh(); }
      }
    };
    const channel = subscribeV6OrderDetails(order.id, () => { void refresh(); });
    void refresh();
    window.addEventListener('online', refresh);
    return () => {
      alive = false;
      window.removeEventListener('online', refresh);
      removeV6Channel(channel);
    };
  }, [order.id, setNotice]);

  useEffect(() => {
    if (profile.role !== 'professional') return;
    const ownProposal = proposals.find((proposal) => proposal.professional_id === profile.id);
    if (!ownProposal) return;
    setProposalLabor(String(ownProposal.labor_price || 0));
    setProposalMaterials(String(ownProposal.materials_price || 0));
    setProposalVisit(String(ownProposal.visit_price || 0));
    setProposalDuration(ownProposal.estimated_minutes ? String(ownProposal.estimated_minutes) : '90');
    setProposalAvailability(ownProposal.availability_label || '');
    setProposalAvailableFrom(dateTimeInputValue(ownProposal.available_from));
    setProposalNote(ownProposal.observation || '');
  }, [profile.id, profile.role, proposals]);

  async function advance() {
    if (advancingOrder.current) return;
    advancingOrder.current = true;
    setPinActionError(null);
    try {
      if (nextAction.kind === 'start_with_pin') {
        const pin = window.prompt(nextAction.prompt);
        if (!pin) return;
        await startV6Order(order.id, pin);
      } else if (nextAction.kind === 'complete_with_pin') {
        if (order.service?.requires_completion_evidence && !photos.some((photo) => photo.stage === 'after')) {
          setError('Agregá al menos una foto del trabajo terminado antes de finalizar.');
          return;
        }
        const pin = window.prompt(nextAction.prompt);
        if (!pin) return;
        await completeTrackedV6Order(order.id, pin);
      } else {
        await advanceV6Order(order.id);
      }
      setOrders(await listV6Orders());
      setNotice('Estado actualizado.');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudo avanzar.';
      if (nextAction.kind === 'start_with_pin' || nextAction.kind === 'complete_with_pin') setPinActionError(message);
      else setError(message);
    } finally {
      advancingOrder.current = false;
    }
  }

  async function cancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cancellationReason === 'other' && !cancellationNote.trim()) {
      setError('Contanos brevemente el motivo de la cancelación.');
      return;
    }
    const phaseWarning =
      order.status === 'en_camino'
        ? 'El profesional ya está en camino.'
        : order.status === 'en_sitio'
          ? 'El profesional ya llegó al domicilio.'
          : '';
    const confirmed = window.confirm(
      `${phaseWarning ? `${phaseWarning}\n\n` : ''}¿Cancelar este servicio?`,
    );
    if (!confirmed) return;
    try {
      await cancelV6Order(order.id, cancellationReason, cancellationNote);
      setOrders(await listV6Orders());
      setNotice('Servicio cancelado.');
      setShowCancellationForm(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cancelar.');
    }
  }

  async function rejectManualRequest(reason = 'no_disponible') {
    try {
      await rejectV6ManualOrderRequest(order.id, reason);
      setOrders(await listV6Orders());
      setNotice('Solicitud rechazada. El cliente va a poder elegir cómo seguir.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo rechazar la solicitud.');
    }
  }

  async function chooseAnotherProfessional() {
    if (!manualReplacementProfessionalId) {
      setError('Elegí otro profesional disponible.');
      return;
    }
    try {
      await chooseV6ManualOrderProfessional(order.id, manualReplacementProfessionalId);
      setOrders(await listV6Orders());
      setNotice('Solicitud enviada al nuevo profesional.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo elegir otro profesional.');
    }
  }

  async function fallbackToAutomaticSearch() {
    try {
      await fallbackV6ManualOrderToAuto(order.id);
      setOrders(await listV6Orders());
      setNotice('Búsqueda automática activada.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo activar la búsqueda automática.');
    }
  }

  async function retryAutomaticSearch() {
    if (retryingMatchingRef.current) return;
    retryingMatchingRef.current = true;
    setRetryingMatching(true);
    setNotice('Buscando profesionales...');
    try {
      await retryV6ImmediateMatching(order.id);
      const nextOrders = await listV6Orders();
      setOrders(nextOrders);
      const refreshedOrder = nextOrders.find((item) => item.id === order.id);
      setNotice(refreshedOrder?.professional_id ? 'Encontramos un profesional.' : 'La búsqueda terminó sin nuevos candidatos. Podés editar la solicitud.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo reintentar la búsqueda.');
    } finally {
      retryingMatchingRef.current = false;
      setRetryingMatching(false);
    }
  }

  async function sendProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const duration = Number(proposalDuration) || 0;
    if (duration < 15 || duration > 1440) {
      setError('Indicá una duración estimada entre 15 minutos y 24 horas.');
      return;
    }
    try {
      await sendV6OrderProposal({
        orderId: order.id,
        professionalId: profile.id,
        laborPrice: Number(proposalLabor) || 0,
        materialsPrice: Number(proposalMaterials) || 0,
        visitPrice: Number(proposalVisit) || 0,
        manitoFee: 0,
        estimatedMinutes: duration,
        availabilityLabel: proposalAvailability.trim(),
        availableFrom: proposalAvailableFrom ? new Date(proposalAvailableFrom).toISOString() : null,
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
      setNotice('Presupuesto aceptado. Si corresponde, confirmá el pago para habilitar el trabajo.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo aceptar presupuesto.');
    }
  }

  async function confirmPayment() {
    try {
      await reportV6OrderPayment(order.id);
      setOrders(await listV6Orders());
      await refreshCommercialData();
      setNotice('Pago reportado. Esperando confirmación del profesional.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo reportar el pago.');
    }
  }

  async function confirmManualPayment() {
    try {
      await confirmV6ManualPayment(order.id);
      setOrders(await listV6Orders());
      await refreshCommercialData();
      setNotice('Pago confirmado.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo confirmar el pago.');
    }
  }

  async function disputeManualPayment() {
    const reason = window.prompt('¿Qué problema hubo con el pago?') || '';
    try {
      await disputeV6ManualPayment(order.id, reason);
      setOrders(await listV6Orders());
      await refreshCommercialData();
      setNotice('Pago enviado a revisión.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo reportar el problema de pago.');
    }
  }

  async function createExtra(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order.professional_id || extraRequestInFlight.current) return;
    extraRequestInFlight.current = true;
    setSubmittingExtra(true);
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
    } finally {
      extraRequestInFlight.current = false;
      setSubmittingExtra(false);
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

  async function uploadOrderEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!evidenceFile) {
      setError('Elegí una foto para subir al seguimiento.');
      return;
    }
    setUploadingEvidence(true);
    try {
      const filePath = await uploadV6OrderEvidenceFile({
        orderId: order.id,
        ownerId: profile.id,
        file: evidenceFile,
      });
      try {
        await addV6OrderPhoto({
          orderId: order.id,
          uploadedBy: profile.id,
          stage: evidenceStage,
          filePath,
          caption: evidenceFile.name,
        });
      } catch (caught) {
        await removeV6MediaFiles([filePath]).catch(() => undefined);
        throw caught;
      }
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

  const canUploadEvidence = evidenceStageOptions.length > 0;
  const canChat = Boolean(order.professional_id);
  const canShareTracking = !['completed', 'cancelled'].includes(order.status);
  const canClientCancel =
    profile.role === 'client' &&
    ['open', 'scheduled_open', 'waiting_quotes', 'matching_failed', 'payment_pending', 'accepted', 'en_camino', 'en_sitio'].includes(
      order.status,
    );
  const canProfessionalCancel =
    profile.role === 'professional' &&
    order.professional_id === profile.id &&
    ['accepted', 'en_camino', 'en_sitio'].includes(order.status);
  const canCancelOrder = canClientCancel || canProfessionalCancel;
  const approvedExtras = extras.filter((extra) => extra.status === 'approved');
  const beforePhotos = photos.filter((photo) => photo.stage === 'before').length;
  const afterPhotos = photos.filter((photo) => photo.stage === 'after').length;
  const photosByStage = {
    before: photos.filter((photo) => photo.stage === 'before'),
    during: photos.filter((photo) => photo.stage === 'during'),
    after: photos.filter((photo) => photo.stage === 'after'),
  };
  const protectionReference = order.completed_at || order.updated_at || order.created_at;
  const latestPayment = payments[0] || null;
  const approvedPaymentTotal = payments
    .filter((payment) => payment.status === 'approved' || payment.status === 'confirmed')
    .reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const manualPayment = isManualPaymentMethod(order.payment_method);
  const paymentConfirmed = payments.some((payment) => payment.status === 'approved' || payment.status === 'confirmed');
  const paymentReported = latestPayment?.status === 'reported';
  const paymentDisputed = latestPayment?.status === 'disputed' || latestPayment?.status === 'rejected';
  const canClientReportManualPayment =
    profile.role === 'client' &&
    order.status === 'completed' &&
    manualPayment &&
    !paymentConfirmed &&
    !paymentReported &&
    !paymentDisputed;
  const canProfessionalConfirmManualPayment =
    profile.role === 'professional' &&
    order.status === 'completed' &&
    manualPayment &&
    paymentReported;

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
    <article className="v6-order" data-order-id={order.id}>
      {order.client_id === profile.id && !order.professional_id && !order.location_id &&
        (order.client_lat == null || order.client_lng == null) &&
        ['open', 'scheduled_open', 'waiting_quotes', 'matching_failed'].includes(order.status) &&
        <CompleteMatchingLocation orderId={order.id} onSaved={() => { void listV6Orders().then(setOrders).catch(() => setError('No pudimos actualizar el pedido.')); }} />}
      <div className="v6-order-top">
        <span className="v6-order-icon">{serviceIcon(order.service?.slug || '')}</span>
        <div>
          <strong>{serviceDisplayName(order.service)}</strong>
          <p>{order.address} · {shortDate(order.created_at)}</p>
          {other && <small>{profile.role === 'client' ? 'Profesional' : 'Cliente'}: {other.full_name || 'Usuario'}</small>}
          <span className={`v6-status ${order.status}`}>{orderStatusText(order, proposals.length)}</span>
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
        <b>{money(orderDisplayAmount(order))}</b>
      </div>
      <div className="v6-order-guidance">
        <span>Próximo paso</span>
        <p>{orderNextStepText(order, profile.role)}</p>
        {clientPin && (
          <strong className="v6-pin-callout"><KeyRound size={18} aria-hidden="true" /> {clientPin.label}: {clientPin.value}</strong>
        )}
        {profile.role === 'professional' && canProfessionalAdvanceOrder(order, profile.id) && (
          <button className="v6-primary" type="button" onClick={advance}>{nextAction.label}</button>
        )}
      </div>
      {profile.role === 'client' && order.status === 'matching_failed' && (
        <section className="v6-recovery-panel">
          <strong>No encontramos profesionales disponibles.</strong>
          <p>Podés volver a buscar con estos datos o cambiar la ubicación, especialidad y modalidad.</p>
          <div className="v6-actions compact">
            <button className="v6-primary" type="button" disabled={retryingMatching} onClick={retryAutomaticSearch}>
              {retryingMatching ? 'Buscando profesionales...' : 'Reintentar búsqueda'}
            </button>
            <button className="v6-secondary" type="button" onClick={() => onEditRequest?.(order)}>Editar solicitud</button>
          </div>
        </section>
      )}
      <details className="v6-inline-details v6-status-details">
        <summary>Ver recorrido del trabajo</summary>
        <StatusSteps status={order.status} />
      </details>
      {order.status === 'cancelled' && (
        <p className="v6-alert">
          Servicio cancelado
          {order.cancellation_phase ? ` desde ${V6_STATUS_LABEL[order.cancellation_phase] || order.cancellation_phase}` : ''}.
          {' '}Motivo: {cancellationReasonLabel(order.cancellation_reason)}.
          {' '}Responsabilidad: {cancellationResponsibilityLabel(order.cancellation_responsibility)}.
          {order.cancellation_note ? ` Nota: ${order.cancellation_note}` : ''}
        </p>
      )}
      <div className="v6-meta-row">
        <span><ShieldCheck size={14} aria-hidden="true" /> Protección MANITO</span>
        <span>{paymentStatusLabel(order.payment_status)}</span>
        {order.recurring_plan_id && <span>Servicio recurrente</span>}
        {order.payment_method && <span>Pago {paymentLabel(order.payment_method)}</span>}
        {order.eta_minutes && <span>ETA {order.eta_minutes} min</span>}
      </div>
      {manualLabel && (showManualPendingNotice || showManualClientDecision || canRejectManualRequest) && (
        <section className="v6-payment-box action">
          <div>
            <strong>
              <Users size={16} aria-hidden="true" /> Solicitud directa
            </strong>
            <span>{order.manual_response_status === 'awaiting_client_choice' ? 'Elegí cómo seguir' : order.manual_response_status || 'pendiente'}</span>
          </div>
          <p>{manualLabel}</p>
          {showManualClientDecision && (
            <div className="v6-inline-form">
              {manualAlternatives.length > 0 && (
                <select
                  value={manualReplacementProfessionalId}
                  onChange={(event) => setManualReplacementProfessionalId(event.target.value)}
                  aria-label="Elegir otro profesional"
                >
                  {manualAlternatives.slice(0, 8).map((professional) => (
                    <option key={professional.profile.id} value={professional.profile.id}>
                      {publicProfessionalName(professional)}
                    </option>
                  ))}
                </select>
              )}
              <button
                className="v6-secondary"
                type="button"
                disabled={!manualAlternatives.length}
                onClick={chooseAnotherProfessional}
              >
                Elegir otro profesional
              </button>
              <button className="v6-primary" type="button" onClick={fallbackToAutomaticSearch}>
                {order.mode === 'scheduled' ? 'Buscar profesionales' : 'Buscar automáticamente'}
              </button>
            </div>
          )}
          {canRejectManualRequest && (
            <div className="v6-actions compact">
              <button className="v6-secondary" type="button" onClick={() => rejectManualRequest('no_disponible')}>
                Rechazar solicitud
              </button>
            </div>
          )}
        </section>
      )}
      <details className="v6-inline-details v6-commercial-details">
        <summary>Acuerdo, pago y Protección MANITO</summary>
      <section className="v6-payment-box">
        <div>
          <strong>
            <CreditCard size={16} aria-hidden="true" /> Pago y comisión
          </strong>
          <span>{paymentStatusLabel(order.payment_status)}</span>
        </div>
        {latestPayment ? (
          <p>
            {paymentRecordStatusLabel(latestPayment)} · {paymentProviderLabel(latestPayment.provider)} por {money(Number(latestPayment.amount))}
            {' '}· comisión MANITO {money(Number(latestPayment.manito_fee))}
            {' '}· para profesional {money(Number(latestPayment.professional_amount))}
            {approvedPaymentTotal > 0 ? ` · aprobado ${money(approvedPaymentTotal)}` : ''}
            {latestPayment.receipt_path ? ' · comprobante adjunto' : ''}
          </p>
        ) : order.payment_method === 'card' ? (
          <p>
            Preparado para Mercado Pago marketplace: cuando conectemos OAuth y webhooks, el cliente pagará online y MANITO separará comisión y saldo del profesional.
          </p>
        ) : order.payment_method === 'wallet' ? (
          <p>
            Billetera registrada como preferencia. El QR o link se coordina por chat y queda como evidencia del pedido.
          </p>
        ) : (
          <p>
            Pago registrado como coordinación manual dentro del pedido.
          </p>
        )}
      </section>
      {order.status !== 'completed' && <section className="v6-protection compact">
        <div className="v6-section-head compact">
          <div>
            <h2>Protección MANITO</h2>
          </div>
          <ShieldCheck size={18} aria-hidden="true" />
        </div>
        <p>
          Chat, fotos, presupuesto, pagos y adicionales quedan en este pedido. Si algo falla después del trabajo,
          el cliente puede pedir revisión desde acá.
        </p>
        <div className="v6-proof-grid compact">
          <span>
            <b>Pago</b>
            {paymentCoordinationHint(order, profile.role)}
          </span>
          <span>
            <b>Vigencia</b>
            Disponible al finalizar, según el servicio.
          </span>
        </div>
      </section>}
      {order.status === 'completed' && <ProtectionPanel key={order.id} order={order} profile={profile} notify={setNotice} />}
      </details>
      {canClientReportManualPayment && (
        <section className="v6-payment-box action">
          <div>
            <strong>
              <CreditCard size={16} aria-hidden="true" /> Reportar pago
            </strong>
            <span>{money(orderServiceTotal(order, approvedExtras) ?? orderDisplayAmount(order))}</span>
          </div>
          <p>
            Avisale al profesional que ya pagaste. El pedido queda esperando su confirmación de recepción.
          </p>
          <button className="v6-primary" type="button" onClick={confirmPayment}>
            {reportPaymentButtonLabel(order.payment_method)}
          </button>
        </section>
      )}
      {profile.role === 'client' && order.status === 'completed' && paymentReported && (
        <p className="v6-note">
          Esperando confirmación del profesional. El pago todavía no figura como confirmado.
        </p>
      )}
      {canProfessionalConfirmManualPayment && (
        <section className="v6-payment-box action">
          <div>
            <strong>
              <CreditCard size={16} aria-hidden="true" /> Confirmar recepción
            </strong>
            <span>{money(Number(latestPayment?.amount || 0))}</span>
          </div>
          <p>
            El cliente reportó el pago. Confirmalo sólo si recibiste el importe acordado.
          </p>
          <div className="v6-actions compact">
            <button className="v6-primary" type="button" onClick={confirmManualPayment}>
              Pago recibido
            </button>
            <button className="v6-secondary" type="button" onClick={disputeManualPayment}>
              Reportar un problema
            </button>
          </div>
        </section>
      )}
      {paymentDisputed && (
        <p className="v6-alert">
          Pago en revisión. MANITO conserva el historial del pedido, chat y evidencia para revisar la diferencia.
        </p>
      )}
      {!['completed', 'cancelled'].includes(order.status) && (
        <p className="v6-note">
          Coordiná por el chat y aprobá adicionales desde MANITO para que el servicio quede registrado.
        </p>
      )}
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
      {(photos.length > 0 || canUploadEvidence) && (
        <details className="v6-inline-details v6-evidence-details">
          <summary>Fotos y evidencia {photos.length > 0 ? `(${photos.length})` : ''}</summary>
          <div className="v6-inline-details-body">
      {photos.length > 0 && (
        <div className="v6-evidence-groups">
          {(['before', 'during', 'after'] as const).map((stage) => (
            photosByStage[stage].length > 0 && (
              <section className="v6-evidence-group" key={stage}>
                <strong>{photoStageLabel(stage)}</strong>
                <div className="v6-photo-strip">
                  {photosByStage[stage].map((photo) => (
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
                      {photo.caption && <figcaption>{photo.caption}</figcaption>}
                    </figure>
                  ))}
                </div>
              </section>
            )
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
                {evidenceStageOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
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
          </div>
        </details>
      )}
      {order.mode === 'quote' && proposals.length > 0 && (
        <div className="v6-quote-list">
          {proposals.map((proposal) => (
            <article className="v6-quote-card" key={proposal.id}>
              <div className="v6-quote-head">
                <div>
                  <strong>{proposal.professional?.full_name || 'Profesional MANITO'}</strong>
                  <span>
                    <Star size={13} aria-hidden="true" />
                    {Number(proposal.professional?.rating_avg || 0).toFixed(1)} · {proposal.professional?.jobs_completed || 0} trabajos
                    {proposal.professional?.verified ? ' · verificado' : ''}
                  </span>
                </div>
                <b className={`v6-proposal-status ${proposal.status}`}>{proposalStatusLabel(proposal)}</b>
              </div>
              <div className="v6-quote-scope">
                <span>Alcance</span>
                <p>{proposal.observation || 'Sin aclaraciones adicionales sobre el alcance.'}</p>
              </div>
              <div className="v6-quote-components">
                <span>Mano de obra {money(proposal.labor_price)}</span>
                <span>{proposalMaterialsText(proposal)}</span>
                <span>Visita {money(proposal.visit_price)}</span>
                <span>{proposal.manito_fee > 0 ? `Otros conceptos ${money(proposal.manito_fee)}` : 'Otros conceptos sin especificar'}</span>
              </div>
              <div className="v6-quote-total-row"><span>Total propuesto</span><strong className="v6-quote-total">{money(proposalTotal(proposal))}</strong></div>
              <p>Disponibilidad: {proposalAvailabilityText(proposal)}</p>
              <p>Duración: {proposal.estimated_minutes ? `${proposal.estimated_minutes} min` : 'Sin especificar'}</p>
              <p>Válida hasta: {shortDateTime(proposal.valid_until)}</p>
              {profile.role === 'client' && isOpenOpportunityStatus(order.status) && proposal.status === 'sent' && !proposalIsExpiredByClock(proposal) && (
                <button className="v6-primary" type="button" onClick={() => acceptProposal(proposal.id)}>
                  Aceptar presupuesto
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {profile.role === 'professional' && order.mode === 'quote' && isOpenOpportunityStatus(order.status) && (
        <form className="v6-inline-form v6-quote-form" onSubmit={sendProposal}>
          <label>
            <span>Mano de obra</span>
            <input value={proposalLabor} onChange={(event) => setProposalLabor(event.target.value)} inputMode="numeric" />
          </label>
          <label>
            <span>Materiales</span>
            <input value={proposalMaterials} onChange={(event) => setProposalMaterials(event.target.value)} inputMode="numeric" />
          </label>
          <label>
            <span>Visita</span>
            <input value={proposalVisit} onChange={(event) => setProposalVisit(event.target.value)} inputMode="numeric" />
          </label>
          <label>
            <span>Duración estimada</span>
            <input value={proposalDuration} onChange={(event) => setProposalDuration(event.target.value)} inputMode="numeric" />
          </label>
          <label>
            <span>Disponible desde</span>
            <input type="datetime-local" value={proposalAvailableFrom} onChange={(event) => setProposalAvailableFrom(event.target.value)} />
          </label>
          <label>
            <span>Disponibilidad</span>
            <input value={proposalAvailability} onChange={(event) => setProposalAvailability(event.target.value)} placeholder="Ej: No antes del viernes" />
          </label>
          <label className="v6-inline-wide">
            <span>Observación</span>
            <textarea value={proposalNote} onChange={(event) => setProposalNote(event.target.value)} placeholder="Alcance, condiciones o aclaraciones del presupuesto" />
          </label>
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
      {profile.role === 'professional' && order.professional_id === profile.id && ['en_sitio', 'trabajando'].includes(order.status) && (
        <form className="v6-inline-form" onSubmit={createExtra}>
          <input value={extraTitle} onChange={(event) => setExtraTitle(event.target.value)} aria-label="Detalle adicional" />
          <input value={extraAmount} onChange={(event) => setExtraAmount(event.target.value)} aria-label="Monto adicional" />
          <button className="v6-secondary" type="submit" disabled={submittingExtra}>{submittingExtra ? 'Enviando...' : 'Pedir adicional'}</button>
        </form>
      )}
      {order.status === 'completed' && (
        <section className="v6-protection">
          <div className="v6-section-head compact">
            <div>
              <h2>Constancia MANITO</h2>
              <span>Servicio registrado</span>
            </div>
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <p>
            Este pedido conserva chat, presupuesto, adicionales y evidencia para revisar cualquier inconveniente relacionado con el trabajo.
          </p>
          <div className="v6-proof-grid">
            <span>
              <b>Pedido</b>
              #{order.id.slice(0, 8).toUpperCase()}
            </span>
            <span>
              <b>Finalizado</b>
              {shortDate(protectionReference)}
            </span>
            <span>
              <b>Servicio</b>
              {serviceDisplayName(order.service)}
            </span>
            <span>
              <b>{profile.role === 'client' ? 'Profesional' : 'Cliente'}</b>
              {other?.full_name || 'Usuario MANITO'}
            </span>
            <span>
              <b>Precio final</b>
              {money(orderServiceTotal(order, approvedExtras) ?? orderDisplayAmount(order))}
            </span>
            <span>
              <b>Evidencia</b>
              {beforePhotos} antes · {afterPhotos} después
            </span>
            <span>
              <b>Adicionales</b>
              {approvedExtras.length ? `${approvedExtras.length} aprobados` : 'Sin adicionales'}
            </span>
            <span>
              <b>PIN final</b>
              Validado
            </span>
          </div>
        </section>
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
        </div>
      )}
      {showCancellationForm && canCancelOrder && (
        <form className="v6-inline-form" onSubmit={cancel}>
          <select
            value={cancellationReason}
            onChange={(event) => setCancellationReason(event.target.value as V6CancellationReason)}
            aria-label="Motivo de cancelación"
          >
            {cancellationReasonOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <textarea
            value={cancellationNote}
            onChange={(event) => setCancellationNote(event.target.value)}
            placeholder={cancellationReason === 'other' ? 'Contanos brevemente qué pasó' : 'Nota opcional'}
          />
          {['en_camino', 'en_sitio'].includes(order.status) && (
            <p className="v6-note">
              {order.status === 'en_camino'
                ? 'El profesional ya está en camino. Queda registrado para revisión operativa.'
                : 'El profesional ya llegó. Queda registrado para revisión operativa.'}
            </p>
          )}
          <div className="v6-actions">
            <button className="v6-danger" type="submit">Confirmar cancelación</button>
            <button className="v6-secondary" type="button" onClick={() => setShowCancellationForm(false)}>
              Volver
            </button>
          </div>
        </form>
      )}
      {pinActionError && <p ref={pinErrorElement} className="v6-alert" role="alert">{pinActionError}</p>}
      <div className="v6-actions">
        {canCancelOrder && !showCancellationForm && (
          <button className="v6-danger" type="button" onClick={() => setShowCancellationForm(true)}>
            Cancelar servicio
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
  const [paymentAccount, setPaymentAccount] = useState<V6ProfessionalPaymentAccount | null>(null);
  const [onboarding, setOnboarding] = useState<V6ProfessionalOnboarding | null>(null);
  const [documents, setDocuments] = useState<V6ProfessionalDocument[]>([]);
  const [portfolio, setPortfolio] = useState<V6PortfolioItem[]>([]);
  const [professionalStep, setProfessionalStep] = useState(1);
  const [headline, setHeadline] = useState('Tecnico verificado para urgencias del hogar');
  const [bio, setBio] = useState('Trabajo con turnos puntuales, presupuesto claro y Protección MANITO.');
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
  const [professionalServiceGroup, setProfessionalServiceGroup] = useState<ServiceGroupId>('home');
  const [serviceSearch, setServiceSearch] = useState('');
  const [showServiceCatalog, setShowServiceCatalog] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [savingCatalog, setSavingCatalog] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      getV6ProfessionalProfile(profile.id),
      getV6ProfessionalPaymentAccount(profile.id),
      getV6ProfessionalPayoutDetails(profile.id),
      getV6ProfessionalOnboarding(profile.id),
      listV6ProfessionalDocuments(profile.id),
      listV6Portfolio(profile.id),
    ])
      .then(([
        nextProfessionalProfile,
        nextPaymentAccount,
        nextPayoutDetails,
        nextOnboarding,
        nextDocuments,
        nextPortfolio,
      ]) => {
        if (!alive) return;
        setProfessionalProfile(nextProfessionalProfile);
        setPaymentAccount(nextPaymentAccount);
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
  const visibleProfessionalServices = useMemo(
    () => filterServicesByGroup(services, professionalServiceGroup).filter((service) =>
      `${serviceDisplayName(service)} ${service.slug}`.toLocaleLowerCase('es').includes(serviceSearch.trim().toLocaleLowerCase('es')),
    ),
    [professionalServiceGroup, serviceSearch, services],
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
  const completedDocuments = requiredDocuments.filter((item) =>
    uploadedDocumentKinds.has(item.kind),
  ).length;
  const hasPayoutDetails = Boolean(
    payoutAlias.trim() || payoutCbu.trim() || walletPaymentLink.trim(),
  );
  const onboardingRequirements = useMemo(
    () =>
      professionalOnboardingRequirements({
        servicesCount: proServices.length,
        specialtiesCount: proSpecialties.length,
        completedDocumentsCount: completedDocuments,
        requiredDocumentsCount: requiredDocuments.length,
        fullName,
        phone,
        city,
        headline,
        bio,
        yearsExperience,
        workZone,
        workRadius,
        workDaysCount: workDays.length,
        workStart,
        workEnd,
        hasPayoutDetails,
        portfolioCount: portfolio.length,
      }),
    [
      bio,
      city,
      completedDocuments,
      fullName,
      hasPayoutDetails,
      headline,
      phone,
      portfolio.length,
      proServices.length,
      proSpecialties.length,
      workDays.length,
      workEnd,
      workRadius,
      workStart,
      workZone,
      yearsExperience,
    ],
  );
  const missingRequirements = useMemo(
    () => missingBlockingRequirements(onboardingRequirements),
    [onboardingRequirements],
  );
  const completedRequirementCount = onboardingRequirements.filter((requirement) => requirement.complete).length;
  const professionalProgress = onboardingRequirements.length
    ? Math.round((completedRequirementCount / onboardingRequirements.length) * 100)
    : 0;

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
    if (savingCatalog) return;
    const previousServices = proServices;
    const previousSpecialties = proSpecialties;
    const current = new Set(proServices.map((item) => item.service_id));
    if (current.has(serviceId)) current.delete(serviceId);
    else current.add(serviceId);
    const nextServiceIds = [...current];
    const nextSpecialtyIds = proSpecialties
      .filter((item) => current.has(item.service_id))
      .map((item) => item.specialty_id);
    setProServices(nextServiceIds.map((id) => previousServices.find((item) => item.service_id === id) || {
      professional_id: profile.id,
      service_id: id,
      price_from: services.find((item) => item.id === id)?.base_price || null,
    }));
    setProSpecialties(previousSpecialties.filter((item) => current.has(item.service_id)));
    setSavingCatalog(true);
    try {
      const nextServices = await saveV6ProfessionalServices(profile.id, nextServiceIds, services, serviceRatesFor(nextServiceIds));
      setProServices(nextServices);
      setProSpecialties(await saveV6ProfessionalSpecialties(profile.id, nextSpecialtyIds, specialties));
      if (current.has(serviceId)) {
        setEditingServiceId(serviceId);
        setShowServiceCatalog(false);
      } else if (editingServiceId === serviceId) {
        setEditingServiceId(null);
      }
      setNotice('Servicios guardados.');
    } catch (caught) {
      setProServices(previousServices);
      setProSpecialties(previousSpecialties);
      setError(caught instanceof Error ? caught.message : 'No se guardaron servicios.');
    } finally {
      setSavingCatalog(false);
    }
  }

  async function toggleSpecialty(specialty: V6Specialty) {
    if (!selectedServiceIds.has(specialty.service_id) || savingCatalog) return;
    const previous = proSpecialties;
    const current = new Set(proSpecialties.map((item) => item.specialty_id));
    if (current.has(specialty.id)) current.delete(specialty.id);
    else current.add(specialty.id);
    const next = [...current];
    setProSpecialties(next.map((id) => previous.find((item) => item.specialty_id === id) || {
      professional_id: profile.id,
      service_id: specialties.find((item) => item.id === id)?.service_id || specialty.service_id,
      specialty_id: id,
      created_at: new Date().toISOString(),
    }));
    setSavingCatalog(true);
    try {
      setProSpecialties(await saveV6ProfessionalSpecialties(profile.id, next, specialties));
      setNotice('Especialidades guardadas.');
    } catch (caught) {
      setProSpecialties(previous);
      setError(caught instanceof Error ? caught.message : 'No se guardaron especialidades.');
    } finally {
      setSavingCatalog(false);
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
    'Sobre vos',
    'Qué hacés',
    'Dónde y cuándo',
    'Perfil y documentación',
    'Cobro y revisión',
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
      setError(`Agregá una foto o un link para ${label}.`);
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
    if (missingRequirements.length) {
      setError(`Para enviar faltan: ${missingRequirements.map((item) => item.label).join(', ')}.`);
      return;
    }
    setSubmittingOnboarding(true);
    try {
      const selectedIds = proServices.map((item) => item.service_id);
      const changedProfile = await updateV6Profile(profile.id, {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        city: city.trim() || null,
      });
      const nextProfile = await upsertV6ProfessionalProfile({
        professionalId: profile.id,
        headline: headline.trim(),
        bio: bio.trim(),
        yearsExperience: Number(yearsExperience) || 0,
        responseMinutes: professionalProfile?.response_minutes || 35,
        insuranceLabel: insuranceLabel.trim(),
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
      setProfile(changedProfile);
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
      setError('Ponele un título al trabajo del portfolio.');
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
                {completedRequirementCount}/{onboardingRequirements.length} requisitos · {completedDocuments}/{requiredDocuments.length} documentos · paso interno {onboarding?.current_step || 1}/16
              </small>
            </div>
            {missingRequirements.length > 0 && (
              <div className="v6-requirement-list">
                {missingRequirements.slice(0, 3).map((requirement) => (
                  <span key={requirement.id}>{requirement.label}</span>
                ))}
              </div>
            )}
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
                  disabled={submittingOnboarding || missingRequirements.length > 0}
                >
                  {submittingOnboarding ? 'Enviando...' : 'Enviar a verificación'}
                </button>
              )}
            </div>
      </section>

      {professionalStep === 2 && (
          <section className="v6-card">
            <h2>Servicios que ofrecés</h2>
            <p className="v6-help-text">
              Agregá un rubro y elegí sólo las tareas que realizás.
            </p>
            {proServices.length > 0 && (
              <div className="v6-selected-service-list">
                <div className="v6-section-head compact">
                  <h3>Servicios seleccionados</h3>
                  <span>{proServices.length}</span>
                </div>
                {proServices.map((item) => {
                  const service = services.find((candidate) => candidate.id === item.service_id);
                  if (!service) return null;
                  const count = proSpecialties.filter((specialty) => specialty.service_id === item.service_id).length;
                  return (
                    <button className="v6-selected-service" type="button" key={item.service_id} onClick={() => setEditingServiceId(item.service_id)}>
                      <span>{serviceIcon(service.slug)}</span>
                      <span><strong>{serviceDisplayName(service)}</strong><small>{count ? `${count} especialidades seleccionadas` : 'Elegí tus especialidades'}</small></span>
                      <ChevronRight size={18} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            )}
            <button className="v6-secondary v6-add-service" type="button" onClick={() => { setShowServiceCatalog((value) => !value); setEditingServiceId(null); }}>
              {showServiceCatalog ? 'Cerrar catálogo' : '+ Agregar servicio'}
            </button>
            {showServiceCatalog && (
              <div className="v6-service-catalog">
                <label className="v6-field"><span>Buscar servicio</span><input value={serviceSearch} onChange={(event) => setServiceSearch(event.target.value)} placeholder="Ej: plomería" /></label>
                <div className="v6-chip-row nowrap">
                  {serviceGroups.map((group) => <button type="button" key={group.id} aria-pressed={professionalServiceGroup === group.id} onClick={() => setProfessionalServiceGroup(group.id)}>{group.label}</button>)}
                </div>
                <div className="v6-service-catalog-list">
                  {visibleProfessionalServices.filter((service) => !selectedServiceIds.has(service.id)).map((service) => (
                    <button type="button" key={service.id} disabled={savingCatalog} onClick={() => void toggleService(service.id)}>
                      <span>{serviceIcon(service.slug)}</span><strong>{serviceDisplayName(service)}</strong><span>Agregar</span>
                    </button>
                  ))}
                </div>
                {!visibleProfessionalServices.some((service) => !selectedServiceIds.has(service.id)) && <p className="v6-muted">No hay otros servicios con este filtro.</p>}
              </div>
            )}
            {editingServiceId && (() => {
              const service = services.find((item) => item.id === editingServiceId);
              const serviceSpecialties = specialtiesByService[editingServiceId] || [];
              if (!service) return null;
              return (
                <div className="v6-specialty-editor">
                  <div className="v6-section-head compact"><div><h3>{serviceDisplayName(service)}</h3><span>Elegí las tareas que realizás</span></div><button className="v6-icon-button" type="button" onClick={() => setEditingServiceId(null)} aria-label="Cerrar">×</button></div>
                  <div className="v6-chip-list">
                    {serviceSpecialties.map((specialty) => <button type="button" key={specialty.id} disabled={savingCatalog} aria-pressed={selectedSpecialtyIds.has(specialty.id)} onClick={() => void toggleSpecialty(specialty)}>{specialty.name}</button>)}
                  </div>
                  <button className="v6-link-button danger" type="button" disabled={savingCatalog} onClick={() => void toggleService(editingServiceId)}>Quitar servicio</button>
                </div>
              );
            })()}
            {savingCatalog && <p className="v6-save-status" role="status">Guardando cambios...</p>}
          </section>
      )}

      {professionalStep === 1 && (
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

      {professionalStep === 1 && (
      <section className="v6-card">
        <h2>Datos personales</h2>
        <form className="v6-stack" onSubmit={saveProfile}>
          <label className="v6-field">
            <span>Nombre</span>
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
          </label>
          <label className="v6-field">
            <span>Teléfono</span>
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

      {professionalStep === 4 && (
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

      {professionalStep === 3 && (
          <section className="v6-card">
            <h2>Zona, horarios y tarifas</h2>
            <ProfessionalCoverage professionalId={profile.id} />
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
            <div className="v6-work-days" aria-label="Días de trabajo">
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
            <div className="v6-payment-box">
              <div>
                <strong>
                  <CreditCard size={16} aria-hidden="true" /> Mercado Pago marketplace
                </strong>
                <span>{paymentAccountStatusLabel(paymentAccount)}</span>
              </div>
              <p>
                La base ya está preparada para vincular cada profesional por OAuth, crear pagos con comisión MANITO y confirmar cobros por webhook. Falta conectar las credenciales reales de Mercado Pago Developers.
              </p>
            </div>
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
                Primero elegí al menos un servicio en Qué hacés para poder cargar tarifas.
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

      {professionalStep === 5 && (
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
              {onboardingRequirements.map((requirement) => (
                <span className={requirement.complete ? 'done' : ''} key={requirement.id}>
                  {requirement.label}{!requirement.blocking ? ' · recomendado' : ''}
                </span>
              ))}
              <span className={paymentAccount?.can_receive_online_payments ? 'done' : ''}>Mercado Pago preparado</span>
            </div>
            {missingRequirements.length > 0 && (
              <div className="v6-requirement-list">
                {missingRequirements.map((requirement) => (
                  <span key={requirement.id}>{requirement.label}</span>
                ))}
              </div>
            )}
            <button
              className="v6-primary"
              type="button"
              onClick={submitOnboarding}
              disabled={submittingOnboarding || missingRequirements.length > 0}
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
  experience,
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
  experience: AppMode;
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
  const [locationCity, setLocationCity] = useState(cityFromLocationLabel(profile.city) || profile.city || '');
  const [locationDetail, setLocationDetail] = useState(detailFromLocationLabel(profile.city));
  const [locationPhone, setLocationPhone] = useState(profile.phone || '');
  const [savingLocation, setSavingLocation] = useState(false);
  const [accountType, setAccountType] = useState<V6UserSecurityPreferences['account_type']>('particular');
  const [taxId, setTaxId] = useState('');
  const [trustedContact, setTrustedContact] = useState('');
  const [hidePhoneInChat, setHidePhoneInChat] = useState(true);
  const [savingSecurityPreferences, setSavingSecurityPreferences] = useState(false);
  const [paymentProfiles, setPaymentProfiles] = useState<V6PaymentProfile[]>([]);
  const [savingPaymentType, setSavingPaymentType] = useState<PaymentMethod | null>(null);
  const [adminSettings, setAdminSettings] = useState<V6AdminSetting[]>([]);
  const [adminReviews, setAdminReviews] = useState<V6AdminProfessionalReview[]>([]);
  const [adminComplaints, setAdminComplaints] = useState<V6AdminComplaintReview[]>([]);
  const [showRecurring, setShowRecurring] = useState(false);
  const referralCode = `MANITO-${normalizeText(profile.full_name || profile.email || profile.id)
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 6)
    .toUpperCase() || 'AMIGO'}`;

  useEffect(() => {
    let alive = true;
    Promise.all([
      listV6PaymentProfiles(profile.id),
      getV6UserSecurityPreferences(profile.id),
      profile.role === 'admin' ? listV6AdminSettings() : Promise.resolve([]),
      profile.role === 'admin' ? listV6AdminProfessionalReviews() : Promise.resolve([]),
      profile.role === 'admin' ? listV6AdminComplaintReviews() : Promise.resolve([]),
    ])
      .then(([nextPayments, nextSecurityPreferences, nextSettings, nextReviews, nextComplaints]) => {
        if (!alive) return;
        setPaymentProfiles(uniquePaymentProfiles(nextPayments));
        if (nextSecurityPreferences) {
          setAccountType(nextSecurityPreferences.account_type);
          setTaxId(nextSecurityPreferences.tax_id || '');
          setTrustedContact(nextSecurityPreferences.trusted_contact || '');
          setHidePhoneInChat(nextSecurityPreferences.hide_phone_in_chat);
        }
        setAdminSettings(nextSettings);
        setAdminReviews(nextReviews);
        setAdminComplaints(nextComplaints);
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

  async function saveAccountPreferences() {
    if (savingSecurityPreferences) return;
    setSavingSecurityPreferences(true);
    try {
      await upsertV6UserSecurityPreferences({
        profileId: profile.id,
        accountType,
        taxId: taxId.trim(),
        trustedContact: trustedContact.trim(),
        hidePhoneInChat,
      });
      for (const key of [
        `manito_v6_account_type:${profile.id}`,
        `manito_v6_tax_id:${profile.id}`,
        `manito_v6_trusted:${profile.id}`,
        `manito_v6_hide_phone:${profile.id}`,
      ]) {
        window.localStorage.removeItem(key);
      }
      setNotice('Cuenta actualizada con privacidad protegida.');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'No se pudo guardar seguridad de cuenta.');
    } finally {
      setSavingSecurityPreferences(false);
    }
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
      const nextLocation = composeProfileLocation(locationCity, locationDetail);
      const updated = await updateV6Profile(profile.id, {
        full_name: profile.full_name,
        phone: locationPhone.trim() || null,
        city: nextLocation,
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
    setShowRecurring(true);
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
      setPaymentProfiles(uniquePaymentProfiles(await listV6PaymentProfiles(profile.id)));
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
      {showRecurring && <RecurringServicesPanel
        clientOrders={clientOrders}
        onOrders={() => onNavigate('orders')}
        onClose={() => setShowRecurring(false)}
      />}
      <section className="v6-card v6-account-cta">
        <h2>{experience === 'professional' ? 'Tu perfil profesional' : 'Tu cuenta de cliente'}</h2>
        <p>{experience === 'professional'
          ? 'Administrá servicios, especialidades, cobertura, documentación, horarios y tarifas.'
          : 'Guardá direcciones, favoritos, pedidos recurrentes y datos de facturación.'}</p>
        <button className="v6-primary" type="button" onClick={onOpenProfile}>
          {experience === 'professional' ? 'Administrar perfil profesional' : 'Editar perfil'}
        </button>
      </section>
      <section className="v6-card">
        <h2>Ubicación principal</h2>
        <p className="v6-muted">
          MANITO usa la ciudad para mostrarla arriba y el GPS para ordenar profesionales cercanos.
        </p>
        {profile.lat != null && profile.lng != null && (
          <p className="v6-note">
            GPS guardado. Arriba se muestra {profile.city || 'tu ubicación actual'}.
          </p>
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
            <span>Barrio, zona o referencia</span>
            <input
              value={locationDetail}
              onChange={(event) => setLocationDetail(event.target.value)}
              placeholder="Ej: Güemes, Centro, Av. Independencia"
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
        <p className="v6-help-text">
          Para una dirección exacta por pedido, cargá calle, número y ciudad cuando pedís el servicio.
        </p>
      </section>
      <section className="v6-card">
        <h2>Datos de cuenta</h2>
        <div className="v6-stack">
          <label className="v6-field">
            <span>Tipo</span>
            <select
              value={accountType}
              onChange={(event) =>
                setAccountType(event.target.value as V6UserSecurityPreferences['account_type'])
              }
            >
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
          <button
            className="v6-secondary"
            type="button"
            onClick={saveAccountPreferences}
            disabled={savingSecurityPreferences}
          >
            {savingSecurityPreferences ? 'Guardando...' : 'Guardar cuenta'}
          </button>
        </div>
      </section>
      {experience === 'client' && <section className="v6-card v6-account-cta">
        <div className="v6-section-head compact">
          <h2>Referidos</h2>
          <span>crecé con MANITO</span>
        </div>
        <p>Compartí tu código y dejalo listo para una promo de prueba.</p>
        <button className="v6-secondary" type="button" onClick={copyReferralCode}>
          {referralCode}
        </button>
      </section>}
      {experience === 'professional' && <section className="v6-card v6-account-cta">
        <h2>Perfil profesional</h2>
        <p>Administrá tus servicios, especialidades, cobertura, horarios y documentación.</p>
        <button className="v6-secondary" type="button" onClick={onOpenProfile}>Editar perfil profesional</button>
      </section>}
      {experience === 'client' && <section className="v6-card">
        <div className="v6-section-head">
          <h2>Pagos</h2>
          <span>{paymentProfiles.length}</span>
        </div>
        <p className="v6-muted">
          Guardamos un método preferido para acelerar pedidos. Tarjeta queda bloqueada hasta activar Mercado Pago marketplace; Cuenta DNI/billetera se coordina por QR o link dentro del chat.
        </p>
        <div className="v6-choice-grid three">
          {paymentOptions.map((option) => (
            <button
              className="v6-choice"
              type="button"
              key={option.id}
              onClick={() => {
                if (option.disabled) {
                  setNotice(option.detail);
                  return;
                }
                addPayment(option.id);
              }}
              aria-disabled={option.disabled}
              disabled={Boolean(savingPaymentType)}
            >
              {option.icon}
              {savingPaymentType === option.id ? 'Guardando...' : option.label}
              <small>{option.shortHint}</small>
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
      </section>}
      {experience === 'client' && <section className="v6-card">
        <h2>Beneficios</h2>
        <div className="v6-benefit-grid">
          <button type="button" onClick={copyReferralCode}>
            <Ticket size={17} aria-hidden="true" />
            <span>
              <strong>Referidos</strong>
              <small>Copiá {referralCode}</small>
            </span>
          </button>
          <button type="button" onClick={goToRecurringOrders}>
            <Clock size={17} aria-hidden="true" />
            <span>
              <strong>Recurrentes</strong>
              <small>Repetí un servicio anterior</small>
            </span>
          </button>
          <button type="button" onClick={() => onNavigate('favorites')}>
            <Heart size={17} aria-hidden="true" />
            <span>
              <strong>Favoritos</strong>
              <small>Profesionales guardados</small>
            </span>
          </button>
          <button type="button" onClick={shareActiveTracking}>
            <SendHorizontal size={17} aria-hidden="true" />
            <span>
              <strong>Seguimiento</strong>
              <small>Compartí el pedido activo</small>
            </span>
          </button>
          <button type="button" onClick={focusTrustedContact}>
            <ShieldCheck size={17} aria-hidden="true" />
            <span>
              <strong>Contacto seguro</strong>
              <small>{trustedContact || 'Cargar contacto'}</small>
            </span>
          </button>
        </div>
      </section>}
      {experience === 'client' && <section className="v6-card v6-account-cta">
        <h2>Trabaja con MANITO</h2>
        <p>Creá tu perfil profesional, mostrá qué hacés y empezá a recibir pedidos cuando tu cuenta sea aprobada.</p>
        <button className="v6-secondary" type="button" onClick={onOpenProfile}>
          Quiero ser profesional
        </button>
      </section>}
      {profile.role === 'admin' && (
        <RecurringAdminPanel />
      )}
      {profile.role === 'admin' && (
        <AdminReviewWorkbench
          reviews={adminReviews}
          complaints={adminComplaints}
          settings={adminSettings}
          setReviews={setAdminReviews}
          setComplaints={setAdminComplaints}
          setNotice={setNotice}
        />
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

function AdminReviewWorkbench({
  reviews,
  complaints,
  settings,
  setReviews,
  setComplaints,
  setNotice,
}: {
  reviews: V6AdminProfessionalReview[];
  complaints: V6AdminComplaintReview[];
  settings: V6AdminSetting[];
  setReviews: (reviews: V6AdminProfessionalReview[]) => void;
  setComplaints: (complaints: V6AdminComplaintReview[]) => void;
  setNotice: (message: string) => void;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const pendingCount = reviews.filter((review) =>
    ['submitted', 'in_review', 'observed'].includes(review.onboarding_status),
  ).length;
  const approvedCount = reviews.filter((review) => review.onboarding_status === 'approved').length;
  const openComplaintCount = complaints.filter((complaint) =>
    ['open', 'under_review', 'awaiting_professional'].includes(complaint.status),
  ).length;

  const refreshReviews = useCallback(async () => {
    const [nextReviews, nextComplaints] = await Promise.all([
      listV6AdminProfessionalReviews(),
      listV6AdminComplaintReviews(),
    ]);
    setReviews(nextReviews);
    setComplaints(nextComplaints);
  }, [setReviews, setComplaints]);

  useEffect(() => {
    const channel = subscribeV6Complaints(null, () => { void refreshReviews().catch(() => setNotice('No pudimos actualizar los casos.')); });
    return () => removeV6Channel(channel);
  }, [refreshReviews, setNotice]);

  async function reviewProfessional(review: V6AdminProfessionalReview, status: V6AdminReviewStatus) {
    const key = `${review.professional_id}:${status}`;
    setBusyKey(key);
    try {
      await reviewV6ProfessionalOnboarding({
        professionalId: review.professional_id,
        status,
        notes: notes[review.professional_id] || null,
        verified: status === 'approved' ? true : status === 'in_review' ? null : false,
        manitoPro: status === 'approved' ? review.manito_pro : null,
      });
      await refreshReviews();
      setNotice(adminReviewResultLabel(status));
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'No se pudo revisar el alta.');
    } finally {
      setBusyKey(null);
    }
  }

  async function reviewDocument(document: V6AdminReviewDocument, status: 'approved' | 'observed' | 'rejected') {
    const key = `${document.id}:${status}`;
    setBusyKey(key);
    try {
      await reviewV6ProfessionalDocument({
        documentId: document.id,
        status,
        observation: document.observation,
      });
      await refreshReviews();
      setNotice(adminDocumentResultLabel(status));
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'No se pudo revisar el documento.');
    } finally {
      setBusyKey(null);
    }
  }

  async function openDocument(document: V6AdminReviewDocument) {
    if (!document.file_path) {
      setNotice('Ese documento todavía no tiene archivo ni link.');
      return;
    }
    if (document.file_path.startsWith('http')) {
      window.open(document.file_path, '_blank', 'noopener,noreferrer');
      return;
    }
    const signedUrl = await getV6MediaSignedUrl(document.file_path);
    if (!signedUrl) {
      setNotice('No se pudo abrir el archivo privado. Revisá permisos de Storage.');
      return;
    }
    window.open(signedUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="v6-card v6-admin-workbench">
      <div className="v6-section-head">
        <h2>Admin MANITO</h2>
        <button className="v6-text-button" type="button" onClick={() => void refreshReviews()}>
          Actualizar
        </button>
      </div>
      <div className="v6-admin-grid">
        <article>
          <strong>{reviews.length}</strong>
          <span>altas profesionales</span>
        </article>
        <article>
          <strong>{pendingCount}</strong>
          <span>pendientes</span>
        </article>
        <article>
          <strong>{approvedCount}</strong>
          <span>aprobadas</span>
        </article>
        <article>
          <strong>{openComplaintCount}</strong>
          <span>casos de Protección abiertos</span>
        </article>
      </div>

      <div className="v6-section-head compact">
        <h3>Protección MANITO</h3>
        <span>{complaints.length}</span>
      </div>
      <div className="v6-admin-review-list">
        {complaints.map((complaint) => (
          <ProtectionAdminCase key={complaint.id} item={complaint} refresh={refreshReviews} notify={setNotice} />
        ))}
        {!complaints.length && (
          <div className="v6-empty">
            <ShieldCheck size={24} aria-hidden="true" />
            <strong>No hay casos de Protección</strong>
            <p>Los casos abiertos desde pedidos finalizados van a aparecer acá.</p>
          </div>
        )}
      </div>

      <div className="v6-section-head compact">
        <h3>Altas profesionales</h3>
        <span>{reviews.length}</span>
      </div>
      <div className="v6-admin-review-list">
        {reviews.map((review) => (
          <article className="v6-admin-review-card" key={review.professional_id}>
            <div className="v6-section-head compact">
              <h3>{review.full_name || 'Profesional sin nombre'}</h3>
              <span>{adminOnboardingStatusLabel(review.onboarding_status)}</span>
            </div>
            <p className="v6-muted">
              {review.email || 'Sin email'} · {review.phone || 'Sin teléfono'} · {review.city || review.work_city || 'Sin ciudad'}
            </p>
            <div className="v6-admin-summary">
              <span>{review.current_step}/16 pasos</span>
              <span>{review.verified ? 'Verificado' : 'No verificado'}</span>
              <span>{review.manito_pro ? 'MANITO Pro' : 'Estándar'}</span>
            </div>

            {(review.headline || review.bio || review.insurance_label) && (
              <div className="v6-admin-block">
                <strong>{review.headline || 'Perfil público'}</strong>
                {review.bio && <p>{review.bio}</p>}
                <small>
                  {review.years_experience || 0} años · {review.work_city || 'zona sin definir'} · {review.service_radius_km || 8} km · {review.insurance_label || 'sin matrícula/seguro'}
                </small>
              </div>
            )}

            <div className="v6-admin-chip-list">
              {review.services.map((service) => (
                <span key={service.service_id}>
                  {service.service_name}
                  {service.price_from ? ` · desde ${money(service.price_from)}` : ''}
                  {service.specialties.length ? ` · ${service.specialties.map((item) => item.specialty_name).join(', ')}` : ''}
                </span>
              ))}
              {!review.services.length && <span>Sin servicios declarados</span>}
            </div>

            <div className="v6-admin-documents">
              {review.documents.map((document) => (
                <div key={document.id}>
                  <button
                    className="v6-text-button"
                    type="button"
                    onClick={() => void openDocument(document)}
                  >
                    {document.label}
                  </button>
                  <span>{adminDocumentStatusLabel(document.status)}</span>
                  <div className="v6-actions-row compact">
                    <button
                      className="v6-secondary"
                      type="button"
                      disabled={busyKey === `${document.id}:approved`}
                      onClick={() => void reviewDocument(document, 'approved')}
                    >
                      Aprobar
                    </button>
                    <button
                      className="v6-secondary"
                      type="button"
                      disabled={busyKey === `${document.id}:observed`}
                      onClick={() => void reviewDocument(document, 'observed')}
                    >
                      Observar
                    </button>
                    <button
                      className="v6-danger"
                      type="button"
                      disabled={busyKey === `${document.id}:rejected`}
                      onClick={() => void reviewDocument(document, 'rejected')}
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              ))}
              {!review.documents.length && <p className="v6-muted">Todavía no cargó documentos.</p>}
            </div>

            <label className="v6-field">
              <span>Nota interna / observación</span>
              <textarea
                value={notes[review.professional_id] || ''}
                onChange={(event) =>
                  setNotes((current) => ({ ...current, [review.professional_id]: event.target.value }))
                }
                placeholder="Ej: falta DNI dorso legible, pedir matrícula..."
              />
            </label>
            <div className="v6-actions-row compact">
              <button
                className="v6-secondary"
                type="button"
                disabled={busyKey === `${review.professional_id}:in_review`}
                onClick={() => void reviewProfessional(review, 'in_review')}
              >
                En revisión
              </button>
              <button
                className="v6-primary"
                type="button"
                disabled={busyKey === `${review.professional_id}:approved`}
                onClick={() => void reviewProfessional(review, 'approved')}
              >
                Aprobar alta
              </button>
              <button
                className="v6-secondary"
                type="button"
                disabled={busyKey === `${review.professional_id}:observed`}
                onClick={() => void reviewProfessional(review, 'observed')}
              >
                Observar
              </button>
              <button
                className="v6-danger"
                type="button"
                disabled={busyKey === `${review.professional_id}:suspended`}
                onClick={() => void reviewProfessional(review, 'suspended')}
              >
                Suspender
              </button>
            </div>
          </article>
        ))}
        {!reviews.length && (
          <div className="v6-empty">
            <ShieldCheck size={24} aria-hidden="true" />
            <strong>No hay altas para revisar</strong>
            <p>Cuando un prestador envíe el alta, va a aparecer acá.</p>
          </div>
        )}
      </div>

      {settings.map((setting) => (
        <pre className="v6-admin-setting" key={setting.key}>{setting.key}: {JSON.stringify(setting.value, null, 2)}</pre>
      ))}
    </section>
  );
}

function adminOnboardingStatusLabel(status: V6ProfessionalOnboarding['status']) {
  const labels: Record<V6ProfessionalOnboarding['status'], string> = {
    draft: 'Borrador',
    submitted: 'Enviada',
    in_review: 'En revisión',
    approved: 'Aprobada',
    observed: 'Observada',
    rejected: 'Rechazada',
    suspended: 'Suspendida',
  };
  return labels[status] || status;
}

function adminDocumentStatusLabel(status: V6ProfessionalDocument['status']) {
  const labels: Record<V6ProfessionalDocument['status'], string> = {
    pending: 'Pendiente',
    uploaded: 'Cargado',
    approved: 'Aprobado',
    observed: 'Observado',
    rejected: 'Rechazado',
  };
  return labels[status] || status;
}

function adminReviewResultLabel(status: V6AdminReviewStatus) {
  const labels: Record<V6AdminReviewStatus, string> = {
    in_review: 'Alta marcada en revisión.',
    approved: 'Alta aprobada. El prestador ya puede recibir pedidos.',
    observed: 'Alta observada. El prestador debe corregirla.',
    rejected: 'Alta rechazada.',
    suspended: 'Prestador suspendido.',
  };
  return labels[status];
}

function adminDocumentResultLabel(status: 'approved' | 'observed' | 'rejected') {
  const labels = {
    approved: 'Documento aprobado.',
    observed: 'Documento observado.',
    rejected: 'Documento rechazado.',
  };
  return labels[status];
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
        <p className="v6-chat-protection">
          Usá este chat para coordinar pagos, horarios y adicionales. Lo acordado acá queda registrado para Protección MANITO.
        </p>
        <div className="v6-chat-shortcuts" aria-label="Mensajes rápidos">
          <button
            type="button"
            onClick={() =>
              setBody(
                profile.role === 'client'
                  ? 'Hola, confirmo el pedido por acá. ¿Me pasás horario estimado y cómo coordinamos el pago?'
                  : 'Hola, acepto coordinar este pedido por MANITO. Te confirmo horario estimado y próximos pasos por acá.',
              )
            }
          >
            Coordinar
          </button>
          {order.payment_method === 'wallet' && (
            <button
              type="button"
              onClick={() =>
                setBody(
                  profile.role === 'client'
                    ? 'Prefiero pagar con Cuenta DNI / billetera. ¿Me compartís el QR o link cuando corresponda?'
                    : 'Te comparto mi QR o link de Cuenta DNI / billetera por este chat para que quede registrado.',
                )
              }
            >
              Pago billetera
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              setBody('Cualquier adicional lo aprobamos desde el pedido antes de hacerlo, así queda cubierto por MANITO.')
            }
          >
            Adicionales
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
          <input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Escribí un mensaje" />
          <button type="submit" aria-label="Enviar mensaje">
            <SendHorizontal size={18} aria-hidden="true" />
          </button>
        </form>
      </section>
    </div>
  );
}

function HeaderLocationSheet({
  profile,
  savingPhoneLocation,
  onUsePhoneLocation,
  onClose,
  onSave,
  setError,
}: {
  profile: V6Profile;
  savingPhoneLocation: boolean;
  onUsePhoneLocation: () => Promise<void>;
  onClose: () => void;
  onSave: (city: string, detail: string) => Promise<void>;
  setError: (message: string) => void;
}) {
  const initial = splitStoredAddress(profile.city || '', '');
  const [city, setCity] = useState(initial.city || initial.line || '');
  const [detail, setDetail] = useState(initial.city ? initial.line : '');
  const [locationId, setLocationId] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!city.trim()) {
      setError('Ingresá una ciudad para guardar la ubicación.');
      return;
    }
    setSaving(true);
    try {
      await onSave(city.trim(), detail.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos guardar la ubicación.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="v6-modal" role="dialog" aria-modal="true" aria-label="Configurar ubicación">
      <section className="v6-sheet v6-location-sheet">
        <div className="v6-section-head">
          <div><h2>Tu ubicación</h2><span>Se usa como punto de partida para tus pedidos.</span></div>
          <button className="v6-icon-button" type="button" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <button className="v6-location-action" type="button" disabled={savingPhoneLocation} onClick={() => void onUsePhoneLocation()}>
          <LocateFixed size={20} aria-hidden="true" />
          <span><strong>{savingPhoneLocation ? 'Buscando ubicación...' : 'Usar ubicación del teléfono'}</strong><small>Te pediremos permiso sólo ahora.</small></span>
        </button>
        <div className="v6-divider-label"><span>o ingresala manualmente</span></div>
        <form className="v6-stack" onSubmit={submit}>
          <MatchingLocation value={locationId} onChange={(id, name) => { setLocationId(id); if (name) setCity(name); }} />
          <label className="v6-field"><span>Ciudad</span><input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Ej: Mar del Plata" required /></label>
          <label className="v6-field"><span>Barrio o referencia (opcional)</span><input value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Ej: Constitución" /></label>
          <button className="v6-primary" type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar ubicación'}</button>
        </form>
      </section>
    </div>
  );
}

function NotificationPanel({
  notifications,
  onClose,
  onOpenOrder,
}: {
  notifications: V6Notification[];
  onClose: () => void;
  onOpenOrder: (orderId: string) => void;
}) {
  return (
    <section className="v6-notification-panel">
      <div className="v6-section-head compact">
        <div>
          <h2>Notificaciones</h2>
          <span>{notifications.length ? `${notifications.length} recientes` : 'sin avisos'}</span>
        </div>
        <button className="v6-icon-button" type="button" onClick={onClose} aria-label="Cerrar notificaciones">
          ×
        </button>
      </div>
      <div className="v6-notification-list">
        {notifications.map((item) => (
          <button
            className={item.read_at ? 'read' : ''}
            type="button"
            key={item.id}
            onClick={() => item.order_id && onOpenOrder(item.order_id)}
          >
            <strong>{item.title}</strong>
            {item.body && <span>{item.body}</span>}
            <small>{shortDate(item.created_at)}</small>
          </button>
        ))}
        {!notifications.length && (
          <Empty title="Todo tranquilo" body="Acá van a aparecer presupuestos, chats, pagos y cambios de estado." />
        )}
      </div>
    </section>
  );
}

function StatusSteps({ status }: { status: V6OrderStatus }) {
  if (isOpenOpportunityStatus(status) || status === 'cancelled' || status === 'matching_failed') return null;
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
