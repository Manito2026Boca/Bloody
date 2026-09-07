-- NORM-010. Protection records decisions; it never executes financial movements.
alter table public.services add column protection_window_days integer
  check (protection_window_days between 0 and 3650);
alter table public.orders add column protection_window_days integer
  check (protection_window_days between 0 and 3650);
comment on column public.orders.guarantee_days is
  'Deprecated legacy value. New protection eligibility uses protection_window_days only.';
comment on column public.orders.protection_window_days is
  'Backend snapshot at completion. Immutable thereafter, independent of current service/settings.';
grant select (protection_window_days) on public.orders to authenticated;

-- Carry forward the configured legacy policy once, not as a runtime dependency.
insert into public.admin_settings(key,value)
select 'protection', jsonb_build_object('schema_version',1,
  'default_window_days',(value->>'guarantee_days')::integer)
from public.admin_settings where key='commercial'
on conflict (key) do nothing;
do $$ begin
  if not exists (select 1 from public.admin_settings where key='protection'
    and (value->>'default_window_days')::integer between 0 and 3650) then
    raise exception 'Configure protection.default_window_days before migrating';
  end if;
end $$;

-- Historical completed orders retain their recorded window, never today's policy.
update public.orders set protection_window_days=guarantee_days
where status='completed' and guarantee_days between 0 and 3650;

create function private.freeze_order_protection_window()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_days integer;
begin
  if tg_op='UPDATE' and old.status='completed' then
    if new.protection_window_days is distinct from old.protection_window_days then
      raise exception 'La ventana de Proteccion del pedido ya esta congelada';
    end if;
  elsif new.status='completed' then
    select coalesce(s.protection_window_days,
      (select (value->>'default_window_days')::integer from public.admin_settings where key='protection'))
    into v_days from public.services s where s.id=new.service_id;
    if v_days is null or v_days not between 0 and 3650 then
      raise exception 'La politica de Proteccion requiere revision de MANITO';
    end if;
    new.protection_window_days:=v_days;
  else
    new.protection_window_days:=null;
  end if;
  return new;
end $$;
create trigger trg_orders_protection_window before insert or update on public.orders
for each row execute function private.freeze_order_protection_window();

alter table public.complaints drop constraint complaints_status_check;
update public.complaints set status='under_review' where status='in_review';
alter table public.complaints
  add column claim_type text check (claim_type in
    ('work_quality','incomplete_work','damage','unexpected_charge','professional_conduct','other')),
  add column opened_by_role text check (opened_by_role='client'),
  add column protection_window_days integer check (protection_window_days between 0 and 3650),
  add column professional_response text check (char_length(professional_response) between 10 and 5000),
  add column professional_responded_at timestamptz,
  add column resolution_type text check (resolution_type in
    ('revisit','correction','replacement_professional','credit','partial_refund','full_refund','rejected','other')),
  add column resolution_amount numeric(12,2),
  add constraint complaints_status_check check (status in
    ('open','under_review','awaiting_professional','resolved','rejected')),
  add constraint complaints_resolution_amount_check check (
    resolution_amount is null or (resolution_amount >= 0 and resolution_amount <> 'NaN'::numeric
      and resolution_type is not null and resolution_type in ('credit','partial_refund','full_refund')));
comment on column public.complaints.reviewed_by is 'Admin who last reviewed/decided the case; resolved_at identifies the final decision.';
comment on column public.complaints.resolution_amount is 'Decision only. Does not execute a refund, credit, or payment.';
create unique index idx_complaints_one_active_order on public.complaints(order_id)
  where status in ('open','under_review','awaiting_professional');
create index idx_complaints_opened_by on public.complaints(opened_by);
create index idx_complaints_reviewed_by on public.complaints(reviewed_by);

create table public.complaint_evidence (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id),
  uploaded_by uuid not null references public.profiles(id),
  file_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 255),
  caption text check (char_length(caption)<=240),
  created_at timestamptz not null default now()
);
create index idx_complaint_evidence_case on public.complaint_evidence(complaint_id,created_at);
create index idx_complaint_evidence_uploader on public.complaint_evidence(uploaded_by);
create table public.complaint_events (
  id bigint generated always as identity primary key,
  complaint_id uuid not null references public.complaints(id),
  actor_id uuid references public.profiles(id),
  event_type text not null,
  from_status text,
  to_status text not null,
  created_at timestamptz not null default now()
);
create index idx_complaint_events_case on public.complaint_events(complaint_id,created_at);
create index idx_complaint_events_actor on public.complaint_events(actor_id);
alter table public.complaints enable row level security;
alter table public.complaint_evidence enable row level security;
alter table public.complaint_events enable row level security;
revoke all on public.complaints,public.complaint_evidence,public.complaint_events from public,anon,authenticated;
grant select on public.complaints,public.complaint_evidence,public.complaint_events to authenticated;

