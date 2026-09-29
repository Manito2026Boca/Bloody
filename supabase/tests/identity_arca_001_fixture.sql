-- LOCAL TEST DATABASE ONLY. Synthetic identities, no ARCA requests or real people.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema private;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb);
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,role text,full_name text,city text,is_available boolean,lat float8,lng float8);
create table public.services(id bigint primary key,slug text,active boolean);
create table public.specialties(id bigint primary key,service_id bigint references public.services(id),active boolean);
create table public.professional_services(professional_id uuid references public.profiles(id) on delete cascade,service_id bigint,primary key(professional_id,service_id));
create table public.professional_profiles(professional_id uuid primary key references public.profiles(id) on delete cascade,service_radius_km numeric,rating_avg numeric);
create table public.professional_specialties(professional_id uuid,service_id bigint,specialty_id bigint);
create table public.service_locations(id text primary key,active boolean);
create table public.professional_service_locations(professional_id uuid,location_id text);
create table public.professional_documents(id uuid primary key default gen_random_uuid(),professional_id uuid references public.profiles(id) on delete cascade,kind text,status text,file_path text);
create table public.professional_onboarding(professional_id uuid,status text);
create table public.orders(id uuid primary key default gen_random_uuid(),professional_id uuid references public.profiles(id),client_id uuid,service_id bigint,required_specialty_id bigint,
 mode text,client_lat float8,client_lng float8,location_id text,assignment_mode text,preferred_professional_id uuid,scheduled_at timestamptz,scheduled_end timestamptz,
 estimated_duration_minutes integer,eta_minutes integer,contracted_at timestamptz,status text,price_confirmation_professional_id uuid);
create table public.order_proposals(id uuid primary key default gen_random_uuid(),order_id uuid,professional_id uuid,status text);
create table public.ratings(id uuid primary key default gen_random_uuid(),professional_id uuid references public.profiles(id) on delete cascade,stars integer);
create function private.is_manito_admin(uuid default auth.uid()) returns boolean language sql stable security definer as $$ select exists(select 1 from public.profiles where id=$1 and role='admin') $$;
create function private.professional_can_receive_orders(uuid) returns boolean language sql stable as $$ select true $$;
create function private.match_coordinates_valid(float8,float8) returns boolean language sql immutable as $$ select $1 between -90 and 90 and $2 between -180 and 180 $$;
create function private.distance_km(float8,float8,float8,float8) returns numeric language sql immutable as $$ select 0::numeric $$;
create function private.professional_schedule_contains(uuid,timestamptz,timestamptz) returns boolean language sql stable as $$ select true $$;
create function private.professional_has_schedule_conflict(uuid,timestamptz,timestamptz,uuid) returns boolean language sql stable as $$ select false $$;
create function private.schedule_default_duration_minutes() returns integer language sql immutable as $$ select 60 $$;
create function private.schedule_end_from(timestamptz,integer) returns timestamptz language sql immutable as $$ select $1 + ($2 || ' minutes')::interval $$;
insert into auth.users(id,email,raw_app_meta_data) values
 ('00000000-0000-0000-0000-000000000001','test-a@invalid','{}'),
 ('00000000-0000-0000-0000-000000000002','test-b@invalid','{}'),
 ('00000000-0000-0000-0000-000000000003','test-admin@invalid','{}'),
 ('00000000-0000-0000-0000-000000000004','prof.plomeria@qa.manito.invalid','{"manito_qa":true}'),
 ('00000000-0000-0000-0000-000000000005','test-client@invalid','{}');
insert into public.profiles(id,role,full_name,is_available,lat,lng) select id,case when right(id::text,1)='3' then 'admin' when right(id::text,1)='5' then 'client' else 'professional' end,'Synthetic QA',true,-38,-57 from auth.users;
insert into public.services values (1,'plomeria',true),(2,'arquitectura',true),(3,'ingenieria',true),(4,'fixture-level2',true);
insert into public.professional_services select id,1 from public.profiles where role='professional';
insert into public.professional_profiles(professional_id,rating_avg) select id,4.5 from public.profiles where role='professional';
insert into public.ratings(professional_id,stars) values('00000000-0000-0000-0000-000000000001',4);
grant usage on schema public,auth to anon,authenticated;
