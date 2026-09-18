-- ADMIN-VERIFY-001: scalable professional verification queue and audit trail.

create table if not exists private.professional_verification_events (
  id bigint generated always as identity primary key,
  professional_id uuid not null references public.profiles(id) on delete cascade,
  document_id uuid references public.professional_documents(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('onboarding_status', 'document_status')),
  from_status text,
  to_status text not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists professional_verification_events_professional_created_idx
  on private.professional_verification_events (professional_id, created_at desc);

revoke all on table private.professional_verification_events from public, anon, authenticated;
revoke all on sequence private.professional_verification_events_id_seq from public, anon, authenticated;

insert into public.admin_settings (key, value)
values (
  'professional_verification_requirements',
  '{
    "version": 1,
    "default": [
      {"kind":"dni_front","label":"DNI frente","category":"identity"},
      {"kind":"dni_back","label":"DNI dorso","category":"identity"},
      {"kind":"selfie","label":"Selfie de verificación","category":"identity"},
      {"kind":"tax","label":"Constancia fiscal","category":"professional"},
      {"kind":"insurance","label":"Seguro o matrícula","category":"professional"}
    ],
    "by_service_slug": {}
  }'::jsonb
)
on conflict (key) do nothing;

create or replace function private.admin_professional_requirements(p_professional_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select a.value -> 'default'
      from public.admin_settings a
      where a.key = 'professional_verification_requirements'
    ),
    '[]'::jsonb
  );
$$;

revoke all on function private.admin_professional_requirements(uuid) from public, anon, authenticated;

create or replace function public.list_admin_professional_review_queue(
  p_scope text default 'active',
  p_queue_state text default 'all',
  p_service_id bigint default null,
  p_search text default null,
  p_sort text default 'oldest',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  professional_id uuid,
  full_name text,
  email text,
  city text,
  onboarding_status text,
  identity_status text,
  professional_verification_status text,
  queue_state text,
  primary_service_name text,
  service_names text[],
  documents_present integer,
  documents_required integer,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  onboarding_updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope text := lower(coalesce(p_scope, 'active'));
  v_queue_state text := lower(coalesce(p_queue_state, 'all'));
  v_sort text := lower(coalesce(p_sort, 'oldest'));
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not private.is_manito_admin() then
    raise exception 'Solo MANITO puede consultar verificaciones';
  end if;

  if v_scope not in ('active', 'resolved') then
    raise exception 'Bandeja invalida';
  end if;
  if v_queue_state not in ('all', 'ready', 'incomplete', 'correction', 'approved', 'rejected') then
    raise exception 'Filtro invalido';
  end if;
  if v_sort not in ('oldest', 'newest', 'complete') then
    raise exception 'Orden invalido';
  end if;

  return query
  with base as (
    select
      p.id,
      p.full_name,
      p.email,
      coalesce(pp.work_city, p.city) as city,
      po.status,
      po.current_step,
      po.submitted_at,
      po.reviewed_at,
      po.updated_at,
      private.admin_professional_requirements(p.id) as requirements,
      coalesce(sv.names, array[]::text[]) as service_names,
      sv.primary_name,
      coalesce(dc.present_count, 0)::integer as present_count,
      coalesce(dc.accessible_count, 0)::integer as accessible_count,
      coalesce(dc.identity_approved, 0)::integer as identity_approved,
      coalesce(dc.identity_present, 0)::integer as identity_present,
      coalesce(dc.professional_approved, 0)::integer as professional_approved,
      coalesce(dc.professional_present, 0)::integer as professional_present,
      coalesce(dc.correction_count, 0)::integer as correction_count
    from public.professional_onboarding po
    join public.profiles p on p.id = po.professional_id
    left join public.professional_profiles pp on pp.professional_id = p.id
    left join lateral (
      select
        array_agg(s.name order by s.name) as names,
        min(s.name) as primary_name,
        bool_or(ps.service_id = p_service_id) as matches_service
      from public.professional_services ps
      join public.services s on s.id = ps.service_id
      where ps.professional_id = p.id
    ) sv on true
    left join lateral (
      select
        count(*) filter (where d.file_path is not null)::integer as present_count,
        count(*) filter (
          where d.file_path is not null
            and exists (
              select 1 from storage.objects so
              where so.bucket_id = 'manito-media' and so.name = d.file_path
            )
        )::integer as accessible_count,
        count(*) filter (where d.kind in ('dni_front','dni_back','selfie') and d.file_path is not null)::integer as identity_present,
        count(*) filter (where d.kind in ('dni_front','dni_back','selfie') and d.status = 'approved')::integer as identity_approved,
        count(*) filter (where d.kind not in ('dni_front','dni_back','selfie') and d.file_path is not null)::integer as professional_present,
        count(*) filter (where d.kind not in ('dni_front','dni_back','selfie') and d.status = 'approved')::integer as professional_approved,
        count(*) filter (where d.status in ('observed','rejected'))::integer as correction_count
      from public.professional_documents d
      where d.professional_id = p.id
    ) dc on true
    where (
      (v_scope = 'active' and po.status in ('submitted','in_review','observed'))
      or (v_scope = 'resolved' and po.status in ('approved','rejected'))
    )
      and (p_service_id is null or coalesce(sv.matches_service, false))
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or p.full_name ilike '%' || btrim(p_search) || '%'
        or coalesce(p.email, '') ilike '%' || btrim(p_search) || '%'
        or exists (select 1 from unnest(coalesce(sv.names, array[]::text[])) n where n ilike '%' || btrim(p_search) || '%')
      )
  ), classified as (
    select
      b.*,
      jsonb_array_length(b.requirements) as required_count,
      case
        when b.status = 'approved' then 'verified'
        when b.correction_count > 0 or b.status = 'observed' then 'requires_correction'
        when b.identity_present < 3 then 'incomplete'
        when b.identity_approved = 3 then 'verified'
        else 'requires_review'
      end as computed_identity_status,
      case
        when b.status = 'approved' then 'verified'
        when b.correction_count > 0 or b.status = 'observed' then 'requires_correction'
        when cardinality(b.service_names) = 0 or b.present_count < jsonb_array_length(b.requirements) then 'incomplete'
        when b.professional_approved >= 2 then 'verified'
        else 'requires_review'
      end as computed_professional_status,
      case
        when b.status = 'approved' then 'approved'
        when b.status = 'rejected' then 'rejected'
        when b.correction_count > 0 or b.status = 'observed' then 'correction'
        when b.current_step < 16
          or cardinality(b.service_names) = 0
          or b.present_count < jsonb_array_length(b.requirements)
          or b.accessible_count < b.present_count then 'incomplete'
        else 'ready'
      end as computed_queue_state
    from base b
  ), filtered as (
    select c.*
    from classified c
    where v_queue_state = 'all' or c.computed_queue_state = v_queue_state
  )
  select
    f.id,
    f.full_name,
    f.email,
    f.city,
    f.status,
    f.computed_identity_status,
    f.computed_professional_status,
    f.computed_queue_state,
    f.primary_name,
    f.service_names,
    f.present_count,
    f.required_count,
    f.submitted_at,
    f.reviewed_at,
    f.updated_at,
    count(*) over()
  from filtered f
  order by
    case when v_sort = 'complete' then (f.present_count::numeric / greatest(f.required_count, 1)) end desc nulls last,
    case when v_sort = 'newest' then coalesce(f.submitted_at, f.updated_at) end desc nulls last,
    case when v_sort = 'oldest' then coalesce(f.submitted_at, f.updated_at) end asc nulls last,
    f.full_name
  limit v_limit offset v_offset;
