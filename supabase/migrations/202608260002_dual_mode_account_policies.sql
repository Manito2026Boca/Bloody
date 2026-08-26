-- Allow one MANITO account to work as both client and professional.
-- The UI mode decides the surface; RLS still ties every action to auth.uid().

drop policy if exists pro_services_insert_own on public.professional_services;
create policy pro_services_insert_own on public.professional_services
for insert to authenticated
with check (
  professional_id = (select auth.uid())
  and exists (
    select 1
    from public.services s
    where s.id = professional_services.service_id
      and s.active = true
  )
);

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
for select to authenticated
using (
  client_id = (select auth.uid())
  or professional_id = (select auth.uid())
  or (
    status = 'open'
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_available = true
    )
    and exists (
      select 1
      from public.professional_services ps
      where ps.professional_id = (select auth.uid())
        and ps.service_id = orders.service_id
    )
  )
);

drop policy if exists orders_insert_client on public.orders;
create policy orders_insert_client on public.orders
for insert to authenticated
with check (client_id = (select auth.uid()));
