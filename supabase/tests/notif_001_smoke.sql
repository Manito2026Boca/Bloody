begin;

do $$
declare
  v_recipient uuid;
  v_other uuid;
  v_notification uuid;
  v_result jsonb;
  v_read_at timestamptz;
begin
  select id into v_recipient from public.profiles order by created_at limit 1;
  select id into v_other from public.profiles where id <> v_recipient order by created_at limit 1;
  if v_recipient is null or v_other is null then raise exception 'NOTIF-001 needs two profile fixtures'; end if;

  perform private.add_notification_event(
    v_recipient, 'order_status', 'NOTIF-001 smoke', 'One logical event',
    null, null, 'notif-001-smoke-key', null, null, null, '{}'::jsonb
  );
  perform private.add_notification_event(
    v_recipient, 'order_status', 'NOTIF-001 smoke', 'One logical event',
    null, null, 'notif-001-smoke-key', null, null, null, '{}'::jsonb
  );

  if (select count(*) from public.notifications where recipient_id = v_recipient and dedupe_key = 'notif-001-smoke-key') <> 1 then
    raise exception 'logical event deduplication failed';
  end if;

  select id into v_notification from public.notifications
  where recipient_id = v_recipient and dedupe_key = 'notif-001-smoke-key';

  perform set_config('request.jwt.claim.sub', v_recipient::text, true);
  execute 'set local role authenticated';

  v_result := public.list_notifications('center', 8, 0);
  if (v_result->>'unread_count')::integer < 1 then raise exception 'unread count failed'; end if;
  v_read_at := public.mark_notification_read(v_notification);
  if v_read_at is null then raise exception 'single read failed'; end if;
  perform public.archive_notification(v_notification);

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', v_other::text, true);
  execute 'set local role authenticated';
  if exists (
    select 1 from jsonb_array_elements(public.list_notifications('history', 20, 0)->'items') item
    where item->>'id' = v_notification::text
  ) then
    raise exception 'cross-user notification leak';
  end if;
  execute 'reset role';
end;
$$;

rollback;
