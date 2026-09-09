-- PREP-001: business rejection is data, not a SQL exception that rolls back attempts.
create table private.pin_attempt_policy (
  singleton boolean primary key default true check (singleton),
  max_failures integer not null check (max_failures between 1 and 5),
  initial_cooldown_seconds integer not null check (initial_cooldown_seconds >= 900),
  multiplier integer not null check (multiplier between 2 and 8),
  max_cooldown_seconds integer not null check (max_cooldown_seconds between 86400 and 604800),
  check (initial_cooldown_seconds <= max_cooldown_seconds)
);
insert into private.pin_attempt_policy values (true,5,900,4,86400);

create table private.order_pin_challenges (
  order_id uuid not null references public.orders(id) on delete cascade,
  stage text not null check (stage in ('start','end')),
  professional_id uuid not null references public.profiles(id),
  failures integer not null default 0 check(failures>=0),
  lockouts integer not null default 0 check(lockouts>=0),
  blocked_until timestamptz,
  blocked_requests bigint not null default 0,
  last_attempt_at timestamptz,
  closed_at timestamptz,
  primary key(order_id,stage)
);
create table private.order_pin_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  professional_id uuid not null references public.profiles(id),
  stage text not null check(stage in ('start','end')),
  event text not null check(event in ('failed','blocked','expired','success','transition_error')),
  occurred_at timestamptz not null default clock_timestamp(),
  blocked_until timestamptz
);
create index order_pin_events_order_time on private.order_pin_events(order_id,occurred_at);
alter table private.pin_attempt_policy enable row level security;
alter table private.order_pin_challenges enable row level security;
alter table private.order_pin_events enable row level security;
revoke all on private.pin_attempt_policy,private.order_pin_challenges,private.order_pin_events from public,anon,authenticated;
revoke all on sequence private.order_pin_events_id_seq from public,anon,authenticated;
-- Technical audit is SQL/backend only. No new schema usage or client/Admin RPC.
grant select on private.pin_attempt_policy,private.order_pin_challenges,private.order_pin_events to service_role;

create function private.generate_order_pin() returns text
language plpgsql volatile set search_path='' as $$
declare b bytea; n integer;
begin
  -- Rejection sampling avoids modulo bias while retaining the existing 4-digit format.
  loop
    b:=extensions.gen_random_bytes(2);
    n:=get_byte(b,0)*256+get_byte(b,1);
    exit when n<60000;
  end loop;
  return lpad((n%10000)::text,4,'0');
end $$;

create function private.ensure_order_pins() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='UPDATE' then
    if (old.start_pin is not null and new.start_pin is distinct from old.start_pin)
       or (old.end_pin is not null and new.end_pin is distinct from old.end_pin) then
      raise exception 'No se puede modificar el PIN del pedido';
    end if;
  end if;
  if new.professional_id is not null and new.status in ('payment_pending','accepted','en_camino','en_sitio','trabajando') then
    if TG_OP='INSERT' then
      new.start_pin:=coalesce(new.start_pin,private.generate_order_pin());
      new.end_pin:=coalesce(new.end_pin,private.generate_order_pin());
    else
      -- Also replaces the old non-cryptographic generator only when a challenge is born.
      if old.start_pin is null then new.start_pin:=private.generate_order_pin(); end if;
      if old.end_pin is null then new.end_pin:=private.generate_order_pin(); end if;
    end if;
  end if;
  return new;
end $$;
create trigger prep001_ensure_order_pins
before insert or update of professional_id,status,start_pin,end_pin on public.orders
for each row execute function private.ensure_order_pins();
-- Quote acceptance did not generate PINs. Fill only missing active legacy challenges.
update public.orders set start_pin=start_pin
where professional_id is not null and status in ('payment_pending','accepted','en_camino','en_sitio','trabajando')
and (start_pin is null or end_pin is null);

