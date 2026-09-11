-- UX-001R: safe pre-contract editing, idempotent retry and one logical notification per event.

create or replace function public.retry_immediate_matching(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 607));
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or v_order.client_id <> v_uid or v_order.mode <> 'immediate'
     or coalesce(v_order.assignment_mode, 'auto') <> 'auto' or v_order.professional_id is not null
     or v_order.status <> 'matching_failed' then
    raise exception 'No podes reintentar esta busqueda';
  end if;
  if v_order.matching_failed_at is not null and v_order.matching_failed_at > clock_timestamp() - interval '2 seconds' then
    return;
  end if;
  perform private.start_immediate_matching_round_impl(p_order_id, true);
end;
$$;

revoke all on function public.retry_immediate_matching(uuid) from public, anon;
grant execute on function public.retry_immediate_matching(uuid) to authenticated;

create or replace function public.edit_uncontracted_order(p_order_id uuid, p_data jsonb)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_mode text;
  v_assignment text;
  v_status text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 608));
  select * into v_order from public.orders where id = p_order_id for update;

  if v_order.id is null or v_order.client_id <> v_uid or v_order.professional_id is not null
     or v_order.contracted_at is not null
     or v_order.status not in ('open', 'scheduled_open', 'waiting_quotes', 'matching_failed') then
    raise exception 'Esta solicitud ya no se puede editar';
  end if;
  if exists (select 1 from public.order_proposals p where p.order_id = p_order_id and p.status = 'sent') then
    raise exception 'No podes editar una solicitud que ya recibio presupuestos';
  end if;

  v_mode := coalesce(nullif(p_data->>'mode', ''), v_order.mode);
  v_assignment := case when v_mode = 'quote' then 'auto' else coalesce(nullif(p_data->>'assignment_mode', ''), 'auto') end;
  if v_mode not in ('immediate', 'scheduled', 'quote') then raise exception 'Modalidad invalida'; end if;
  if v_assignment not in ('auto', 'manual') then raise exception 'Asignacion invalida'; end if;
  if v_mode = 'scheduled' and nullif(p_data->>'scheduled_at', '')::timestamptz <= now() then
    raise exception 'Elegi una fecha futura';
  end if;
  if v_assignment = 'manual' and nullif(p_data->>'preferred_professional_id', '') is null then
    raise exception 'Elegi un profesional compatible';
  end if;

  delete from public.order_match_candidates where order_id = p_order_id;
  v_status := case v_mode when 'quote' then 'waiting_quotes' when 'scheduled' then 'scheduled_open' else 'matching_failed' end;

  update public.orders
  set description = coalesce(nullif(btrim(p_data->>'description'), ''), description),
      address = coalesce(nullif(btrim(p_data->>'address'), ''), address),
      mode = v_mode,
      assignment_mode = v_assignment,
      preferred_professional_id = case when v_assignment = 'manual' then nullif(p_data->>'preferred_professional_id', '')::uuid else null end,
      location_id = case when p_data ? 'location_id' then nullif(p_data->>'location_id', '') else location_id end,
      required_specialty_id = case when p_data ? 'required_specialty_id' then nullif(p_data->>'required_specialty_id', '')::bigint else required_specialty_id end,
      client_lat = case when p_data ? 'client_lat' then nullif(p_data->>'client_lat', '')::double precision else client_lat end,
      client_lng = case when p_data ? 'client_lng' then nullif(p_data->>'client_lng', '')::double precision else client_lng end,
      scheduled_at = case when v_mode = 'scheduled' then nullif(p_data->>'scheduled_at', '')::timestamptz else null end,
      estimated_duration_minutes = case when v_mode = 'scheduled' then nullif(p_data->>'estimated_duration_minutes', '')::integer else null end,
      payment_method = case when v_mode = 'quote' then null else nullif(p_data->>'payment_method', '') end,
      status = v_status,
      matching_status = case when v_mode = 'immediate' and v_assignment = 'auto' then 'failed' else null end,
      matching_started_at = null,
      matching_current_round = 0,
      matching_cycle = coalesce(matching_cycle, 0) + 1,
      matching_round_deadline_at = null,
      matching_failed_at = case when v_mode = 'immediate' and v_assignment = 'auto' then now() - interval '3 seconds' else null end,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if v_assignment = 'manual' and not private.order_professional_eligible(v_order, v_order.preferred_professional_id) then
    raise exception 'El profesional ya no es compatible con estos criterios';
  end if;
  if v_mode = 'immediate' and v_assignment = 'auto' then
    v_order := private.start_immediate_matching_round_impl(p_order_id, true);
  end if;
  return v_order;
