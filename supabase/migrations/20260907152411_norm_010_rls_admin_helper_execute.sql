-- Restore only the execution privilege required by existing RLS predicates.
-- This boolean helper reads the persisted role; it does not grant or change roles.
revoke execute on function private.is_manito_admin(uuid) from public, anon;
grant execute on function private.is_manito_admin(uuid) to authenticated;
