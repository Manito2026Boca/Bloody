import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260919134802_workroom_001_shared_context.sql'), 'utf8').toLowerCase();
const component = readFileSync(join(process.cwd(), 'app/components/Workroom.tsx'), 'utf8');
const api = readFileSync(join(process.cwd(), 'app/lib/v6Api.ts'), 'utf8');
const app = readFileSync(join(process.cwd(), 'app/components/ManitoV6App.tsx'), 'utf8');
const styles = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

describe('WORKROOM-001 shared work context', () => {
  it('creates isolated rooms for contracted work and each proposal', () => {
    expect(migration).toContain('unique (order_id, professional_id)');
    expect(migration).toContain("phase text not null check (phase in ('precontractual', 'contracted'))");
    expect(migration).toContain('create trigger trg_workroom_proposal_sync');
    expect(migration).toContain('create trigger trg_workroom_order_sync');
    expect(migration).toContain("professional_id <> new.professional_id");
  });

  it('keeps business events derived from their source entities and never selects PINs', () => {
    expect(migration).toContain('from public.order_extras e');
    expect(migration).toContain('from public.payments p');
    expect(migration).toContain("to_jsonb(o) - 'start_pin' - 'end_pin'");
    const timeline = migration.slice(migration.indexOf('function public.list_workroom_timeline'), migration.indexOf('function public.mark_workroom_read'));
    expect(timeline).not.toContain('start_pin');
    expect(timeline).not.toContain('end_pin');
  });

  it('uses private image storage and participant-only access', () => {
    expect(migration).toContain("values ('manito-workroom', 'manito-workroom', false");
    expect(migration).toContain('workroom_media_select_participant');
    expect(migration).toContain('public.can_access_workroom');
    expect(api).toContain("storage.from('manito-workroom')");
  });

  it('supports durable unread state, pagination, realtime and idempotent sends', () => {
    expect(migration).toContain('create table public.workroom_reads');
    expect(migration).toContain('function public.mark_workroom_read');
    expect(migration).toContain('p_before timestamptz default null');
    expect(migration).toContain('idx_messages_sender_nonce');
    expect(api).toContain("table: 'messages'");
    expect(api).toContain('filter: `workroom_id=eq.${workroomId}`');
  });

  it('provides text, image, retry and read-only history UX', () => {
    expect(component).toContain("accept=\"image/jpeg,image/png,image/webp\"");
    expect(component).toContain('Reintentar envío');
    expect(component).toContain('Ver mensajes anteriores');
    expect(component).toContain('Esta conversación quedó guardada como historial.');
    expect(component).toContain('<AgreementSummary');
  });

  it('opens the exact room from notifications and clears it with session state', () => {
    expect(app).toContain("item.entity_type === 'workroom' ? item.entity_id : null");
    expect(app).toContain('getV6WorkroomOrder(item.entity_id)');
    expect(app.match(/setChatWorkroomId\(null\)/g)?.length || 0).toBeGreaterThanOrEqual(3);
  });

  it('uses a bounded mobile sheet with a dedicated scrolling timeline', () => {
    expect(styles).toContain('height: 100dvh');
    expect(styles).toContain('.v6-workroom-timeline');
    expect(styles).toContain('overflow-y: auto');
    expect(styles).toContain('env(safe-area-inset-bottom)');
  });
});
