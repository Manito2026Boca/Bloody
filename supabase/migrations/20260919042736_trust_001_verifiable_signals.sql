-- TRUST-001: public trust signals must be derived from auditable evidence.

create or replace function private.professional_public_trust(p_professional_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with real_reviews as (
    select
      count(*)::integer as review_count,
      round(avg(r.stars)::numeric, 2) as rating_avg
    from public.ratings r
    join public.orders o
      on o.id = r.order_id
     and o.status = 'completed'
     and o.client_id = r.client_id
     and o.professional_id = r.professional_id
    where r.professional_id = p_professional_id
  ), completed_jobs as (
    select count(*)::integer as completed_count
    from public.orders o
    where o.professional_id = p_professional_id
      and o.status = 'completed'
  ), reviewed_documents as (
    select
      count(distinct d.kind) filter (
        where d.kind in ('dni_front', 'dni_back', 'selfie')
          and d.status = 'approved'
          and d.file_path is not null
      )::integer as identity_approved,
      count(distinct d.kind) filter (
        where d.kind not in ('dni_front', 'dni_back', 'selfie')
          and d.status = 'approved'
          and d.file_path is not null
      )::integer as professional_approved
    from public.professional_documents d
    where d.professional_id = p_professional_id
  )
  select jsonb_build_object(
    'trust_rating_avg', case when rr.review_count > 0 then rr.rating_avg else null end,
    'trust_review_count', rr.review_count,
    'trust_completed_jobs', cj.completed_count,
    'identity_reviewed', rd.identity_approved = 3,
    'professional_documents_reviewed', rd.professional_approved > 0
  )
  from real_reviews rr
  cross join completed_jobs cj
  cross join reviewed_documents rd;
$$;

revoke all on function private.professional_public_trust(uuid) from public, anon, authenticated;

create or replace function public.list_public_professional_trust()
returns table (
  professional_id uuid,
  trust_rating_avg numeric,
  trust_review_count integer,
  trust_completed_jobs integer,
  identity_reviewed boolean,
  professional_documents_reviewed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  return query
  select
    p.id,
    nullif(t.value ->> 'trust_rating_avg', '')::numeric,
    coalesce((t.value ->> 'trust_review_count')::integer, 0),
    coalesce((t.value ->> 'trust_completed_jobs')::integer, 0),
    coalesce((t.value ->> 'identity_reviewed')::boolean, false),
    coalesce((t.value ->> 'professional_documents_reviewed')::boolean, false)
  from public.profiles p
  join public.professional_profiles pp on pp.professional_id = p.id
  cross join lateral (select private.professional_public_trust(p.id) as value) t
  where p.role = 'professional'
    and private.professional_can_receive_orders(p.id)
  order by p.full_name;
end;
$$;

revoke all on function public.list_public_professional_trust() from public, anon;
grant execute on function public.list_public_professional_trust() to authenticated;

create or replace function public.get_professional_trust_signals(p_professional_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if p_professional_id <> v_uid
    and not private.is_manito_admin()
    and not private.professional_can_receive_orders(p_professional_id)
    and not exists (
      select 1
      from public.orders o
      where o.professional_id = p_professional_id
        and o.client_id = v_uid
    ) then
    raise exception 'Profesional no disponible';
  end if;

  return private.professional_public_trust(p_professional_id);
end;
$$;

revoke all on function public.get_professional_trust_signals(uuid) from public, anon;
grant execute on function public.get_professional_trust_signals(uuid) to authenticated;

-- A public reputation signal is only valid for a completed order involving
-- the same client and professional. The unique constraint remains the
-- idempotency boundary for one review per client/order.
drop policy if exists ratings_client_insert on public.ratings;
create policy ratings_client_insert on public.ratings
for insert to authenticated
with check (
  client_id = (select auth.uid())
  and exists (
    select 1
    from public.orders o
    where o.id = ratings.order_id
      and o.status = 'completed'
      and o.client_id = (select auth.uid())
      and o.professional_id = ratings.professional_id
  )
);

create or replace function public.list_order_proposals(p_order_id uuid)
returns table (
  id uuid,
  order_id uuid,
  professional_id uuid,
  labor_price numeric,
  materials_price numeric,
  visit_price numeric,
  manito_fee numeric,
  estimated_minutes integer,
  availability_label text,
  available_from timestamptz,
  observation text,
  status text,
  valid_until timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  professional jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  perform private.expire_order_proposals_impl(p_order_id);

  return query
  select
    op.id,
    op.order_id,
    op.professional_id,
    op.labor_price,
    op.materials_price,
    op.visit_price,
    op.manito_fee,
    op.estimated_minutes,
    op.availability_label,
    op.available_from,
    op.observation,
    op.status,
    op.valid_until,
    op.created_at,
    op.updated_at,
    jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'city', p.city,
      'manito_pro', coalesce(pp.manito_pro, false)
    ) || private.professional_public_trust(op.professional_id) as professional
  from public.order_proposals op
  join public.orders o on o.id = op.order_id
  join public.profiles p on p.id = op.professional_id
  left join public.professional_profiles pp on pp.professional_id = op.professional_id
  where op.order_id = p_order_id
    and (
      o.client_id = v_uid
      or op.professional_id = v_uid
      or private.is_manito_admin()
    )
  order by
    case when op.status = 'sent' and op.valid_until > now() then 0 else 1 end,
    op.updated_at desc,
    op.created_at desc;
end;
$$;

revoke all on function public.list_order_proposals(uuid) from public, anon;
grant execute on function public.list_order_proposals(uuid) to authenticated;
