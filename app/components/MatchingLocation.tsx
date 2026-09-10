'use client';

import { useEffect, useId, useState } from 'react';
import { getV6Supabase } from '../lib/v6Supabase';

type Location = { id: string; name: string; region: string; country_code: string };

function useLocations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void getV6Supabase().from('service_locations').select('id,name,region,country_code')
      .eq('active', true).order('name').then(({ data, error }) => {
        if (!alive) return;
        if (error) setError('No pudimos cargar las localidades. Volvé a intentarlo.');
        else setLocations(data || []);
      });
    return () => { alive = false; };
  }, []);
  return { locations, error };
}

export function MatchingLocation({ value, onChange }: {
  value: string; onChange: (id: string, name: string) => void;
}) {
  const { locations, error } = useLocations();
  const id = useId();
  return <div className="v6-field">
    <label htmlFor={id}>Localidad del servicio</label>
    <select id={id} value={value} onChange={(e) => onChange(e.target.value, locations.find(l => l.id === e.target.value)?.name || '')}>
      <option value="">Elegí una localidad</option>
      {locations.map(l => <option key={l.id} value={l.id}>{l.name}, {l.region} ({l.country_code})</option>)}
    </select>
    {error && <small role="alert">{error}</small>}
  </div>;
}

export function ProfessionalCoverage({ professionalId }: { professionalId: string }) {
  const { locations, error } = useLocations();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let alive = true;
    void getV6Supabase().from('professional_service_locations').select('location_id')
      .eq('professional_id', professionalId).then(({ data, error }) => {
        if (!alive) return;
        if (error) setNotice('No pudimos cargar tu cobertura.');
        else { setSelected((data || []).map(x => x.location_id)); setBusy(false); }
      });
    return () => { alive = false; };
  }, [professionalId]);
  async function toggle(id: string) {
    setBusy(true); setNotice('');
    try {
      const removing = selected.includes(id);
      const query = getV6Supabase().from('professional_service_locations');
      const { error } = removing
        ? await query.delete().eq('professional_id', professionalId).eq('location_id', id)
        : await query.insert({ professional_id: professionalId, location_id: id });
      if (error) throw error;
      setSelected(current => removing ? current.filter(x => x !== id) : [...current, id]);
      setNotice('Cobertura guardada.');
    } catch { setNotice('No pudimos guardar tu cobertura. Probá nuevamente.'); }
    finally { setBusy(false); }
  }
  return <fieldset className="v6-stack">
    <legend>Localidades que cubrís completas sin GPS</legend>
    {locations.map(l => <label key={l.id} className="v6-toggle-row">
      <span>{l.name}, {l.region}</span>
      <input type="checkbox" checked={selected.includes(l.id)} disabled={busy} onChange={() => void toggle(l.id)} />
    </label>)}
    {(error || notice) && <small role="status">{error || notice}</small>}
  </fieldset>;
}

export function CompleteMatchingLocation({ orderId, onSaved }: { orderId: string; onSaved: () => void }) {
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try {
      const { error } = await getV6Supabase().rpc('complete_order_location', { p_order_id: orderId, p_location_id: location });
      if (error) throw error;
      onSaved();
    } catch { setError('No pudimos completar la ubicación. Probá nuevamente.'); }
    finally { setBusy(false); }
  }
  return <div className="v6-stack">
    <MatchingLocation value={location} onChange={setLocation} />
    <button type="button" className="v6-secondary" disabled={!location || busy} onClick={() => void save()}>Completar ubicación</button>
    {error && <small role="alert">{error}</small>}
  </div>;
}
