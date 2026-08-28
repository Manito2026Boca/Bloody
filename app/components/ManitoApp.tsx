'use client';

import type { Session } from '@supabase/supabase-js';
import {
  Bell,
  BriefcaseBusiness,
  Home,
  ShieldCheck,
  UserCircle,
  Wrench,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { getProfile } from '../lib/api';
import { isSupabaseConfigured, requireSupabase } from '../lib/supabaseClient';
import type { Profile, WorkspaceRole } from '../lib/types';
import AccountPanel from './AccountPanel';
import AdminPanel from './AdminPanel';
import AuthScreen from './AuthScreen';
import ClientHome from './ClientHome';
import ProfessionalHome from './ProfessionalHome';
import SetupNotice from './SetupNotice';

type PrimaryTab = 'home' | 'orders' | 'favorites' | 'account';

export default function ManitoApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<WorkspaceRole>('client');
  const [tab, setTab] = useState<PrimaryTab>('home');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    const supabase = requireSupabase();

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        if (data.session?.user.id) {
          return getProfile(data.session.user.id);
        }
        return null;
      })
      .then((loadedProfile) => {
        if (loadedProfile) {
          setProfile(loadedProfile);
          setRole(loadedProfile.default_workspace || 'client');
        }
      })
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : 'No se cargó sesión.'),
      )
      .finally(() => setLoading(false));

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        if (nextSession?.user.id) {
          void getProfile(nextSession.user.id).then((loadedProfile) => {
            if (loadedProfile) {
              setProfile(loadedProfile);
              setRole(loadedProfile.default_workspace || 'client');
            }
          });
        } else {
          setProfile(null);
          setRole('client');
        }
      },
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js');
    }
  }, []);

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (loading) {
    return (
      <main className="app-shell auth-wrap">
        <section className="panel auth-panel">
          <p className="pill">MANITO</p>
          <h1>Cargando sesión...</h1>
        </section>
      </main>
    );
  }
  if (!session) return <AuthScreen />;
  if (!profile) {
    return (
      <main className="app-shell auth-wrap">
        <section className="panel auth-panel">
          <p className="alert">
            {error || 'No se encontró el perfil. Revisá la migración de Auth.'}
          </p>
        </section>
      </main>
    );
  }

  function renderWorkspace(activeProfile: Profile, activeSession: Session) {
    if (tab === 'account') {
      return <AccountPanel profile={activeProfile} onProfileChange={setProfile} />;
    }

    if (role === 'professional') {
      return <ProfessionalHome profile={activeProfile} userId={activeSession.user.id} />;
    }

    if (role === 'admin') {
      return <AdminPanel profile={activeProfile} />;
    }

    return <ClientHome profile={activeProfile} userId={activeSession.user.id} />;
  }

  return (
    <main className="app-shell">
      <div className="mobile-frame">
        <header className="topbar">
          <div className="brand-mark">
            <span className="brand-icon" aria-hidden="true">
              M
            </span>
            <div>
              <p className="brand-title">MANITO</p>
              <p className="brand-subtitle">
                Servicios del hogar en tiempo real
              </p>
            </div>
          </div>
          <button
            className="icon-button"
            type="button"
            title="Notificaciones"
            aria-label="Notificaciones"
          >
            <Bell size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="layout-grid">
          <nav className="panel" aria-label="Cambiar rol">
            <div className="role-switcher">
              <button
                type="button"
                aria-pressed={role === 'client'}
                onClick={() => {
                  setRole('client');
                  setTab('home');
                }}
              >
                <Home size={17} aria-hidden="true" /> Cliente
              </button>
              <button
                type="button"
                aria-pressed={role === 'professional'}
                onClick={() => {
                  setRole('professional');
                  setTab('home');
                }}
              >
                <Wrench size={17} aria-hidden="true" /> Pro
              </button>
              <button
                type="button"
                aria-pressed={role === 'admin'}
                onClick={() => {
                  setRole('admin');
                  setTab('home');
                }}
              >
                <ShieldCheck size={17} aria-hidden="true" /> Admin
              </button>
            </div>

            <div
              className="bottom-nav"
              style={{ marginTop: 12 }}
              aria-label="Navegacion principal"
            >
              <button
                type="button"
                aria-current={tab === 'home' ? 'page' : undefined}
                onClick={() => setTab('home')}
              >
                <Home size={17} aria-hidden="true" /> Inicio
              </button>
              <button
                type="button"
                aria-current={tab === 'orders' ? 'page' : undefined}
                onClick={() => setTab('home')}
              >
                <BriefcaseBusiness size={17} aria-hidden="true" /> Pedidos
              </button>
              <button
                type="button"
                aria-current={tab === 'favorites' ? 'page' : undefined}
                onClick={() => setTab('home')}
              >
                <UserCircle size={17} aria-hidden="true" /> Favoritos
              </button>
              <button
                type="button"
                aria-current={tab === 'account' ? 'page' : undefined}
                onClick={() => setTab('account')}
              >
                <UserCircle size={17} aria-hidden="true" /> Cuenta
              </button>
            </div>
          </nav>

          {renderWorkspace(profile, session)}
        </div>
      </div>
    </main>
  );
}
