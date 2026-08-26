'use client';

import type { Session } from '@supabase/supabase-js';
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
  getV6ProfessionalOnboarding,
  getV6ProfessionalProfile,
  listV6AdminSettings,
  listV6ClientAddresses,
  listV6Messages,
  listV6OrderExtras,
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
type NavigatorWithStandalone = Navigator & { standalone?: boolean };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};
type SavedAddress = {
  id: string;
  label: string;
  line: string;
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
  { id: 'wallet', label: 'Billetera', icon: <Wallet size={17} aria-hidden="true" /> },
  { id: 'cash', label: 'Efectivo', icon: <Banknote size={17} aria-hidden="true" /> },
];
const featuredProfessionals: FeaturedProfessional[] = [
  {
    id: 'pro-martin',
    name: 'Martin Ledesma',
    trade: 'Plomeria y gas',
    rating: 4.9,
    jobs: 186,
    distance: '1,8 km',
    etaMinutes: 28,
    specialties: ['Urgencias', 'Perdidas', 'Termotanques'],
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
const onboardingSteps = [
  'Datos personales',
  'DNI frente',
  'DNI dorso',
  'Selfie',
  'Telefono',
  'Direccion',
  'CUIT/CUIL',
  'CBU o CVU',
  'Categoria principal',
  'Especialidades',
  'Tarifas',
  'Portfolio',
  'Seguro',
  'Antecedentes',
  'Terminos',
  'Revision MANITO',
];
const requiredDocuments = [
  { kind: 'dni_front', label: 'DNI frente' },
  { kind: 'dni_back', label: 'DNI dorso' },
  { kind: 'selfie', label: 'Selfie de verificacion' },
  { kind: 'tax', label: 'Constancia fiscal' },
  { kind: 'insurance', label: 'Seguro o matricula' },
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

function serviceIcon(slug: string) {
  if (slug === 'cerrajeria') return <KeyRound size={20} aria-hidden="true" />;
  if (slug === 'electricidad') return <PlugZap size={20} aria-hidden="true" />;
  return <Wrench size={20} aria-hidden="true" />;
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

function professionalForService(service: V6Service | null) {
  const slug = service?.slug || '';
  if (slug === 'electricidad') return featuredProfessionals[1];
  if (slug === 'plomeria' || slug === 'gas') return featuredProfessionals[0];
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

export default function ManitoV6App() {
  const [configured, setConfigured] = useState(() => isV6SupabaseConfigured());
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<V6Profile | null>(null);
  const [services, setServices] = useState<V6Service[]>([]);
  const [proServices, setProServices] = useState<V6ProfessionalService[]>([]);
  const [orders, setOrders] = useState<V6Order[]>([]);
  const [tab, setTab] = useState<Tab>('home');
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
      if (nextProfile.role === 'professional') {
        setProServices(await listV6ProfessionalServices(userId));
      } else {
        setProServices([]);
      }
    } finally {
      setProfileLoading(false);
    }
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
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : 'No se pudo iniciar.'),
      )
      .finally(() => setLoading(false));

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        if (nextSession?.user.id) {
          void loadData(nextSession.user.id).catch((caught) =>
            setError(caught instanceof Error ? caught.message : 'No se pudo cargar tu perfil.'),
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
    return (
      <main className="v6-app v6-center">
        <section className="v6-card">
          <p className="v6-alert">{error || 'No se encontro tu perfil.'}</p>
        </section>
      </main>
    );
  }

  const activeOrders =
    profile.role === 'professional' ? professionalOrders : clientOrders;

  return (
    <main className="v6-app">
      <header className="v6-top">
        <div>
          <strong>
            MANI<span>TO</span>
          </strong>
          <p className="v6-kicker">Tu ubicacion</p>
          <p className="v6-location">
            <MapPin size={13} aria-hidden="true" /> Av. Independencia 1845, Mar del Plata
          </p>
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
          (profile.role === 'professional' ? (
            <ProfessionalHome
              profile={profile}
              services={services}
              proServices={proServices}
              matchingOrders={matchingOrders}
              activeOrders={professionalOrders}
              setProfile={setProfile}
              setProServices={setProServices}
              setChatOrder={setChatOrder}
              setError={setError}
              setNotice={setNotice}
            />
          ) : (
            <ClientHome
              profile={profile}
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
              setClientProblemQuery((current) => current || service.name);
              setTab('home');
            }}
          />
        )}

        {tab === 'orders' && (
          <OrdersList
            profile={profile}
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
          {profile.role === 'professional' ? 'Trabajos' : 'Pedidos'}
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
          Para probar el circuito, usa una cuenta cliente y otra profesional.
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
  const [address, setAddress] = useState('Av. Constitucion 4580');
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
  const [photoNames, setPhotoNames] = useState<string[]>([]);
  const [paymentProfiles, setPaymentProfiles] = useState<V6PaymentProfile[]>([]);
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
  const filteredServices = !query.trim()
    ? services
    : scoreMatches.length
      ? scoreMatches
      : services.filter((service) =>
          normalizeText(`${service.name} ${service.slug}`).includes(query),
        );
  const recommendedProfessional = professionalForService(recommendedService);

  function scrollToRequestForm() {
    window.requestAnimationFrame(() => {
      requestFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

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
    if (!selectedService) {
      setError('Elegi un servicio.');
      return;
    }
    try {
      const orderDescription = [
        description,
        `Asignacion: ${
          assignmentMode === 'manual' && selectedProfessional
            ? `prefiero a ${selectedProfessional.name}`
            : 'automatica MANITO'
        }`,
        `Pago: ${paymentOptions.find((option) => option.id === paymentMethod)?.label}`,
        photoNames.length ? `Fotos cargadas: ${photoNames.join(', ')}` : null,
        'Garantia MANITO: 7 dias',
      ]
        .filter(Boolean)
        .join('\n');
      await createV6Order({
        clientId: profile.id,
        serviceId: selectedService.id,
        description: orderDescription,
        address,
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
      setOrders(await listV6Orders());
      setNotice('Pedido publicado. Ya puede verlo un profesional disponible.');
      setPhotoNames([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo publicar.');
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
      setError('Escribi una direccion para guardarla.');
      return;
    }
    try {
      const remoteAddress = await upsertV6ClientAddress({
        clientId: profile.id,
        label: addressLabel.trim() || 'Direccion',
        line: address.trim(),
        lat: coords?.lat || null,
        lng: coords?.lng || null,
      });
      const nextAddress: SavedAddress = {
        id: remoteAddress.id,
        label: remoteAddress.label,
        line: remoteAddress.line,
        lat: remoteAddress.lat,
        lng: remoteAddress.lng,
      };
      const nextAddresses = [nextAddress, ...savedAddresses.filter((item) => item.id !== nextAddress.id)].slice(0, 5);
      setSavedAddresses(nextAddresses);
      window.localStorage.setItem(savedAddressesKey(profile.id), JSON.stringify(nextAddresses));
      setNotice('Direccion guardada en tu cuenta.');
    } catch {
      const nextAddress: SavedAddress = {
        id: makeClientId('addr'),
        label: addressLabel.trim() || 'Direccion',
        line: address.trim(),
        lat: coords?.lat || null,
        lng: coords?.lng || null,
      };
      const nextAddresses = [nextAddress, ...savedAddresses].slice(0, 5);
      setSavedAddresses(nextAddresses);
      window.localStorage.setItem(savedAddressesKey(profile.id), JSON.stringify(nextAddresses));
      setNotice('Direccion guardada en este dispositivo.');
    }
  }

  function chooseSavedAddress(addressId: string) {
    const savedAddress = savedAddresses.find((item) => item.id === addressId);
    if (!savedAddress) return;
    setAddress(savedAddress.line);
    setAddressLabel(savedAddress.label);
    if (savedAddress.lat != null && savedAddress.lng != null) {
      setCoords({ lat: savedAddress.lat, lng: savedAddress.lng });
    }
  }

  function updatePhotos(files: FileList | null) {
    const nextFiles = Array.from(files || [])
      .slice(0, 3)
      .map((file) => file.name);
    setPhotoNames(nextFiles);
  }

  function applyRecommendation(service: V6Service, nextProblem = problemQuery) {
    const professional = professionalForService(service);
    setSelectedService(service);
    setProblemQuery(nextProblem);
    setDescription(nextProblem.trim() || `Necesito ayuda con ${service.name}.`);
    setAssignmentMode('manual');
    setSelectedProfessionalId(professional.id);
    setNotice(`${service.name} seleccionado. Completa los datos y publica el pedido.`);
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
    setNotice('Describi un poco mas el problema y MANITO te recomienda una categoria.');
  }

  function chooseService(service: V6Service) {
    setSelectedService(service);
    if (!problemQuery.trim()) {
      setProblemQuery(service.name);
    }
    setDescription((current) =>
      current.trim() && current !== 'Necesito un plomero.'
        ? current
        : `Necesito ayuda con ${service.name}.`,
    );
    setNotice(`${service.name} seleccionado. Completa el pedido.`);
    scrollToRequestForm();
  }

  function repeatLastOrder() {
    const lastOrder = clientOrders[0];
    if (!lastOrder) {
      setNotice('Todavia no hay pedidos para repetir. Elegi un servicio y creamos el primero.');
      scrollToRequestForm();
      return;
    }
    const lastService = services.find((service) => service.id === lastOrder.service_id) || null;
    if (lastService) setSelectedService(lastService);
    setDescription(lastOrder.description.split('\n')[0] || `Necesito ayuda con ${lastService?.name || 'un servicio'}.`);
    setAddress(lastOrder.address);
    setMode(lastOrder.mode);
    setPaymentMethod(
      lastOrder.payment_method === 'wallet' || lastOrder.payment_method === 'cash'
        ? lastOrder.payment_method
        : 'card',
    );
    setNotice('Copie tu ultimo pedido. Revisalo y publicalo de nuevo.');
    scrollToRequestForm();
  }

  function shareTracking() {
    const activeOrder = clientOrders.find((order) => !['completed', 'cancelled'].includes(order.status));
    if (!activeOrder) {
      setNotice('Cuando tengas un pedido en curso vas a poder compartir el seguimiento.');
      return;
    }
    onNavigate('orders');
    setNotice('Abri el pedido en curso para compartir su seguimiento.');
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
        <h1>Hola {profile.full_name || 'Jeremias'}, que necesitas resolver?</h1>
        <p>Publica un pedido real. Un profesional conectado desde otro dispositivo puede aceptarlo.</p>
      </section>

      <section className="v6-card v6-finder">
        <label className="v6-field">
          <span>Buscar por profesion o describir problema</span>
          <div className="v6-search-box">
            <Search size={18} aria-hidden="true" />
            <textarea
              value={problemQuery}
              onChange={(event) => setProblemQuery(event.target.value)}
              placeholder="Ej: pierde agua el bano, se corto la luz, necesito pintar una pared"
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
          {['Plomero', 'Electricista', 'Perdi la llave', 'No enfria el aire'].map((example) => (
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
              <strong>{recommendedService.name}</strong>
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
          <p className="v6-muted">No encontre una coincidencia exacta. Podes elegir un servicio abajo y describirlo igual.</p>
        )}
      </section>

      <section className="v6-section v6-flat-section">
        <div className="v6-section-head">
          <h2>Como lo necesitas?</h2>
          <span>elegi modalidad</span>
        </div>
        <div className="v6-mode-grid">
          {([
            { id: 'immediate', title: 'Ahora', body: 'Profesional disponible lo antes posible', icon: <PlugZap size={22} aria-hidden="true" /> },
            { id: 'scheduled', title: 'Programar', body: 'Elegi dia y horario', icon: <Clock size={22} aria-hidden="true" /> },
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
              <strong>{service.name}</strong>
              <small>Desde {money(service.base_price)}</small>
            </button>
          ))}
        </div>
      </section>

      {selectedService && (
        <section className="v6-card" ref={requestFormRef}>
          <h2>{selectedService.name}</h2>
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
                    {savedAddresses.length ? 'Elegir direccion' : 'Todavia no guardaste direcciones'}
                  </option>
                  {savedAddresses.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.label} - {item.line}
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
              <span>Direccion</span>
              <input value={address} onChange={(event) => setAddress(event.target.value)} required />
            </label>
            <div className="v6-actions-row">
              <button className="v6-secondary" type="button" onClick={captureLocation}>
                <LocateFixed size={17} aria-hidden="true" />
                {coords ? 'GPS capturado' : 'Usar GPS'}
              </button>
              <button className="v6-secondary" type="button" onClick={saveAddress}>
                <MapPin size={17} aria-hidden="true" />
                Guardar direccion
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
              <h2>Asignacion</h2>
              <span>{assignmentMode === 'manual' ? 'Elegis vos' : 'MANITO asigna'}</span>
            </div>
            <div className="v6-choice-grid">
              <button
                type="button"
                className="v6-choice"
                aria-pressed={assignmentMode === 'auto'}
                onClick={() => setAssignmentMode('auto')}
              >
                <Users size={18} aria-hidden="true" />
                Automatico
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
              <span>Metodo preferido</span>
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
                    <CreditCard size={15} aria-hidden="true" /> {payment.label}
                    {payment.last4 ? ` terminada en ${payment.last4}` : ''}
                  </span>
                ))}
              </div>
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
                <ShieldCheck size={17} aria-hidden="true" /> Garantia MANITO 7 dias
              </span>
              <strong>{money(estimatedPrice)}</strong>
              <small>ETA {etaText} - {paymentOptions.find((option) => option.id === paymentMethod)?.label}</small>
            </div>
            <button className="v6-primary" type="submit">
              Publicar pedido
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
            onClick={() => openAccountShortcut('En Cuenta dejamos visible la opcion de privacidad del telefono.')}
          >
            Ocultar telefono en chat
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
        {!clientOrders.length && <Empty title="Todavia no pediste nada" body="Elegi un servicio para crear el primer pedido real." />}
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
  const scoredServices = useMemo(
    () =>
      services
        .map((service) => ({ service, score: serviceScore(service, problemQuery) }))
        .sort((left, right) => right.score - left.score),
    [problemQuery, services],
  );
  const filteredServices = problemQuery.trim()
    ? scoredServices.filter((item) => item.score > 0).map((item) => item.service)
    : services;
  const visibleServices = filteredServices.length ? filteredServices : services;

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
          <h2>Categorias</h2>
          <span>{visibleServices.length} resultados</span>
        </div>
        <div className="v6-chip-row nowrap">
          <button type="button" aria-pressed={!problemQuery.trim()} onClick={() => setProblemQuery('')}>
            Todos
          </button>
          {services.slice(0, 7).map((service) => (
            <button type="button" key={service.id} onClick={() => setProblemQuery(service.name)}>
              {service.name}
            </button>
          ))}
        </div>
        <div className="v6-service-list">
          {visibleServices.map((service) => (
            <article className="v6-list-service" key={service.id}>
              <span>{service.name.slice(0, 2)}</span>
              <div>
                <strong>{service.name}</strong>
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
  if (slug === 'plomeria') return 'Perdidas, canerias, griferias, destapes y reparaciones generales.';
  if (slug === 'electricidad') return 'Cortes, tomas, termicas, luces y reparaciones electricas domiciliarias.';
  if (slug === 'limpieza') return 'Limpieza general, profunda, post obra y servicios por hora.';
  if (slug === 'gas') return 'Revision, perdidas, calefones, cocinas y trabajos con gasistas.';
  if (slug === 'cerrajeria') return 'Aperturas, cambios de cerradura y urgencias de acceso.';
  if (slug === 'pintura') return 'Pintura interior y exterior, retoques y ambientes completos.';
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
  setChatOrder: (order: V6Order) => void;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
}) {
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
      await acceptV6Order(orderId);
      setNotice('Trabajo aceptado. El cliente lo ve en tiempo real.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'El pedido ya no esta disponible.');
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
            <span>Comision MANITO</span>
          </article>
          <article>
            <strong>{money(netIncome)}</strong>
            <span>Neto estimado</span>
          </article>
          <article>
            <strong>{matchingOrders.length}</strong>
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
              {serviceIcon(service.slug)} {service.name}
            </button>
          ))}
        </div>
      </section>

      <section className="v6-section">
        <div className="v6-section-head">
          <h2>Pedidos disponibles</h2>
          <span>{matchingOrders.length} compatibles</span>
        </div>
        {profile.is_available &&
          matchingOrders.map((order) =>
            order.mode === 'quote' ? (
              <OrderCard
                key={order.id}
                order={order}
                profile={profile}
                setOrders={() => undefined}
                setChatOrder={setChatOrder}
                setError={setError}
                setNotice={setNotice}
              />
            ) : (
              <article className="v6-order" key={order.id}>
                <div className="v6-order-top">
                  <span className="v6-order-icon">{serviceIcon(order.service?.slug || '')}</span>
                  <div>
                    <strong>{order.service?.name || 'Servicio'}</strong>
                    <p>{order.description}</p>
                    <small>Match {proServices.some((item) => item.service_id === order.service_id) ? '96%' : '72%'} · {V6_MODE_LABEL[order.mode]}</small>
                    <small>
                      <MapPin size={13} aria-hidden="true" /> {order.address}
                    </small>
                  </div>
                  <b>{money(order.service?.base_price)}</b>
                </div>
                <button className="v6-primary" type="button" onClick={() => accept(order.id)}>
                  Aceptar trabajo
                </button>
              </article>
            ),
          )}
        {!profile.is_available && <Empty title="Estas desconectado" body="Activa Disponible para ver pedidos abiertos." />}
        {profile.is_available && !matchingOrders.length && <Empty title="No hay pedidos compatibles" body="Cuando un cliente publique uno de tus servicios aparecera aca." />}
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

function OrdersList(props: {
  profile: V6Profile;
  orders: V6Order[];
  setOrders: (orders: V6Order[]) => void;
  setChatOrder: (order: V6Order) => void;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
}) {
  return (
    <section className="v6-section">
      <div className="v6-section-head">
        <h2>{props.profile.role === 'professional' ? 'Mis trabajos' : 'Mis pedidos'}</h2>
        <span>{props.orders.length}</span>
      </div>
      {props.orders.map((order) => (
        <OrderCard key={order.id} order={order} {...props} />
      ))}
      {!props.orders.length && <Empty title="Todavia esta vacio" body="Los pedidos apareceran aca y se sincronizaran entre dispositivos." />}
    </section>
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

  useEffect(() => {
    let alive = true;
    Promise.all([
      listV6OrderProposals(order.id),
      listV6OrderExtras(order.id),
    ])
      .then(([nextProposals, nextExtras]) => {
        if (!alive) return;
        setProposals(nextProposals);
        setExtras(nextExtras);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [order.id]);

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
      setNotice('Adicional enviado para aprobacion.');
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
      setNotice('Calificacion enviada.');
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
        reason: 'Garantia MANITO',
        detail: complaintDetail,
      });
      setNotice('Reclamo abierto. MANITO revisa la garantia.');
      setComplaintDetail('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo abrir reclamo.');
    }
  }

  return (
    <article className="v6-order">
      <div className="v6-order-top">
        <span className="v6-order-icon">{serviceIcon(order.service?.slug || '')}</span>
        <div>
          <strong>{order.service?.name || 'Servicio'}</strong>
          <p>{order.address} · {shortDate(order.created_at)}</p>
          {other && <small>{profile.role === 'client' ? 'Profesional' : 'Cliente'}: {other.full_name || 'Usuario'}</small>}
          <Status status={order.status} />
        </div>
        <b>{money(order.price || order.service?.base_price)}</b>
      </div>
      <StatusSteps status={order.status} />
      <div className="v6-meta-row">
        <span><ShieldCheck size={14} aria-hidden="true" /> Garantia {order.guarantee_days || 7} dias</span>
        {order.payment_method && <span>Pago {order.payment_method}</span>}
        {order.eta_minutes && <span>ETA {order.eta_minutes} min</span>}
        {order.status === 'accepted' && <span>PIN inicio {order.start_pin || 'pendiente'}</span>}
      </div>
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
            <input value={complaintDetail} onChange={(event) => setComplaintDetail(event.target.value)} placeholder="Reclamo o garantia" />
            <button className="v6-danger" type="submit">Usar garantia</button>
          </form>
        </div>
      )}
      <div className="v6-actions">
        {profile.role === 'client' && ['open', 'accepted'].includes(order.status) && (
          <button className="v6-danger" type="button" onClick={cancel}>Cancelar</button>
        )}
        {order.professional_id && (
          <button className="v6-secondary" type="button" onClick={() => setChatOrder(order)}>
            <MessageCircle size={16} aria-hidden="true" /> Chat
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
  const [role, setRole] = useState<V6Role>(profile.role);
  const [professionalProfile, setProfessionalProfile] = useState<V6ProfessionalProfile | null>(null);
  const [onboarding, setOnboarding] = useState<V6ProfessionalOnboarding | null>(null);
  const [documents, setDocuments] = useState<V6ProfessionalDocument[]>([]);
  const [portfolio, setPortfolio] = useState<V6PortfolioItem[]>([]);
  const [headline, setHeadline] = useState('Tecnico verificado para urgencias del hogar');
  const [bio, setBio] = useState('Trabajo con turnos puntuales, presupuesto claro y garantia MANITO.');
  const [yearsExperience, setYearsExperience] = useState('3');
  const [insuranceLabel, setInsuranceLabel] = useState('Responsabilidad civil vigente');
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
    if (role !== 'professional') return;
    let alive = true;
    Promise.all([
      getV6ProfessionalProfile(profile.id),
      getV6ProfessionalOnboarding(profile.id),
      listV6ProfessionalDocuments(profile.id),
      listV6Portfolio(profile.id),
    ])
      .then(([nextProfessionalProfile, nextOnboarding, nextDocuments, nextPortfolio]) => {
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
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [profile.id, role]);

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
      const changedRole =
        role !== profile.role
          ? await completeV6Profile({ fullName, role, phone, city })
          : await updateV6Profile(profile.id, { full_name: fullName, phone, city });
      setProfile(changedRole);
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
      setProServices(await saveV6ProfessionalServices(profile.id, [...current], services));
      setNotice('Servicios guardados.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se guardaron servicios.');
    }
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
      });
      const nextOnboarding = await upsertV6ProfessionalOnboarding({
        professionalId: profile.id,
        status: onboarding?.status || 'draft',
        currentStep: Math.max(onboarding?.current_step || 1, 8),
        notes: 'Perfil publico iniciado por el profesional.',
      });
      setProfessionalProfile(nextProfile);
      setOnboarding(nextOnboarding);
      setNotice('Perfil profesional guardado.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Aplica la migracion V7 para guardar alta profesional.');
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
      setNotice(`${label} guardado para revision.`);
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
        notes: 'Alta enviada para revision.',
      }));
      setNotice('Alta enviada para revision MANITO.');
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

  return (
    <>
      <section className="v6-card">
        <h2>Perfil</h2>
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
          <label className="v6-field">
            <span>Tipo de cuenta</span>
            <select value={role} onChange={(event) => setRole(event.target.value as V6Role)}>
              <option value="client">Cliente</option>
              <option value="professional">Profesional</option>
            </select>
          </label>
          <button className="v6-primary" type="submit">
            <Save size={16} aria-hidden="true" /> Guardar perfil
          </button>
        </form>
      </section>

      {role === 'professional' && (
        <>
          <section className="v6-card">
            <div className="v6-section-head">
              <h2>Alta profesional</h2>
              <span>{onboarding?.status || 'borrador'} · paso {onboarding?.current_step || 1}/16</span>
            </div>
            <div className="v6-progress">
              <span style={{ width: `${((onboarding?.current_step || 1) / onboardingSteps.length) * 100}%` }} />
            </div>
            <div className="v6-step-grid">
              {onboardingSteps.map((step, index) => (
                <span className={index < (onboarding?.current_step || 1) ? 'done' : ''} key={step}>
                  {index + 1}. {step}
                </span>
              ))}
            </div>
            <button
              className="v6-primary"
              type="button"
              onClick={submitOnboarding}
              disabled={submittingOnboarding}
            >
              {submittingOnboarding ? 'Enviando...' : 'Enviar alta a revision'}
            </button>
          </section>

          <section className="v6-card">
            <h2>Perfil publico</h2>
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
                  <span>Anios de experiencia</span>
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
                  {serviceIcon(service.slug)} {service.name}
                </button>
              ))}
            </div>
          </section>
        </>
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
  const [paymentProfiles, setPaymentProfiles] = useState<V6PaymentProfile[]>([]);
  const [adminSettings, setAdminSettings] = useState<V6AdminSetting[]>([]);

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
    setNotice('Cuenta actualizada.');
  }

  async function addPayment(type: PaymentMethod) {
    try {
      await addV6PaymentProfile({
        profileId: profile.id,
        type,
        label: type === 'cash' ? 'Efectivo' : type === 'wallet' ? 'Billetera virtual' : 'Tarjeta personal',
        last4: type === 'card' ? '1234' : null,
      });
      setPaymentProfiles(await listV6PaymentProfiles(profile.id));
      setNotice('Medio de pago guardado.');
    } catch {
      setNotice('Aplica la migracion V7 para guardar medios de pago.');
    }
  }

  return (
    <>
      <section className="v6-account">
        <h1>{profile.full_name || 'Usuario MANITO'}</h1>
        <p>{profile.email} · {profile.role === 'professional' ? 'Cuenta profesional' : 'Cuenta cliente'}</p>
      </section>
      <section className="v6-card v6-account-cta">
        <h2>Tu cuenta de cliente</h2>
        <p>Guarda direcciones, favoritos, pedidos recurrentes y datos de facturacion.</p>
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
          <button className="v6-secondary" type="button" onClick={saveAccountPreferences}>
            Guardar cuenta
          </button>
        </div>
      </section>
      <section className="v6-card">
        <div className="v6-section-head">
          <h2>Pagos</h2>
          <span>{paymentProfiles.length}</span>
        </div>
        <div className="v6-choice-grid three">
          {paymentOptions.map((option) => (
            <button className="v6-choice" type="button" key={option.id} onClick={() => addPayment(option.id)}>
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
        <div className="v6-file-list">
          {paymentProfiles.map((payment) => (
            <span key={payment.id}>
              <CreditCard size={15} aria-hidden="true" /> {payment.label}
              {payment.last4 ? ` terminada en ${payment.last4}` : ''}
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
        <p>Crea tu perfil profesional, mostra que haces y empeza a recibir pedidos cuando tu cuenta sea aprobada.</p>
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
              <span>{adminSettings.length ? 'Config desde Supabase' : 'Pendiente de migracion V7'}</span>
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
          <LogOut size={17} aria-hidden="true" /> Cerrar sesion
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
            <span>{order.service?.name || 'Servicio'}</span>
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