end;
$$;

revoke all on function public.edit_uncontracted_order(uuid, jsonb) from public, anon;
grant execute on function public.edit_uncontracted_order(uuid, jsonb) to authenticated;

create or replace function private.notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_body text;
  v_reason_label text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'waiting_quotes' then v_title := 'Solicitud publicada'; v_body := 'Los profesionales compatibles ya pueden enviarte presupuestos.';
    elsif new.status = 'scheduled_open' then v_title := 'Pedido programado'; v_body := 'MANITO buscará profesionales compatibles con ese horario.';
    else v_title := 'Pedido publicado'; v_body := 'Estamos buscando un profesional disponible.';
    end if;
    perform private.add_notification(new.client_id, 'order_created', v_title, v_body, new.id, new.client_id);
    return new;
  end if;

  if new.status is distinct from old.status then
    -- Matching owns its specific failure notification. Internal open/failed transitions are not user events.
    if new.status in ('open', 'scheduled_open', 'waiting_quotes', 'matching_failed') then return new; end if;
    v_title := case new.status
      when 'payment_pending' then 'Falta confirmar el pago'
      when 'accepted' then coalesce(new.professional_id::text, 'El profesional') || ' aceptó tu pedido'
      when 'en_camino' then 'El profesional va en camino'
      when 'en_sitio' then 'El profesional llegó'
      when 'trabajando' then 'Trabajo en curso'
      when 'completed' then 'Trabajo finalizado'
      when 'cancelled' then 'Pedido cancelado'
      else 'Seguimiento actualizado'
    end;
    if new.status = 'cancelled' then
      v_reason_label := private.cancellation_reason_label(new.cancellation_reason);
      v_body := 'El pedido fue cancelado. Motivo: ' || v_reason_label || '.';
    else
      v_body := case new.status
        when 'payment_pending' then 'El precio quedó definido. Confirmá el pago para habilitar el trabajo.'
        when 'accepted' then 'Ya pueden coordinar por el chat del pedido.'
        when 'en_camino' then 'Podés seguir el estado desde tu pedido.'
        when 'en_sitio' then 'Compartí el PIN de inicio cuando estés listo.'
        when 'trabajando' then 'El servicio ya comenzó.'
        when 'completed' then 'La constancia MANITO queda disponible para protección y reclamos.'
        else 'Revisá el seguimiento del pedido.'
      end;
    end if;
    perform private.add_notification(new.client_id, 'order_status', v_title, v_body, new.id, new.professional_id);
    if new.professional_id is not null then
      perform private.add_notification(new.professional_id, 'order_status', v_title, v_body, new.id, new.client_id);
    end if;
  elsif new.payment_status is distinct from old.payment_status then
    perform private.add_notification(new.client_id, 'payment_status', 'Pago actualizado', 'El estado de pago del pedido cambió.', new.id, new.professional_id);
    if new.professional_id is not null then
      perform private.add_notification(new.professional_id, 'payment_status', 'Pago actualizado', 'El estado de pago del pedido cambió.', new.id, new.client_id);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.notify_order_status_change() from public, anon, authenticated;

-- Remove only same-event duplicates already produced. Keep the oldest visible record.
with ranked as (
  select id, row_number() over (partition by recipient_id, order_id, kind, title, body, date_trunc('second', created_at) order by created_at, id) as rn
  from public.notifications
)
delete from public.notifications n using ranked r where n.id = r.id and r.rn > 1;

insert into public.admin_settings(key, value)
values ('ux_001r_human_review', jsonb_build_object('status','implemented','request_edit','pre_contract_only','retry_debounce_seconds',2))
on conflict (key) do update set value = excluded.value, updated_at = now();
