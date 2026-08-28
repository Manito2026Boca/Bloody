'use client';

import { LogOut, Save } from 'lucide-react';
import { useState } from 'react';
import { updateProfile } from '../lib/api';
import { requireSupabase } from '../lib/supabaseClient';
import type { Profile } from '../lib/types';

type Props = {
  profile: Profile;
  onProfileChange: (profile: Profile) => void;
};

export default function AccountPanel({ profile, onProfileChange }: Props) {
  const [firstName, setFirstName] = useState(profile.first_name);
  const [lastName, setLastName] = useState(profile.last_name);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [dni, setDni] = useState(profile.dni ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await updateProfile(profile.id, {
        first_name: firstName,
        last_name: lastName,
        phone,
        dni,
      });
      onProfileChange(updated);
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar.');
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await requireSupabase().auth.signOut();
  }

  return (
    <section className="panel" aria-labelledby="account-title">
      <h1 id="account-title">Cuenta</h1>
      <p className="muted">
        Tus datos de perfil se guardan separados de los permisos administrativos.
      </p>

      <form className="field-grid" onSubmit={handleSave}>
        <div className="field-grid two">
          <label className="field">
            <span>Nombre</span>
            <input
              className="input"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Apellido</span>
            <input
              className="input"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Teléfono</span>
            <input
              className="input"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          <label className="field">
            <span>DNI</span>
            <input
              className="input"
              value={dni}
              onChange={(event) => setDni(event.target.value)}
            />
          </label>
        </div>

        {error && <p className="alert">{error}</p>}
        {saved && <p className="alert">Perfil actualizado.</p>}

        <button className="secondary-button" type="submit" disabled={loading}>
          <Save size={18} aria-hidden="true" />
          {loading ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>

      <button
        className="ghost-button"
        type="button"
        onClick={logout}
        style={{ marginTop: 12 }}
      >
        <LogOut size={18} aria-hidden="true" /> Cerrar sesión
      </button>
    </section>
  );
}