end;
$$;

create or replace function public.get_admin_professional_review(p_professional_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.is_manito_admin() then
    raise exception 'Solo MANITO puede consultar verificaciones';
  end if;

  select jsonb_build_object(
    'professional_id', p.id,
    'full_name', p.full_name,
    'email', p.email,
    'phone', p.phone,
    'city', p.city,
    'is_available', p.is_available,
    'onboarding_status', coalesce(po.status, 'draft'),
    'current_step', coalesce(po.current_step, 1),
    'onboarding_notes', po.notes,
    'submitted_at', po.submitted_at,
    'reviewed_at', po.reviewed_at,
    'onboarding_updated_at', po.updated_at,
    'headline', pp.headline,
    'bio', pp.bio,
    'years_experience', pp.years_experience,
    'work_city', pp.work_city,
    'service_radius_km', pp.service_radius_km,
    'work_days', pp.work_days,
    'work_starts_at', pp.work_starts_at,
    'work_ends_at', pp.work_ends_at,
    'insurance_label', pp.insurance_label,
    'verified', coalesce(pp.verified, false),
    'manito_pro', coalesce(pp.manito_pro, false),
    'rating_avg', coalesce(pp.rating_avg, 0),
    'jobs_completed', coalesce(pp.jobs_completed, 0),
    'requirements', private.admin_professional_requirements(p.id),
    'services', coalesce(sv.items, '[]'::jsonb),
    'documents', coalesce(dv.items, '[]'::jsonb),
    'history', coalesce(hv.items, '[]'::jsonb)
  ) into v_result
  from public.profiles p
  left join public.professional_onboarding po on po.professional_id = p.id
  left join public.professional_profiles pp on pp.professional_id = p.id
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'service_id', ps.service_id,
      'service_name', s.name,
      'service_slug', s.slug,
      'price_from', ps.price_from,
      'specialties', coalesce(spv.items, '[]'::jsonb)
    ) order by s.name) as items
    from public.professional_services ps
    join public.services s on s.id = ps.service_id
    left join lateral (
      select jsonb_agg(jsonb_build_object('specialty_id', sp.id, 'specialty_name', sp.name) order by sp.position, sp.name) as items
      from public.professional_specialties psp
      join public.specialties sp on sp.id = psp.specialty_id and sp.service_id = psp.service_id
      where psp.professional_id = p.id and psp.service_id = ps.service_id
    ) spv on true
    where ps.professional_id = p.id
  ) sv on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', d.id,
      'kind', d.kind,
      'label', d.label,
      'status', d.status,
      'file_path', d.file_path,
      'observation', d.observation,
      'created_at', d.created_at,
      'updated_at', d.updated_at,
      'file_accessible', exists (
        select 1 from storage.objects so where so.bucket_id = 'manito-media' and so.name = d.file_path
      ),
      'format_allowed', lower(split_part(d.file_path, '.', -1)) in ('jpg','jpeg','png','webp','pdf')
    ) order by d.created_at, d.label) as items
    from public.professional_documents d
    where d.professional_id = p.id
  ) dv on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', e.id,
      'document_id', e.document_id,
      'event_type', e.event_type,
      'from_status', e.from_status,
      'to_status', e.to_status,
      'note', e.note,
      'created_at', e.created_at
    ) order by e.created_at desc) as items
    from private.professional_verification_events e
    where e.professional_id = p.id
  ) hv on true
  where p.id = p_professional_id;

  if v_result is null then
    raise exception 'No existe el expediente profesional';
  end if;
  return v_result;
