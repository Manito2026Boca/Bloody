-- NORM-011: traceable and configurable order evidence.

alter table public.services
  add column if not exists requires_completion_evidence boolean not null default false;

comment on column public.services.requires_completion_evidence is
  'When true, the assigned professional must upload at least one after-stage order evidence item before complete_order succeeds.';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'order_photos'
      and column_name = 'kind'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'order_photos'
      and column_name = 'stage'
  ) then
    alter table public.order_photos rename column kind to stage;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'order_photos'
      and column_name = 'kind'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'order_photos'
      and column_name = 'stage'
  ) then
    update public.order_photos
       set stage = kind
     where stage is null;
    alter table public.order_photos drop column kind;
  end if;
end $$;

alter table public.order_photos
  add column if not exists caption text;

alter table public.order_photos
  drop constraint if exists order_photos_kind_check,
  drop constraint if exists order_photos_stage_check,
  drop constraint if exists order_photos_caption_length,
  drop constraint if exists order_photos_file_path_present;

update public.order_photos
   set stage = case
     when stage in ('problem', 'before') then 'before'
     when stage = 'after' then 'after'
     else 'during'
   end
 where stage is distinct from case
     when stage in ('problem', 'before') then 'before'
     when stage = 'after' then 'after'
     else 'during'
   end;

update public.order_photos
   set caption = nullif(file_name, '')
 where caption is null
   and file_name is not null;

alter table public.order_photos
  alter column stage set default 'before',
  alter column stage set not null,
  alter column file_path set not null,
  add constraint order_photos_stage_check
    check (stage in ('before', 'during', 'after')),
  add constraint order_photos_caption_length
    check (caption is null or char_length(caption) <= 240),
  add constraint order_photos_file_path_present
    check (char_length(btrim(file_path)) between 1 and 1024);

comment on column public.order_photos.stage is
  'Temporal evidence stage: before, during, or after.';
comment on column public.order_photos.caption is
  'Optional short user-facing evidence caption.';
comment on column public.order_photos.file_path is
  'Private manito-media object path. Signed URLs are generated transiently and never persisted.';

create index if not exists idx_order_photos_order_stage_created
  on public.order_photos(order_id, stage, created_at);
create unique index if not exists idx_order_photos_file_path_unique
  on public.order_photos(file_path);

revoke all on public.order_photos from anon, authenticated;
grant select on public.order_photos to authenticated;

drop policy if exists order_photos_participants on public.order_photos;
create policy order_photos_participants on public.order_photos
for select to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_photos.order_id
      and (
        o.client_id = (select auth.uid())
        or o.professional_id = (select auth.uid())
      )
  )
  or private.is_manito_admin()
);

drop policy if exists order_photos_insert_participants on public.order_photos;

insert into public.admin_settings (key, value)
values (
  'evidence',
  jsonb_build_object(
    'schema_version', 1,
    'max_files_per_stage', 6,
    'storage_bucket', 'manito-media',
    'signed_url_seconds', 600
  )
)
on conflict (key) do update
  set value = public.admin_settings.value
    || jsonb_build_object(
      'schema_version', 1,
      'max_files_per_stage', coalesce(public.admin_settings.value->'max_files_per_stage', '6'::jsonb),
      'storage_bucket', 'manito-media',
      'signed_url_seconds', coalesce(public.admin_settings.value->'signed_url_seconds', '600'::jsonb)
    ),
      updated_at = now();

create or replace function private.current_evidence_policy()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select value from public.admin_settings where key = 'evidence'),
    jsonb_build_object(
      'schema_version', 1,
      'max_files_per_stage', 6,
      'storage_bucket', 'manito-media',
      'signed_url_seconds', 600
    )
  );
$$;

create or replace function private.evidence_policy_int(p_policy jsonb, p_key text, p_default integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(p_policy->>p_key, '')::integer, p_default);
$$;

drop function if exists public.add_order_evidence(uuid, text, text, text, text);
create function public.add_order_evidence(
  p_order_id uuid,
  p_stage text,
  p_file_path text,
  p_file_name text default null,
  p_caption text default null
)
returns public.order_photos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_stage text := lower(btrim(coalesce(p_stage, '')));
  v_file_path text := btrim(coalesce(p_file_path, ''));
  v_file_name text := nullif(btrim(coalesce(p_file_name, '')), '');
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  v_limit integer := greatest(1, private.evidence_policy_int(private.current_evidence_policy(), 'max_files_per_stage', 6));
  v_count integer;
  v_photo public.order_photos;
