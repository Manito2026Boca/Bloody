-- IDENTITY-ARCA-001. No existing tax_id is trusted or promoted to VERIFIED.
create function private.normalize_provider_cuit(p_value text)
returns text language sql immutable set search_path='' as $$
 select case when p_value ~ '^[0-9 .-]+$' then regexp_replace(p_value,'[^0-9]','','g') end
$$;

create function private.provider_cuit_valid(p_value text)
returns boolean language plpgsql immutable set search_path='' as $$
declare s integer := 0; weights integer[] := array[5,4,3,2,7,6,5,4,3,2]; d integer;
begin
 if p_value is null or p_value !~ '^[0-9]{11}$' or p_value='00000000000' then return false; end if;
 for i in 1..10 loop s := s + substring(p_value,i,1)::integer * weights[i]; end loop;
 d := 11 - (s % 11);
 if d=11 then d:=0; elsif d=10 then d:=9; end if;
 return d=substring(p_value,11,1)::integer;
end $$;

create table private.provider_identities (
 id uuid primary key default gen_random_uuid(),
 normalized_cuit text not null unique check(private.provider_cuit_valid(normalized_cuit)),
 provider_type text not null default 'PERSON' check(provider_type in ('PERSON','COMPANY')),
 fiscal_status text not null default 'PENDING' check(fiscal_status in ('UNVERIFIED','PENDING','VERIFIED','REJECTED','NEEDS_REVIEW')),
 verification_source text check(verification_source in ('MANUAL_ARCA','ARCA_WS')),
 verified_at timestamptz, verified_by uuid,
 canonical_professional_profile_id uuid unique references public.profiles(id) on delete restrict,
 operational_status text not null default 'RESTRICTED' check(operational_status in ('ENABLED','RESTRICTED','SUSPENDED')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
comment on table private.provider_identities is 'Stable private identity. Canonical FK deliberately prevents accidental Auth cascade/history deletion. PR-001 must define deliberate erasure and retention.';

create table private.provider_identity_claims (
 id uuid primary key default gen_random_uuid(),
 identity_id uuid not null references private.provider_identities(id) on delete restrict,
 claimant_profile_id uuid not null references public.profiles(id) on delete restrict,
 claim_type text not null check(claim_type in ('INITIAL','RECOVERY','CONFLICT','REVIEW')),
 status text not null default 'PENDING' check(status in ('PENDING','ACCEPTED','REJECTED','NEEDS_REVIEW')),
 reviewed_by uuid, reviewed_at timestamptz, reason_code text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index provider_claim_one_open on private.provider_identity_claims(claimant_profile_id)
 where status in ('PENDING','NEEDS_REVIEW');
create index provider_claim_identity on private.provider_identity_claims(identity_id,created_at);

create table private.provider_identity_events (
 id uuid primary key default gen_random_uuid(),
 identity_id uuid references private.provider_identities(id) on delete restrict,
 claim_id uuid references private.provider_identity_claims(id) on delete restrict,
 actor_id uuid, event_type text not null, reason_code text not null,
 created_at timestamptz not null default now()
);
-- Only structured codes are persisted: no notes, CUIT, ARCA payload or submitted secrets.
create function private.provider_event(p_identity uuid,p_claim uuid,p_type text,p_reason text)
returns void language sql security definer set search_path='' as $$
 insert into private.provider_identity_events(identity_id,claim_id,actor_id,event_type,reason_code)
 values(p_identity,p_claim,auth.uid(),p_type,p_reason)
$$;
create function private.provider_events_append_only()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'El historial de identidad no puede modificarse'; end $$;
create trigger provider_events_append_only before update or delete on private.provider_identity_events
 for each row execute function private.provider_events_append_only();

create table private.provider_activity_requirements (
 id uuid primary key default gen_random_uuid(),
 service_id bigint not null references public.services(id),
 specialty_id bigint references public.specialties(id),
 level text check(level in ('LEVEL_1','LEVEL_2','LEVEL_3')),
 credential_kinds text[] not null default '{}',
 configured_by uuid, configured_at timestamptz,
 unique nulls not distinct(service_id,specialty_id),
 check(level is distinct from 'LEVEL_2' or cardinality(credential_kinds)>0),
 check(not ('insurance'=any(credential_kinds)))
);
-- Unclassified activities fail closed until their requirements are explicitly approved.
insert into private.provider_activity_requirements(service_id,level)
 select id,case when slug in ('arquitectura','ingenieria') then 'LEVEL_3' end from public.services;

create table private.provider_qa_exceptions (
 professional_id uuid primary key references public.profiles(id) on delete restrict,
 enabled boolean not null default true, granted_by uuid,
 reason_code text not null check(reason_code='PERSISTENT_QA'), created_at timestamptz not null default now()
);
-- Explicit existing allowlist AND server-managed metadata; never an email-domain bypass.
insert into private.provider_qa_exceptions(professional_id,reason_code)
 select p.id,'PERSISTENT_QA' from public.profiles p join auth.users u on u.id=p.id
 where u.raw_app_meta_data->>'manito_qa'='true' and p.role='professional' and lower(u.email)=any(array[
 'prof.plomeria@qa.manito.invalid','prof.electricidad@qa.manito.invalid','prof.limpieza@qa.manito.invalid',
 'prof.gas@qa.manito.invalid','prof.cerrajeria@qa.manito.invalid','prof.pintura@qa.manito.invalid',
 'prof.jardin@qa.manito.invalid','prof.arreglos@qa.manito.invalid','prof.aire@qa.manito.invalid',
 'prof.electro@qa.manito.invalid','prof.mudanzas@qa.manito.invalid','prof.carpinteria@qa.manito.invalid',
 'prof.fumigacion@qa.manito.invalid','prof.tecnologia@qa.manito.invalid','prof.albanileria@qa.manito.invalid',
 'prof.pileta@qa.manito.invalid']);
insert into private.provider_identity_events(actor_id,event_type,reason_code)
 select professional_id,'QA_EXCEPTION_GRANTED','PERSISTENT_QA' from private.provider_qa_exceptions;

alter table private.provider_identities enable row level security;
alter table private.provider_identity_claims enable row level security;
alter table private.provider_identity_events enable row level security;
alter table private.provider_activity_requirements enable row level security;
alter table private.provider_qa_exceptions enable row level security;
revoke all on private.provider_identities,private.provider_identity_claims,private.provider_identity_events,
 private.provider_activity_requirements,private.provider_qa_exceptions from public,anon,authenticated,service_role;

create function public.submit_provider_identity_claim(p_cuit text,p_recovery boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); cuit text := private.normalize_provider_cuit(p_cuit);
 ident uuid; claim uuid; current_claim private.provider_identity_claims;
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid) then raise exception 'No autenticado'; end if;
 if not private.provider_cuit_valid(cuit) then raise exception 'Revisa los 11 digitos y el digito verificador del CUIT'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,129));
 -- A verified canonical provider cannot silently replace its identity.
 if exists(select 1 from private.provider_identities where canonical_professional_profile_id=uid) then
   return jsonb_build_object('received',true);
 end if;
 select * into current_claim from private.provider_identity_claims
 where claimant_profile_id=uid and status in ('PENDING','NEEDS_REVIEW') for update;
 if current_claim.id is not null then return jsonb_build_object('received',true); end if;
 if (select count(*) from private.provider_identity_claims where claimant_profile_id=uid and created_at>now()-interval '1 day')>=5 then
   return jsonb_build_object('received',true);
 end if;
 insert into private.provider_identities(normalized_cuit) values(cuit)
 on conflict(normalized_cuit) do update set normalized_cuit=excluded.normalized_cuit returning id into ident;
 insert into private.provider_identity_claims(identity_id,claimant_profile_id,claim_type)
 values(ident,uid,case when p_recovery then 'RECOVERY' else 'INITIAL' end) returning id into claim;
 perform private.provider_event(ident,claim,'CLAIM_CREATED','SUBMITTED');
 return jsonb_build_object('received',true);
