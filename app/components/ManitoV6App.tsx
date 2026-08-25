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
  SendHorizontal,
  Settings,
  ShieldCheck,
  Star,
  UserCircle,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  acceptV6Order,
  advanceV6Order,
  cancelV6Order,
  completeV6Profile,
  createV6Order,
  getV6Profile,
  listV6Messages,
  listV6Orders,
  listV6ProfessionalServices,
  listV6Services,
  removeV6Channel,
  saveV6ProfessionalServices,
  sendV6Message,
  setV6Availability,
  subscribeV6Messages,
  subscribeV6Orders,
  updateV6Profile,
} from '../lib/v6Api';
import {
  clearStoredConfig,
  getV6Supabase,
  isV6SupabaseConfigured,
  saveStoredConfig,
} from '../lib/v6Supabase';
import type {
  V6Message,
  V6Mode,
  V6Order,
  V6OrderStatus,
  V6Profile,
  V6ProfessionalService,
  V6Role,
  V6Service,
} from '../lib/v6Types';
import { V6_MODE_LABEL, V6_STATUS_LABEL } from '../lib/v6Types';

type Tab = 'home' | 'orders' | 'profile' | 'account';
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
  'https://manito-v6-real.eaeb3861-253b-4861-ab40-75d3f3ded9cb.chatgpt.site';
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
          <p>{profile.role === 'professional' ? 'Profesional' : 'Cliente'}</p>
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
              setOrders={setOrders}
              setChatOrder={setChatOrder}
              setError={setError}
              setNotice={setNotice}
            />
          ))}

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

        {tab === 'account' && (
          <AccountPanel
            profile={profile}
            canInstall={Boolean(installPrompt) && !isStandalone}
            onInstall={installApp}
            setNotice={setNotice}
          />
        )}
      </div>

      <nav className="v6-bottom" aria-label="Navegacion principal">
        <NavButton active={tab === 'home'} onClick={() => setTab('home')} icon={<Home size={18} />}>
          Inicio
        </NavButton>
        <NavButton
          active={tab === 'orders'}
          onClick={() => setTab('orders')}
          icon={<BriefcaseBusiness size={18} />}
        >
          {profile.role === 'professional' ? 'Trabajos' : 'Pedidos'}
        </NavButton>
        <NavButton
          active={tab === 'profile'}
          onClick={() => setTab('profile')}
          icon={<UserCircle size={18} />}
        >
          Perfil
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
          emailRedirectTo: getAuthRedirectUrl(),
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
  setOrders,
  setChatOrder,
  setError,
  setNotice,
}: {
  profile: V6Profile;
  services: V6Service[];
  clientOrders: V6Order[];
  setOrders: (orders: V6Order[]) => void;
  setChatOrder: (order: V6Order) => void;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
}) {
  const [selectedService, setSelectedService] = useState<V6Service | null>(null);
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

  function saveAddress() {
    if (!address.trim()) {
      setError('Escribi una direccion para guardarla.');
      return;
    }
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
    setNotice('Direccion guardada.');
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

  return (
    <>
      <section className="v6-hero">
        <p className="v6-live">
          <CircleDot size={14} aria-hidden="true" /> Backend conectado
        </p>
        <h1>Hola {profile.full_name || 'Jeremias'}, que necesitas resolver?</h1>
        <p>Publica un pedido real. Un profesional conectado desde otro dispositivo puede aceptarlo.</p>
      </section>

      <section className="v6-section">
        <div className="v6-section-head">
          <h2>Servicios</h2>
          <span>{services.length} disponibles</span>
        </div>
        <div className="v6-services">
          {services.map((service) => (
            <button
              className="v6-service"
              type="button"
              aria-pressed={selectedService?.id === service.id}
              key={service.id}
              onClick={() => setSelectedService(service)}
            >
              <span>{serviceIcon(service.slug)}</span>
              <strong>{service.name}</strong>
              <small>Desde {money(service.base_price)}</small>
            </button>
          ))}
        </div>
      </section>

      {selectedService && (
        <section className="v6-card">
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
            <label className="v6-field">
              <span>Modalidad</span>
              <select value={mode} onChange={(event) => setMode(event.target.value as V6Mode)}>
                {(['immediate', 'scheduled', 'quote'] as const).map((item) => (
                  <option value={item} key={item}>{V6_MODE_LABEL[item]}</option>
                ))}
              </select>
            </label>
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
          matchingOrders.map((order) => (
            <article className="v6-order" key={order.id}>
              <div className="v6-order-top">
                <span className="v6-order-icon">{serviceIcon(order.service?.slug || '')}</span>
                <div>
                  <strong>{order.service?.name || 'Servicio'}</strong>
                  <p>{order.description}</p>
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
          ))}
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
      )}
    </>
  );
}

function AccountPanel({
  profile,
  canInstall,
  onInstall,
  setNotice,
}: {
  profile: V6Profile;
  canInstall: boolean;
  onInstall: () => void;
  setNotice: (message: string) => void;
}) {
  async function logout() {
    await getV6Supabase().auth.signOut();
  }

  function resetConfig() {
    clearStoredConfig();
    setNotice('Conexion borrada.');
    window.location.reload();
  }

  return (
    <>
      <section className="v6-account">
        <h1>{profile.full_name || 'Usuario MANITO'}</h1>
        <p>{profile.email} · {profile.role === 'professional' ? 'Cuenta profesional' : 'Cuenta cliente'}</p>
      </section>
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
