-- MANITO security hardening.
-- Moves sensitive account preferences out of browser localStorage and tightens private function execution.

create table if not exists public.user_security_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  account_type text not null default 'particular'
    check (account_type in ('particular', 'empresa', 'consorcio')),
  tax_id text,
  trusted_contact text,
  hide_phone_in_chat boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_security_preferences_tax_id_length
    check (tax_id is null or char_length(tax_id) <= 32),
  constraint user_security_preferences_trusted_contact_length
    check (trusted_contact is null or char_length(trusted_contact) <= 180)
);

drop trigger if exists trg_user_security_preferences_updated_at on public.user_security_preferences;
create trigger trg_user_security_preferences_updated_at
before update on public.user_security_preferences
for each row execute function public.touch_updated_at();

alter table public.user_security_preferences enable row level security;

revoke all on public.user_security_preferences from anon, authenticated;
grant select, insert, update on public.user_security_preferences to authenticated;

drop policy if exists user_security_preferences_select_own on public.user_security_preferences;
create policy user_security_preferences_select_own on public.user_security_preferences
for select
to authenticated
using (profile_id = (select auth.uid()));

drop policy if exists user_security_preferences_insert_own on public.user_security_preferences;
create policy user_security_preferences_insert_own on public.user_security_preferences
for insert
to authenticated
with check (profile_id = (select auth.uid()));

drop policy if exists user_security_preferences_update_own on public.user_security_preferences;
create policy user_security_preferences_update_own on public.user_security_preferences
for update
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

-- Trigger functions should never be callable directly by browser roles.
revoke all on function private.sync_order_payment_status() from public, anon, authenticated;

insert into public.admin_settings (key, value)
values (
  'security_baseline',
  '{
    "password_min_length": 10,
    "frontend_secret_policy": "publishable_key_only",
    "sensitive_preferences_storage": "supabase_rls",
    "headers": ["hsts", "csp", "x-frame-options", "referrer-policy", "permissions-policy"],
    "dashboard_required": ["password_policy", "mfa", "leaked_password_protection", "captcha_or_rate_limits"]
  }'::jsonb
)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
