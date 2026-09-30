-- Approved pilot matrix. Resolve generated IDs through catalogue keys, never literal IDs.
do $$
begin
 if (select count(*) from public.services where slug=any(array['plomeria','electricidad','cerrajeria','limpieza','pintura','jardin','arreglos','aire','electro','carpinteria','tecnologia','albanileria','pileta','mecanica_automotor','gomeria','chapa_pintura_auto','diseno_interiores','fotografia','profesores_particulares','soporte_remoto','gas','mudanzas','fumigacion','arquitectura','ingenieria']))<>25
 or not exists(select 1 from public.specialties sp join public.services s on s.id=sp.service_id where s.slug='electricidad' and sp.name='Instalaciones') then
  raise exception 'El catalogo no coincide con la matriz aprobada';
 end if;
end $$;

insert into private.provider_activity_requirements(service_id)
 select id from public.services
 on conflict(service_id,specialty_id) do nothing;
update private.provider_activity_requirements r set
 level=case when s.slug in ('arquitectura','ingenieria') then 'LEVEL_3'
            when s.slug in ('gas','mudanzas','fumigacion') then 'LEVEL_2' else 'LEVEL_1' end,
 credential_kinds=case s.slug when 'gas' then array['gas_installer_registration']
 when 'fumigacion' then array['pest_control_authorization']
 when 'mudanzas' then array['transport_vehicle_review'] else '{}'::text[] end,
 configured_at=now()
from public.services s where s.id=r.service_id and r.specialty_id is null
 and s.slug=any(array['plomeria','electricidad','cerrajeria','limpieza','pintura','jardin','arreglos','aire','electro','carpinteria','tecnologia','albanileria','pileta','mecanica_automotor','gomeria','chapa_pintura_auto','diseno_interiores','fotografia','profesores_particulares','soporte_remoto','gas','mudanzas','fumigacion','arquitectura','ingenieria']);

insert into private.provider_activity_requirements(service_id,specialty_id,level,credential_kinds,configured_at)
select s.id,sp.id,case when s.slug='electricidad' and sp.name='Instalaciones' then 'LEVEL_2' else 'LEVEL_1' end,
 case when s.slug='electricidad' and sp.name='Instalaciones' then array['electrical_installer_registration'] else '{}'::text[] end,now()
from public.specialties sp join public.services s on s.id=sp.service_id
where s.slug in ('electricidad','plomeria');

-- Remove only the universal insurance requirement; retain all documents and other settings.
update public.admin_settings set value=jsonb_set(value,'{default}',
 coalesce((select jsonb_agg(item order by ordinal) from jsonb_array_elements(value->'default') with ordinality e(item,ordinal)
 where item->>'kind'<>'insurance'),'[]'::jsonb))
where key='professional_verification_requirements';

create table private.provider_activity_reviews (
 id uuid primary key default gen_random_uuid(),
 professional_id uuid not null references public.profiles(id) on delete restrict,
 service_id bigint not null references public.services(id),
 kind text not null check(kind in ('gas_installer_registration','electrical_installer_registration','pest_control_authorization','transport_vehicle_review')),
 document_id uuid not null references public.professional_documents(id) on delete restrict,
 document_path text not null,
 status text not null check(status in ('APPROVED','REJECTED','NEEDS_REVIEW')),
 details jsonb not null check(jsonb_typeof(details)='object'),
 reviewed_by uuid not null references public.profiles(id) on delete restrict,
 verified_at timestamptz not null default now(),
 unique(professional_id,service_id,kind)
);
alter table private.provider_activity_reviews enable row level security;
revoke all on private.provider_activity_reviews from public,anon,authenticated,service_role;
comment on table private.provider_activity_reviews is 'Private manual sector review. Transport requirements are assessed per declared vehicle/scope, not a fleet system. No public credential numbers.';

create function public.get_provider_activity_reviews(p_professional_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or (auth.uid()<>p_professional_id and not private.is_manito_admin(auth.uid())) then raise exception 'No autorizado'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('service_id',service_id,'kind',kind,'status',status,
 'details',details,'verified_at',verified_at,'reviewed_by',reviewed_by)) from private.provider_activity_reviews where professional_id=p_professional_id),'[]'::jsonb);
