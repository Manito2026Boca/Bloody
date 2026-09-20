-- B07 follow-up: automatic matching invitations are actionable opportunities.
-- Client-side order creation remains in-app only.

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
    'order_created','order_status','proposal_received','extra_requested','message_received','payment_status','appointment',
    'manual_request','manual_request_expired','manual_request_rejected','manual_request_auto',
    'price_confirmation_required','price_confirmation_expired',
    'complaint_opened','complaint_awaiting_professional','complaint_response','complaint_resolved'
  ) then return new; end if;
  if new.kind='order_created' and not exists (
    select 1 from public.orders o where o.id=new.order_id and o.client_id<>new.recipient_id
  ) then return new; end if;

  select greatest(0,coalesce((value->>'message_throttle_seconds')::integer,300)) into v_throttle
  from public.admin_settings where key='web_push';

  insert into public.notification_deliveries(notification_id,subscription_id,notification_version)
  select new.id,s.id,new.created_at
  from public.push_subscriptions s
  where s.user_id=new.recipient_id and s.active
    and (
      new.kind<>'message_received'
      or not exists (
        select 1 from public.notification_deliveries d
        where d.notification_id=new.id and d.subscription_id=s.id
          and d.created_at>now()-make_interval(secs=>v_throttle)
          and d.status in ('pending','sending','sent')
      )
    )
  on conflict do nothing;
  return new;
end;
$function$;

create or replace function public.claim_push_deliveries(p_limit integer default 25)
returns table(
  delivery_id uuid,endpoint text,p256dh text,auth_secret text,
  payload jsonb,attempt integer
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
      status='sending',attempts=d.attempts+1,claimed_at=now(),updated_at=now()
    from claimed c where d.id=c.id returning d.*
  )
  select u.id,s.endpoint,s.p256dh,s.auth_secret,
    jsonb_build_object(
      'notificationId',n.id,
      'title',case
        when n.kind='order_created' then 'Nueva oportunidad en MANITO'
        when n.kind='manual_request' then 'Nueva solicitud en MANITO'
        when n.kind='proposal_received' then 'Recibiste una propuesta'
        when n.kind='message_received' then 'Nuevo mensaje en MANITO'
        when n.kind='extra_requested' then 'Tenés un adicional para revisar'
        when n.kind='payment_status' then 'Novedad sobre un pago'
        else left(coalesce(n.title,'Novedad en MANITO'),90) end,
      'body',case
        when n.kind='order_created' then 'Hay un trabajo compatible que necesita respuesta.'
        when n.kind='manual_request' then 'Tenés una solicitud que necesita respuesta.'
        when n.kind='proposal_received' then 'Hay una nueva propuesta para tu pedido.'
        when n.kind='message_received' then 'Tenés un mensaje nuevo en un trabajo.'
        when n.kind='extra_requested' then 'Revisá una modificación propuesta para tu trabajo.'
        when n.kind='payment_status' then 'Revisá el estado del pago en MANITO.'
        else left(coalesce(n.body,'Abrí MANITO para ver el detalle.'),140) end,
      'url','/?notification='||n.id::text,
      'tag','manito-notification-'||n.id::text
    ),u.attempts
  from updated u
  join public.push_subscriptions s on s.id=u.subscription_id
  join public.notifications n on n.id=u.notification_id;
end;
$function$;

revoke all on function private.queue_notification_deliveries() from public,anon,authenticated;
revoke all on function public.claim_push_deliveries(integer) from public,anon,authenticated;
grant execute on function public.claim_push_deliveries(integer) to service_role;
