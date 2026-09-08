-- NORM-012: plans describe future requests; all work remains in ordinary Orders.
do $$ begin
  if exists(select 1 from public.recurring_orders) or exists(select 1 from public.recurring_service_plans) then
    raise exception 'NORM-012 requires review of existing recurring data before migration';
  end if;
end $$;
-- RESTRICT intentionally detects unexpected dependencies rather than cascading.
drop table public.recurring_orders;

alter table public.recurring_service_plans
  add column preferred_professional_id uuid,
  add column description text not null,
  add column address text not null,
  add column client_lat double precision,
  add column client_lng double precision,
  add column estimated_duration_minutes integer not null,
  add column anchor_at timestamptz not null,
  add column payment_method text,
  add column last_generation_attempt_at timestamptz,
  add column generation_error text,
  alter column next_scheduled_at set not null,
  add constraint recurring_duration check (estimated_duration_minutes between 1 and 1440),
  add constraint recurring_location check (length(trim(address)) >= 2 and length(trim(description)) >= 2
    and (client_lat is null or client_lat between -90 and 90)
    and (client_lng is null or client_lng between -180 and 180)),
  add constraint recurring_source_unique unique(source_order_id);
comment on column public.recurring_service_plans.preferred_professional_id is
  'Preference only; deliberately retains a deleted professional UUID so deletion cannot silently enable auto publication.';
comment on column public.recurring_service_plans.next_scheduled_at is
  'NORM-012 next ungenerated occurrence. Computed by backend; not a client supplied cursor.';
create trigger trg_recurring_plans_updated_at before update on public.recurring_service_plans
for each row execute function public.touch_updated_at();
revoke insert,update,delete on public.recurring_service_plans from public,anon,authenticated;
drop policy recurring_plans_insert_own on public.recurring_service_plans;
drop policy recurring_plans_update_own on public.recurring_service_plans;

alter table public.orders
  add column recurring_plan_id uuid references public.recurring_service_plans(id) on delete restrict,
  add column recurrence_due_at timestamptz,
  add constraint orders_recurrence_pair check ((recurring_plan_id is null) = (recurrence_due_at is null)),
  add constraint orders_recurrence_scheduled check (recurring_plan_id is null or mode = 'scheduled');
create unique index orders_recurring_occurrence_unique on public.orders(recurring_plan_id,recurrence_due_at)
where recurring_plan_id is not null;
create unique index orders_recurring_one_operational on public.orders(recurring_plan_id)
where recurring_plan_id is not null and status not in ('completed','cancelled','matching_failed');
grant select(recurring_plan_id,recurrence_due_at) on public.orders to authenticated;
-- Existing column-level INSERT grants do not include recurrence linkage.
revoke insert(recurring_plan_id,recurrence_due_at),update(recurring_plan_id,recurrence_due_at) on public.orders from authenticated;

insert into public.admin_settings(key,value)
values('recurring','{"schema_version":1,"generation_lead_days":7}')
on conflict(key) do nothing;

create function private.recurring_next_at(p_anchor timestamptz,p_frequency text,p_after timestamptz)
returns timestamptz language plpgsql stable set search_path='' as $$
declare
  a timestamp := p_anchor at time zone 'America/Argentina/Buenos_Aires';
  b timestamp := p_after at time zone 'America/Argentina/Buenos_Aires';
  n integer; step_days integer; candidate timestamptz;
begin
  if p_anchor is null or p_after is null or p_frequency is null
     or p_frequency not in ('weekly','biweekly','monthly') then
    raise exception 'Frecuencia o fecha invalida';
  end if;
  if p_frequency='monthly' then
    n:=greatest(0,(extract(year from b)::int-extract(year from a)::int)*12
      +extract(month from b)::int-extract(month from a)::int);
  else
    step_days:=case when p_frequency='weekly' then 7 else 14 end;
    n:=greatest(0,floor(extract(epoch from (b-a))/(step_days*86400))::int);
  end if;
  loop
    candidate := (a + case when p_frequency='monthly' then make_interval(months=>n)
      else make_interval(days=>n*step_days) end) at time zone 'America/Argentina/Buenos_Aires';
    if candidate>p_after then return candidate; end if;
    n:=n+1;
  end loop;
