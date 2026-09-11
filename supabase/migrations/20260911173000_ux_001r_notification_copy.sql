-- Keep status notifications specific and human without exposing internal identifiers.
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
  v_professional_name text;
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
    if new.status in ('open', 'scheduled_open', 'waiting_quotes', 'matching_failed') then return new; end if;
    if new.professional_id is not null then
      select nullif(btrim(p.full_name), '') into v_professional_name from public.profiles p where p.id = new.professional_id;
    end if;
    v_title := case new.status
      when 'payment_pending' then 'Falta confirmar el pago'
      when 'accepted' then coalesce(v_professional_name, 'El profesional') || ' aceptó tu pedido'
      when 'en_camino' then coalesce(v_professional_name, 'El profesional') || ' está en camino'
      when 'en_sitio' then coalesce(v_professional_name, 'El profesional') || ' llegó'
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
