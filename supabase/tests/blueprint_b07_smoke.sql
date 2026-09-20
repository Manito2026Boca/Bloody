begin;

do $$
declare
  v_user uuid;
  v_other uuid;
  v_subscription uuid;
  v_notification uuid;
  v_delivery uuid;
  v_destination record;
  v_claim record;
begin
  select id into v_user from public.profiles order by created_at limit 1;
  select id into v_other from public.profiles where id<>v_user order by created_at limit 1;
  if v_user is null or v_other is null then raise exception 'B07 needs two profile fixtures'; end if;

  if has_function_privilege('anon','public.register_push_subscription(text,text,text,text)','EXECUTE') then
    raise exception 'anon can register push';
  end if;
  if has_function_privilege('authenticated','public.claim_push_deliveries(integer)','EXECUTE') then
    raise exception 'authenticated can claim technical deliveries';
  end if;
  if not has_function_privilege('service_role','public.claim_push_deliveries(integer)','EXECUTE') then
    raise exception 'service_role cannot claim deliveries';
  end if;

  perform set_config('request.jwt.claim.sub',v_user::text,true);
  execute 'set local role authenticated';
  v_subscription:=public.register_push_subscription(
    'https://push.example.test/b07-'||v_user::text,
    repeat('p',65), repeat('a',24), 'B07 SQL smoke'
  );
  execute 'reset role';

  perform private.add_notification_event(
    v_user,'order_status','B07 smoke','Open MANITO',null,null,
    'b07-smoke:'||v_user::text,'open_order',null,null,'{}'::jsonb
  );
  select id into v_notification from public.notifications
  where recipient_id=v_user and dedupe_key='b07-smoke:'||v_user::text;
  if (select count(*) from public.notification_deliveries where notification_id=v_notification and subscription_id=v_subscription)<>1 then
    raise exception 'logical notification did not create exactly one delivery';
  end if;

  update public.notifications set created_at=now() where id=v_notification;
  if (select count(*) from public.notification_deliveries where notification_id=v_notification and subscription_id=v_subscription)<>1 then
    raise exception 'delivery retry created a duplicate version';
  end if;

  perform set_config('request.jwt.claim.sub',v_other::text,true);
  execute 'set local role authenticated';
  select * into v_destination from public.get_notification_destination(v_notification);
  if v_destination.notification_id is not null then raise exception 'deep link leaked cross-user destination'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',v_user::text,true);
  execute 'set local role authenticated';
  select * into v_destination from public.get_notification_destination(v_notification);
  if v_destination.notification_id<>v_notification then raise exception 'owner cannot resolve deep link'; end if;
  execute 'reset role';

  execute 'set local role service_role';
  select * into v_claim from public.claim_push_deliveries(1);
  execute 'reset role';
  if v_claim.delivery_id is null then raise exception 'service role did not claim delivery'; end if;
  v_delivery:=v_claim.delivery_id;

  execute 'set local role service_role';
  perform public.finish_push_delivery(v_delivery,'expired','http_410');
  execute 'reset role';
  if exists(select 1 from public.push_subscriptions where id=v_subscription and active) then
    raise exception 'expired endpoint remained active';
  end if;
end;
$$;

rollback;