end $$;

-- Both normal client creation and system recurrence use this validated scheduled path.
-- Cron never impersonates auth.uid(); its client comes exclusively from a locked, validated plan.
create function private.create_scheduled_request(p_client uuid,p_data jsonb,p_system boolean default false)
returns public.orders language plpgsql security definer set search_path='' as $$
declare
  o public.orders; s public.services; target uuid; estimate numeric;
begin
  if not exists(select 1 from public.profiles where id=p_client) then raise exception 'Cuenta no disponible'; end if;
  select * into s from public.services where id=(p_data->>'service_id')::bigint and active and allow_scheduled;
  if s.id is null then raise exception 'Este servicio no permite programar'; end if;
  o.client_id:=p_client; o.service_id:=s.id; o.mode:='scheduled'; o.status:='scheduled_open';
  o.description:=trim(p_data->>'description'); o.address:=trim(p_data->>'address');
  o.scheduled_at:=(p_data->>'scheduled_at')::timestamptz;
  o.estimated_duration_minutes:=coalesce((p_data->>'estimated_duration_minutes')::int,private.schedule_default_duration_minutes());
  o.client_lat:=(p_data->>'client_lat')::double precision; o.client_lng:=(p_data->>'client_lng')::double precision;
  o.payment_method:=p_data->>'payment_method';
  target:=nullif(p_data->>'preferred_professional_id','')::uuid;
  if o.description is null or length(o.description)<2 or o.address is null or length(o.address)<2
     or o.scheduled_at is null or o.scheduled_at<=now()
     or o.estimated_duration_minutes not between 1 and 1440
     or (o.client_lat is not null and o.client_lat not between -90 and 90)
     or (o.client_lng is not null and o.client_lng not between -180 and 180) then
    raise exception 'Revisa descripcion, ubicacion, fecha y duracion del servicio';
  end if;
  o.scheduled_end:=private.schedule_end_from(o.scheduled_at,o.estimated_duration_minutes);
  o.assignment_mode:=case when target is null then 'auto' else 'manual' end;
  if target is not null and not private.manual_order_target_is_valid(o,target) then
    if not p_system then raise exception 'Ese profesional no esta disponible para este pedido'; end if;
    o.manual_response_status:='awaiting_client_choice';
    target:=null;
  end if;
  estimate:=coalesce((select ps.price_from from public.professional_services ps
    where ps.professional_id=target and ps.service_id=s.id),s.base_price,0)
    +greatest(0,private.policy_number(private.current_commercial_policy(),'scheduled_fee',0));
  insert into public.orders(client_id,service_id,description,address,mode,status,scheduled_at,
    estimated_duration_minutes,assignment_mode,preferred_professional_id,manual_response_status,
    payment_method,client_lat,client_lng,estimated_price,price,recurring_plan_id,recurrence_due_at)
  values(p_client,s.id,o.description,o.address,'scheduled','scheduled_open',o.scheduled_at,
    o.estimated_duration_minutes,o.assignment_mode,target,o.manual_response_status,
    o.payment_method,o.client_lat,o.client_lng,estimate,estimate,
    case when p_system then (p_data->>'recurring_plan_id')::uuid end,
    case when p_system then (p_data->>'recurrence_due_at')::timestamptz end)
  returning * into o;
  return o;
end $$;

