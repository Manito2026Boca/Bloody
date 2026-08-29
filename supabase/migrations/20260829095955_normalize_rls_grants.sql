-- NORM-002: shrink exposed Data API grants while preserving current V6 flows.
-- RLS remains the row-level boundary; grants below decide which tables/actions
-- can be reached from the browser at all.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on storage.buckets from public, anon;
revoke all on storage.objects from public, anon;

revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;

grant usage on all sequences in schema public to authenticated;

grant select on public.admin_settings to authenticated;
grant select, insert, update, delete on public.client_addresses to authenticated;
grant select on public.complaints to authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select, update on public.notifications to authenticated;
grant select on public.order_extras to authenticated;
grant select, insert on public.order_photos to authenticated;
grant select on public.order_proposals to authenticated;
grant select, insert on public.orders to authenticated;
grant select on public.payment_events to authenticated;
grant select, insert, update, delete on public.payment_methods to authenticated;
grant select on public.payments to authenticated;
grant select, insert, update on public.professional_documents to authenticated;
grant select, insert, update on public.professional_onboarding to authenticated;
grant select on public.professional_payment_accounts to authenticated;
grant select, insert, update on public.professional_payout_details to authenticated;
grant select, insert, update, delete on public.professional_portfolio to authenticated;
grant select, insert, update on public.professional_profiles to authenticated;
grant select, insert, delete on public.professional_services to authenticated;
grant select, insert, delete on public.professional_specialties to authenticated;
grant select on public.promo_codes to authenticated;
grant select, insert on public.ratings to authenticated;
grant select, insert, update, delete on public.recurring_orders to authenticated;
grant select, insert, update on public.recurring_service_plans to authenticated;
grant select, insert on public.referrals to authenticated;
grant select on public.services to authenticated;
grant select on public.specialties to authenticated;
grant select, insert on public.tracking_shares to authenticated;
grant select, insert, update, delete on public.trusted_contacts to authenticated;
grant select, insert, update on public.user_security_preferences to authenticated;

grant select (
  id,
  full_name,
  role,
  city,
  is_available,
  lat,
  lng,
  created_at,
  updated_at
) on public.profiles to authenticated;

grant update (
  full_name,
  phone,
  city,
  is_available,
  lat,
  lng
) on public.profiles to authenticated;

revoke all on storage.buckets from public, anon, authenticated;
revoke all on storage.objects from public, anon, authenticated;
grant select on storage.buckets to authenticated;
grant select, insert on storage.objects to authenticated;

drop policy if exists orders_client_update_v5_details on public.orders;

drop policy if exists professional_documents_self_or_admin on public.professional_documents;
drop policy if exists professional_documents_select_self_or_admin on public.professional_documents;
drop policy if exists professional_documents_insert_self on public.professional_documents;
drop policy if exists professional_documents_update_self_or_admin on public.professional_documents;

create policy professional_documents_select_self_or_admin on public.professional_documents
for select to authenticated
using (
  professional_id = (select auth.uid())
  or private.is_manito_admin()
);

create policy professional_documents_insert_self on public.professional_documents
for insert to authenticated
with check (
  professional_id = (select auth.uid())
);

create policy professional_documents_update_self_or_admin on public.professional_documents
for update to authenticated
using (
  professional_id = (select auth.uid())
  or private.is_manito_admin()
)
with check (
  professional_id = (select auth.uid())
  or private.is_manito_admin()
);

create or replace function private.enforce_professional_document_review_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_manito_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('pending', 'uploaded') then
      raise exception 'La revision de documentos la realiza MANITO';
    end if;
    return new;
  end if;

  if new.professional_id <> old.professional_id then
    raise exception 'No se puede reasignar un documento profesional';
  end if;

  if new.status not in ('pending', 'uploaded') then
    raise exception 'La revision de documentos la realiza MANITO';
  end if;

  if old.status in ('approved', 'rejected') and new.status <> old.status then
    raise exception 'No se puede cambiar un documento ya cerrado por MANITO';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_professional_documents_review_fields on public.professional_documents;
create trigger trg_professional_documents_review_fields
before insert or update on public.professional_documents
for each row execute function private.enforce_professional_document_review_fields();

drop policy if exists ratings_client_insert on public.ratings;
create policy ratings_client_insert on public.ratings
for insert to authenticated
with check (
  client_id = (select auth.uid())
  and exists (
    select 1
    from public.orders o
    where o.id = ratings.order_id
      and o.client_id = (select auth.uid())
      and o.professional_id = ratings.professional_id
      and o.status = 'completed'
  )
);

revoke all on function private.enforce_professional_document_review_fields() from public, anon, authenticated;

insert into public.admin_settings (key, value)
values (
  'norm_002_rls_grants',
  '{
    "anon": "no business table or storage grants",
    "authenticated": "least privilege by current V6 operation",
    "sensitive_writes": {
      "orders": "insert only; state and assignment through RPC",
      "order_proposals": "select only; create/accept through RPC",
      "order_extras": "select only; propose/decide through RPC",
      "payments": "select only; provider/server/RPC owned",
      "complaints": "select only; open/review through RPC",
      "professional_reviews": "documents guarded by trigger; onboarding guarded by trigger"
    },
    "pin_scope": "NORM-013 explicitly left unchanged"
  }'::jsonb
)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
