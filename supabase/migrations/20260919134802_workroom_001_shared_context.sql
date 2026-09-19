-- WORKROOM-001: one private shared context per client/professional relationship.
-- Business state remains in orders, proposals, extras and payments. Workrooms only
-- persist conversation identity, messages and per-user read position.

create table public.workrooms (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  proposal_id uuid references public.order_proposals(id) on delete set null,
  client_id uuid not null references public.profiles(id) on delete cascade,
  professional_id uuid not null references public.profiles(id) on delete cascade,
  phase text not null check (phase in ('precontractual', 'contracted')),
  status text not null default 'open' check (status in ('open', 'read_only')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  unique (order_id, professional_id),
  unique (proposal_id),
  check (client_id <> professional_id)
);

create table public.workroom_reads (
  workroom_id uuid not null references public.workrooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (workroom_id, user_id)
);

create index idx_workrooms_client_activity on public.workrooms(client_id, last_activity_at desc);
create index idx_workrooms_professional_activity on public.workrooms(professional_id, last_activity_at desc);
create index idx_workroom_reads_user on public.workroom_reads(user_id, last_read_at desc);

alter table public.messages add column workroom_id uuid references public.workrooms(id) on delete cascade;
alter table public.messages add column kind text not null default 'text' check (kind in ('text', 'image'));
alter table public.messages add column file_path text;
alter table public.messages add column file_name text;
alter table public.messages add column client_nonce uuid;
alter table public.messages add constraint messages_payload_check check (
  (kind = 'text' and char_length(body) between 1 and 2000 and file_path is null)
  or (kind = 'image' and char_length(body) between 1 and 2000 and file_path is not null)
);
create unique index idx_messages_sender_nonce on public.messages(sender_id, client_nonce) where client_nonce is not null;
create index idx_messages_workroom_created on public.messages(workroom_id, created_at desc, id desc);

comment on table public.workrooms is 'Conversation identity only. Order/proposal/extras/payments remain business sources of truth.';
comment on column public.messages.file_path is 'Private manito-workroom storage object path; never a public URL.';

create or replace function private.sync_proposal_workroom()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = new.order_id;
  if v_order.id is null or v_order.client_id = new.professional_id then return new; end if;

  insert into public.workrooms(order_id, proposal_id, client_id, professional_id, phase, status, last_activity_at)
  values (
    new.order_id, new.id, v_order.client_id, new.professional_id,
    case when new.status = 'accepted' and v_order.contracted_at is not null then 'contracted' else 'precontractual' end,
    case when new.status in ('rejected', 'expired') then 'read_only' else 'open' end,
    greatest(new.created_at, new.updated_at)
  )
  on conflict (order_id, professional_id) do update set
    proposal_id = excluded.proposal_id,
    phase = excluded.phase,
    status = excluded.status,
    updated_at = now(),
    last_activity_at = greatest(public.workrooms.last_activity_at, excluded.last_activity_at);
  return new;
end;
$function$;

create or replace function private.sync_order_workroom()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.professional_id is null or new.contracted_at is null or new.client_id = new.professional_id then return new; end if;

  insert into public.workrooms(order_id, proposal_id, client_id, professional_id, phase, status, last_activity_at)
  values (
    new.id, new.accepted_proposal_id, new.client_id, new.professional_id, 'contracted',
    case when new.status in ('completed', 'cancelled') then 'read_only' else 'open' end,
    greatest(new.contracted_at, new.updated_at)
  )
  on conflict (order_id, professional_id) do update set
    proposal_id = coalesce(excluded.proposal_id, public.workrooms.proposal_id),
    phase = 'contracted',
    status = excluded.status,
    updated_at = now(),
    last_activity_at = greatest(public.workrooms.last_activity_at, excluded.last_activity_at);

  update public.workrooms
  set status = 'read_only', updated_at = now()
  where order_id = new.id and professional_id <> new.professional_id and status <> 'read_only';
  return new;
end;
$function$;

drop trigger if exists trg_workroom_proposal_sync on public.order_proposals;
create trigger trg_workroom_proposal_sync
after insert or update of status, updated_at on public.order_proposals
for each row execute function private.sync_proposal_workroom();

drop trigger if exists trg_workroom_order_sync on public.orders;
create trigger trg_workroom_order_sync
after insert or update of professional_id, contracted_at, accepted_proposal_id, status, updated_at on public.orders
for each row execute function private.sync_order_workroom();

create or replace function private.touch_contracted_workroom()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.workrooms
  set last_activity_at = greatest(
    last_activity_at,
    coalesce(
      (to_jsonb(new)->>'decided_at')::timestamptz,
      (to_jsonb(new)->>'confirmed_at')::timestamptz,
      (to_jsonb(new)->>'reported_at')::timestamptz,
      (to_jsonb(new)->>'updated_at')::timestamptz,
      (to_jsonb(new)->>'created_at')::timestamptz,
      now()
    )
  ), updated_at = now()
  where order_id = new.order_id and phase = 'contracted';
  return new;
end;
$function$;

drop trigger if exists trg_workroom_extra_activity on public.order_extras;
create trigger trg_workroom_extra_activity after insert or update on public.order_extras
for each row execute function private.touch_contracted_workroom();
drop trigger if exists trg_workroom_payment_activity on public.payments;
create trigger trg_workroom_payment_activity after insert or update on public.payments
for each row execute function private.touch_contracted_workroom();

insert into public.workrooms(order_id, proposal_id, client_id, professional_id, phase, status, created_at, updated_at, last_activity_at)
select p.order_id, p.id, o.client_id, p.professional_id,
  case when p.status = 'accepted' and o.contracted_at is not null then 'contracted' else 'precontractual' end,
  case when p.status in ('rejected', 'expired') then 'read_only' else 'open' end,
  p.created_at, p.updated_at, greatest(p.created_at, p.updated_at)
from public.order_proposals p join public.orders o on o.id = p.order_id
where o.client_id <> p.professional_id
on conflict (order_id, professional_id) do nothing;

insert into public.workrooms(order_id, proposal_id, client_id, professional_id, phase, status, created_at, updated_at, last_activity_at)
select o.id, o.accepted_proposal_id, o.client_id, o.professional_id, 'contracted',
  case when o.status in ('completed', 'cancelled') then 'read_only' else 'open' end,
  coalesce(o.contracted_at, o.accepted_at, o.created_at), o.updated_at, o.updated_at
from public.orders o
where o.professional_id is not null and o.contracted_at is not null and o.client_id <> o.professional_id
on conflict (order_id, professional_id) do update set
  proposal_id = coalesce(excluded.proposal_id, public.workrooms.proposal_id),
  phase = 'contracted', status = excluded.status, updated_at = excluded.updated_at,
  last_activity_at = greatest(public.workrooms.last_activity_at, excluded.last_activity_at);

update public.messages m
set workroom_id = w.id
from public.workrooms w
where m.workroom_id is null and w.order_id = m.order_id
  and w.phase = 'contracted';

create or replace function public.can_access_workroom(p_workroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.workrooms w
    where w.id = p_workroom_id and auth.uid() in (w.client_id, w.professional_id)
  );
$function$;

create or replace function public.list_my_workrooms()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.last_activity_at desc), '[]'::jsonb)
  from (
    select w.id, w.order_id, w.proposal_id, w.client_id, w.professional_id, w.phase, w.status,
      w.last_activity_at, o.status as order_status, o.mode, o.address, o.scheduled_at, o.description,
      o.agreed_price, o.estimated_price, o.contracted_at,
      s.name as service_name,
      case when auth.uid() = w.client_id then pp.full_name else cp.full_name end as counterpart_name,
      lm.body as last_item,
      lm.kind as last_item_kind,
      lm.created_at as last_item_at,
      (select count(*)::integer from public.messages um
       where um.workroom_id = w.id and um.sender_id <> auth.uid()
         and um.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)) as unread_count
    from public.workrooms w
    join public.orders o on o.id = w.order_id
    join public.services s on s.id = o.service_id
    join public.profiles cp on cp.id = w.client_id
    join public.profiles pp on pp.id = w.professional_id
    left join public.workroom_reads r on r.workroom_id = w.id and r.user_id = auth.uid()
    left join lateral (
      select m.body, m.kind, m.created_at from public.messages m
      where m.workroom_id = w.id order by m.created_at desc, m.id desc limit 1
    ) lm on true
    where auth.uid() in (w.client_id, w.professional_id)
  ) q;
