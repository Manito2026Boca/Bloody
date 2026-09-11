// Generates an idempotent, operator-run SQL fixture. The password is required at runtime and never stored in git.
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const password = process.env.MANITO_QA_PASSWORD;
assert(password && password.length >= 16, 'Set MANITO_QA_PASSWORD (16+ characters)');

const clients = [
  ['cliente.qa1@qa.manito.invalid', 'Cliente QA 1'],
  ['cliente.qa2@qa.manito.invalid', 'Cliente QA 2'],
];
const professionals = [
  ['prof.plomeria@qa.manito.invalid', 'Ariel "Caño" Ibagaza', 'plomeria'],
  ['prof.electricidad@qa.manito.invalid', 'Juan Carlos "Rayo" Menseguez', 'electricidad'],
  ['prof.limpieza@qa.manito.invalid', 'Marcelo "Trapito" Barovero', 'limpieza'],
  ['prof.gas@qa.manito.invalid', 'José Luis "Garrafa" Sánchez', 'gas'],
  ['prof.cerrajeria@qa.manito.invalid', 'Rubén "Chapa" Suñé', 'cerrajeria'],
  ['prof.pintura@qa.manito.invalid', 'Facundo "Colorado" Sava', 'pintura'],
  ['prof.jardin@qa.manito.invalid', 'Julio "Jardinero" Cruz', 'jardin'],
  ['prof.arreglos@qa.manito.invalid', 'Rubén "Mago" Capria', 'arreglos'],
  ['prof.aire@qa.manito.invalid', 'Norberto "Llamarada" Eresuma', 'aire'],
  ['prof.electro@qa.manito.invalid', 'Antonio "Chipi" Barijho', 'electro'],
  ['prof.mudanzas@qa.manito.invalid', 'Javier "Tractor" Zanetti', 'mudanzas'],
  ['prof.carpinteria@qa.manito.invalid', 'Daniel "Hachita" Ludueña', 'carpinteria'],
  ['prof.fumigacion@qa.manito.invalid', 'Claudio "Piojo" López', 'fumigacion'],
  ['prof.tecnologia@qa.manito.invalid', 'Ernesto "Tecla" Farías', 'tecnologia'],
  ['prof.albanileria@qa.manito.invalid', 'Leandro Paredes', 'albanileria'],
  ['prof.pileta@qa.manito.invalid', 'Roberto "Pato" Abbondanzieri', 'pileta'],
];
const esc = (value) => String(value).replaceAll("'", "''");

