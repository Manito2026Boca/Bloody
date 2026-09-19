-- WORKROOM-001 follow-up: cache auth.uid() once per statement in participant policies.
drop policy if exists workrooms_select_participants on public.workrooms;
create policy workrooms_select_participants on public.workrooms for select to authenticated
using ((select auth.uid()) in (client_id, professional_id));

drop policy if exists workroom_reads_select_own on public.workroom_reads;
create policy workroom_reads_select_own on public.workroom_reads for select to authenticated
using (user_id = (select auth.uid()));
