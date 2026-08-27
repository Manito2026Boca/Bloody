'use client';

import { CheckCircle2, Loader2, MailCheck, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { completeV6Profile } from '../lib/v6Api';
import { getV6Supabase } from '../lib/v6Supabase';
import type { V6Role } from '../lib/v6Types';

type ConfirmationState = 'loading' | 'success' | 'ready' | 'error';
type PendingProfile = {
  fullName: string;
  role?: V6Role;
};

type SupabaseAuthPayload = {
  user?: { email?: string | null } | null;
  session?: { user?: { email?: string | null } | null } | null;
};
const deployedAppUrl = 'https://bloody-eta.vercel.app';

function pendingProfileKey(email: string) {
  return `manito_v6_pending_profile:${email.toLowerCase()}`;
}

function readHashParams() {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.hash.replace(/^#/, ''));
}

async function completePendingProfile(email: string) {
  const raw = window.localStorage.getItem(pendingProfileKey(email));
  if (!raw) return;
  const pending = JSON.parse(raw) as PendingProfile;
  await completeV6Profile({ fullName: pending.fullName, role: pending.role || 'client' });
  window.localStorage.removeItem(pendingProfileKey(email));
}

function getConfirmedEmail(data: SupabaseAuthPayload | null | undefined) {
  return data?.user?.email || data?.session?.user?.email || null;
}

function isJwtTimingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes('jwt issued at future');
}

function friendlyConfirmationError(error: unknown) {
  if (isJwtTimingError(error)) {
    return 'Tu email fue validado, pero el celular parece tener la hora desfasada. Activá fecha y hora automática y tocá Entrar a MANITO.';
  }
  return 'No pudimos confirmar el enlace. Probá ingresar con tu email y contraseña.';
}

export default function AuthConfirmationScreen({
  canVerifyToken = false,
}: {
  canVerifyToken?: boolean;
}) {
  const [state, setState] = useState<ConfirmationState>('loading');
  const [message, setMessage] = useState('Estamos validando tu cuenta.');

  const appUrl = useMemo(() => {
    if (typeof window === 'undefined') return deployedAppUrl;
    const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (configuredUrl) return configuredUrl;
    if (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.endsWith('.chatgpt.site')
    ) {
      return deployedAppUrl;
    }
    return window.location.origin;
  }, []);

  useEffect(() => {
    let alive = true;

    async function confirm() {
      try {
        const supabase = getV6Supabase();
        const query = new URLSearchParams(window.location.search);
        const hash = readHashParams();
        const errorDescription =
          query.get('error_description') || hash.get('error_description');

        if (errorDescription) {
          throw new Error(errorDescription);
        }

        const code = query.get('code');
        const tokenHash = query.get('token_hash');
        const type = query.get('type') || 'signup';
        let confirmedEmail: string | null = null;

        if (canVerifyToken && tokenHash) {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as 'signup',
          });
          if (error) throw error;
          confirmedEmail = getConfirmedEmail(data);
        } else if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          confirmedEmail = getConfirmedEmail(data);
        } else if (hash.get('access_token')) {
          const { data } = await supabase.auth.getSession();
          confirmedEmail = getConfirmedEmail(data);
        } else {
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            if (!alive) return;
            setState('ready');
            setMessage('Tu email ya fue confirmado. Ingresá con tu cuenta para seguir.');
            return;
          }
          confirmedEmail = getConfirmedEmail(data);
        }

        if (!confirmedEmail) {
          try {
            const {
              data: { user },
              error: userError,
            } = await supabase.auth.getUser();
            if (userError) throw userError;
            confirmedEmail = user?.email || null;
          } catch (caught) {
            if (isJwtTimingError(caught)) {
              if (!alive) return;
              setState('success');
              setMessage(friendlyConfirmationError(caught));
              return;
            }
            throw caught;
          }
        }

        if (confirmedEmail) {
          try {
            await completePendingProfile(confirmedEmail);
          } catch (caught) {
            if (isJwtTimingError(caught)) {
              if (!alive) return;
              setState('success');
              setMessage(friendlyConfirmationError(caught));
              return;
            }
            throw caught;
          }
        }

        if (!alive) return;
        setState('success');
        setMessage('Tu cuenta fue confirmada. Ya podés entrar a MANITO.');
      } catch (caught) {
        if (!alive) return;
        if (isJwtTimingError(caught)) {
          setState('success');
          setMessage(friendlyConfirmationError(caught));
          return;
        }
        setState('error');
        setMessage(friendlyConfirmationError(caught));
      }
    }

    void confirm();

    return () => {
      alive = false;
    };
  }, [canVerifyToken]);

  return (
    <main className="v6-app v6-center">
      <section className="v6-card v6-confirm-card">
        <p className="v6-logo">
          MANI<span>TO</span>
        </p>
        <div className="v6-confirm-icon" aria-hidden="true">
          {state === 'loading' ? (
            <Loader2 className="v6-spin" size={30} />
          ) : state === 'error' ? (
            <RotateCcw size={30} />
          ) : state === 'ready' ? (
            <MailCheck size={30} />
          ) : (
            <CheckCircle2 size={30} />
          )}
        </div>
        <h1>
          {state === 'loading'
            ? 'Validando cuenta'
            : state === 'error'
              ? 'No se pudo validar'
              : 'Cuenta confirmada'}
        </h1>
        <p className={state === 'error' ? 'v6-alert' : 'v6-note'}>{message}</p>
        <a className="v6-primary v6-link-button" href={appUrl}>
          Entrar a MANITO
        </a>
      </section>
    </main>
  );
}
