'use client';

import { useEffect, useRef, useState } from 'react';
import { isValidCuit, providerIdentityCopy, type OwnProviderIdentity } from '../lib/providerIdentity';
import { getMyProviderIdentity, submitProviderIdentity } from '../lib/providerIdentityApi';
import { getV6UserSecurityPreferences } from '../lib/v6Api';
import { usePwaForm } from './PwaUpdateProvider';

export function ProviderIdentityPanel({ profileId }: { profileId: string }) {
  const [identity, setIdentity] = useState<OwnProviderIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [cuit, setCuit] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const submitting = useRef(false);
  const safety = usePwaForm(`provider-identity:${profileId}`);
  useEffect(() => {
    let alive = true;
    void Promise.allSettled([getMyProviderIdentity(), getV6UserSecurityPreferences(profileId)]).then(([result, preferences]) => {
      if (!alive) return;
      setIdentity(result.status === 'fulfilled' ? result.value : null);
      // Legacy tax_id is only a draft. It grants NO verification/capability.
      if (result.status === 'fulfilled' && result.value.status === 'UNVERIFIED' && preferences.status === 'fulfilled') {
        setCuit(preferences.value?.tax_id || '');
      }
      setLoading(false);
    });
    return () => { alive = false; };
  }, [profileId]);
  const editable = identity?.can_submit === true;
  return <section className="v6-card" aria-label="Identidad profesional">
    <h2>Identidad profesional</h2>
    <p>{loading ? 'Cargando tu estado...' : providerIdentityCopy(identity)}</p>
    {identity?.masked_cuit && <p>CUIT {identity.masked_cuit}</p>}
    {!loading && !identity && <button className="v6-secondary" type="button" onClick={() => {
      void getMyProviderIdentity().then(setIdentity).catch(() => setMessage('No pudimos comprobar el estado.'));
    }}>Volver a comprobar</button>}
    {refreshNeeded && <button className="v6-secondary" type="button" onClick={() => {
      if (submitting.current || safety.blocked()) return;
      submitting.current = true; setBusy(true); safety.begin();
      void getMyProviderIdentity().then((next) => { setIdentity(next); setRefreshNeeded(false); setCuit(''); safety.saved(); setMessage('Estado actualizado.'); })
        .catch(() => { safety.failed(); setMessage('Los datos fueron enviados, pero no pudimos actualizar el estado. Volve a comprobar.'); })
        .finally(() => { submitting.current = false; setBusy(false); });
    }}>Comprobar estado</button>}
    {editable && <form className="v6-stack" data-pwa-tracked onSubmit={async (event) => {
      event.preventDefault();
      if (submitting.current || refreshNeeded || safety.blocked()) return;
      if (!isValidCuit(cuit)) { setMessage('Revisa los 11 digitos y el digito verificador del CUIT.'); return; }
      submitting.current = true; setBusy(true); safety.begin(); setMessage('');
      let sent = false;
      try {
        await submitProviderIdentity(cuit, recovery);
        sent = true;
        setIdentity(await getMyProviderIdentity());
        setCuit(''); safety.saved();
        setMessage('Recibimos tus datos para revision. Si necesitas recuperar una cuenta, solicita ayuda a MANITO.');
      } catch { safety.failed(); setRefreshNeeded(sent); setMessage(sent ? 'Los datos fueron enviados, pero no pudimos actualizar el estado. Volve a comprobar.' : 'No pudimos enviar los datos. Podes volver a intentar.'); }
      finally { submitting.current = false; setBusy(false); }
    }}>
      <label className="v6-field"><span>Tu CUIT personal</span><input disabled={busy || refreshNeeded} value={cuit} inputMode="numeric" autoComplete="off" maxLength={18} onChange={(event) => { setCuit(event.target.value); safety.dirty(); }} /></label>
      <label><input disabled={busy || refreshNeeded} type="checkbox" checked={recovery} onChange={(event) => { setRecovery(event.target.checked); safety.dirty(); }} /> Necesito recuperar mi cuenta profesional original</label>
      <button className="v6-primary" disabled={busy || refreshNeeded} type="submit">{busy ? 'Enviando...' : 'Enviar para revision'}</button>
    </form>}
    {message && <p role="status">{message}</p>}
  </section>;
}