create function public.create_scheduled_order(p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  o:=private.create_scheduled_request(auth.uid(),p_data,false);
  return to_jsonb(o)-'start_pin'-'end_pin';
end $$;

create function public.create_recurring_plan(p_source_order_id uuid,p_frequency text)
returns public.recurring_service_plans language plpgsql security definer set search_path='' as $$
declare o public.orders; p public.recurring_service_plans;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into o from public.orders where id=p_source_order_id and client_id=auth.uid() for update;
  if o.id is null then raise exception 'No podes usar este pedido'; end if;
  select * into p from public.recurring_service_plans where source_order_id=o.id;
  if p.id is not null then return p; end if;
  if o.mode<>'scheduled' or o.scheduled_at is null or o.status in ('cancelled','matching_failed')
    or not exists(select 1 from public.services where id=o.service_id and active and allow_scheduled and supports_recurring) then
    raise exception 'Este pedido no permite crear un servicio recurrente';
  end if;
  insert into public.recurring_service_plans(client_id,service_id,source_order_id,frequency,
    next_scheduled_at,anchor_at,description,address,client_lat,client_lng,estimated_duration_minutes,
    preferred_professional_id,payment_method)
  values(auth.uid(),o.service_id,o.id,p_frequency,
    private.recurring_next_at(o.scheduled_at,p_frequency,greatest(now(),o.scheduled_at)),o.scheduled_at,
    o.description,o.address,o.client_lat,o.client_lng,coalesce(o.estimated_duration_minutes,private.schedule_default_duration_minutes()),
    coalesce(o.preferred_professional_id,o.professional_id),o.payment_method)
  returning * into p;
  update public.orders set recurring_plan_id=p.id,recurrence_due_at=o.scheduled_at where id=o.id;
  return p;
end $$;

create function public.update_recurring_plan(p_plan_id uuid,p_changes jsonb)
returns public.recurring_service_plans language plpgsql security definer set search_path='' as $$
declare p public.recurring_service_plans; candidate public.orders; last_due timestamptz;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into p from public.recurring_service_plans where id=p_plan_id and client_id=auth.uid() for update;
  if p.id is null then raise exception 'No podes modificar este plan'; end if;
  if p.status='cancelled' then raise exception 'El plan cancelado no se puede modificar'; end if;
  if jsonb_typeof(p_changes)<>'object' or exists(select 1 from jsonb_object_keys(p_changes) k
    where k not in ('frequency','scheduled_at','preferred_professional_id','description','address','client_lat','client_lng','estimated_duration_minutes')) then
    raise exception 'Datos de plan no permitidos';
  end if;
  if p_changes ? 'frequency' then p.frequency:=p_changes->>'frequency'; end if;
  if p_changes ? 'scheduled_at' then
    p.anchor_at:=(p_changes->>'scheduled_at')::timestamptz;
    if p.anchor_at is null or p.anchor_at<=now() then raise exception 'Elegi una fecha futura'; end if;
  end if;
  if p_changes ? 'description' then p.description:=trim(p_changes->>'description'); end if;
  if p_changes ? 'address' then p.address:=trim(p_changes->>'address'); end if;
  if p_changes ? 'client_lat' then p.client_lat:=(p_changes->>'client_lat')::double precision; end if;
  if p_changes ? 'client_lng' then p.client_lng:=(p_changes->>'client_lng')::double precision; end if;
  if p_changes ? 'estimated_duration_minutes' then p.estimated_duration_minutes:=(p_changes->>'estimated_duration_minutes')::int; end if;
  select max(recurrence_due_at) into last_due from public.orders where recurring_plan_id=p.id;
  p.next_scheduled_at:=private.recurring_next_at(p.anchor_at,p.frequency,greatest(now(),last_due));
  if p_changes ? 'preferred_professional_id' then
    p.preferred_professional_id:=nullif(p_changes->>'preferred_professional_id','')::uuid;
    candidate.client_id:=p.client_id; candidate.service_id:=p.service_id; candidate.mode:='scheduled';
    candidate.scheduled_at:=p.next_scheduled_at;
    candidate.estimated_duration_minutes:=p.estimated_duration_minutes;
    candidate.scheduled_end:=private.schedule_end_from(candidate.scheduled_at,p.estimated_duration_minutes);
    if p.preferred_professional_id is not null and not private.manual_order_target_is_valid(candidate,p.preferred_professional_id) then
      raise exception 'Ese profesional no esta disponible para este servicio';
    end if;
  end if;
  update public.recurring_service_plans set frequency=p.frequency,anchor_at=p.anchor_at,next_scheduled_at=p.next_scheduled_at,
    description=p.description,address=p.address,client_lat=p.client_lat,client_lng=p.client_lng,
    estimated_duration_minutes=p.estimated_duration_minutes,preferred_professional_id=p.preferred_professional_id,
    generation_error=null where id=p.id returning * into p;
  return p;
end $$;

create function private.change_recurring_plan_status(p_plan_id uuid,p_action text)
returns public.recurring_service_plans language plpgsql security definer set search_path='' as $$
declare p public.recurring_service_plans; last_due timestamptz;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into p from public.recurring_service_plans where id=p_plan_id and client_id=auth.uid() for update;
  if p.id is null then raise exception 'No podes modificar este plan'; end if;
  if p_action not in ('paused','active','cancelled') then raise exception 'Accion invalida'; end if;
  if p.status='cancelled' and p_action<>'cancelled' then raise exception 'El plan cancelado no se puede reactivar'; end if;
  if p.status=p_action then return p; end if;
  if p_action='active' then
    select max(recurrence_due_at) into last_due from public.orders where recurring_plan_id=p.id;
    p.next_scheduled_at:=private.recurring_next_at(p.anchor_at,p.frequency,greatest(now(),last_due));
  end if;
  update public.recurring_service_plans set status=p_action,next_scheduled_at=p.next_scheduled_at,
    generation_error=null where id=p.id returning * into p;
  return p;
end $$;
create function public.pause_recurring_plan(p_plan_id uuid) returns public.recurring_service_plans
language sql security definer set search_path='' as $$select private.change_recurring_plan_status(p_plan_id,'paused')$$;
create function public.resume_recurring_plan(p_plan_id uuid) returns public.recurring_service_plans
language sql security definer set search_path='' as $$select private.change_recurring_plan_status(p_plan_id,'active')$$;
create function public.cancel_recurring_plan(p_plan_id uuid) returns public.recurring_service_plans
language sql security definer set search_path='' as $$select private.change_recurring_plan_status(p_plan_id,'cancelled')$$;

create function public.list_my_recurring_plans()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  return coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object(
    'service_name',s.name,'preferred_professional_name',pr.full_name,
    'latest_order',(select jsonb_build_object('id',o.id,'status',o.status,'scheduled_at',o.scheduled_at,
      'manual_response_status',o.manual_response_status) from public.orders o
      where o.recurring_plan_id=p.id order by o.recurrence_due_at desc limit 1))
    order by p.created_at desc)
    from public.recurring_service_plans p join public.services s on s.id=p.service_id
    left join public.profiles pr on pr.id=p.preferred_professional_id
    where p.client_id=auth.uid()),'[]'::jsonb);
