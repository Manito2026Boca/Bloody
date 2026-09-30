-- Completes the synthetic catalogue before testing the approved matrix, never production data.
alter table public.specialties add column name text;
create table public.admin_settings(key text primary key,value jsonb);
insert into public.admin_settings values('professional_verification_requirements','{"default":[{"kind":"dni_front"},{"kind":"dni_back"},{"kind":"selfie"},{"kind":"tax"},{"kind":"insurance"}],"by_service_slug":{}}');
insert into public.services(id,slug,active)
select row_number() over()+10,slug,true from unnest(array['electricidad','cerrajeria','limpieza','pintura','jardin','arreglos','aire','electro','carpinteria','tecnologia','albanileria','pileta','mecanica_automotor','gomeria','chapa_pintura_auto','diseno_interiores','fotografia','profesores_particulares','soporte_remoto','gas','mudanzas','fumigacion']) slug;
insert into public.specialties(id,service_id,name,active)
select 100,s.id,'Instalaciones',true from public.services s where slug='electricidad';
insert into public.specialties(id,service_id,name,active)
select 101,s.id,'Iluminación',true from public.services s where slug='electricidad';
