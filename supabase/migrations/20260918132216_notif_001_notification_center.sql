-- NOTIF-001: compact attention center, durable read/archive state and event idempotency.

alter table public.notifications
  add column if not exists archived_at timestamptz,
  add column if not exists action_key text,
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists dedupe_key text;

alter table public.notifications
  drop constraint if exists notifications_metadata_object_check;
alter table public.notifications
  add constraint notifications_metadata_object_check
  check (jsonb_typeof(metadata) = 'object');

update public.notifications
set entity_type = 'order',
    entity_id = order_id::text,
    action_key = case
      when kind = 'manual_request' then 'open_direct_request'
      when kind = 'proposal_received' then 'compare_proposals'
      when kind = 'extra_requested' then 'review_extra'
      when kind = 'payment_status' then 'review_payment'
      when kind = 'message_received' then 'open_chat'
      when kind like 'complaint_%' then 'open_protection'
      else 'open_order'
    end
where order_id is not null
  and (entity_type is null or entity_id is null or action_key is null);

create index if not exists idx_notifications_center
  on public.notifications(recipient_id, archived_at, created_at desc);

create index if not exists idx_notifications_unread
  on public.notifications(recipient_id, created_at desc)
  where read_at is null;

create unique index if not exists uq_notifications_recipient_dedupe
  on public.notifications(recipient_id, dedupe_key)
  where dedupe_key is not null;

-- Reading notification data is allowed through own-row RLS. Mutations are only
-- exposed through the narrow RPCs below so clients cannot rewrite copy or ownership.
revoke update on public.notifications from authenticated;
drop policy if exists notifications_update_own on public.notifications;