drop policy complaints_participants_select on public.complaints;
create policy complaints_participants_select on public.complaints for select to authenticated using (
  private.is_manito_admin() or exists (select 1 from public.orders o where o.id=order_id
    and (o.client_id=(select auth.uid()) or o.professional_id=(select auth.uid()))));
create policy complaint_evidence_participants_select on public.complaint_evidence for select to authenticated
  using (exists(select 1 from public.complaints c where c.id=complaint_id));
create policy complaint_events_participants_select on public.complaint_events for select to authenticated
  using (exists(select 1 from public.complaints c where c.id=complaint_id));

create function private.guard_complaint_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'El historial de Proteccion no se elimina'; end if;
  if old.status in ('resolved','rejected') then raise exception 'El caso ya esta cerrado'; end if;
  if row(new.order_id,new.opened_by,new.claim_type,new.detail,new.reason,new.opened_by_role,
    new.protection_window_days,new.created_at) is distinct from
    row(old.order_id,old.opened_by,old.claim_type,old.detail,old.reason,old.opened_by_role,
    old.protection_window_days,old.created_at) then
    raise exception 'Los datos originales del caso no se modifican';
  end if;
  if old.professional_responded_at is not null and
    row(new.professional_response,new.professional_responded_at) is distinct from
    row(old.professional_response,old.professional_responded_at) then
    raise exception 'La respuesta ya fue registrada';
  end if;
  return new;
end $$;
create trigger trg_complaints_immutable before update or delete on public.complaints
for each row execute function private.guard_complaint_mutation();

create or replace function public.open_order_complaint(p_order_id uuid,p_reason text,p_detail text default null)
returns public.complaints language plpgsql security definer set search_path='' as $$
declare v_order public.orders; v_case public.complaints; v_detail text:=btrim(coalesce(p_detail,''));
begin
  if auth.uid() is null then raise exception 'Tenes que iniciar sesion'; end if;
  select * into v_order from public.orders where id=p_order_id and client_id=auth.uid() for update;
  if v_order.id is null then raise exception 'Solo el cliente del pedido puede reportar un problema'; end if;
  if v_order.status<>'completed' then raise exception 'Proteccion se solicita despues de finalizar el trabajo'; end if;
  if v_order.completed_at is null or v_order.protection_window_days is null
    or v_order.completed_at + make_interval(days=>v_order.protection_window_days)<=now() then
    raise exception 'La ventana de Proteccion no esta disponible';
  end if;
  if p_reason is null or p_reason not in
    ('work_quality','incomplete_work','damage','unexpected_charge','professional_conduct','other') then
    raise exception 'Elegi un tipo de problema valido';
  end if;
  if char_length(v_detail) not between (case when p_reason='other' then 20 else 10 end) and 5000 then
    raise exception 'Contanos que paso con suficiente detalle (hasta 5000 caracteres)';
  end if;
  if exists(select 1 from public.complaints where order_id=p_order_id
    and status in ('open','under_review','awaiting_professional')) then
    raise exception 'Este pedido ya tiene un caso abierto';
  end if;
  insert into public.complaints(order_id,opened_by,reason,claim_type,detail,opened_by_role,protection_window_days,status)
    values(p_order_id,auth.uid(),p_reason,p_reason,v_detail,'client',v_order.protection_window_days,'open')
    returning * into v_case;
  return v_case;
end $$;

