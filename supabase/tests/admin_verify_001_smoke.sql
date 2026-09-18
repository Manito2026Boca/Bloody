begin;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b70449cc-784b-4e91-a6d6-d071ba5d9495', true);

do $$
declare
  v_before_status text;
  v_after_status text;
  v_before_events bigint;
  v_after_events bigint;
  v_onboarding_status text;
begin
  if not private.is_manito_admin() then
    raise exception 'fixture admin is not authorized';
  end if;

  if not exists (
    select 1
    from public.list_admin_professional_review_queue('active', 'all', null, 'Azul', 'oldest', 20, 0)
    where full_name ilike '%Azul%'
  ) then
    raise exception 'pending professional missing from queue';
  end if;

  select status into v_before_status
  from public.professional_documents
  where id = '3c663977-7ff1-446a-bf50-52acb9b0fc6a'::uuid;

  select jsonb_array_length(public.get_admin_professional_review(
    '00000000-0000-4000-8000-000000000216'::uuid
  ) -> 'history') into v_before_events;

  perform public.review_professional_document(
    '3c663977-7ff1-446a-bf50-52acb9b0fc6a'::uuid,
    'observed',
    'ADMIN-VERIFY-001 rollback smoke'
  );

  select status into v_after_status
  from public.professional_documents
  where id = '3c663977-7ff1-446a-bf50-52acb9b0fc6a'::uuid;

  select jsonb_array_length(public.get_admin_professional_review(
    '00000000-0000-4000-8000-000000000216'::uuid
  ) -> 'history') into v_after_events;

  if v_before_status = v_after_status or v_after_status <> 'observed' then
    raise exception 'document decision did not apply';
  end if;
  if v_after_events <> v_before_events + 1 then
    raise exception 'document decision was not audited';
  end if;

  perform public.review_professional_document(
    '3c663977-7ff1-446a-bf50-52acb9b0fc6a'::uuid,
    'rejected',
    'ADMIN-VERIFY-001 rejection rollback smoke'
  );
  perform public.review_professional_document(
    '3c663977-7ff1-446a-bf50-52acb9b0fc6a'::uuid,
    'approved',
    null
  );

  select status into v_after_status
  from public.professional_documents
  where id = '3c663977-7ff1-446a-bf50-52acb9b0fc6a'::uuid;
  if v_after_status <> 'approved' then
    raise exception 'document approve/reject transitions failed';
  end if;

  perform public.review_professional_onboarding(
    '00000000-0000-4000-8000-000000000216'::uuid,
    'observed',
    'ADMIN-VERIFY-001 correction rollback smoke',
    false,
    null
  );
  perform public.review_professional_onboarding(
    '00000000-0000-4000-8000-000000000216'::uuid,
    'rejected',
    'ADMIN-VERIFY-001 rejection rollback smoke',
    false,
    null
  );
  perform public.review_professional_onboarding(
    '00000000-0000-4000-8000-000000000216'::uuid,
    'approved',
    'ADMIN-VERIFY-001 approval rollback smoke',
    true,
    false
  );

  select status into v_onboarding_status
  from public.professional_onboarding
  where professional_id = '00000000-0000-4000-8000-000000000216'::uuid;
  if v_onboarding_status <> 'approved' then
    raise exception 'onboarding final decisions failed';
  end if;
end;
$$;

rollback;

-- Non-admin execution is verified separately because the expected result is a
-- permission exception. Storage remains private and its SELECT policy delegates
-- admin authorization to private.is_manito_admin().