create function private.attempt_order_pin(p_order_id uuid,p_pin text,p_stage text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u uuid:=auth.uid();
  o public.orders;
  c private.order_pin_challenges;
  policy private.pin_attempt_policy;
  ts timestamptz;
  seconds integer;
  matches boolean;
begin
  if u is null or p_stage not in ('start','end') then raise exception 'Pedido no disponible'; end if;
  select * into o from public.orders where id=p_order_id and professional_id=u for update;
  if o.id is null or not exists(select 1 from public.profiles where id=u and role='professional')
     or not private.professional_can_receive_orders(u) then
    raise exception 'Pedido no disponible';
  end if;
  if o.status <> (case p_stage when 'start' then 'en_sitio' else 'trabajando' end) then
    return jsonb_build_object('ok',false,'code','unavailable');
  end if;
  -- The order lock serializes creation as well as all mutations of both challenge rows.
  ts:=clock_timestamp();
  select * into strict policy from private.pin_attempt_policy where singleton;
  insert into private.order_pin_challenges(order_id,stage,professional_id)
    values(p_order_id,p_stage,u) on conflict(order_id,stage) do nothing;
  select * into strict c from private.order_pin_challenges where order_id=p_order_id and stage=p_stage;
  if c.professional_id<>u or c.closed_at is not null then
    return jsonb_build_object('ok',false,'code','unavailable');
  end if;
  if c.blocked_until>ts then
    update private.order_pin_challenges set blocked_requests=blocked_requests+1,last_attempt_at=ts
      where order_id=p_order_id and stage=p_stage;
    return jsonb_build_object('ok',false,'code','cooldown',
      'retry_after_seconds',ceil(extract(epoch from c.blocked_until-ts))::integer);
  end if;
  if c.blocked_until is not null then
    insert into private.order_pin_events(order_id,professional_id,stage,event)
      values(p_order_id,u,p_stage,'expired');
    c.failures:=0; c.blocked_until:=null;
    update private.order_pin_challenges set failures=0,blocked_until=null
      where order_id=p_order_id and stage=p_stage;
  end if;
  -- Check non-secret prerequisites BEFORE comparing the secret to avoid an evidence oracle.
  if p_stage='end' and exists(select 1 from public.services where id=o.service_id and requires_completion_evidence)
     and not exists(select 1 from public.order_photos where order_id=p_order_id and uploaded_by=u and stage='after' and file_path is not null) then
    return jsonb_build_object('ok',false,'code','evidence_required');
  end if;
  -- No prefix/length hints. A malformed candidate costs an attempt just like any mismatch.
  matches:=coalesce(btrim(p_pin)=case p_stage when 'start' then o.start_pin else o.end_pin end,false);
  if not matches then
    c.failures:=c.failures+1;
    insert into private.order_pin_events(order_id,professional_id,stage,event)
      values(p_order_id,u,p_stage,'failed');
    if c.failures>=policy.max_failures then
      seconds:=least(policy.max_cooldown_seconds,
        policy.initial_cooldown_seconds*power(policy.multiplier::numeric,least(c.lockouts,10)))::integer;
      c.lockouts:=c.lockouts+1;
      c.blocked_until:=ts+make_interval(secs=>seconds);
      insert into private.order_pin_events(order_id,professional_id,stage,event,blocked_until)
        values(p_order_id,u,p_stage,'blocked',c.blocked_until);
    end if;
    update private.order_pin_challenges set failures=c.failures,lockouts=c.lockouts,
      blocked_until=c.blocked_until,last_attempt_at=ts where order_id=p_order_id and stage=p_stage;
    return jsonb_build_object('ok',false,'code',case when c.blocked_until is null then 'invalid_pin' else 'cooldown' end,
      'retry_after_seconds',coalesce(seconds,0));
  end if;
  -- Catch transition failures in their own subtransaction, without rolling back earlier state.
  begin
    update public.orders set status=case p_stage when 'start' then 'trabajando' else 'completed' end,
      completed_at=case p_stage when 'end' then ts else completed_at end,updated_at=ts
      where id=p_order_id;
  exception when others then
    insert into private.order_pin_events(order_id,professional_id,stage,event)
      values(p_order_id,u,p_stage,'transition_error');
    return jsonb_build_object('ok',false,'code','temporarily_unavailable');
  end;
  update private.order_pin_challenges set failures=0,blocked_until=null,closed_at=ts,last_attempt_at=ts
    where order_id=p_order_id and stage=p_stage;
  insert into private.order_pin_events(order_id,professional_id,stage,event)
    values(p_order_id,u,p_stage,'success');
  return jsonb_build_object('ok',true,'order_id',p_order_id,
    'status',case p_stage when 'start' then 'trabajando' else 'completed' end);
end $$;

-- Replace both public entry points atomically; do not leave a legacy unlimited validator.
drop function public.start_order(uuid,text);
drop function public.complete_order(uuid,text);
drop function private.start_order_impl(uuid,text);
drop function private.complete_order_impl(uuid,text);
create function public.start_order(p_order_id uuid,p_pin text) returns jsonb
language sql security definer set search_path='' as $$
  select private.attempt_order_pin(p_order_id,p_pin,'start');
$$;
create function public.complete_order(p_order_id uuid,p_pin text) returns jsonb
language sql security definer set search_path='' as $$
  select private.attempt_order_pin(p_order_id,p_pin,'end');
$$;
revoke all on function private.generate_order_pin(),private.ensure_order_pins(),private.attempt_order_pin(uuid,text,text) from public,anon,authenticated;
revoke all on function public.start_order(uuid,text),public.complete_order(uuid,text) from public,anon;
grant execute on function public.start_order(uuid,text),public.complete_order(uuid,text) to authenticated,service_role;
comment on function public.start_order(uuid,text) is 'PREP-001: returns committed {ok,code} rejection; client must inspect ok. Never log p_pin.';
comment on function public.complete_order(uuid,text) is 'PREP-001: same durable challenge boundary as start_order. No PIN in response.';
notify pgrst,'reload schema';
