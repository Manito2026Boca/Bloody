-- BLUEPRINT-B07: durable response recovery and asynchronous Web Push delivery.
-- NOTIF-001 remains the logical event source. Push is a delivery channel only.

create extension if not exists pg_net with schema extensions;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  endpoint_hash text generated always as (md5(endpoint)) stored,
  p256dh text not null,
  auth_secret text not null,
  user_agent text,
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint_hash)
);

create index idx_push_subscriptions_user_active
  on public.push_subscriptions(user_id, active, updated_at desc);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  channel text not null default 'web_push' check (channel = 'web_push'),
  notification_version timestamptz not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','expired')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, subscription_id, channel, notification_version)
);

create index idx_notification_deliveries_pending
  on public.notification_deliveries(status, available_at, created_at)
  where status in ('pending','failed');

alter table public.push_subscriptions enable row level security;
alter table public.notification_deliveries enable row level security;
revoke all on public.push_subscriptions, public.notification_deliveries from public, anon, authenticated;

insert into public.admin_settings(key, value)
values ('web_push', jsonb_build_object(
  'schema_version', 1,
  'enabled', true,
  'public_key', 'BFKa76IsrTP6wUNgN4F5m8NsN7VzG8ZnUxCpFO7sevl-wsojza0oym2aIZsPGMmIRwi--fUFiL0bFsgUjDEoAyk',
  'subject', 'https://bloody-eta.vercel.app',
  'max_attempts', 5,
  'message_throttle_seconds', 300
))
on conflict (key) do update set
  value = public.admin_settings.value || excluded.value,
  updated_at = now();

create or replace function public.get_web_push_public_key()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select case when coalesce((s.value->>'enabled')::boolean, false)
    then nullif(s.value->>'public_key','') end
  from public.admin_settings s where s.key = 'web_push';
$function$;

create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if length(coalesce(p_endpoint,'')) < 40 or p_endpoint !~ '^https://' then
    raise exception 'Suscripcion push invalida';
  end if;
  if length(coalesce(p_p256dh,'')) < 20 or length(coalesce(p_auth,'')) < 8 then
    raise exception 'Claves de suscripcion invalidas';
  end if;

  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth_secret, user_agent, active, last_seen_at)
  values (v_uid, left(p_endpoint, 2000), left(p_p256dh, 300), left(p_auth, 200), left(p_user_agent, 500), true, now())
  on conflict (endpoint_hash) do update set
    user_id = excluded.user_id,
    endpoint = excluded.endpoint,
    p256dh = excluded.p256dh,
    auth_secret = excluded.auth_secret,
    user_agent = excluded.user_agent,
    active = true,
    invalidated_at = null,
    last_seen_at = now(),
    updated_at = now()
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.unregister_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_uid uuid := auth.uid(); v_changed integer;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  update public.push_subscriptions
  set active=false, invalidated_at=now(), updated_at=now()
  where user_id=v_uid and endpoint_hash=md5(p_endpoint) and active;
  get diagnostics v_changed = row_count;
  return v_changed > 0;
end;
$function$;

create or replace function public.get_notification_destination(p_notification_id uuid)
returns table(notification_id uuid, action_key text, entity_type text, entity_id text, order_id uuid)
language sql
stable
security definer
set search_path = ''
as $function$
  select n.id, n.action_key, n.entity_type, n.entity_id, n.order_id
  from public.notifications n
  where n.id=p_notification_id and n.recipient_id=auth.uid();
$function$;

create or replace function private.queue_notification_deliveries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_throttle integer := 300;
begin
  if new.read_at is not null then return new; end if;
  if tg_op='UPDATE' and new.created_at is not distinct from old.created_at then return new; end if;
  if new.kind not in (
    'order_status','proposal_received','extra_requested','message_received','payment_status','appointment',
    'manual_request','manual_request_expired','manual_request_rejected','manual_request_auto',
    'price_confirmation_required','price_confirmation_expired',
    'complaint_opened','complaint_awaiting_professional','complaint_response','complaint_resolved'
  ) then return new; end if;
  select greatest(0, coalesce((value->>'message_throttle_seconds')::integer,300)) into v_throttle
  from public.admin_settings where key='web_push';

  insert into public.notification_deliveries(notification_id,subscription_id,notification_version)
  select new.id, s.id, new.created_at
  from public.push_subscriptions s
  where s.user_id=new.recipient_id and s.active
    and (
      new.kind <> 'message_received'
      or not exists (
        select 1 from public.notification_deliveries d
        where d.notification_id=new.id and d.subscription_id=s.id
          and d.created_at > now()-make_interval(secs=>v_throttle)
          and d.status in ('pending','sending','sent')
      )
    )
  on conflict do nothing;
  return new;
end;
$function$;

