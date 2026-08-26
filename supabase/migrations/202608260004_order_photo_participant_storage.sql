-- Keep MANITO media private, but let order participants read order photos.

drop policy if exists manito_media_select_own on storage.objects;
create policy manito_media_select_own on storage.objects
for select to authenticated
using (
  bucket_id = 'manito-media'
  and (
    owner = (select auth.uid())
    or exists (
      select 1
      from public.order_photos op
      join public.orders o on o.id = op.order_id
      where op.file_path = storage.objects.name
        and (
          o.client_id = (select auth.uid())
          or o.professional_id = (select auth.uid())
        )
    )
  )
);
