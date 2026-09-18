import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { notificationActionLabel, notificationTimeLabel } from '../app/components/NotificationCenter';
import type { V6Notification } from '../app/lib/v6Types';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260918132216_notif_001_notification_center.sql'),
  'utf8',
).toLowerCase();
const actionStateMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260918132918_notif_001_action_state.sql'),
  'utf8',
).toLowerCase();
const app = readFileSync(join(process.cwd(), 'app/components/ManitoV6App.tsx'), 'utf8');
const center = readFileSync(join(process.cwd(), 'app/components/NotificationCenter.tsx'), 'utf8');
const styles = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

function notification(overrides: Partial<V6Notification> = {}): V6Notification {
  return {
    id: 'notification-1', recipient_id: 'recipient-1', actor_id: null,
    order_id: 'order-1', kind: 'order_status', title: 'Trabajo actualizado', body: '',
    read_at: null, archived_at: null, action_key: 'open_order', entity_type: 'order',
    entity_id: 'order-1', metadata: {}, dedupe_key: null, action_pending: false,
    created_at: '2026-09-18T12:00:00.000Z', ...overrides,
  };
}

describe('NOTIF-001 notification center', () => {
  it('separates durable read and archive state', () => {
    expect(migration).toContain('add column if not exists archived_at timestamptz');
    expect(migration).toContain('function public.mark_notification_read');
    expect(migration).toContain('function public.mark_all_notifications_read');
    expect(migration).toContain('function public.archive_notification');
  });

  it('removes broad notification UPDATE access and protects every mutation by recipient', () => {
    expect(migration).toContain('revoke update on public.notifications from authenticated');
    expect(migration).toContain('drop policy if exists notifications_update_own');
    expect(migration).toContain('where id = p_notification_id and recipient_id = v_uid');
    expect(migration).toContain("set search_path = ''");
  });

  it('uses durable event keys rather than visual-only deduplication', () => {
    expect(migration).toContain('uq_notifications_recipient_dedupe');
    expect(migration).toContain('on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing');
    expect(migration).toContain("'extra-created:' || new.id::text");
    expect(migration).toContain("'message-created:' || new.id::text");
    expect(center).not.toContain('.filter((item, index');
  });

  it('keeps opening the bell separate from marking notifications read', () => {
    expect(app).toContain('function toggleNotifications()');
    const toggle = app.slice(app.indexOf('function toggleNotifications()'), app.indexOf('async function markAllNotificationsRead()'));
    expect(toggle).not.toContain('markV6NotificationsRead');
    expect(app).toContain('markV6NotificationRead(item.id)');
  });

  it('limits the quick center and paginates history in batches of twenty', () => {
    expect(migration).toContain("p_view text default 'center'");
    expect(migration).toContain('limit v_limit offset v_offset');
    expect(center).toContain('const HISTORY_PAGE_SIZE = 20');
    expect(center).toContain('Ver todas');
  });

  it('provides specific action labels without preserving stale pending actions', () => {
    expect(notificationActionLabel(notification({ action_key: 'review_extra', action_pending: true }))).toBe('Revisar adicional');
    expect(notificationActionLabel(notification({ action_key: 'review_extra', action_pending: false }))).toBe('Ver estado');
    expect(notificationActionLabel(notification({ order_id: null }))).toBeNull();
    expect(actionStateMigration).toContain("op.status = 'sent'");
    expect(actionStateMigration).toContain('op.valid_until > now()');
  });

  it('moves an individually opened history item out of Nuevas immediately', () => {
    expect(center).toContain('function open(item: V6Notification)');
    expect(center).toContain('? { ...entry, read_at: readAt }');
    expect(center).toContain('onOpen(item)');
  });

  it('formats compact human timestamps', () => {
    const now = new Date('2026-09-18T12:05:00.000Z');
    expect(notificationTimeLabel('2026-09-18T12:04:30.000Z', now)).toBe('Ahora');
    expect(notificationTimeLabel('2026-09-18T12:01:00.000Z', now)).toBe('Hace 4 min');
    expect(notificationTimeLabel('2026-09-17T15:00:00.000Z', now)).toBe('Ayer');
  });

  it('uses a full-height mobile surface without a nested notification-list scroller', () => {
    expect(styles).toContain('inset: calc(54px + env(safe-area-inset-top)) 0 0');
    expect(styles).toContain('.v6-notification-feed { overflow: visible; }');
    expect(styles).not.toContain('.v6-notification-list { max-height: 100%');
  });
});
