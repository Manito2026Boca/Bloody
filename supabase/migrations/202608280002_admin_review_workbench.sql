-- MANITO admin review workbench.
-- Admins can review professional onboarding and documents without exposing this
-- operational data to regular users.

create or replace function public.list_admin_professional_reviews()
returns table (
  professional_id uuid,
  full_name text,
  email text,
  phone text,
  city text,
  is_available boolean,
  onboarding_status text,
  current_step integer,
  onboarding_notes text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  onboarding_updated_at timestamptz,
  headline text,
  bio text,
  years_experience integer,
  work_city text,
  service_radius_km integer,
  work_days text[],
  work_starts_at time,
  work_ends_at time,
  insurance_label text,
  verified boolean,
  manito_pro boolean,
  rating_avg numeric,
  jobs_completed integer,
  services jsonb,
  documents jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id as professional_id,
    p.full_name,
    p.email,
    p.phone,
    p.city,
    p.is_available,
    coalesce(po.status, 'draft') as onboarding_status,
    coalesce(po.current_step, 1) as current_step,
    po.notes as onboarding_notes,
    po.submitted_at,
    po.reviewed_at,
    po.updated_at as onboarding_updated_at,
    pp.headline,
    pp.bio,
    pp.years_experience,
    pp.work_city,
    pp.service_radius_km,
    pp.work_days,
    pp.work_starts_at,
    pp.work_ends_at,
    pp.insurance_label,
    coalesce(pp.verified, false) as verified,
    coalesce(pp.manito_pro, false) as manito_pro,
    coalesce(pp.rating_avg, 0) as rating_avg,
    coalesce(pp.jobs_completed, 0) as jobs_completed,
    coalesce(service_list.items, '[]'::jsonb) as services,
    coalesce(document_list.items, '[]'::jsonb) as documents
  from public.profiles p
  left join public.professional_onboarding po
    on po.professional_id = p.id
  left join public.professional_profiles pp
    on pp.professional_id = p.id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'service_id', ps.service_id,
        'service_name', s.name,
        'service_slug', s.slug,
        'price_from', ps.price_from,
        'specialties', coalesce(specialty_list.items, '[]'::jsonb)
      )
      order by s.name
    ) as items
    from public.professional_services ps
    join public.services s
      on s.id = ps.service_id
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'specialty_id', sp.id,
          'specialty_name', sp.name
        )
        order by sp.position, sp.name
      ) as items
      from public.professional_specialties psp
      join public.specialties sp
        on sp.id = psp.specialty_id
       and sp.service_id = psp.service_id
      where psp.professional_id = p.id
        and psp.service_id = ps.service_id
    ) specialty_list on true
    where ps.professional_id = p.id
  ) service_list on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'kind', d.kind,
        'label', d.label,
        'status', d.status,
        'file_path', d.file_path,
        'observation', d.observation,
        'created_at', d.created_at,
        'updated_at', d.updated_at
      )
      order by d.created_at, d.label
    ) as items
    from public.professional_documents d
    where d.professional_id = p.id
  ) document_list on true
  where private.is_manito_admin()
    and p.role in ('professional', 'client')
    and (
      p.role = 'professional'
      or po.professional_id is not null
      or pp.professional_id is not null
    )
  order by
    case coalesce(po.status, 'draft')
      when 'submitted' then 1
      when 'in_review' then 2
      when 'observed' then 3
      when 'approved' then 4
      when 'rejected' then 5
      when 'suspended' then 6
      else 7
    end,
    po.submitted_at nulls last,
    p.full_name;
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
  v_onboarding public.professional_onboarding;
begin
  if not private.is_manito_admin() then
    raise exception 'Solo MANITO puede revisar altas profesionales';
  end if;

  if v_status not in ('in_review', 'approved', 'observed', 'rejected', 'suspended') then
    raise exception 'Estado de revision invalido';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_professional_id) then
    raise exception 'No existe el perfil profesional';
  end if;

  if v_status = 'approved' then
    update public.profiles
       set role = case when role = 'admin' then role else 'professional' end,
           updated_at = now()
     where id = p_professional_id;
  end if;

  insert into public.professional_profiles (professional_id, verified, manito_pro)
  values (
    p_professional_id,
    v_status = 'approved',
    coalesce(p_manito_pro, false)
  )
  on conflict (professional_id) do update
     set verified = coalesce(
           p_verified,
           case
             when v_status = 'approved' then true
             when v_status in ('observed', 'rejected', 'suspended') then false
             else public.professional_profiles.verified
           end
         ),
         manito_pro = coalesce(p_manito_pro, public.professional_profiles.manito_pro),
         updated_at = now();

  insert into public.professional_onboarding (
    professional_id,
    status,
    current_step,
    notes,
    submitted_at,
    reviewed_at
  )
  values (
    p_professional_id,
    v_status,
    16,
    nullif(btrim(coalesce(p_notes, '')), ''),
    now(),
    now()
  )
  on conflict (professional_id) do update
     set status = excluded.status,
         current_step = greatest(public.professional_onboarding.current_step, 16),
         notes = excluded.notes,
         submitted_at = coalesce(public.professional_onboarding.submitted_at, now()),
         reviewed_at = now(),
         updated_at = now()
  returning * into v_onboarding;

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
  v_document public.professional_documents;
begin
  if not private.is_manito_admin() then
    raise exception 'Solo MANITO puede revisar documentos';
  end if;

  if v_status not in ('approved', 'observed', 'rejected') then
    raise exception 'Estado de documento invalido';
  end if;

  update public.professional_documents
     set status = v_status,
         observation = nullif(btrim(coalesce(p_observation, '')), ''),
         updated_at = now()
   where id = p_document_id
  returning * into v_document;

  if v_document.id is null then
    raise exception 'No existe el documento';
  end if;

  return v_document;
end;
$$;

drop policy if exists manito_media_select_own on storage.objects;
create policy manito_media_select_own on storage.objects
for select to authenticated
using (
  bucket_id = 'manito-media'
  and (
    owner = (select auth.uid())
    or private.is_manito_admin()
    or exists (
      select 1
      from public.order_photos op
      join public.orders o on o.id = op.order_id
      where op.file_path = storage.objects.name
        and (
          o.client_id = (select auth.uid())
          or o.professional_id = (select auth.uid())
        )
    )
  )
);

revoke all on function public.list_admin_professional_reviews() from public, anon;
revoke all on function public.review_professional_onboarding(uuid, text, text, boolean, boolean) from public, anon;
revoke all on function public.review_professional_document(uuid, text, text) from public, anon;

grant execute on function public.list_admin_professional_reviews() to authenticated;
grant execute on function public.review_professional_onboarding(uuid, text, text, boolean, boolean) to authenticated;
grant execute on function public.review_professional_document(uuid, text, text) to authenticated;

insert into public.admin_settings (key, value)
values (
  'admin_review_workbench',
  '{
    "professional_reviews": "admin_rpc_only",
    "documents": "admin_can_review_and_open_private_storage",
    "approval_effect": "sets_profile_role_professional_and_verified",
    "rejection_effect": "keeps_profile_unverified"
  }'::jsonb
)
on conflict (key) do update
  set value = excluded.value,
      updated_at = now();