create or replace function private.notification_action_key(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case
    when p_kind = 'manual_request' then 'open_direct_request'
    when p_kind = 'proposal_received' then 'compare_proposals'
    when p_kind = 'extra_requested' then 'review_extra'
    when p_kind = 'payment_status' then 'review_payment'
    when p_kind = 'message_received' then 'open_chat'
    when p_kind like 'complaint_%' then 'open_protection'
    else 'open_order'
  end;
$function$;

create or replace function private.add_notification_event(
  p_recipient_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_order_id uuid,
  p_actor_id uuid,
  p_dedupe_key text,
  p_action_key text,
  p_entity_type text,
  p_entity_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_recipient_id is null then return; end if;

  insert into public.notifications (
    recipient_id, actor_id, order_id, kind, title, body,
    action_key, entity_type, entity_id, metadata, dedupe_key
  ) values (
    p_recipient_id,
    p_actor_id,
    p_order_id,
    p_kind,
    left(coalesce(p_title, 'MANITO'), 140),
    left(coalesce(p_body, ''), 400),
    coalesce(p_action_key, private.notification_action_key(p_kind)),
    coalesce(p_entity_type, case when p_order_id is not null then 'order' end),
    coalesce(p_entity_id, p_order_id::text),
    coalesce(p_metadata, '{}'::jsonb),
    nullif(left(p_dedupe_key, 300), '')
  )
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$function$;

create or replace function private.add_notification(
  p_recipient_id uuid,
  p_kind text,
  p_title text,
  p_body text default '',
  p_order_id uuid default null,
  p_actor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_dedupe_key text;
begin
  if p_kind <> 'message_received' then
    v_dedupe_key := concat_ws(':',
      'notif-v1', p_kind, coalesce(p_order_id::text, 'none'),
      coalesce(p_actor_id::text, 'system'),
      md5(coalesce(p_title, '') || E'\n' || coalesce(p_body, ''))
    );
  end if;

  perform private.add_notification_event(
    p_recipient_id, p_kind, p_title, p_body, p_order_id, p_actor_id,
    v_dedupe_key, private.notification_action_key(p_kind),
    case when p_order_id is not null then 'order' end,
    p_order_id::text, '{}'::jsonb
  );
end;
$function$;

create or replace function private.notify_manual_request_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.assignment_mode = 'manual'
    and new.manual_response_status = 'pending'
    and new.preferred_professional_id is not null
    and (tg_op = 'INSERT' or old.preferred_professional_id is distinct from new.preferred_professional_id or old.manual_requested_at is distinct from new.manual_requested_at)
  then
    perform private.add_notification_event(
      new.preferred_professional_id, 'manual_request', 'Solicitud directa MANITO',
      'Un cliente te eligió para un trabajo. Respondelo antes del vencimiento.',
      new.id, new.client_id,
      concat_ws(':', 'manual-request', new.id::text, new.preferred_professional_id::text, coalesce(new.manual_requested_at::text, 'initial')),
      'open_direct_request', 'order', new.id::text,
      jsonb_build_object('response_deadline_at', new.manual_response_deadline_at)
    );
  end if;
  return new;
end;
$function$;

create or replace function private.notify_proposal_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_client_id uuid;
begin
  select o.client_id into v_client_id from public.orders o where o.id = new.order_id;
  perform private.add_notification_event(
    v_client_id, 'proposal_received', 'Nuevo presupuesto recibido',
    'Compará precio, disponibilidad y observaciones antes de elegir.',
    new.order_id, new.professional_id,
    'proposal-created:' || new.id::text, 'compare_proposals',
    'proposal', new.id::text, '{}'::jsonb
  );
  return new;
end;
$function$;

create or replace function private.notify_proposal_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_client_id uuid; v_version text;
begin
  if old.status = 'sent' and new.status = 'sent' and (
    new.labor_price is distinct from old.labor_price
    or new.materials_price is distinct from old.materials_price
    or new.visit_price is distinct from old.visit_price
    or new.manito_fee is distinct from old.manito_fee
    or new.estimated_minutes is distinct from old.estimated_minutes
    or new.availability_label is distinct from old.availability_label
    or new.available_from is distinct from old.available_from
    or new.observation is distinct from old.observation
  ) then
    select o.client_id into v_client_id from public.orders o where o.id = new.order_id;
    v_version := md5(concat_ws('|', new.labor_price, new.materials_price, new.visit_price,
      new.manito_fee, new.estimated_minutes, new.availability_label, new.available_from, new.observation));
    perform private.add_notification_event(
      v_client_id, 'proposal_received', 'Presupuesto actualizado',
      'Un profesional actualizó su presupuesto. Revisalo antes de elegir.',
      new.order_id, new.professional_id,
      concat_ws(':', 'proposal-updated', new.id::text, v_version),
      'compare_proposals', 'proposal', new.id::text, '{}'::jsonb
    );
  end if;
  return new;
end;
$function$;

create or replace function private.notify_extra_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_client_id uuid;
begin
  select o.client_id into v_client_id from public.orders o where o.id = new.order_id;
  perform private.add_notification_event(
    v_client_id, 'extra_requested', 'Tenés un adicional para revisar',
    new.title || ' por $ ' || trim(to_char(new.amount, '999G999G999D00')),
    new.order_id, new.professional_id,
    'extra-created:' || new.id::text, 'review_extra',
    'order_extra', new.id::text,
    jsonb_build_object('amount', new.amount)
  );
  return new;
end;
$function$;

create or replace function private.notify_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_order public.orders; v_recipient uuid;
begin
  select * into v_order from public.orders where id = new.order_id;
  if v_order.id is null then return new; end if;
  v_recipient := case when new.sender_id = v_order.client_id then v_order.professional_id else v_order.client_id end;
  perform private.add_notification_event(
    v_recipient, 'message_received', 'Nuevo mensaje en tu trabajo', left(new.body, 180),
    new.order_id, new.sender_id,
    'message-created:' || new.id::text, 'open_chat',
    'message', new.id::text, '{}'::jsonb
  );
  return new;
end;
$function$;

create or replace function public.list_notifications(
  p_view text default 'center',
  p_limit integer default 8,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb;
  v_total integer;
  v_unread integer;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_view not in ('center', 'history') then raise exception 'Vista inválida'; end if;

  select count(*) into v_unread
  from public.notifications n
  where n.recipient_id = v_uid and n.read_at is null;

  select count(*) into v_total
  from public.notifications n
  where n.recipient_id = v_uid
    and (p_view = 'history' or n.archived_at is null);

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc), '[]'::jsonb)
  into v_items
  from (
    select n.*,
      case
        when n.kind = 'manual_request' then
          o.manual_response_status = 'pending'
          and o.manual_requested_professional_id = v_uid
          and o.professional_id is null
          and (o.manual_response_deadline_at is null or o.manual_response_deadline_at > now())
        when n.kind = 'proposal_received' then o.status = 'waiting_quotes'
        when n.kind = 'extra_requested' and n.entity_type = 'order_extra' then
          exists (select 1 from public.order_extras e where e.id::text = n.entity_id and e.status = 'pending')
        when n.kind = 'extra_requested' then
          exists (select 1 from public.order_extras e where e.order_id = n.order_id and e.status = 'pending')
        when n.kind = 'payment_status' then
          exists (
            select 1 from public.payments p
            where p.order_id = n.order_id
              and (
                (p.professional_id = v_uid and p.status = 'reported')
                or (p.client_id = v_uid and p.status in ('awaiting_client_action', 'disputed'))
              )
          )
        else false
      end as action_pending
    from public.notifications n
    left join public.orders o on o.id = n.order_id
    where n.recipient_id = v_uid
      and (p_view = 'history' or n.archived_at is null)
    order by n.created_at desc
    limit v_limit offset v_offset
  ) q;

  return jsonb_build_object('items', v_items, 'total', v_total, 'unread_count', v_unread);
end;
$function$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
declare v_uid uuid := auth.uid(); v_read_at timestamptz;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  update public.notifications
  set read_at = coalesce(read_at, clock_timestamp())
  where id = p_notification_id and recipient_id = v_uid
  returning read_at into v_read_at;
  if v_read_at is null then raise exception 'Notificación no encontrada'; end if;
  return v_read_at;
end;
$function$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare v_uid uuid := auth.uid(); v_count integer;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  update public.notifications set read_at = clock_timestamp()
  where recipient_id = v_uid and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

create or replace function public.archive_notification(p_notification_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
declare v_uid uuid := auth.uid(); v_archived_at timestamptz;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  update public.notifications
  set archived_at = coalesce(archived_at, clock_timestamp()),
      read_at = coalesce(read_at, clock_timestamp())
  where id = p_notification_id and recipient_id = v_uid
  returning archived_at into v_archived_at;
  if v_archived_at is null then raise exception 'Notificación no encontrada'; end if;
  return v_archived_at;
end;
$function$;

revoke all on function private.notification_action_key(text) from public, anon, authenticated;
revoke all on function private.add_notification_event(uuid,text,text,text,uuid,uuid,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function private.add_notification(uuid,text,text,text,uuid,uuid) from public, anon, authenticated;
revoke all on function private.notify_manual_request_target() from public, anon, authenticated;
revoke all on function private.notify_proposal_insert() from public, anon, authenticated;
revoke all on function private.notify_proposal_update() from public, anon, authenticated;
revoke all on function private.notify_extra_insert() from public, anon, authenticated;
revoke all on function private.notify_message_insert() from public, anon, authenticated;

revoke all on function public.list_notifications(text,integer,integer) from public, anon;
revoke all on function public.mark_notification_read(uuid) from public, anon;
revoke all on function public.mark_all_notifications_read() from public, anon;
revoke all on function public.archive_notification(uuid) from public, anon;
grant execute on function public.list_notifications(text,integer,integer) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.archive_notification(uuid) to authenticated;

insert into public.admin_settings(key, value)
values ('notif_001', jsonb_build_object(
  'status', 'implemented',
  'center_limit', 8,
  'history_page_size', 20,
  'dedupe', 'recipient_event_key'
))
on conflict (key) do update set value = excluded.value, updated_at = now();