const rows = [...clients.map(([email, name]) => [email, name, 'client', '']), ...professionals.map(([email, name, slug]) => [email, name, 'professional', slug])];
const values = rows.map((row) => `('${row.map(esc).join("','")}')`).join(',\n');
const sql = `begin;
create temporary table qa_seed(email text, full_name text, user_role text, service_slug text) on commit drop;
insert into qa_seed values ${values};

do $qa$
declare r record; v_id uuid;
begin
  for r in select * from qa_seed loop
    select id into v_id from auth.users where lower(email)=lower(r.email) limit 1;
    if v_id is null then
      v_id := gen_random_uuid();
      insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
      values('00000000-0000-0000-0000-000000000000',v_id,'authenticated','authenticated',r.email,extensions.crypt('${esc(password)}',extensions.gen_salt('bf')),now(),
        jsonb_build_object('provider','email','providers',jsonb_build_array('email'),'manito_qa',true),jsonb_build_object('full_name',r.full_name,'manito_qa',true),now(),now(),'','','','');
      insert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
      values(gen_random_uuid(),v_id,v_id::text,jsonb_build_object('sub',v_id::text,'email',r.email),'email',now(),now(),now());
    else
      update auth.users set encrypted_password=extensions.crypt('${esc(password)}',extensions.gen_salt('bf')),email_confirmed_at=coalesce(email_confirmed_at,now()),
        raw_app_meta_data=coalesce(raw_app_meta_data,'{}') || '{"manito_qa":true}'::jsonb,
        raw_user_meta_data=coalesce(raw_user_meta_data,'{}') || jsonb_build_object('full_name',r.full_name,'manito_qa',true),updated_at=now() where id=v_id;
    end if;
    insert into public.profiles(id,email,full_name,role,city,is_available,lat,lng)
    values(v_id,r.email,r.full_name,r.user_role,'Mar del Plata, Buenos Aires',r.user_role='professional',-38.0055,-57.5426)
    on conflict(id) do update set email=excluded.email,full_name=excluded.full_name,role=excluded.role,city=excluded.city,is_available=excluded.is_available,lat=excluded.lat,lng=excluded.lng,updated_at=now();
  end loop;
end $qa$;

insert into public.professional_profiles(professional_id,headline,bio,years_experience,verified,manito_pro,rating_avg,jobs_completed,response_minutes,insurance_label,work_city,service_radius_km,work_days,work_starts_at,work_ends_at)
select p.id, 'Especialista en '||s.name, 'Perfil ficticio permanente para pruebas QA de MANITO.', 3+(s.id%8), true, false, 4.4+((s.id%5)*0.1), 8+(s.id%24), 20+(s.id%25), 'Documentación QA aprobada', 'Mar del Plata', 15, array['Lun','Mar','Mie','Jue','Vie','Sab'], '08:00', '20:00'
from qa_seed q join public.profiles p on lower(p.email)=lower(q.email) join public.services s on s.slug=q.service_slug where q.user_role='professional'
on conflict(professional_id) do update set headline=excluded.headline,bio=excluded.bio,years_experience=excluded.years_experience,verified=true,rating_avg=excluded.rating_avg,jobs_completed=excluded.jobs_completed,response_minutes=excluded.response_minutes,work_city=excluded.work_city,service_radius_km=excluded.service_radius_km,work_days=excluded.work_days,work_starts_at=excluded.work_starts_at,work_ends_at=excluded.work_ends_at,updated_at=now();

update public.profiles set role='admin' where email='cliente.qa1@qa.manito.invalid';
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where email='cliente.qa1@qa.manito.invalid'),true);
insert into public.professional_onboarding(professional_id,status,current_step,notes,submitted_at,reviewed_at)
select p.id,'approved',16,'Cuenta ficticia persistente UX-001R QA',now(),now() from qa_seed q join public.profiles p on lower(p.email)=lower(q.email) where q.user_role='professional'
on conflict(professional_id) do update set status='approved',current_step=16,notes=excluded.notes,submitted_at=coalesce(public.professional_onboarding.submitted_at,now()),reviewed_at=now(),updated_at=now();
update public.profiles set role='client' where email='cliente.qa1@qa.manito.invalid';

delete from public.professional_services ps using public.profiles p, qa_seed q where ps.professional_id=p.id and lower(p.email)=lower(q.email) and q.user_role='professional';
insert into public.professional_services(professional_id,service_id,price_from)
select p.id,s.id,s.base_price from qa_seed q join public.profiles p on lower(p.email)=lower(q.email) join public.services s on s.slug=q.service_slug where q.user_role='professional';
delete from public.professional_specialties ps using public.profiles p, qa_seed q where ps.professional_id=p.id and lower(p.email)=lower(q.email) and q.user_role='professional';
insert into public.professional_specialties(professional_id,service_id,specialty_id)
select p.id,s.id,sp.id from qa_seed q join public.profiles p on lower(p.email)=lower(q.email) join public.services s on s.slug=q.service_slug join lateral (select * from public.specialties where service_id=s.id and active order by position,id limit 3) sp on true where q.user_role='professional';
delete from public.professional_service_locations psl using public.profiles p, qa_seed q where psl.professional_id=p.id and lower(p.email)=lower(q.email) and q.user_role='professional';
insert into public.professional_service_locations(professional_id,location_id)
select p.id,'ar-ba-mar-del-plata' from qa_seed q join public.profiles p on lower(p.email)=lower(q.email) where q.user_role='professional';
commit;
select email,full_name,role from public.profiles where email like '%@qa.manito.invalid' order by role,email;`;

mkdirSync('outputs/ux001r', { recursive: true });
writeFileSync('outputs/ux001r/seed-qa-users.sql', sql, { mode: 0o600 });
console.log(`Prepared ${rows.length} persistent QA accounts. SQL contains a credential and stays under ignored outputs/.`);