end $$;

create function public.get_my_provider_identity()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c private.provider_identity_claims; i private.provider_identities; uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'No autenticado'; end if;
 if exists(select 1 from private.provider_qa_exceptions where professional_id=uid and enabled) then
   return jsonb_build_object('status','QA','masked_cuit',null,'operational_status','QA','can_submit',false);
 end if;
 select x.* into c from private.provider_identity_claims x join private.provider_identities y on y.id=x.identity_id
 where x.claimant_profile_id=uid
 order by case when y.canonical_professional_profile_id=uid and x.status='ACCEPTED' then 0
   when x.status in ('PENDING','NEEDS_REVIEW') then 1 else 2 end,x.created_at desc,x.id limit 1;
 if c.id is null then return jsonb_build_object('status','UNVERIFIED','masked_cuit',null,'can_submit',true); end if;
 select * into i from private.provider_identities where id=c.identity_id;
 return jsonb_build_object('status',case when c.status='ACCEPTED' and i.canonical_professional_profile_id=uid then i.fiscal_status else c.status end,
   'masked_cuit','**-********-'||right(i.normalized_cuit,1),'can_submit',c.status='REJECTED'
   and not exists(select 1 from private.provider_identities where canonical_professional_profile_id=uid)
   and not exists(select 1 from private.provider_identity_claims where claimant_profile_id=uid and status in ('PENDING','NEEDS_REVIEW')),
   'operational_status',case when c.status='ACCEPTED' and i.canonical_professional_profile_id=uid then i.operational_status else 'RESTRICTED' end);
