-- Origin is descriptive metadata. Historic endpoints stay unknown until a current client registers.
alter table public.push_subscriptions
  add column installation_origin text not null default 'unknown'
    check (installation_origin in ('unknown', 'legacy', 'app')),
  add column retired_by_user_at timestamptz;

create or replace function public.register_push_subscription_with_origin(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text, p_origin text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_origin not in ('app', 'legacy') then raise exception 'Origen push invalido'; end if;
  v_id := public.register_push_subscription(p_endpoint, p_p256dh, p_auth, p_user_agent);
  update public.push_subscriptions set installation_origin=p_origin,
    retired_by_user_at=null, updated_at=now()
  where id=v_id and user_id=auth.uid();
  return v_id;
end;
$function$;

create or replace function public.retire_current_legacy_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  update public.push_subscriptions set active=false,
    invalidated_at=coalesce(invalidated_at,now()),
    retired_by_user_at=coalesce(retired_by_user_at,now()), updated_at=now()
  where user_id=auth.uid() and endpoint_hash=md5(p_endpoint)
    and installation_origin in ('legacy','unknown') and active;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$function$;

revoke all on function public.register_push_subscription_with_origin(text,text,text,text,text) from public,anon;
revoke all on function public.retire_current_legacy_push_subscription(text) from public,anon;
grant execute on function public.register_push_subscription_with_origin(text,text,text,text,text) to authenticated;
grant execute on function public.retire_current_legacy_push_subscription(text) to authenticated;
