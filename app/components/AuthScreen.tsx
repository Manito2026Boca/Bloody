'use client';

import { Eye, LogIn, Mail, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { MIN_PASSWORD_LENGTH, passwordHelpText, passwordSecurityMessage } from '../lib/security';
import { requireSupabase } from '../lib/supabaseClient';

type AuthMode = 'login' | 'signup' | 'reset';

export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = requireSupabase();
      const cleanEmail = email.trim().toLowerCase();

      if (mode === 'login') {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (loginError) throw loginError;
      }

      if (mode === 'signup') {
        const passwordError = passwordSecurityMessage(password, cleanEmail);
        if (passwordError) {
          setError(passwordError);
          return;
        }

        const { error: signupError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
              phone,
            },
            emailRedirectTo:
              typeof window !== 'undefined' ? window.location.origin : '/',
          },
        });
        if (signupError) throw signupError;
        setMessage(
          'Registro creado. Si tu proyecto exige verificacion, revisa tu email antes de ingresar.',
        );
      }

      if (mode === 'reset') {
        const { error: resetError } =
          await supabase.auth.resetPasswordForEmail(cleanEmail, {
            redirectTo:
              typeof window !== 'undefined' ? window.location.origin : '/',
          });
        if (resetError) throw resetError;
        setMessage('Te enviamos el link para recuperar tu contrasena.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo ingresar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell auth-wrap">
      <section className="panel auth-panel" aria-labelledby="auth-title">
        <div className="auth-mark" aria-hidden="true">
          M
        </div>
        <p className="pill orange">Argentina primero</p>
        <h1 id="auth-title" className="hero-greeting">
          MANITO
        </h1>
        <p className="muted">
          Pedir, aceptar, seguir y resolver servicios del hogar con Supabase en
          tiempo real.
        </p>

        <div className="mode-tabs" style={{ margin: '18px 0' }}>
          <button
            type="button"
            aria-pressed={mode === 'login'}
            onClick={() => setMode('login')}
          >
            Login
          </button>
          <button
            type="button"
            aria-pressed={mode === 'signup'}
            onClick={() => setMode('signup')}
          >
            Registro
          </button>
          <button
            type="button"
            aria-pressed={mode === 'reset'}
            onClick={() => setMode('reset')}
          >
            Recuperar
          </button>
        </div>

        <form className="field-grid" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="field-grid two">
              <label className="field">
                <span>Nombre</span>
                <input
                  className="input"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  autoComplete="given-name"
                  required
                />
              </label>
              <label className="field">
                <span>Apellido</span>
                <input
                  className="input"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  autoComplete="family-name"
                  required
                />
              </label>
              <label className="field">
                <span>Telefono</span>
                <input
                  className="input"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  autoComplete="tel"
                />
              </label>
            </div>
          )}

          <label className="field">
            <span>Email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          {mode !== 'reset' && (
            <label className="field">
              <span>Contrasena</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
              {mode === 'signup' && <small>{passwordHelpText()}</small>}
            </label>
          )}

          {error && <p className="alert">{error}</p>}
          {message && <p className="alert">{message}</p>}

          <button className="primary-button" type="submit" disabled={loading}>
            {mode === 'login' && <LogIn size={18} aria-hidden="true" />}
            {mode === 'signup' && <UserPlus size={18} aria-hidden="true" />}
            {mode === 'reset' && <Mail size={18} aria-hidden="true" />}
            {loading ? 'Procesando...' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : 'Enviar email'}
          </button>
        </form>

        <p className="muted" style={{ marginTop: 14 }}>
          <Eye size={15} aria-hidden="true" /> El frontend usa solo
          publishable key; los permisos viven en RLS.
        </p>
      </section>
    </main>
  );
}
