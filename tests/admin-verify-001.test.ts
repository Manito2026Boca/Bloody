import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260917212317_admin_verify_001_review_queue.sql'),
  'utf8',
).toLowerCase();
const inbox = readFileSync(join(process.cwd(), 'app/components/AdminVerificationInbox.tsx'), 'utf8');
const adminPage = readFileSync(join(process.cwd(), 'app/admin/AdminPageClient.tsx'), 'utf8');
const styles = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

describe('ADMIN-VERIFY-001 professional verification inbox', () => {
  it('uses an admin-gated, paginated summary queue and lazy detail RPC', () => {
    expect(migration).toContain('function public.list_admin_professional_review_queue');
    expect(migration).toContain('function public.get_admin_professional_review');
    expect(migration).toContain('if not private.is_manito_admin() then');
    expect(migration).toContain('limit v_limit offset v_offset');
    expect(migration).toContain('count(*) over()');
    expect(migration).toContain("set search_path = ''");
  });

  it('keeps verification RPCs unavailable to PUBLIC and anon', () => {
    expect(migration).toContain('revoke all on function public.list_admin_professional_review_queue(text,text,bigint,text,text,integer,integer) from public, anon');
    expect(migration).toContain('revoke all on function public.get_admin_professional_review(uuid) from public, anon');
    expect(migration).toContain('grant execute on function public.list_admin_professional_review_queue(text,text,bigint,text,text,integer,integer) to authenticated');
  });

  it('records document and onboarding decisions without exposing the audit table', () => {
    expect(migration).toContain('private.professional_verification_events');
    expect(migration).toContain("'document_status'");
    expect(migration).toContain("'onboarding_status'");
    expect(migration).toContain('revoke all on table private.professional_verification_events from public, anon, authenticated');
  });

  it('separates viewing a private document from review actions', () => {
    expect(inbox).toContain('Ver documento');
    expect(inbox).toContain('Acceso privado temporal');
    expect(inbox).toContain("document.file_path.startsWith('http')");
    expect(inbox).toContain("decideDocument(document, 'approved')");
    expect(inbox).toContain("decideDocument(document, 'observed')");
    expect(inbox).toContain("decideDocument(document, 'rejected')");
  });

  it('provides active/resolved navigation, filters and master-detail navigation', () => {
    expect(inbox).toContain('Necesitan acción');
    expect(inbox).toContain('Resueltas');
    expect(inbox).toContain('Buscar nombre, email o rubro');
    expect(inbox).toContain('Solicitud {selectedIndex + 1} de {rows.length}');
    expect(adminPage).toContain('<AdminVerificationInbox setNotice={setNotice} />');
  });

  it('uses explicit correction language and individual final decisions', () => {
    expect(inbox).toContain('Solicitar corrección');
    expect(inbox).toContain('Solicitar correcciones');
    expect(inbox).toContain('Aprobar alta');
    expect(inbox).toContain('Rechazar alta');
    expect(inbox).not.toContain('Aprobar seleccionados');
  });

  it('uses a mobile list-to-detail layout instead of squeezing both panes', () => {
    expect(styles).toContain('.admin-verification.has-selection .admin-queue');
    expect(styles).toContain('.admin-verification:not(.has-selection) .admin-detail');
    expect(inbox).toContain("window.matchMedia('(max-width: 719px)').matches");
    expect(inbox).toContain('Volver a solicitudes');
  });
});