end $$;

create function public.review_provider_activity_document(p_professional_id uuid,p_service_id bigint,p_kind text,p_document_id uuid,p_status text,p_details jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare d public.professional_documents; k text; check_item jsonb;
begin
 if auth.uid() is null or not private.is_manito_admin(auth.uid()) then raise exception 'No autorizado'; end if;
 if p_status is null or p_status not in ('APPROVED','REJECTED','NEEDS_REVIEW') or p_details is null
 or jsonb_typeof(p_details)<>'object' or octet_length(p_details::text)>12000
 or coalesce(length(trim(p_details->>'observation')),0) not between 3 and 1000 then raise exception 'Revision incompleta'; end if;
 perform pg_advisory_xact_lock_shared(hashtextextended(p_service_id::text,130));
 perform 1 from private.provider_identities where canonical_professional_profile_id=p_professional_id for update;
 if not exists(select 1 from private.provider_activity_requirements where service_id=p_service_id and p_kind=any(credential_kinds))
 or p_kind not in ('gas_installer_registration','electrical_installer_registration','pest_control_authorization','transport_vehicle_review') then raise exception 'Credencial no configurada'; end if;
 select * into d from public.professional_documents where id=p_document_id and professional_id=p_professional_id and kind=p_kind for share;
 if d.id is null or d.file_path is null or (p_status='APPROVED' and d.status<>'approved') then raise exception 'Primero revisa el documento de esta actividad'; end if;
 if p_status='APPROVED' then
  if p_kind in ('gas_installer_registration','electrical_installer_registration') and
   (coalesce(length(trim(p_details->>'registration_number')),0) not between 1 and 120
    or coalesce(length(trim(p_details->>'registry')),0) not between 2 and 200) then raise exception 'Falta matricula o registro'; end if;
  if p_kind='pest_control_authorization' and
   (coalesce(length(trim(p_details->>'municipal_framework')),0) not between 3 and 300
    or coalesce(length(trim(p_details->>'registration_number')),0) not between 1 and 120
    or jsonb_typeof(p_details->'technical_responsible_applicable') is distinct from 'boolean'
    or (p_details->>'technical_responsible_applicable'='true' and coalesce(length(trim(p_details->>'technical_responsible')),0) not between 3 and 200)
    or (p_details->>'technical_responsible_applicable'='false' and coalesce(length(trim(p_details->>'technical_responsible_reason')),0) not between 3 and 300)) then raise exception 'Falta encuadre o responsable tecnico'; end if;
  if p_kind='transport_vehicle_review' then
   if coalesce(length(trim(p_details->>'vehicle_scope')),0) not between 3 and 400 then raise exception 'Falta vehiculo y alcance revisado'; end if;
   foreach k in array array['pba_cargo','professional_license','vehicle_documents','motor_insurance','vtv'] loop
    check_item:=p_details->'checks'->k;
    if check_item is null or jsonb_typeof(check_item->'applicable') is distinct from 'boolean'
      or coalesce(length(trim(check_item->>'reference')),0) not between 3 and 300
      or (check_item->>'applicable'='true' and check_item->>'verified' is distinct from 'true') then raise exception 'Falta revisar requisitos segun vehiculo y alcance'; end if;
   end loop;
  end if;
 end if;
 insert into private.provider_activity_reviews(professional_id,service_id,kind,document_id,document_path,status,details,reviewed_by,verified_at)
 values(p_professional_id,p_service_id,p_kind,p_document_id,d.file_path,p_status,p_details,auth.uid(),now())
 on conflict(professional_id,service_id,kind) do update set document_id=excluded.document_id,document_path=excluded.document_path,
 status=excluded.status,details=excluded.details,reviewed_by=excluded.reviewed_by,verified_at=excluded.verified_at;
 perform private.provider_event(null,null,'ACTIVITY_DOCUMENT_REVIEWED',p_status);
end $$;

create function private.provider_sector_ready(p_profile uuid,p_service bigint,p_specialty bigint)
returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.provider_activity_requirements r cross join lateral unnest(r.credential_kinds) k
 where r.service_id=p_service and (r.specialty_id is null or p_specialty is null or r.specialty_id=p_specialty)
 and k in ('gas_installer_registration','electrical_installer_registration','pest_control_authorization','transport_vehicle_review')
 and not exists(select 1 from private.provider_activity_reviews v join public.professional_documents d on d.id=v.document_id
 where v.professional_id=p_profile and v.service_id=p_service and v.kind=k and v.status='APPROVED'
 and d.professional_id=p_profile and d.kind=k and d.status='approved' and d.file_path=v.document_path));