create function public.respond_to_complaint(p_complaint_id uuid,p_response text)
returns public.complaints language plpgsql security definer set search_path='' as $$
declare v_case public.complaints; v_response text:=btrim(coalesce(p_response,''));
begin
  select c.* into v_case from public.complaints c join public.orders o on o.id=c.order_id
    where c.id=p_complaint_id and o.professional_id=auth.uid() for update of c;
  if v_case.id is null then raise exception 'No podes responder este caso'; end if;
  if v_case.status in ('resolved','rejected') then raise exception 'El caso ya esta cerrado'; end if;
  if v_case.professional_responded_at is not null then raise exception 'Tu respuesta ya fue registrada'; end if;
  if char_length(v_response) not between 10 and 5000 then raise exception 'Escribi una respuesta de 10 a 5000 caracteres'; end if;
  update public.complaints set professional_response=v_response,professional_responded_at=now(),
    status='under_review',updated_at=now() where id=p_complaint_id returning * into v_case;
  return v_case;
end $$;

drop function public.review_order_complaint(uuid,text,text);
create function public.review_order_complaint(p_complaint_id uuid,p_status text,
  p_resolution_note text default null,p_resolution_type text default null,p_resolution_amount numeric default null)
returns public.complaints language plpgsql security definer set search_path='' as $$
declare v_case public.complaints; v_note text:=nullif(btrim(p_resolution_note),'');
begin
  if auth.uid() is null or not private.is_manito_admin() then raise exception 'Solo MANITO puede revisar el caso'; end if;
  select * into v_case from public.complaints where id=p_complaint_id for update;
  if v_case.id is null then raise exception 'No existe el caso'; end if;
  if v_case.status in ('resolved','rejected') then raise exception 'El caso ya esta cerrado'; end if;
  if p_status is null or p_status not in ('under_review','awaiting_professional','resolved','rejected') then
    raise exception 'Estado de Proteccion invalido'; end if;
  if p_status='awaiting_professional' and v_case.professional_responded_at is not null then
    raise exception 'El profesional ya respondio'; end if;
  if p_status in ('resolved','rejected') then
    if v_note is null or char_length(v_note) not between 10 and 5000 then
      raise exception 'Registra una nota de resolucion de 10 a 5000 caracteres'; end if;
    if p_resolution_type is null or p_resolution_type not in
      ('revisit','correction','replacement_professional','credit','partial_refund','full_refund','rejected','other')
      or (p_status='rejected')<>(p_resolution_type='rejected') then
      raise exception 'La resolucion no corresponde al estado'; end if;
    if p_resolution_type in ('credit','partial_refund','full_refund') then
      if p_resolution_amount is null or p_resolution_amount<0 or p_resolution_amount='NaN'::numeric then
        raise exception 'Ingresa un monto de decision valido'; end if;
    elsif p_resolution_amount is not null then raise exception 'Esta resolucion no admite monto'; end if;
  elsif p_resolution_type is not null or p_resolution_amount is not null or v_note is not null then
    raise exception 'La resolucion se registra al cerrar el caso';
  end if;
  update public.complaints set status=p_status,resolution_type=p_resolution_type,
    resolution_amount=p_resolution_amount,resolution_note=v_note,reviewed_by=auth.uid(),
    resolved_at=case when p_status in ('resolved','rejected') then now() end,updated_at=now()
    where id=p_complaint_id returning * into v_case;
  return v_case;
end $$;

-- Exact path ownership plus case eligibility. Helpers expose booleans, no case data.
create function private.can_upload_complaint_media(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.complaints c join public.orders o on o.id=c.order_id
    where o.client_id=auth.uid() and c.status in ('open','under_review','awaiting_professional')
    and p_path ~ ('^complaints/'||c.id::text||'/'||auth.uid()::text||'/[a-zA-Z0-9._-]+$'));
$$;
create function private.can_read_complaint_media(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.complaint_evidence e join public.complaints c on c.id=e.complaint_id
    join public.orders o on o.id=c.order_id where e.file_path=p_path and
    (o.client_id=auth.uid() or o.professional_id=auth.uid() or private.is_manito_admin()));
