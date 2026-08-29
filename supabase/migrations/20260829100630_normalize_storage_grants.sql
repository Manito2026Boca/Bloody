-- NORM-002 follow-up: storage schema had broad privileges inherited through
-- PUBLIC, so revoke that role explicitly and then grant only the current app
-- needs for private uploads and signed reads.

revoke all on storage.buckets from public, anon, authenticated;
revoke all on storage.objects from public, anon, authenticated;

grant select on storage.buckets to authenticated;
grant select, insert on storage.objects to authenticated;
