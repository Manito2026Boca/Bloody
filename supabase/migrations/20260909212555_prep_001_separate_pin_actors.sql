-- PREP001-SEC-004: the same account must not own both sides of a PIN challenge.
create function private.guard_pin_actor_separation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.professional_id=new.client_id then
   raise exception 'No podés aceptar tu propio pedido';
 end if;
 return new;
end $$;
create trigger prep001_distinct_actors before insert or update of client_id,professional_id,status on public.orders
for each row execute function private.guard_pin_actor_separation();
revoke all on function private.guard_pin_actor_separation() from public,anon,authenticated;
create or replace function private.attempt_order_pin(p_order_id uuid,p_pin text,p_stage text)
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
  if o.id is null or o.client_id=u or not exists(select 1 from public.profiles where id=u and role='professional')
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


create or replace function public.get_order_pin(p_order_id uuid)
returns table(order_id uuid,pin_stage text,pin_value text)
language sql stable security definer set search_path='' as $$
 select o.id,case when o.status='en_sitio' then 'start' else 'end' end,
   case when o.status='en_sitio' then o.start_pin else o.end_pin end
 from public.orders o
 where o.id=p_order_id and o.client_id=(select auth.uid())
   and o.professional_id is distinct from (select auth.uid())
   and ((o.status='en_sitio' and o.start_pin is not null)
     or (o.status='trabajando' and o.end_pin is not null));
$$;
revoke all on function public.get_order_pin(uuid) from public,anon;
grant execute on function public.get_order_pin(uuid) to authenticated,service_role;