$$;
create function public.add_complaint_evidence(p_complaint_id uuid,p_file_path text,p_file_name text,p_caption text default null)
returns public.complaint_evidence language plpgsql security definer set search_path='' as $$
declare v_case public.complaints; v_evidence public.complaint_evidence;
begin
  select c.* into v_case from public.complaints c join public.orders o on o.id=c.order_id
    where c.id=p_complaint_id and o.client_id=auth.uid() for update of c;
  if v_case.id is null or v_case.status in ('resolved','rejected') then raise exception 'Este caso no admite evidencia'; end if;
  if p_file_path is null or not private.can_upload_complaint_media(p_file_path)
    or split_part(p_file_path,'/',2)<>p_complaint_id::text then raise exception 'Ruta de evidencia invalida'; end if;
  if char_length(btrim(coalesce(p_file_name,''))) not between 1 and 255 or char_length(p_caption)>240 then
    raise exception 'Nombre o descripcion del archivo invalido'; end if;
  if (select count(*) from public.complaint_evidence where complaint_id=p_complaint_id)>=6 then
    raise exception 'El caso admite hasta 6 archivos'; end if;
  perform 1 from storage.objects where bucket_id='manito-media' and name=p_file_path and owner=auth.uid() for share;
  if not found then raise exception 'No encontramos el archivo privado'; end if;
  insert into public.complaint_evidence(complaint_id,uploaded_by,file_path,file_name,caption)
    values(p_complaint_id,auth.uid(),p_file_path,btrim(p_file_name),nullif(btrim(p_caption),'')) returning * into v_evidence;
  return v_evidence;
end $$;

drop policy manito_media_insert_own on storage.objects;
create policy manito_media_insert_own on storage.objects for insert to authenticated with check (
  bucket_id='manito-media' and owner=(select auth.uid()) and
  (split_part(name,'/',1)<>'complaints' or private.can_upload_complaint_media(name)));
-- A restrictive policy preserves all original evidence/document read rules.
create policy complaint_media_read on storage.objects for select to authenticated
using (bucket_id='manito-media' and private.can_read_complaint_media(name));
create policy complaint_media_read_guard on storage.objects as restrictive for select to authenticated
using (bucket_id<>'manito-media' or split_part(name,'/',1)<>'complaints'
  or private.can_read_complaint_media(name)
  or (owner=(select auth.uid()) and private.can_upload_complaint_media(name)));
-- Never delete complaint-path objects through normal users, including upload/link races.
create policy complaint_media_delete_guard on storage.objects as restrictive for delete to authenticated
using (bucket_id<>'manito-media' or split_part(name,'/',1)<>'complaints');
create policy complaint_media_update_guard on storage.objects as restrictive for update to authenticated
using (bucket_id<>'manito-media' or split_part(name,'/',1)<>'complaints')
with check (bucket_id<>'manito-media' or split_part(name,'/',1)<>'complaints');

-- Keep the lightweight list; fetch investigative context only on demand.
drop function public.list_admin_complaint_reviews();
create function public.list_admin_complaint_reviews()
returns setof jsonb language sql stable security definer set search_path='' as $$
  select to_jsonb(c)||jsonb_build_object('service_name',s.name,'order_status',o.status,
    'order_price',o.agreed_price,'client_name',cl.full_name,'client_city',cl.city,
    'professional_name',pr.full_name,'professional_city',pr.city)
  from public.complaints c join public.orders o on o.id=c.order_id
  join public.services s on s.id=o.service_id join public.profiles cl on cl.id=o.client_id
  left join public.profiles pr on pr.id=o.professional_id where private.is_manito_admin()
  order by (c.status in ('resolved','rejected')),c.created_at desc;
$$;
create function public.get_admin_complaint_detail(p_complaint_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_case public.complaints; v_order public.orders;
begin
  if auth.uid() is null or not private.is_manito_admin() then raise exception 'Solo MANITO puede consultar la revision'; end if;
  select * into v_case from public.complaints where id=p_complaint_id;
  if v_case.id is null then raise exception 'No existe el caso'; end if;
  select * into v_order from public.orders where id=v_case.order_id;
  return jsonb_build_object('complaint',to_jsonb(v_case),
    'order',jsonb_build_object('id',v_order.id,'completed_at',v_order.completed_at,
      'agreed_scope',v_order.agreed_scope,'agreed_price',v_order.agreed_price,
      'accepted_proposal_id',v_order.accepted_proposal_id,'contract_snapshot',v_order.contract_snapshot,
      'cancelled_at',v_order.cancelled_at,'cancellation_reason',v_order.cancellation_reason),
    'proposal',(select to_jsonb(p) from public.order_proposals p where p.id=v_order.accepted_proposal_id),
    'extras',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.order_extras e where e.order_id=v_order.id),'[]'::jsonb),
    'order_evidence',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.order_photos e where e.order_id=v_order.id),'[]'::jsonb),
    'complaint_evidence',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.complaint_evidence e where e.complaint_id=v_case.id),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount,'status',p.status,'created_at',p.created_at))
      from public.payments p where p.order_id=v_order.id),'[]'::jsonb),
    'payment_events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'event_type',e.event_type,'created_at',e.received_at) order by e.received_at)
      from public.payment_events e join public.payments p on p.id=e.payment_id where p.order_id=v_order.id),'[]'::jsonb),
    'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'sender_id',m.sender_id,'body',m.body,'created_at',m.created_at) order by m.created_at)
      from public.messages m where m.order_id=v_order.id),'[]'::jsonb),
    'ratings',coalesce((select jsonb_agg(to_jsonb(r)) from public.ratings r where r.order_id=v_order.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.complaint_events e where e.complaint_id=v_case.id),'[]'::jsonb));