begin
  if v_uid is null then
    raise exception 'Tenés que iniciar sesión';
  end if;

  if v_stage not in ('before', 'during', 'after') then
    raise exception 'Etapa de evidencia inválida';
  end if;

  if v_file_path = '' then
    raise exception 'No se recibió el archivo de evidencia';
  end if;

  if v_file_path !~ ('^orders/' || p_order_id::text || '/evidence/' || v_uid::text || '/[^/].+') then
    raise exception 'La ruta de evidencia no corresponde al pedido';
  end if;

  if v_caption is not null and char_length(v_caption) > 240 then
    raise exception 'La descripción de la evidencia es demasiado larga';
  end if;

  select *
    into v_order
    from public.orders o
   where o.id = p_order_id
     and (
       o.client_id = v_uid
       or o.professional_id = v_uid
     )
   for update;

  if v_order.id is null then
    raise exception 'No podés agregar evidencia a este pedido';
  end if;

  if v_order.status in ('completed', 'cancelled', 'matching_failed') then
    raise exception 'Este pedido ya no admite nueva evidencia';
  end if;

  if v_stage = 'before' and v_order.status not in (
    'open', 'scheduled_open', 'waiting_quotes', 'payment_pending', 'accepted', 'en_camino', 'en_sitio'
  ) then
    raise exception 'La evidencia inicial se carga antes de empezar el trabajo';
  end if;

  if v_stage = 'during' and v_order.status not in ('accepted', 'en_camino', 'en_sitio', 'trabajando') then
    raise exception 'La evidencia durante el trabajo se carga con el pedido activo';
  end if;

  if v_stage = 'after' then
    if v_order.professional_id is distinct from v_uid or v_order.status <> 'trabajando' then
      raise exception 'La evidencia final la carga el profesional durante el trabajo';
    end if;
  end if;

  if not exists (
    select 1
    from storage.objects so
    where so.bucket_id = 'manito-media'
      and so.name = v_file_path
      and so.owner = v_uid
  ) then
    raise exception 'No encontramos el archivo privado de evidencia';
  end if;

  select count(*)
    into v_count
    from public.order_photos op
   where op.order_id = p_order_id
     and op.stage = v_stage;

  if v_count >= v_limit then
    raise exception 'Ya alcanzaste el límite de fotos para esta etapa';
  end if;

  insert into public.order_photos (
    order_id,
    uploaded_by,
    stage,
    file_path,
    file_name,
    caption
  )
  values (
    p_order_id,
    v_uid,
    v_stage,
    v_file_path,
    v_file_name,
    v_caption
  )
  returning * into v_photo;

  return v_photo;
end;
$$;

drop function if exists public.list_order_evidence(uuid);
create function public.list_order_evidence(p_order_id uuid)
returns table (
  id uuid,
  order_id uuid,
  uploaded_by uuid,
  stage text,
  file_path text,
  file_name text,
  caption text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    op.id,
    op.order_id,
    op.uploaded_by,
    op.stage,
    op.file_path,
    op.file_name,
    op.caption,
    op.created_at
  from public.order_photos op
  where op.order_id = p_order_id
    and (
      private.is_manito_admin()
      or exists (
        select 1
        from public.orders o
        where o.id = op.order_id
          and (
            o.client_id = (select auth.uid())
            or o.professional_id = (select auth.uid())
          )
      )
    )
  order by
    case op.stage
      when 'before' then 1
      when 'during' then 2
      when 'after' then 3
      else 4
    end,
    op.created_at;
$$;

create or replace function private.complete_order_impl(p_order_id uuid, p_pin text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_requires_completion_evidence boolean := false;
begin
  select o.*
    into v_order
    from public.orders o
   where o.id = p_order_id
     and o.professional_id = v_uid
     and o.status = 'trabajando'
     and o.end_pin = btrim(coalesce(p_pin, ''))
   for update;

  if v_order.id is null then
    raise exception 'PIN de cierre incorrecto o pedido no disponible';
  end if;

  select coalesce(s.requires_completion_evidence, false)
    into v_requires_completion_evidence
    from public.services s
   where s.id = v_order.service_id;

  if v_requires_completion_evidence
     and not exists (
       select 1
       from public.order_photos op
       where op.order_id = p_order_id
         and op.uploaded_by = v_uid
         and op.stage = 'after'
         and op.file_path is not null
     ) then
    raise exception 'Agregá al menos una foto del trabajo terminado antes de finalizar.';
  end if;

  update public.orders
     set status = 'completed',
         completed_at = now(),
         updated_at = now()
   where id = p_order_id
  returning * into v_order;

  return v_order;
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

drop policy if exists manito_media_delete_unlinked_own on storage.objects;
create policy manito_media_delete_unlinked_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'manito-media'
  and owner = (select auth.uid())
  and not exists (
    select 1
    from public.order_photos op
    where op.file_path = storage.objects.name
  )
);

grant delete on storage.objects to authenticated;

revoke all on function private.current_evidence_policy() from public, anon, authenticated;
revoke all on function private.evidence_policy_int(jsonb, text, integer) from public, anon, authenticated;
revoke all on function private.complete_order_impl(uuid, text) from public, anon, authenticated;

revoke all on function public.add_order_evidence(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.list_order_evidence(uuid) from public, anon, authenticated;
revoke all on function public.complete_order(uuid, text) from public, anon;

grant execute on function public.add_order_evidence(uuid, text, text, text, text) to authenticated;
grant execute on function public.list_order_evidence(uuid) to authenticated;
grant execute on function public.complete_order(uuid, text) to authenticated;

insert into public.admin_settings (key, value)
values (
  'norm_011_evidence',
  jsonb_build_object(
    'schema_version', 1,
    'order_photos_model', 'stage_file_path_file_name_caption',
    'stages', jsonb_build_array('before', 'during', 'after'),
    'requires_completion_evidence_source', 'services.requires_completion_evidence',
    'private_bucket', 'manito-media',
    'signed_urls_persisted', false,
    'normal_user_delete_associated_evidence', false,
    'orphan_cleanup', 'owner_can_delete_unlinked_storage_object'
  )
)
on conflict (key) do update
  set value = excluded.value,
      updated_at = now();
