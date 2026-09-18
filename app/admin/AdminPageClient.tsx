'use client';

import { useEffect, useState } from 'react';
import { AdminVerificationInbox } from '../components/AdminVerificationInbox';
import { ProtectionAdminCase } from '../components/ProtectionManito';
import {
  getV6MyCapabilities,
  listV6AdminComplaintReviews,
} from '../lib/v6Api';
import { getV6Supabase } from '../lib/v6Supabase';
import type {
  V6AdminComplaintReview,
} from '../lib/v6Types';

export default function AdminPageClient() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [complaints, setComplaints] = useState<V6AdminComplaintReview[]>([]);
  const [notice, setNotice] = useState('');
  const [section, setSection] = useState<'verifications' | 'protection'>('verifications');

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data } = await getV6Supabase().auth.getSession();
        if (!data.session) return;
        const capabilities = await getV6MyCapabilities();
        if (!active || !capabilities.admin) return;
        setAuthorized(true);
        const nextComplaints = await listV6AdminComplaintReviews();
        if (!active) return;
        setComplaints(nextComplaints);
      } catch {
        if (active) setAuthorized(false);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) {
    return <main className="v6-app v6-admin-app v6-center"><section className="v6-card"><strong>Verificando acceso...</strong></section></main>;
  }

  if (!authorized) {
    return (
      <main className="v6-app v6-admin-app v6-center">
        <section className="v6-card v6-stack">
          <h1>Acceso restringido</h1>
          <p>Este panel está disponible únicamente para administradores MANITO.</p>
          <a className="v6-primary" href="/">Volver a MANITO</a>
        </section>
      </main>
    );
  }

  return (
    <main className="v6-app v6-admin-app">
      <header className="v6-top">
        <div><strong>MANITO</strong><p>Panel administrativo</p></div>
        <a className="v6-secondary" href="/">Volver a la app</a>
      </header>
      <div className="v6-content">
        {notice && <button className="v6-toast" type="button" onClick={() => setNotice('')}>{notice}</button>}
        <nav className="admin-primary-nav" aria-label="Secciones administrativas">
          <button type="button" aria-current={section === 'verifications' ? 'page' : undefined} onClick={() => setSection('verifications')}>Verificaciones</button>
          <button type="button" aria-current={section === 'protection' ? 'page' : undefined} onClick={() => setSection('protection')}>Protección MANITO</button>
        </nav>
        {section === 'verifications' ? (
          <AdminVerificationInbox setNotice={setNotice} />
        ) : (
          <section className="v6-card v6-stack">
            <div className="v6-section-head"><div><h1>Protección MANITO</h1><p>Casos que requieren intervención administrativa.</p></div><span>{complaints.length}</span></div>
            <div className="v6-admin-review-list">
              {complaints.map((complaint) => (
                <ProtectionAdminCase
                  key={complaint.id}
                  item={complaint}
                  notify={setNotice}
                  refresh={async () => setComplaints(await listV6AdminComplaintReviews())}
                />
              ))}
              {!complaints.length && <p className="v6-muted">No hay casos de Protección abiertos.</p>}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
