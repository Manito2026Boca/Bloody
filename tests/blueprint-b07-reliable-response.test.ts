import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync('app/components/ManitoV6App.tsx', 'utf8');
const api = readFileSync('app/lib/v6Api.ts', 'utf8');
const push = readFileSync('app/lib/webPush.ts', 'utf8');
const worker = readFileSync('public/sw.js', 'utf8');
const migration = readFileSync('supabase/migrations/20260920153219_blueprint_b07_reliable_response.sql', 'utf8');
const opportunityMigration = readFileSync('supabase/migrations/20260920153449_blueprint_b07_opportunity_push.sql', 'utf8');
const edge = readFileSync('supabase/functions/deliver-web-push/index.ts', 'utf8');

describe('BLUEPRINT-B07 reliable response', () => {
  it('keeps exhausted searches recoverable without creating another order', () => {
    expect(api).toContain("rpc('retry_order_search'");
    expect(migration).toContain("v_order.status<>'matching_failed'");
    expect(migration).toContain('return private.start_immediate_matching_round_impl(v_order.id,true)');
    expect(migration).toContain("when mode='scheduled' then 'scheduled_open'");
    expect(migration).toContain("when mode='quote' then 'waiting_quotes'");
    expect(app).toContain('Volver a recibir propuestas');
    expect(app).toContain('No encontramos disponibilidad para ese horario.');
  });

  it('advances durable timeouts outside the browser', () => {
    expect(migration).toContain('private.process_b07_response_timeouts()');
    expect(migration).toContain('private.refresh_manual_order_request_impl(v_order_id)');
    expect(migration).toContain('private.expire_immediate_matching_impl(v_order_id)');
    expect(migration).toContain("'manito-b07-response-and-push','* * * * *'");
  });

  it('uses NOTIF-001 as the single logical source and an idempotent delivery outbox', () => {
    expect(migration).toContain('notification_id uuid not null references public.notifications(id)');
    expect(migration).toContain('unique (notification_id, subscription_id, channel, notification_version)');
    expect(migration).toContain('for update of d skip locked');
    expect(migration).toContain('on conflict do nothing');
    expect(migration).toContain("new.kind <> 'message_received'");
    expect(opportunityMigration).toContain("new.kind='order_created'");
    expect(opportunityMigration).toContain('Nueva oportunidad en MANITO');
  });

  it('keeps push secrets server-side and protects technical RPCs', () => {
    expect(push).toContain("rpc('get_web_push_public_key'");
    expect(push).not.toContain('private_key');
    expect(edge).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(migration).toContain("v.name='b07_vapid_private_key'");
    expect(migration).toContain('revoke all on function public.claim_push_deliveries(integer) from public,anon,authenticated');
    expect(migration).not.toMatch(/private_key['"\s]*[,=:]['"]?[A-Za-z0-9_-]{20}/);
  });

  it('asks permission only after a contextual user action and degrades safely', () => {
    expect(app).toContain('Activar avisos');
    expect(app).toContain('onClick={() => void activate()}');
    expect(push).toContain('Notification.requestPermission()');
    expect(push).toContain("return 'unsupported'");
    expect(push).toContain("return 'denied'");
  });

  it('uses private generic payloads and same-origin authorized deep links', () => {
    expect(migration).toContain("'url','/?notification='||n.id::text");
    expect(migration).not.toContain("n.address");
    expect(worker).toContain("payload.url.startsWith('/')");
    expect(worker).toContain('destination.origin !== self.location.origin');
    expect(app).toContain('getV6NotificationDestination(notificationId)');
    expect(app).toContain("cleanUrl.searchParams.delete('notification')");
  });

  it('removes the current-device subscription on logout and re-associates it after login', () => {
    expect(app).toContain('await disableWebPushForCurrentDevice().catch(() => undefined)');
    expect(app).toContain("webPushState() !== 'enabled'");
    expect(app).toContain('void syncExistingWebPush().catch(() => undefined)');
    expect(migration).toContain('user_id = excluded.user_id');
  });

  it('invalidates expired endpoints and never couples push to business transactions', () => {
    expect(edge).toContain('statusCode === 404 || statusCode === 410');
    expect(edge).toContain('expired ? "expired" : "failed"');
    expect(migration).toContain("if p_status='expired'");
    expect(migration).toContain('exception when others then');
  });
});