$$;

-- A revoked/replaced document must never silently revive a previous sector approval.
create function private.invalidate_provider_activity_review()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status or new.file_path is distinct from old.file_path
 or new.kind is distinct from old.kind or new.professional_id is distinct from old.professional_id then
  update private.provider_activity_reviews set status='NEEDS_REVIEW' where document_id=old.id;
 end if;
 return new;
end $$;
create trigger identity_sector_document_changed after update on public.professional_documents
 for each row execute function private.invalidate_provider_activity_review();
revoke all on function private.invalidate_provider_activity_review() from public,anon,authenticated,service_role;

create or replace function private.provider_activity_can_contract(p_profile uuid,p_service bigint,p_specialty bigint)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.provider_qa_exceptions q where q.professional_id=p_profile and q.enabled)
 or (exists(select 1 from private.provider_identities i where i.canonical_professional_profile_id=p_profile
   and i.provider_type='PERSON' and i.fiscal_status='VERIFIED' and i.operational_status='ENABLED')
 and not exists(select 1 from unnest(array['dni_front','dni_back','selfie','tax']) k where not exists(
   select 1 from public.professional_documents d where d.professional_id=p_profile and d.kind=k and d.status='approved' and d.file_path is not null))
 and exists(select 1 from private.provider_activity_requirements r where r.service_id=p_service and r.specialty_id is null and r.level in ('LEVEL_1','LEVEL_2'))
 and not exists(select 1 from private.provider_activity_requirements r where r.service_id=p_service
   and (r.specialty_id is null or p_specialty is null or r.specialty_id=p_specialty)
   and (r.level is null or r.level='LEVEL_3' or (r.level='LEVEL_2' and exists(
     select 1 from unnest(r.credential_kinds) k where not exists(select 1 from public.professional_documents d
       where d.professional_id=p_profile and d.kind=k and d.status='approved' and d.file_path is not null)))))
 and private.provider_sector_ready(p_profile,p_service,p_specialty))
$$;

create or replace function private.admin_professional_requirements(p_professional_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select value->'default' from public.admin_settings where key='professional_verification_requirements'),'[]'::jsonb)
 || coalesce((select jsonb_agg(jsonb_build_object('kind',k,'label',replace(k,'_',' '),'category','professional'))
 from (select distinct unnest(r.credential_kinds) k from private.provider_activity_requirements r
 join public.professional_services ps on ps.service_id=r.service_id and ps.professional_id=p_professional_id
 where r.specialty_id is null or exists(select 1 from public.professional_specialties sp where sp.professional_id=p_professional_id and sp.specialty_id=r.specialty_id)) kinds),'[]'::jsonb);
$$;

create or replace function public.get_my_provider_activity_requirements()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'No autenticado'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('service_id',r.service_id,'specialty_id',r.specialty_id,
 'level',r.level,'credential_kinds',r.credential_kinds)) from private.provider_activity_requirements r
 join public.professional_services ps on ps.service_id=r.service_id and ps.professional_id=auth.uid()
 where r.specialty_id is null or exists(select 1 from public.professional_specialties sp where sp.professional_id=auth.uid() and sp.specialty_id=r.specialty_id)),'[]'::jsonb);
end $$;

revoke all on function private.provider_sector_ready(uuid,bigint,bigint),private.admin_professional_requirements(uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_provider_activity_reviews(uuid),public.review_provider_activity_document(uuid,bigint,text,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_provider_activity_reviews(uuid),public.review_provider_activity_document(uuid,bigint,text,uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
