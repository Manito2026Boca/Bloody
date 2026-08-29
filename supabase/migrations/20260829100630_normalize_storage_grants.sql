-- NORM-002 follow-up: record least-privilege intent for Storage access.
-- Supabase-managed ACL entries on storage.objects/storage.buckets may remain
-- visible because they are granted by supabase_storage_admin; effective app
-- access is constrained by the authenticated-only RLS policies on objects.

revoke all on storage.buckets from public, anon, authenticated;
revoke all on storage.objects from public, anon, authenticated;

grant select on storage.buckets to authenticated;
grant select, insert on storage.objects to authenticated;
