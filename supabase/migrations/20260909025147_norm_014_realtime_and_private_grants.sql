-- BUG-N014-001: publish participant-scoped detail changes under their existing RLS.
do $$
declare t text;
begin
  foreach t in array array['order_proposals','order_extras','order_photos'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;

-- BUG-N014-002: these helpers are called by owner-context functions/triggers only.
revoke execute on function private.current_commercial_policy() from public,anon,authenticated;
revoke execute on function private.prevent_approved_extra_changes() from public,anon,authenticated;

-- BUG-N014-003: NORM-009 added columns after the PIN-safe SELECT allowlist.
-- The frontend selects these fields; missing one rejects the entire order query.
grant select (cancelled_by,cancelled_at,cancellation_actor,cancellation_reason,
  cancellation_note,cancellation_phase,cancellation_responsibility,cancellation_fee)
on public.orders to authenticated;