end $$;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in
 ('order_created','order_status','proposal_received','extra_requested','message_received','payment_status','appointment',
  'manual_request','manual_request_expired','manual_request_rejected','manual_request_auto',
  'complaint_opened','complaint_awaiting_professional','complaint_response','complaint_resolved'));
create function private.notify_complaint_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_order public.orders; v_kind text; v_title text; v_recipient uuid; v_event text;
begin
  select * into v_order from public.orders where id=new.order_id;
  if tg_op='INSERT' then v_kind:='complaint_opened'; v_title:='El cliente reporto un problema'; v_event:='opened';
  elsif new.professional_responded_at is distinct from old.professional_responded_at then
    v_kind:='complaint_response'; v_title:='El profesional respondio al caso'; v_event:='professional_response';
  elsif new.status is distinct from old.status then
    v_event:='status_changed';
    if new.status in ('resolved','rejected') then v_kind:='complaint_resolved'; v_title:='Tu caso de Proteccion tiene una resolucion';
    elsif new.status='awaiting_professional' then v_kind:='complaint_awaiting_professional'; v_title:='MANITO solicita tu respuesta'; end if;
  else return new;
  end if;
  insert into public.complaint_events(complaint_id,actor_id,event_type,from_status,to_status)
    values(new.id,auth.uid(),v_event,case when tg_op='UPDATE' then old.status end,new.status);
  if v_kind is not null then
    for v_recipient in select distinct recipient from (
      select v_order.professional_id recipient where v_kind<>'complaint_response'
      union select v_order.client_id where v_kind in ('complaint_response','complaint_resolved')
      union select p.id from public.profiles p where p.role='admin' and v_kind in ('complaint_opened','complaint_response')
    ) recipients where recipient is not null loop
      perform private.add_notification(v_recipient,v_kind,v_title,'Consulta el caso en Proteccion MANITO.',new.order_id,auth.uid());
    end loop;
  end if;
  return new;
end $$;
create trigger trg_complaints_notify after insert or update on public.complaints
for each row execute function private.notify_complaint_change();

revoke all on function private.freeze_order_protection_window(),private.guard_complaint_mutation(),
 private.notify_complaint_change(),private.can_upload_complaint_media(text),private.can_read_complaint_media(text)
 from public,anon,authenticated;
grant execute on function private.can_upload_complaint_media(text),private.can_read_complaint_media(text) to authenticated;
revoke all on function public.open_order_complaint(uuid,text,text),public.respond_to_complaint(uuid,text),
 public.review_order_complaint(uuid,text,text,text,numeric),public.add_complaint_evidence(uuid,text,text,text),
 public.list_admin_complaint_reviews(),public.get_admin_complaint_detail(uuid) from public,anon,authenticated;
grant execute on function public.open_order_complaint(uuid,text,text),public.respond_to_complaint(uuid,text),
 public.review_order_complaint(uuid,text,text,text,numeric),public.add_complaint_evidence(uuid,text,text,text),
 public.list_admin_complaint_reviews(),public.get_admin_complaint_detail(uuid) to authenticated;
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='complaints') then
    alter publication supabase_realtime add table public.complaints;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='complaint_evidence') then
    alter publication supabase_realtime add table public.complaint_evidence;
  end if;
end $$;
insert into public.admin_settings(key,value) values('norm_010_protection',jsonb_build_object(
  'schema_version',1,'window_snapshot','on_completion','professional_response','one_initial_response',
  'money_resolution','decision_only','NOTIF-DEBT-001','resolved: added existing manual_request kinds'))
on conflict(key) do update set value=excluded.value,updated_at=now();