end;
$$;

create or replace function public.review_professional_onboarding(
  p_professional_id uuid,
  p_status text,
  p_notes text default null,
  p_verified boolean default null,
  p_manito_pro boolean default null
)
returns public.professional_onboarding
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_previous_status text;
  v_onboarding public.professional_onboarding;
begin
  if not private.is_manito_admin() then raise exception 'Solo MANITO puede revisar altas profesionales'; end if;
  if v_status not in ('in_review','approved','observed','rejected','suspended') then raise exception 'Estado de revision invalido'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_professional_id) then raise exception 'No existe el perfil profesional'; end if;

  select po.status into v_previous_status from public.professional_onboarding po where po.professional_id = p_professional_id for update;

  if v_status = 'approved' then
    update public.profiles set role = case when role = 'admin' then role else 'professional' end, updated_at = now() where id = p_professional_id;
  end if;

  insert into public.professional_profiles (professional_id, verified, manito_pro)
  values (p_professional_id, v_status = 'approved', coalesce(p_manito_pro, false))
  on conflict (professional_id) do update set
    verified = coalesce(p_verified, case when v_status = 'approved' then true when v_status in ('observed','rejected','suspended') then false else public.professional_profiles.verified end),
    manito_pro = coalesce(p_manito_pro, public.professional_profiles.manito_pro),
    updated_at = now();

  insert into public.professional_onboarding (professional_id,status,current_step,notes,submitted_at,reviewed_at)
  values (p_professional_id,v_status,16,nullif(btrim(coalesce(p_notes,'')),''),now(),now())
  on conflict (professional_id) do update set
    status=excluded.status,
    current_step=greatest(public.professional_onboarding.current_step,16),
    notes=excluded.notes,
    submitted_at=coalesce(public.professional_onboarding.submitted_at,now()),
    reviewed_at=now(),
    updated_at=now()
  returning * into v_onboarding;

  insert into private.professional_verification_events (professional_id,actor_id,event_type,from_status,to_status,note)
  values (p_professional_id,auth.uid(),'onboarding_status',v_previous_status,v_status,nullif(btrim(coalesce(p_notes,'')),''));
  return v_onboarding;
end;
$$;

create or replace function public.review_professional_document(
  p_document_id uuid,
  p_status text,
  p_observation text default null
)
returns public.professional_documents
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_previous_status text;
  v_document public.professional_documents;
begin
  if not private.is_manito_admin() then raise exception 'Solo MANITO puede revisar documentos'; end if;
  if v_status not in ('approved','observed','rejected') then raise exception 'Estado de documento invalido'; end if;

  select d.status into v_previous_status from public.professional_documents d where d.id = p_document_id for update;
  update public.professional_documents
    set status=v_status, observation=nullif(btrim(coalesce(p_observation,'')),''), updated_at=now()
    where id=p_document_id returning * into v_document;
  if v_document.id is null then raise exception 'No existe el documento'; end if;

  insert into private.professional_verification_events (professional_id,document_id,actor_id,event_type,from_status,to_status,note)
  values (v_document.professional_id,v_document.id,auth.uid(),'document_status',v_previous_status,v_status,nullif(btrim(coalesce(p_observation,'')),''));
  return v_document;
end;
$$;

revoke all on function public.list_admin_professional_review_queue(text,text,bigint,text,text,integer,integer) from public, anon;
revoke all on function public.get_admin_professional_review(uuid) from public, anon;
revoke all on function public.review_professional_onboarding(uuid,text,text,boolean,boolean) from public, anon;
revoke all on function public.review_professional_document(uuid,text,text) from public, anon;
grant execute on function public.list_admin_professional_review_queue(text,text,bigint,text,text,integer,integer) to authenticated;
grant execute on function public.get_admin_professional_review(uuid) to authenticated;
grant execute on function public.review_professional_onboarding(uuid,text,text,boolean,boolean) to authenticated;
grant execute on function public.review_professional_document(uuid,text,text) to authenticated;
