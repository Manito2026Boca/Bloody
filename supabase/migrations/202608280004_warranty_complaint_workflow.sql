-- MANITO warranty complaint workflow.
-- Warranty cases are opened and resolved through RPCs so participants keep a
-- clear case history without getting direct write access to complaint status.

alter table public.complaints
  add column if not exists resolution_note text,
  add column if not exists resolved_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

drop policy if exists complaints_participants on public.complaints;
drop policy if exists complaints_participants_select on public.complaints;

revoke all on public.complaints from anon, authenticated;
grant select on public.complaints to authenticated;

create policy complaints_participants_select on public.complaints
for select to authenticated
using (
  opened_by = (select auth.uid())
  or exists (
    select 1
    from public.orders o
    where o.id = complaints.order_id
      and (o.client_id = (select auth.uid()) or o.professional_id = (select auth.uid()))
  )
  or private.is_manito_admin()
);

create or replace function public.open_order_complaint(
  p_order_id uuid,
  p_reason text,
  p_detail text default null
)
returns public.complaints
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_complaint public.complaints;
begin
  if v_uid is null then
    raise exception 'Tenés que iniciar sesión';
  end if;

  select *
    into v_order
    from public.orders o
   where o.id = p_order_id
     and (o.client_id = v_uid or o.professional_id = v_uid);

  if v_order.id is null then
    raise exception 'No podés abrir revisión sobre este pedido';
  end if;

  if v_order.status <> 'completed' then
    raise exception 'La garantía se abre cuando el trabajo está finalizado';
  end if;

  if v_order.completed_at is not null
     and v_order.completed_at + make_interval(days => coalesce(v_order.guarantee_days, 7)) < now() then
    raise exception 'La garantía de este pedido ya venció';
  end if;

  insert into public.complaints (order_id, opened_by, reason, detail, status)
  values (
    p_order_id,
    v_uid,
    nullif(btrim(coalesce(p_reason, '')), ''),
    nullif(btrim(coalesce(p_detail, '')), ''),
    'open'
  )
  returning * into v_complaint;

  return v_complaint;
end;
$$;

create or replace function public.review_order_complaint(
  p_complaint_id uuid,
  p_status text,
  p_resolution_note text default null
)
returns public.complaints
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_complaint public.complaints;
begin
  if v_uid is null or not private.is_manito_admin(v_uid) then
    raise exception 'Solo MANITO puede resolver garantías';
  end if;

  if v_status not in ('in_review', 'resolved', 'rejected') then
    raise exception 'Estado de garantía inválido';
  end if;

  update public.complaints
     set status = v_status,
         resolution_note = nullif(btrim(coalesce(p_resolution_note, '')), ''),
         reviewed_by = v_uid,
         resolved_at = case when v_status in ('resolved', 'rejected') then now() else null end,
         updated_at = now()
   where id = p_complaint_id
  returning * into v_complaint;

  if v_complaint.id is null then
    raise exception 'No existe la garantía';
  end if;

  return v_complaint;
end;
$$;

create or replace function public.list_admin_complaint_reviews()
returns table (
  id uuid,
  order_id uuid,
  opened_by uuid,
  reason text,
  detail text,
  status text,
  resolution_note text,
  resolved_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  service_name text,
  order_status text,
  order_price numeric,
  client_name text,
  client_city text,
  professional_name text,
  professional_city text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.order_id,
    c.opened_by,
    c.reason,
    c.detail,
    c.status,
    c.resolution_note,
    c.resolved_at,
    c.reviewed_by,
    c.created_at,
    c.updated_at,
    s.name as service_name,
    o.status as order_status,
    o.price as order_price,
    client.full_name as client_name,
    client.city as client_city,
    professional.full_name as professional_name,
    professional.city as professional_city
  from public.complaints c
  join public.orders o
    on o.id = c.order_id
  join public.services s
    on s.id = o.service_id
  join public.profiles client
    on client.id = o.client_id
  left join public.profiles professional
    on professional.id = o.professional_id
  where private.is_manito_admin()
  order by
    case c.status
      when 'open' then 1
      when 'in_review' then 2
      when 'resolved' then 3
      when 'rejected' then 4
      else 5
    end,
    c.created_at desc;
$$;

revoke all on function public.open_order_complaint(uuid, text, text) from public, anon;
revoke all on function public.review_order_complaint(uuid, text, text) from public, anon;
revoke all on function public.list_admin_complaint_reviews() from public, anon;

grant execute on function public.open_order_complaint(uuid, text, text) to authenticated;
grant execute on function public.review_order_complaint(uuid, text, text) to authenticated;
grant execute on function public.list_admin_complaint_reviews() to authenticated;

insert into public.admin_settings (key, value)
values (
  'warranty_complaint_workflow',
  '{
    "open_case": "participant_rpc_only_after_completed_order",
    "resolve_case": "admin_rpc_only",
    "direct_table_writes": "disabled_for_browser_roles",
    "case_history": ["open", "in_review", "resolved", "rejected"]
  }'::jsonb
)
on conflict (key) do update
  set value = excluded.value,
      updated_at = now();
