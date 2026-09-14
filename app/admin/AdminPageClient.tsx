'use client';

import { useEffect, useState } from 'react';
import { AdminReviewWorkbench } from '../components/ManitoV6App';
import {
  getV6MyCapabilities,
  listV6AdminComplaintReviews,
  listV6AdminProfessionalReviews,
  listV6AdminSettings,
} from '../lib/v6Api';
import { getV6Supabase } from '../lib/v6Supabase';
import type {
  V6AdminComplaintReview,
  V6AdminProfessionalReview,
  V6AdminSetting,
} from '../lib/v6Types';

export default function AdminPageClient() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [reviews, setReviews] = useState<V6AdminProfessionalReview[]>([]);
  const [complaints, setComplaints] = useState<V6AdminComplaintReview[]>([]);
  const [settings, setSettings] = useState<V6AdminSetting[]>([]);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data } = await getV6Supabase().auth.getSession();
        if (!data.session) return;
        const capabilities = await getV6MyCapabilities();
        if (!active || !capabilities.admin) return;
        setAuthorized(true);
        const [nextReviews, nextComplaints, nextSettings] = await Promise.all([
          listV6AdminProfessionalReviews(),
          listV6AdminComplaintReviews(),
          listV6AdminSettings(),
        ]);
        if (!active) return;
        setReviews(nextReviews);
        setComplaints(nextComplaints);
        setSettings(nextSettings);
      } catch {
        if (active) setAuthorized(false);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) {
    return <main className="v6-app v6-center"><section className="v6-card"><strong>Verificando acceso...</strong></section></main>;
  }

  if (!authorized) {
    return (
      <main className="v6-app v6-center">
        <section className="v6-card v6-stack">
          <h1>Acceso restringido</h1>
          <p>Este panel está disponible únicamente para administradores MANITO.</p>
          <a className="v6-primary" href="/">Volver a MANITO</a>
        </section>
      </main>
    );
  }

  return (
    <main className="v6-app">
      <header className="v6-top">
        <div><strong>MANITO</strong><p>Panel administrativo</p></div>
        <a className="v6-secondary" href="/">Volver a la app</a>
      </header>
      <div className="v6-content">
        {notice && <button className="v6-toast" type="button" onClick={() => setNotice('')}>{notice}</button>}
        <AdminReviewWorkbench
          reviews={reviews}
          complaints={complaints}
          settings={settings}
          setReviews={setReviews}
          setComplaints={setComplaints}
          setNotice={setNotice}
        />
      </div>
    </main>
  );
}