drop trigger if exists trg_notifications_queue_push on public.notifications;
create trigger trg_notifications_queue_push
after insert or update of created_at,read_at on public.notifications
for each row execute function private.queue_notification_deliveries();

create or replace function public.claim_push_deliveries(p_limit integer default 25)
returns table(
  delivery_id uuid, endpoint text, p256dh text, auth_secret text,
  payload jsonb, attempt integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare v_max_attempts integer := 5;
begin
  select greatest(1,coalesce((value->>'max_attempts')::integer,5)) into v_max_attempts
  from public.admin_settings where key='web_push';
  return query
  with claimed as (
    select d.id
    from public.notification_deliveries d
    join public.push_subscriptions s on s.id=d.subscription_id and s.active
    where d.status in ('pending','failed') and d.available_at<=now() and d.attempts<v_max_attempts
    order by d.available_at,d.created_at
    for update of d skip locked
    limit least(greatest(coalesce(p_limit,25),1),100)
  ), updated as (
    update public.notification_deliveries d set
      status='sending', attempts=d.attempts+1, claimed_at=now(), updated_at=now()
    from claimed c where d.id=c.id
    returning d.*
  )
  select u.id, s.endpoint, s.p256dh, s.auth_secret,
    jsonb_build_object(
      'notificationId',n.id,
      'title',case
        when n.kind='manual_request' then 'Nueva solicitud en MANITO'
        when n.kind='proposal_received' then 'Recibiste una propuesta'
        when n.kind='message_received' then 'Nuevo mensaje en MANITO'
        when n.kind='extra_requested' then 'Tenés un adicional para revisar'
        when n.kind='payment_status' then 'Novedad sobre un pago'
        else left(coalesce(n.title,'Novedad en MANITO'),90) end,
      'body',case
        when n.kind='manual_request' then 'Tenés una solicitud que necesita respuesta.'
        when n.kind='proposal_received' then 'Hay una nueva propuesta para tu pedido.'
        when n.kind='message_received' then 'Tenés un mensaje nuevo en un trabajo.'
        when n.kind='extra_requested' then 'Revisá una modificación propuesta para tu trabajo.'
        when n.kind='payment_status' then 'Revisá el estado del pago en MANITO.'
        else left(coalesce(n.body,'Abrí MANITO para ver el detalle.'),140) end,
      'url','/?notification='||n.id::text,
      'tag','manito-notification-'||n.id::text
    ), u.attempts
  from updated u
  join public.push_subscriptions s on s.id=u.subscription_id
  join public.notifications n on n.id=u.notification_id;
end;
$function$;

create or replace function public.finish_push_delivery(
  p_delivery_id uuid,
  p_status text,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_subscription uuid; v_attempts integer;
begin
  if p_status not in ('sent','failed','expired') then raise exception 'Estado de delivery invalido'; end if;
  update public.notification_deliveries set
    status=p_status,
    sent_at=case when p_status='sent' then now() else sent_at end,
    available_at=case when p_status='failed' then now()+make_interval(secs=>least(3600,30*power(2,greatest(attempts-1,0))::integer)) else available_at end,
    last_error_code=nullif(left(coalesce(p_error_code,''),120),''),
    updated_at=now()
  where id=p_delivery_id and status='sending'
  returning subscription_id,attempts into v_subscription,v_attempts;
  if p_status='expired' and v_subscription is not null then
    update public.push_subscriptions set active=false,invalidated_at=now(),updated_at=now()
    where id=v_subscription;
  end if;
end;
$function$;

create or replace function public.get_web_push_server_config()
returns table(public_key text,private_key text,subject text)
language sql
stable
security definer
set search_path = ''
as $function$
  select s.value->>'public_key',v.decrypted_secret,s.value->>'subject'
  from public.admin_settings s
  join vault.decrypted_secrets v on v.name='b07_vapid_private_key'
  where s.key='web_push';
$function$;

create or replace function private.process_b07_response_timeouts()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare v_order_id uuid; v_count integer := 0; v_changed integer := 0;
begin
  for v_order_id in
    select id from public.orders
    where assignment_mode='manual' and professional_id is null
      and status in ('open','scheduled_open') and manual_response_status='pending'
      and manual_response_deadline_at<=now()
    for update skip locked
  loop
    perform private.refresh_manual_order_request_impl(v_order_id);
    v_count:=v_count+1;
  end loop;

  for v_order_id in
    select id from public.orders
    where mode='immediate' and coalesce(assignment_mode,'auto')='auto'
      and professional_id is null and status='open' and matching_status='round_pending'
      and matching_round_deadline_at<=now()
    for update skip locked
  loop
    perform private.expire_immediate_matching_impl(v_order_id);
    v_count:=v_count+1;
  end loop;

  -- A scheduled request cannot remain "searching" after its requested start.
  update public.orders
  set status='matching_failed', matching_status='failed', matching_failed_at=now(), updated_at=now()
  where mode='scheduled' and professional_id is null and contracted_at is null
    and status='scheduled_open' and scheduled_at<=now();
  get diagnostics v_changed = row_count;
  v_count:=v_count+v_changed;
  return v_count;
end;
$function$;

create or replace function private.notify_b07_matching_exhausted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status='matching_failed' and old.status is distinct from new.status then
    perform private.add_notification_event(
      new.client_id,
      'order_status',
      case when new.mode='scheduled' then 'No encontramos disponibilidad para ese horario'
           when new.mode='quote' then 'No recibimos propuestas disponibles'
           else 'No encontramos un profesional disponible por ahora' end,
      'Abrí tu pedido para volver a buscar o editar la solicitud.',
      new.id,
      null,
      concat_ws(':','b07-matching-exhausted',new.id::text,coalesce(new.matching_cycle,0)::text),
      'open_order',
      'order',
      new.id::text,
      jsonb_build_object('mode',new.mode,'matching_cycle',new.matching_cycle)
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_orders_b07_matching_exhausted on public.orders;
create trigger trg_orders_b07_matching_exhausted
after update of status on public.orders
for each row execute function private.notify_b07_matching_exhausted();

create or replace function public.retry_order_search(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $function$
declare v_uid uuid:=auth.uid(); v_order public.orders;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text,707));
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null or v_order.client_id<>v_uid or v_order.professional_id is not null
    or v_order.contracted_at is not null or v_order.status<>'matching_failed' then
    raise exception 'No podes reintentar esta busqueda';
  end if;
  if v_order.mode='immediate' and coalesce(v_order.assignment_mode,'auto')='auto' then
    return private.start_immediate_matching_round_impl(v_order.id,true);
  end if;
  update public.orders set
    status=case when mode='scheduled' then 'scheduled_open' when mode='quote' then 'waiting_quotes' else 'open' end,
    matching_status='idle', matching_failed_at=null, updated_at=now()
  where id=v_order.id returning * into v_order;
  return v_order;
end;
$function$;

create or replace function private.dispatch_push_outbox()
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare v_url text; v_key text; v_request bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name='b07_project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name='b07_publishable_key';
  if v_url is null or v_key is null then return null; end if;
  select net.http_post(
    url=>v_url||'/functions/v1/deliver-web-push',
    headers=>jsonb_build_object('Authorization','Bearer '||v_key,'Content-Type','application/json'),
    body=>'{}'::jsonb,
    timeout_milliseconds=>10000
  ) into v_request;
  return v_request;
exception when others then
  return null;
end;
$function$;

do $block$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='manito-b07-response-and-push';
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule(
    'manito-b07-response-and-push','* * * * *',
    $cron$select private.process_b07_response_timeouts(); select private.dispatch_push_outbox();$cron$
  );
end;
$block$;

revoke all on function public.get_web_push_public_key() from public,anon;
revoke all on function public.register_push_subscription(text,text,text,text) from public,anon;
revoke all on function public.unregister_push_subscription(text) from public,anon;
revoke all on function public.get_notification_destination(uuid) from public,anon;
revoke all on function public.retry_order_search(uuid) from public,anon;
grant execute on function public.get_web_push_public_key() to authenticated;
grant execute on function public.register_push_subscription(text,text,text,text) to authenticated;
grant execute on function public.unregister_push_subscription(text) to authenticated;
grant execute on function public.get_notification_destination(uuid) to authenticated;
grant execute on function public.retry_order_search(uuid) to authenticated;

revoke all on function public.claim_push_deliveries(integer) from public,anon,authenticated;
revoke all on function public.finish_push_delivery(uuid,text,text) from public,anon,authenticated;
revoke all on function public.get_web_push_server_config() from public,anon,authenticated;
grant execute on function public.claim_push_deliveries(integer) to service_role;
grant execute on function public.finish_push_delivery(uuid,text,text) to service_role;
grant execute on function public.get_web_push_server_config() to service_role;

revoke all on function private.queue_notification_deliveries() from public,anon,authenticated;
revoke all on function private.process_b07_response_timeouts() from public,anon,authenticated;
revoke all on function private.dispatch_push_outbox() from public,anon,authenticated;
revoke all on function private.notify_b07_matching_exhausted() from public,anon,authenticated;

insert into public.admin_settings(key,value)
values ('blueprint_b07',jsonb_build_object(
  'schema_version',1,
  'logical_event_source','notifications',
  'delivery_channel','web_push',
  'response_timeout_job','manito-b07-response-and-push',
  'quote_window_decision_required',true
))
on conflict (key) do update set value=excluded.value,updated_at=now();