$function$;

create or replace function public.get_workroom_order(p_workroom_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_result jsonb;
begin
  select (to_jsonb(o) - 'start_pin' - 'end_pin') || jsonb_build_object(
    'service', jsonb_build_object('id',s.id,'slug',s.slug,'name',s.name,'emoji',s.emoji,'base_price',s.base_price,
      'active',s.active,'allow_immediate',s.allow_immediate,'allow_scheduled',s.allow_scheduled,'allow_quote',s.allow_quote,
      'supports_recurring',s.supports_recurring,'requires_completion_evidence',s.requires_completion_evidence),
    'client', jsonb_build_object('id',cp.id,'full_name',cp.full_name,'city',cp.city),
    'professional', jsonb_build_object('id',pp.id,'full_name',pp.full_name,'city',pp.city)
  ) into v_result
  from public.workrooms w
  join public.orders o on o.id = w.order_id
  join public.services s on s.id = o.service_id
  join public.profiles cp on cp.id = w.client_id
  join public.profiles pp on pp.id = w.professional_id
  where w.id = p_workroom_id and auth.uid() in (w.client_id, w.professional_id);
  if v_result is null then raise exception 'Conversación no disponible'; end if;
  return v_result;
end;
$function$;

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
  if v_workroom.id is null then raise exception 'Conversación no disponible'; end if;

  with timeline as (
    select 'message:' || m.id::text as item_id, 'message'::text as item_type, m.created_at,
      m.sender_id, m.body, m.kind as message_kind, m.file_path, m.file_name,
      null::text as event_kind, null::text as title, null::text as detail,
      null::text as action_key, null::uuid as entity_id, null::text as event_status
    from public.messages m where m.workroom_id = v_workroom.id
    union all
    select 'proposal:' || p.id::text, 'event', p.created_at, p.professional_id, null, null, null, null,
      'proposal_sent', 'Presupuesto enviado', p.observation,
      null, p.id, p.status
    from public.order_proposals p where p.id = v_workroom.proposal_id
    union all
    select 'contract:' || o.id::text, 'event', o.contracted_at, o.professional_id, null, null, null, null,
      'contract_confirmed', 'Acuerdo confirmado', coalesce(o.agreed_scope, 'El trabajo quedó contratado.'),
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
    select 'payment:' || p.id::text, 'event', coalesce(p.confirmed_at, p.approved_at, p.reported_at, p.updated_at),
      coalesce(p.confirmed_by, p.reported_by), null, null, null, null,
      'payment_status', case when p.status in ('confirmed','approved') then 'Pago confirmado' when p.status = 'reported' then 'Pago informado' else 'Pago actualizado' end,
      '$ ' || trim(to_char(p.amount, 'FM999G999G999D00')), null, p.id, p.status
    from public.payments p where p.order_id = v_workroom.order_id and v_workroom.phase = 'contracted'
    union all
    select 'completed:' || o.id::text, 'event', o.completed_at, o.professional_id, null, null, null, null,
      'completed', 'Trabajo finalizado', null, null, o.id, o.status
    from public.orders o where o.id = v_workroom.order_id and o.completed_at is not null
  ), page as (
    select * from timeline
    where created_at is not null and (p_before is null or created_at < p_before)
    order by created_at desc, item_id desc limit v_limit
  )
  select coalesce(jsonb_agg(to_jsonb(page) order by created_at, item_id), '[]'::jsonb) into v_items from page;
  return jsonb_build_object('items', v_items, 'has_more', jsonb_array_length(v_items) = v_limit);
end;
$function$;

create or replace function public.mark_workroom_read(p_workroom_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
declare v_now timestamptz := now();
begin
  if not public.can_access_workroom(p_workroom_id) then raise exception 'Conversación no disponible'; end if;
  insert into public.workroom_reads(workroom_id, user_id, last_read_at)
  values (p_workroom_id, auth.uid(), v_now)
  on conflict (workroom_id, user_id) do update set last_read_at = excluded.last_read_at;
  return v_now;
end;
$function$;

create or replace function public.send_workroom_message(
  p_workroom_id uuid,
  p_body text,
  p_kind text default 'text',
  p_file_path text default null,
  p_file_name text default null,
  p_client_nonce uuid default null
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $function$
declare v_uid uuid := auth.uid(); v_workroom public.workrooms; v_message public.messages;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into v_workroom from public.workrooms w
  where w.id = p_workroom_id and v_uid in (w.client_id, w.professional_id) for update;
  if v_workroom.id is null then raise exception 'Conversación no disponible'; end if;
  if v_workroom.status <> 'open' then raise exception 'Esta conversación quedó como historial'; end if;
  if p_kind not in ('text','image') then raise exception 'Tipo de mensaje inválido'; end if;
  if char_length(trim(coalesce(p_body,''))) not between 1 and 2000 then raise exception 'Mensaje inválido'; end if;
  if p_kind = 'image' then
    if p_file_path is null or p_file_path !~ ('^' || v_workroom.id::text || '/' || v_uid::text || '/[^/]+$') then
      raise exception 'Archivo inválido';
    end if;
    if not exists (select 1 from storage.objects so where so.bucket_id = 'manito-workroom' and so.name = p_file_path and so.owner = v_uid) then
      raise exception 'Archivo no encontrado';
    end if;
  elsif p_file_path is not null then raise exception 'Archivo inesperado';
  end if;

  insert into public.messages(order_id, workroom_id, sender_id, body, kind, file_path, file_name, client_nonce)
  values (v_workroom.order_id, v_workroom.id, v_uid, trim(p_body), p_kind, p_file_path, nullif(trim(p_file_name),''), p_client_nonce)
  on conflict (sender_id, client_nonce) where client_nonce is not null do update set body = public.messages.body
  returning * into v_message;
  update public.workrooms set last_activity_at = v_message.created_at, updated_at = now() where id = v_workroom.id;
  return v_message;
end;
$function$;

create or replace function private.notify_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_workroom public.workrooms; v_recipient uuid;
begin
  select * into v_workroom from public.workrooms where id = new.workroom_id;
  if v_workroom.id is null then return new; end if;
  v_recipient := case when new.sender_id = v_workroom.client_id then v_workroom.professional_id else v_workroom.client_id end;
  insert into public.notifications(
    recipient_id, actor_id, order_id, kind, title, body, action_key,
    entity_type, entity_id, metadata, dedupe_key, read_at, archived_at, created_at
  ) values (
    v_recipient, new.sender_id, new.order_id, 'message_received', 'Nuevo mensaje en tu trabajo',
    case when new.kind = 'image' then 'Te enviaron una foto.' else left(new.body, 180) end,
    'open_chat', 'workroom', new.workroom_id::text,
    jsonb_build_object('workroom_id', new.workroom_id),
    'workroom-unread:' || new.workroom_id::text, null, null, now()
  )
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do update set
    actor_id = excluded.actor_id,
    body = excluded.body,
    read_at = null,
    archived_at = null,
    created_at = excluded.created_at,
    metadata = excluded.metadata;
  return new;
end;
$function$;

alter table public.workrooms enable row level security;
alter table public.workroom_reads enable row level security;

create policy workrooms_select_participants on public.workrooms for select to authenticated
using (auth.uid() in (client_id, professional_id));
create policy workroom_reads_select_own on public.workroom_reads for select to authenticated using (user_id = auth.uid());

drop policy if exists messages_select_participants on public.messages;
drop policy if exists messages_insert_participants on public.messages;
create policy messages_select_workroom_participants on public.messages for select to authenticated
using (workroom_id is not null and public.can_access_workroom(workroom_id));

revoke all on public.workrooms, public.workroom_reads from public, anon, authenticated;
grant select on public.workrooms, public.workroom_reads to authenticated;
revoke insert, update, delete on public.messages from authenticated;

revoke all on function public.can_access_workroom(uuid) from public, anon;
revoke all on function public.list_my_workrooms() from public, anon;
revoke all on function public.get_workroom_order(uuid) from public, anon;
revoke all on function public.list_workroom_timeline(uuid,timestamptz,integer) from public, anon;
revoke all on function public.mark_workroom_read(uuid) from public, anon;
revoke all on function public.send_workroom_message(uuid,text,text,text,text,uuid) from public, anon;
grant execute on function public.can_access_workroom(uuid) to authenticated;
grant execute on function public.list_my_workrooms() to authenticated;
grant execute on function public.get_workroom_order(uuid) to authenticated;
grant execute on function public.list_workroom_timeline(uuid,timestamptz,integer) to authenticated;
grant execute on function public.mark_workroom_read(uuid) to authenticated;
grant execute on function public.send_workroom_message(uuid,text,text,text,text,uuid) to authenticated;

revoke all on function private.sync_proposal_workroom() from public, anon, authenticated;
revoke all on function private.sync_order_workroom() from public, anon, authenticated;
revoke all on function private.touch_contracted_workroom() from public, anon, authenticated;
revoke all on function private.notify_message_insert() from public, anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('manito-workroom', 'manito-workroom', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists workroom_media_insert_participant on storage.objects;
create policy workroom_media_insert_participant on storage.objects for insert to authenticated with check (
  bucket_id = 'manito-workroom' and owner = auth.uid()
  and split_part(name,'/',1) ~ '^[0-9a-f-]{36}$'
  and split_part(name,'/',2) = auth.uid()::text
  and public.can_access_workroom(case when split_part(name,'/',1) ~ '^[0-9a-f-]{36}$' then split_part(name,'/',1)::uuid end)
  and exists (select 1 from public.workrooms w where w.id = (case when split_part(name,'/',1) ~ '^[0-9a-f-]{36}$' then split_part(name,'/',1)::uuid end) and w.status = 'open')
);
drop policy if exists workroom_media_select_participant on storage.objects;
create policy workroom_media_select_participant on storage.objects for select to authenticated using (
  bucket_id = 'manito-workroom' and split_part(name,'/',1) ~ '^[0-9a-f-]{36}$'
  and public.can_access_workroom(case when split_part(name,'/',1) ~ '^[0-9a-f-]{36}$' then split_part(name,'/',1)::uuid end)
);
drop policy if exists workroom_media_delete_unlinked_owner on storage.objects;
create policy workroom_media_delete_unlinked_owner on storage.objects for delete to authenticated using (
  bucket_id = 'manito-workroom' and owner = auth.uid()
  and not exists (select 1 from public.messages m where m.file_path = name)
);

do $block$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.workrooms; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.workroom_reads; exception when duplicate_object then null; end;
  end if;
end;
$block$;

insert into public.admin_settings(key, value)
values ('workroom_001', jsonb_build_object(
  'status','implemented', 'completed_read_only',true, 'storage_bucket','manito-workroom',
  'business_events','derived_from_source_entities', 'pin_fields_exposed',false
))
on conflict (key) do update set value = excluded.value, updated_at = now();
