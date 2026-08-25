import { Database, ShieldCheck } from 'lucide-react';

export default function SetupNotice() {
  return (
    <main className="app-shell auth-wrap">
      <section className="panel auth-panel" aria-labelledby="setup-title">
        <div className="auth-mark" aria-hidden="true">
          M
        </div>
        <p className="pill blue">
          <Database size={14} aria-hidden="true" /> Supabase pendiente
        </p>
        <h1 id="setup-title" className="hero-greeting">
          Conecta MANITO a Supabase
        </h1>
        <p className="muted">
          Esta entrega no trae datos falsos. Para activar Auth, pedidos y
          realtime, completa las variables publicas y aplica la migracion.
        </p>

        <div className="surface" style={{ marginTop: 16 }}>
          <code>NEXT_PUBLIC_SUPABASE_URL</code>
          <br />
          <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>
        </div>

        <p className="alert" style={{ marginTop: 14 }}>
          <ShieldCheck size={16} aria-hidden="true" /> No agregues
          service_role ni secretos administrativos al frontend.
        </p>
      </section>
    </main>
  );
}