end $$;

create function private.provider_activity_can_contract(p_profile uuid,p_service bigint,p_specialty bigint)
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
 )
$$;

-- Replace only the shared NEW-work predicate; existing execution/PIN authorization stays intact.
create or replace function private.order_professional_eligible(p_order public.orders,p_professional_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
 select 1 from public.profiles p
 join public.professional_services ps on ps.professional_id=p.id and ps.service_id=p_order.service_id
 join public.services s on s.id=ps.service_id and s.active
 left join public.professional_profiles pp on pp.professional_id=p.id
 where p.id=p_professional_id and p.id is distinct from p_order.client_id
 and p.role='professional' and private.professional_can_receive_orders(p.id)
 and private.provider_activity_can_contract(p.id,p_order.service_id,p_order.required_specialty_id)
 and (p_order.mode<>'immediate' or p.is_available)
 and (p_order.required_specialty_id is null or exists(
   select 1 from public.professional_specialties x join public.specialties sp on sp.id=x.specialty_id
   where x.professional_id=p.id and x.service_id=p_order.service_id
     and sp.service_id=p_order.service_id and sp.id=p_order.required_specialty_id and sp.active))
 and case when private.match_coordinates_valid(p_order.client_lat,p_order.client_lng)
                and private.match_coordinates_valid(p.lat,p.lng)
   then private.distance_km(p.lat,p.lng,p_order.client_lat,p_order.client_lng)<=coalesce(pp.service_radius_km,8)
   else exists(select 1 from public.professional_service_locations c
     join public.service_locations l on l.id=c.location_id and l.active
     where c.professional_id=p.id and c.location_id=p_order.location_id)
   end
 and (coalesce(p_order.assignment_mode,'auto')<>'manual'
      or p_order.preferred_professional_id is null or p_order.preferred_professional_id=p.id)
 and (p_order.scheduled_at is null or (
   private.professional_schedule_contains(p.id,p_order.scheduled_at,coalesce(p_order.scheduled_end,
     private.schedule_end_from(p_order.scheduled_at,coalesce(p_order.estimated_duration_minutes,p_order.eta_minutes,private.schedule_default_duration_minutes()))))
   and not private.professional_has_schedule_conflict(p.id,p_order.scheduled_at,coalesce(p_order.scheduled_end,
     private.schedule_end_from(p_order.scheduled_at,coalesce(p_order.estimated_duration_minutes,p_order.eta_minutes,private.schedule_default_duration_minutes()))),p_order.id)))
 )
$$;

