-- BLUEPRINT-B08: secure, idempotent ratings and a complete participant timeline.

drop policy if exists ratings_client_insert on public.ratings;
revoke insert on public.ratings from authenticated;

create or replace function public.submit_order_rating(
  p_order_id uuid,
  p_stars integer,
  p_comment text default null
)
returns public.ratings
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_rating public.ratings;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_stars is null or p_stars not between 1 and 5 then
    raise exception 'La calificacion debe ser de 1 a 5 estrellas';
  end if;
  if char_length(coalesce(v_comment, '')) > 1000 then
    raise exception 'El comentario admite hasta 1000 caracteres';
  end if;

  select * into v_order
  from public.orders o
  where o.id = p_order_id and o.client_id = v_uid
  for update;

  if v_order.id is null then raise exception 'No podes calificar este trabajo'; end if;
  if v_order.status <> 'completed' or v_order.professional_id is null then
    raise exception 'El trabajo debe estar finalizado para calificar';
  end if;

  select * into v_rating
  from public.ratings r
  where r.order_id = p_order_id and r.client_id = v_uid;
  if v_rating.id is not null then return v_rating; end if;

  insert into public.ratings(order_id, client_id, professional_id, stars, comment)
  values (p_order_id, v_uid, v_order.professional_id, p_stars, v_comment)
  on conflict (order_id, client_id) do nothing
  returning * into v_rating;

  if v_rating.id is null then
    select * into v_rating from public.ratings r
    where r.order_id = p_order_id and r.client_id = v_uid;
  end if;
  return v_rating;
end;
$function$;

revoke all on function public.submit_order_rating(uuid,integer,text) from public, anon, authenticated;
grant execute on function public.submit_order_rating(uuid,integer,text) to authenticated;

drop trigger if exists trg_workroom_photo_activity on public.order_photos;
create trigger trg_workroom_photo_activity after insert or update on public.order_photos
for each row execute function private.touch_contracted_workroom();
drop trigger if exists trg_workroom_rating_activity on public.ratings;
create trigger trg_workroom_rating_activity after insert or update on public.ratings
for each row execute function private.touch_contracted_workroom();
drop trigger if exists trg_workroom_complaint_activity on public.complaints;
create trigger trg_workroom_complaint_activity after insert or update on public.complaints
for each row execute function private.touch_contracted_workroom();

create or replace function public.list_workroom_timeline(
  p_workroom_id uuid,
  p_before timestamptz default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_workroom public.workrooms; v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 60); v_items jsonb;