end $$;

create function private.generate_due_recurring_orders()
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.recurring_service_plans; o public.orders; generated integer:=0; failed integer:=0;
  lead_days integer; last_due timestamptz;
begin
  select greatest(0,least(90,coalesce(private.policy_number(value,'generation_lead_days',7),7)))::integer
    into lead_days from public.admin_settings where key='recurring';
  lead_days:=coalesce(lead_days,7);
  for p in select * from public.recurring_service_plans
    where status='active' and next_scheduled_at<=now()+make_interval(days=>lead_days)
      and not exists(select 1 from public.orders pending_order where pending_order.recurring_plan_id=recurring_service_plans.id
        and pending_order.status not in ('completed','cancelled','matching_failed'))
      and (last_generation_attempt_at is null or last_generation_attempt_at<now()-interval '15 minutes')
    order by last_generation_attempt_at nulls first,next_scheduled_at limit 100 for update skip locked
  loop
    begin
      if exists(select 1 from public.orders where recurring_plan_id=p.id
        and status not in ('completed','cancelled','matching_failed')) then continue; end if;
      select max(recurrence_due_at) into last_due from public.orders where recurring_plan_id=p.id;
      if p.next_scheduled_at<=now() or p.next_scheduled_at<=last_due then
        p.next_scheduled_at:=private.recurring_next_at(p.anchor_at,p.frequency,greatest(now(),last_due));
        update public.recurring_service_plans set next_scheduled_at=p.next_scheduled_at where id=p.id;
      end if;
      if p.next_scheduled_at>now()+make_interval(days=>lead_days) then continue; end if;
      if not exists(select 1 from public.services where id=p.service_id and active and allow_scheduled and supports_recurring) then
        raise exception 'Servicio recurrente no disponible';
      end if;
      o:=private.create_scheduled_request(p.client_id,jsonb_build_object(
        'service_id',p.service_id,'description',p.description,'address',p.address,
        'scheduled_at',p.next_scheduled_at,'estimated_duration_minutes',p.estimated_duration_minutes,
        'preferred_professional_id',p.preferred_professional_id,'payment_method',p.payment_method,
        'client_lat',p.client_lat,'client_lng',p.client_lng,'recurring_plan_id',p.id,'recurrence_due_at',p.next_scheduled_at),true);
      update public.recurring_service_plans set
        next_scheduled_at=private.recurring_next_at(p.anchor_at,p.frequency,p.next_scheduled_at),
        last_generation_attempt_at=now(),generation_error=null where id=p.id;
      perform private.add_notification(p.client_id,'appointment','Nueva visita programada',
        case when o.manual_response_status='awaiting_client_choice'
          then 'Tu profesional preferido no esta disponible para esta visita. Elegi otro profesional o busca profesionales.'
          else 'Creamos la solicitud de tu proxima visita. Todavia necesita aceptacion profesional.' end,o.id,null);
      generated:=generated+1;
    exception when others then
      update public.recurring_service_plans set last_generation_attempt_at=now(),
        generation_error='No pudimos generar la visita. Revisa los datos del plan. Codigo: '||SQLSTATE where id=p.id;
      failed:=failed+1;
    end;
  end loop;
  return jsonb_build_object('generated',generated,'failed',failed);