create function public.get_admin_provider_identity(p_professional_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_manito_admin(auth.uid()) then raise exception 'No autorizado'; end if;
 return jsonb_build_object('claims',coalesce((select jsonb_agg(jsonb_build_object(
   'id',c.id,'type',c.claim_type,'status',c.status,'masked_cuit','**-********-'||right(i.normalized_cuit,1),
   'fiscal_status',i.fiscal_status,'operational_status',i.operational_status,'source',i.verification_source,
   'verified_at',i.verified_at,'verified_by',i.verified_by,'canonical_profile_id',i.canonical_professional_profile_id,
   'reason',c.reason_code,'reviewed_at',c.reviewed_at,'reviewed_by',c.reviewed_by,
   'conflicting_claims',(select count(*) from private.provider_identity_claims x where x.identity_id=i.id and x.claimant_profile_id<>c.claimant_profile_id),
   'events',(select coalesce(jsonb_agg(jsonb_build_object('type',e.event_type,'reason',e.reason_code,'actor',e.actor_id,'at',e.created_at) order by e.created_at),'[]'::jsonb)
     from private.provider_identity_events e where e.identity_id=i.id)
 ) order by c.created_at desc) from private.provider_identity_claims c join private.provider_identities i on i.id=c.identity_id
 where c.claimant_profile_id=p_professional_id),'[]'::jsonb),
 'activities',coalesce((select jsonb_agg(jsonb_build_object('service_id',ps.service_id,'specialty_id',r.specialty_id,'level',r.level,'credential_kinds',r.credential_kinds))
 from public.professional_services ps left join private.provider_activity_requirements r on r.service_id=ps.service_id where ps.professional_id=p_professional_id),'[]'::jsonb));
end $$;

create function public.reveal_provider_cuit(p_claim_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare c private.provider_identity_claims; result text;
begin
 if auth.uid() is null or not private.is_manito_admin(auth.uid()) then raise exception 'No autorizado'; end if;
 select * into c from private.provider_identity_claims where id=p_claim_id;
 if c.id is null then raise exception 'Solicitud no disponible'; end if;
 select normalized_cuit into result from private.provider_identities where id=c.identity_id;
 perform private.provider_event(c.identity_id,c.id,'CUIT_REVEALED','MANUAL_REVIEW');
 return result;
end $$;

create function public.review_provider_identity(p_claim_id uuid,p_action text,p_result text default null,p_ownership_checked boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare c private.provider_identity_claims; i private.provider_identities; uid uuid:=auth.uid();
begin
 if uid is null or not private.is_manito_admin(uid) then raise exception 'No autorizado'; end if;
 -- Serialize ALL claims sharing an identity, not just the particular claim.
 select * into c from private.provider_identity_claims where id=p_claim_id;
 if c.id is null then raise exception 'Solicitud no disponible'; end if;
 perform pg_advisory_xact_lock(hashtextextended(c.claimant_profile_id::text,129));
 select * into i from private.provider_identities where id=c.identity_id for update;
 select * into c from private.provider_identity_claims where id=p_claim_id for update;
 if p_action='ARCA' then
   if p_result is null or p_result not in ('FOUND','NOT_FOUND','MISMATCH','UNAVAILABLE') then raise exception 'Resultado no valido'; end if;
   if i.canonical_professional_profile_id is not null and i.canonical_professional_profile_id<>c.claimant_profile_id then
     update private.provider_identity_claims set status='NEEDS_REVIEW',claim_type='CONFLICT',reason_code='RECOVER_ORIGINAL',reviewed_by=uid,reviewed_at=now(),updated_at=now() where id=c.id and status<>'ACCEPTED';
     perform private.provider_event(i.id,c.id,'CONFLICT_REVIEWED',p_result);
     return;
   end if;
   update private.provider_identities set fiscal_status=case p_result when 'FOUND' then 'VERIFIED' when 'NOT_FOUND' then 'REJECTED' else 'NEEDS_REVIEW' end,
     verification_source='MANUAL_ARCA',verified_at=case when p_result='FOUND' then now() end,
     verified_by=case when p_result='FOUND' then uid end,updated_at=now() where id=i.id;
   perform private.provider_event(i.id,c.id,'ARCA_REVIEWED',p_result);
 elsif p_action='ACCEPT' then
   if c.claim_type in ('RECOVERY','CONFLICT') and i.canonical_professional_profile_id is distinct from c.claimant_profile_id then
     raise exception 'La recuperacion requiere la cuenta original y revision administrativa';
   end if;
   if c.status not in ('PENDING','NEEDS_REVIEW') or i.provider_type<>'PERSON' or i.fiscal_status<>'VERIFIED'
      or not coalesce(p_ownership_checked,false) then raise exception 'Revisa ARCA y la titularidad documental antes de vincular'; end if;
   if i.canonical_professional_profile_id is not null and i.canonical_professional_profile_id<>c.claimant_profile_id then
     raise exception 'Recupera la cuenta original. No se puede trasladar el perfil ni su historial';
   end if;
   perform 1 from public.professional_documents where professional_id=c.claimant_profile_id for share;
   if exists(select 1 from unnest(array['dni_front','dni_back','selfie','tax']) k where not exists(
     select 1 from public.professional_documents d where d.professional_id=c.claimant_profile_id and d.kind=k and d.status='approved' and d.file_path is not null)) then
     raise exception 'Falta aprobar la documentacion de identidad y CUIT';
   end if;
   update private.provider_identities set canonical_professional_profile_id=c.claimant_profile_id,updated_at=now() where id=i.id;
   update private.provider_identity_claims set status='ACCEPTED',reviewed_by=uid,reviewed_at=now(),reason_code='OWNERSHIP_CHECKED',updated_at=now() where id=c.id;
   perform private.provider_event(i.id,c.id,'CLAIM_ACCEPTED','OWNERSHIP_CHECKED');
   perform private.provider_event(i.id,c.id,'PROFILE_LINKED','CANONICAL_PROFILE');
 elsif p_action in ('REJECT','NEEDS_REVIEW','REVIEW') then
   if c.status='ACCEPTED' then raise exception 'La identidad vinculada requiere una decision operativa separada'; end if;
   update private.provider_identity_claims set status=case when p_action='REJECT' then 'REJECTED' else 'NEEDS_REVIEW' end,
     claim_type=case when i.canonical_professional_profile_id is not null then 'CONFLICT' else claim_type end,
     reviewed_by=uid,reviewed_at=now(),reason_code=case when p_action='REJECT' then 'DOCUMENT_MISMATCH' else 'MANUAL_REVIEW' end,updated_at=now() where id=c.id;
   perform private.provider_event(i.id,c.id,'CLAIM_'||p_action,'MANUAL_REVIEW');
 elsif p_action in ('ENABLE','RESTRICT','SUSPEND') then
   if c.status<>'ACCEPTED' or i.canonical_professional_profile_id is distinct from c.claimant_profile_id then raise exception 'Primero revisa la solicitud del perfil canonico'; end if;
   if p_action='ENABLE' and i.fiscal_status<>'VERIFIED' then raise exception 'La identidad fiscal no esta verificada'; end if;
   if p_action='ENABLE' then
     perform 1 from public.professional_documents where professional_id=c.claimant_profile_id for share;
     if exists(select 1 from unnest(array['dni_front','dni_back','selfie','tax']) k where not exists(
       select 1 from public.professional_documents d where d.professional_id=c.claimant_profile_id and d.kind=k and d.status='approved' and d.file_path is not null)) then
       raise exception 'Falta aprobar la documentacion de identidad y CUIT';
     end if;
   end if;
   update private.provider_identities set operational_status=case p_action when 'ENABLE' then 'ENABLED' when 'SUSPEND' then 'SUSPENDED' else 'RESTRICTED' end,updated_at=now() where id=i.id;
   perform private.provider_event(i.id,c.id,'OPERATION_'||p_action,'ADMIN_DECISION');
 else raise exception 'Decision no valida'; end if;
end $$;

create function public.configure_provider_activity(p_service_id bigint,p_specialty_id bigint,p_level text,p_credential_kinds text[])
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_manito_admin(auth.uid()) then raise exception 'No autorizado'; end if;
 if p_level is null or p_level not in ('LEVEL_1','LEVEL_2','LEVEL_3') or p_credential_kinds is null
 or (p_level='LEVEL_2' and cardinality(p_credential_kinds)=0)
 or p_credential_kinds && array['insurance','tax','dni_front','dni_back','selfie']
 or exists(select 1 from unnest(p_credential_kinds) k where k is null or k !~ '^[a-z][a-z0-9_]{1,63}$') then raise exception 'Requisitos no validos'; end if;
 if exists(select 1 from public.services where id=p_service_id and slug in ('arquitectura','ingenieria')) and p_level<>'LEVEL_3' then raise exception 'Esta actividad esta fuera del piloto'; end if;
 if p_specialty_id is not null and not exists(select 1 from public.specialties where id=p_specialty_id and service_id=p_service_id) then raise exception 'Especialidad no valida'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_service_id::text,130));
 insert into private.provider_activity_requirements(service_id,specialty_id,level,credential_kinds,configured_by,configured_at)
 values(p_service_id,p_specialty_id,p_level,p_credential_kinds,auth.uid(),now())
 on conflict(service_id,specialty_id) do update set level=excluded.level,credential_kinds=excluded.credential_kinds,configured_by=excluded.configured_by,configured_at=excluded.configured_at;
 perform private.provider_event(null,null,'ACTIVITY_CONFIGURED','ADMIN_DECISION');
end $$;

-- Lock gates on NEW assignments, proposals and contract freezing even for direct API writes.
create function private.enforce_provider_new_contract()
returns trigger language plpgsql security definer set search_path='' as $$
declare o public.orders; pro uuid;
begin
 if TG_TABLE_NAME='order_proposals' then
   select * into o from public.orders where id=new.order_id;
   pro:=new.professional_id;
   if TG_OP='UPDATE' and new.status is not distinct from old.status and new.status<>'sent' then return new; end if;
   if new.status not in ('sent','accepted') then return new; end if;
 else
   o:=new;
   pro:=coalesce(new.professional_id,case when new.status='pending_client_confirmation' then new.price_confirmation_professional_id end);
   if pro is null then return new; end if;
   if TG_OP='UPDATE' and old.professional_id is not distinct from new.professional_id
      and old.price_confirmation_professional_id is not distinct from new.price_confirmation_professional_id
      and old.status is not distinct from new.status
      and (old.contracted_at is not null or new.contracted_at is null) then return new; end if;
   if TG_OP='UPDATE' and old.contracted_at is not null and old.professional_id is not distinct from new.professional_id then return new; end if;
 end if;
 -- Serialize final admission against Admin review/suspension.
 perform pg_advisory_xact_lock_shared(hashtextextended(o.service_id::text,130));
 perform 1 from private.provider_identities where canonical_professional_profile_id=pro for share;
 perform 1 from private.provider_qa_exceptions where professional_id=pro for share;
 perform 1 from private.provider_activity_requirements where service_id=o.service_id for share;
 perform 1 from public.professional_documents where professional_id=pro for share;
 if not private.provider_activity_can_contract(pro,o.service_id,o.required_specialty_id) then
   raise exception 'Tu identidad o los requisitos de esta actividad necesitan revision MANITO';
 end if;
 return new;
end $$;
create trigger identity_new_contract before insert or update on public.orders
 for each row execute function private.enforce_provider_new_contract();
create trigger identity_new_proposal before insert or update on public.order_proposals
 for each row execute function private.enforce_provider_new_contract();

create function private.enforce_provider_approval()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status<>'approved' then return new; end if;
 if TG_OP='UPDATE' and old.status='approved' then return new; end if;
 if exists(select 1 from private.provider_qa_exceptions where professional_id=new.professional_id and enabled) then return new; end if;
 perform 1 from private.provider_identities where canonical_professional_profile_id=new.professional_id for share;
 if not exists(select 1 from private.provider_identities where canonical_professional_profile_id=new.professional_id
   and fiscal_status='VERIFIED' and provider_type='PERSON' and operational_status<>'SUSPENDED') then
   raise exception 'Primero revisa y vincula la identidad profesional';
 end if;
 return new;
end $$;
create trigger identity_professional_approval before insert or update on public.professional_onboarding
 for each row execute function private.enforce_provider_approval();

create function public.get_my_provider_activity_requirements()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'No autenticado'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('service_id',r.service_id,'specialty_id',r.specialty_id,
   'level',r.level,'credential_kinds',r.credential_kinds)) from private.provider_activity_requirements r
 join public.professional_services ps on ps.service_id=r.service_id and ps.professional_id=auth.uid()),'[]'::jsonb);
end $$;

-- Explicit API allowlist. No schema grants or direct private table policies are added.
revoke all on function private.normalize_provider_cuit(text),private.provider_cuit_valid(text),
 private.provider_event(uuid,uuid,text,text),private.provider_events_append_only(),
 private.provider_activity_can_contract(uuid,bigint,bigint),private.enforce_provider_new_contract(),private.enforce_provider_approval()
 from public,anon,authenticated,service_role;
revoke all on function public.submit_provider_identity_claim(text,boolean),public.get_my_provider_identity(),
 public.get_admin_provider_identity(uuid),public.reveal_provider_cuit(uuid),public.review_provider_identity(uuid,text,text,boolean),
 public.configure_provider_activity(bigint,bigint,text,text[]),public.get_my_provider_activity_requirements() from public,anon,authenticated,service_role;
grant execute on function public.submit_provider_identity_claim(text,boolean),public.get_my_provider_identity(),
 public.get_admin_provider_identity(uuid),public.reveal_provider_cuit(uuid),public.review_provider_identity(uuid,text,text,boolean),
 public.configure_provider_activity(bigint,bigint,text,text[]),public.get_my_provider_activity_requirements() to authenticated;