begin
  select * into v_workroom from public.workrooms w
  where w.id = p_workroom_id and auth.uid() in (w.client_id, w.professional_id);
  if v_workroom.id is null then raise exception 'Conversacion no disponible'; end if;

  with timeline as (
    select 'message:' || m.id::text as item_id, 'message'::text as item_type, m.created_at,
      m.sender_id, m.body, m.kind as message_kind, m.file_path, m.file_name,
      null::text as event_kind, null::text as title, null::text as detail,
      null::text as action_key, null::uuid as entity_id, null::text as event_status
    from public.messages m where m.workroom_id = v_workroom.id
    union all
    select 'proposal:' || p.id::text, 'event', p.created_at, p.professional_id, null, null, null, null,
      'proposal_sent', 'Presupuesto enviado', p.observation, null, p.id, p.status
    from public.order_proposals p where p.id = v_workroom.proposal_id
    union all
    select 'contract:' || o.id::text, 'event', o.contracted_at, o.professional_id, null, null, null, null,
      'contract_confirmed', 'Acuerdo confirmado', coalesce(o.agreed_scope, 'El trabajo quedo contratado.'),
      null, o.id, o.status
    from public.orders o where o.id = v_workroom.order_id and o.contracted_at is not null and o.professional_id = v_workroom.professional_id
    union all
    select 'extra-created:' || e.id::text, 'event', e.created_at, e.professional_id, null, null, null, null,
      'extra_proposed', 'Adicional propuesto', e.title || ' · $ ' || trim(to_char(e.amount, 'FM999G999G999D00')),
      case when e.status = 'pending' and auth.uid() = v_workroom.client_id then 'review_extra' else null end,
      e.id, e.status
    from public.order_extras e where e.order_id = v_workroom.order_id and v_workroom.phase = 'contracted'
    union all
    select 'extra-decided:' || e.id::text, 'event', e.decided_at, v_workroom.client_id, null, null, null, null,
      'extra_decided', case when e.status = 'approved' then 'Adicional aprobado' else 'Adicional rechazado' end,
      e.title, null, e.id, e.status
    from public.order_extras e where e.order_id = v_workroom.order_id and e.decided_at is not null and v_workroom.phase = 'contracted'
    union all
    select 'evidence:' || p.id::text, 'event', p.created_at, p.uploaded_by, null, null, null, null,
      'evidence_added', case p.stage when 'before' then 'Evidencia inicial agregada' when 'after' then 'Evidencia final agregada' else 'Evidencia del trabajo agregada' end,
      p.caption, null, p.id, p.stage
    from public.order_photos p where p.order_id = v_workroom.order_id and v_workroom.phase = 'contracted'
    union all
    select 'payment:' || p.id::text, 'event', coalesce(p.confirmed_at, p.approved_at, p.reported_at, p.updated_at),
      coalesce(p.confirmed_by, p.reported_by), null, null, null, null,
      'payment_status', case when p.status in ('confirmed','approved') then 'Pago confirmado' when p.status = 'reported' then 'Pago informado' else 'Pago actualizado' end,
      '$ ' || trim(to_char(p.amount, 'FM999G999G999D00')), null, p.id, p.status
    from public.payments p where p.order_id = v_workroom.order_id and v_workroom.phase = 'contracted'
    union all
    select 'completed:' || o.id::text, 'event', o.completed_at, o.professional_id, null, null, null, null,
      'completed', 'Trabajo finalizado', 'PIN final validado', null, o.id, o.status
    from public.orders o where o.id = v_workroom.order_id and o.completed_at is not null
    union all
    select 'rating:' || r.id::text, 'event', r.created_at, r.client_id, null, null, null, null,
      'rating_submitted', 'Calificacion registrada', r.stars::text || ' estrellas' || case when r.comment is null then '' else ' · ' || r.comment end,
      null, r.id, 'submitted'
    from public.ratings r where r.order_id = v_workroom.order_id
    union all
    select 'complaint-event:' || ce.id::text, 'event', ce.created_at, ce.actor_id, null, null, null, null,
      'protection_status', case when ce.event_type = 'opened' then 'Revision solicitada' when ce.to_status in ('resolved','rejected') then 'Revision cerrada' else 'Revision actualizada' end,
      case ce.to_status when 'open' then 'Caso abierto' when 'under_review' then 'En revision' when 'awaiting_professional' then 'Esperando respuesta del profesional' when 'resolved' then 'Resuelto' else 'Cerrado' end,
      null, c.id, ce.to_status
    from public.complaint_events ce join public.complaints c on c.id = ce.complaint_id
    where c.order_id = v_workroom.order_id
  ), page as (
    select * from timeline
    where created_at is not null and (p_before is null or created_at < p_before)
    order by created_at desc, item_id desc limit v_limit
  )
  select coalesce(jsonb_agg(to_jsonb(page) order by created_at, item_id), '[]'::jsonb) into v_items from page;
  return jsonb_build_object('items', v_items, 'has_more', jsonb_array_length(v_items) = v_limit);
end;
$function$;

revoke all on function public.list_workroom_timeline(uuid,timestamptz,integer) from public, anon, authenticated;
grant execute on function public.list_workroom_timeline(uuid,timestamptz,integer) to authenticated;

create or replace function public.list_admin_complaint_reviews()
returns setof jsonb language sql stable security definer set search_path='' as $function$
  select to_jsonb(c)||jsonb_build_object(
    'service_name',s.name,'order_status',o.status,'order_price',o.agreed_price,
    'service_total',case when o.agreed_price is null then null else o.agreed_price + coalesce((
      select sum(e.amount) from public.order_extras e where e.order_id=o.id and e.status='approved'
    ),0) end,
    'client_name',cl.full_name,'client_city',cl.city,
    'professional_name',pr.full_name,'professional_city',pr.city)
  from public.complaints c join public.orders o on o.id=c.order_id
  join public.services s on s.id=o.service_id join public.profiles cl on cl.id=o.client_id
  left join public.profiles pr on pr.id=o.professional_id where private.is_manito_admin()
  order by (c.status in ('resolved','rejected')),c.created_at desc;
$function$;

revoke all on function public.list_admin_complaint_reviews() from public, anon, authenticated;
grant execute on function public.list_admin_complaint_reviews() to authenticated;

do $block$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    begin alter publication supabase_realtime add table public.ratings; exception when duplicate_object then null; end;
  end if;
end;
$block$;

insert into public.admin_settings(key,value) values('blueprint_b08_closure',jsonb_build_object(
  'schema_version',1,'rating_write','submit_order_rating','timeline','evidence_payment_rating_protection',
  'protection_window','existing_frozen_order_policy'))
on conflict(key) do update set value=excluded.value,updated_at=now();