end $$;

revoke all on function private.recurring_next_at(timestamptz,text,timestamptz) from public,anon,authenticated;
revoke all on function private.create_scheduled_request(uuid,jsonb,boolean) from public,anon,authenticated;
revoke all on function private.change_recurring_plan_status(uuid,text) from public,anon,authenticated;
revoke all on function private.generate_due_recurring_orders() from public,anon,authenticated;
revoke all on function public.create_scheduled_order(jsonb),public.create_recurring_plan(uuid,text),
  public.update_recurring_plan(uuid,jsonb),public.pause_recurring_plan(uuid),public.resume_recurring_plan(uuid),
  public.cancel_recurring_plan(uuid),public.list_my_recurring_plans() from public,anon,authenticated;
grant execute on function public.create_scheduled_order(jsonb),public.create_recurring_plan(uuid,text),
  public.update_recurring_plan(uuid,jsonb),public.pause_recurring_plan(uuid),public.resume_recurring_plan(uuid),
  public.cancel_recurring_plan(uuid),public.list_my_recurring_plans() to authenticated;

create function public.list_admin_recurring_plans()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.is_manito_admin() then raise exception 'Solo MANITO puede consultar estos planes'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select p.id,p.status,p.next_scheduled_at,p.generation_error,p.last_generation_attempt_at,
      c.full_name as client_name,s.name as service_name,
      (select o.id from public.orders o where o.recurring_plan_id=p.id order by o.recurrence_due_at desc limit 1) as latest_order_id
    from public.recurring_service_plans p join public.profiles c on c.id=p.client_id
    join public.services s on s.id=p.service_id order by p.created_at desc limit 200
  ) x),'[]'::jsonb);
end $$;
revoke all on function public.list_admin_recurring_plans() from public,anon,authenticated;
grant execute on function public.list_admin_recurring_plans() to authenticated;
