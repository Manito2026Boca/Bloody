'use client';

import { Camera, ChevronUp, MessageCircle, RefreshCw, X } from 'lucide-react';
import Image from 'next/image';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgreementSummary } from './AgreementSummary';
import { subscribeV6OrderDetails } from '../lib/v6OrderRealtime';
import {
  getV6WorkroomImageSignedUrl,
  listV6OrderExtras,
  listV6OrderProposals,
  listV6Workrooms,
  listV6WorkroomTimeline,
  markV6WorkroomRead,
  removeV6Channel,
  removeV6WorkroomImage,
  sendV6WorkroomMessage,
  subscribeV6Workroom,
  subscribeV6WorkroomList,
  uploadV6WorkroomImage,
} from '../lib/v6Api';
import type {
  V6Order,
  V6OrderExtra,
  V6OrderProposal,
  V6Profile,
  V6Workroom,
  V6WorkroomTimelineItem,
} from '../lib/v6Types';

function time(value: string) {
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function statusText(status: V6Order['status']) {
  const labels: Partial<Record<V6Order['status'], string>> = {
    open: 'Buscando profesional', scheduled_open: 'Buscando profesional', waiting_quotes: 'Comparando presupuestos',
    pending_client_confirmation: 'Esperando confirmación', accepted: 'Profesional confirmado', en_camino: 'Está en camino',
    en_sitio: 'El profesional llegó', trabajando: 'Trabajo en curso', payment_pending: 'Pago pendiente',
    completed: 'Trabajo finalizado', cancelled: 'Trabajo cancelado', matching_failed: 'Sin profesional disponible',
  };
  return labels[status] || 'Trabajo en seguimiento';
}

function nextStep(order: V6Order, profile: V6Profile) {
  if (order.status === 'pending_client_confirmation') return profile.id === order.client_id ? 'Revisá y confirmá el precio desde el trabajo.' : 'El Cliente debe confirmar el precio.';
  if (order.status === 'accepted') return profile.id === order.professional_id ? 'Indicá cuando salgas hacia el domicilio.' : 'El Profesional confirmará cuando esté en camino.';
  if (order.status === 'en_camino') return profile.id === order.professional_id ? 'Avisá cuando llegues.' : 'Esperá la llegada del Profesional.';
  if (order.status === 'en_sitio') return profile.id === order.client_id ? 'Compartí el PIN desde el flujo seguro del trabajo.' : 'Ingresá el PIN desde el trabajo.';
  if (order.status === 'trabajando') return 'Coordiná cualquier cambio o adicional dentro de MANITO.';
  if (order.status === 'completed') return 'Este Workroom se conserva como historial.';
  if (order.status === 'cancelled') return 'La conversación quedó como historial.';
  return order.mode === 'quote' ? 'Usá este hilo para aclarar el presupuesto.' : 'Seguí el próximo paso desde el trabajo.';
}

function TimelineEvent({ item, onOpenOrder }: { item: V6WorkroomTimelineItem; onOpenOrder?: () => void }) {
  return (
    <article className="v6-workroom-event">
      <span>{item.title}</span>
      {item.detail && <p>{item.detail}</p>}
      <small>{time(item.created_at)}</small>
      {item.action_key === 'review_extra' && <button type="button" className="v6-secondary" onClick={onOpenOrder}>Revisar adicional</button>}
    </article>
  );
}

export function WorkroomSheet({
  order,
  profile,
  requestedWorkroomId,
  onClose,
  onOpenOrder,
  setError,
}: {
  order: V6Order;
  profile: V6Profile;
  requestedWorkroomId?: string | null;
  onClose: () => void;
  onOpenOrder?: () => void;
  setError: (message: string) => void;
}) {
  const [workroom, setWorkroom] = useState<V6Workroom | null>(null);
  const [items, setItems] = useState<V6WorkroomTimelineItem[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [body, setBody] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [extras, setExtras] = useState<V6OrderExtra[]>([]);
  const [acceptedProposal, setAcceptedProposal] = useState<V6OrderProposal | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadTimeline = useCallback(async (target: V6Workroom, before: string | null = null) => {
    const page = await listV6WorkroomTimeline(target.id, before);
    setItems((current) => before ? [...page.items, ...current] : page.items);
    setHasMore(page.has_more);
    await markV6WorkroomRead(target.id);
    const imagePaths = page.items.filter((item) => item.message_kind === 'image' && item.file_path).map((item) => item.file_path as string);
    const urls = await Promise.all(imagePaths.map(async (path) => [path, await getV6WorkroomImageSignedUrl(path)] as const));
    setSignedUrls((current) => ({ ...current, ...Object.fromEntries(urls.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))) }));
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const rooms = await listV6Workrooms();
        const target = rooms.find((room) => room.id === requestedWorkroomId)
          || rooms.find((room) => room.order_id === order.id && (
            profile.id === order.client_id ? room.professional_id === order.professional_id : room.professional_id === profile.id
          ));
        if (!target) throw new Error('La conversación todavía no está disponible.');
        if (!active) return;
        setWorkroom(target);
        await Promise.all([
          loadTimeline(target),
          listV6OrderExtras(order.id).then((rows) => { if (active) setExtras(rows); }).catch(() => undefined),
          listV6OrderProposals(order.id).then((rows) => {
            if (active) setAcceptedProposal(rows.find((proposal) => proposal.id === order.accepted_proposal_id || proposal.status === 'accepted') || null);
          }).catch(() => undefined),
        ]);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'No se pudo abrir el Workroom.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loadTimeline, order, profile.id, requestedWorkroomId, setError]);

  useEffect(() => {
    if (!workroom) return undefined;
    let refreshing = false;
    const refresh = () => {
      if (refreshing) return;
      refreshing = true;
      void loadTimeline(workroom).finally(() => { refreshing = false; });
    };
    const workroomChannel = subscribeV6Workroom(workroom.id, refresh);
    const orderChannel = subscribeV6OrderDetails(order.id, refresh);
    return () => { removeV6Channel(workroomChannel); removeV6Channel(orderChannel); };
  }, [loadTimeline, order.id, workroom]);

  const canSend = workroom?.status === 'open';
  const title = workroom?.phase === 'precontractual' ? 'Conversación del presupuesto' : 'Trabajo compartido';
  const counterpart = workroom?.counterpart_name || (profile.id === order.client_id ? order.professional?.full_name : order.client?.full_name) || 'MANITO';
  const oldest = items[0]?.created_at || null;

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workroom || !canSend || sending || (!body.trim() && !image)) return;
    setSending(true);
    setSendFailed(false);
    let uploadedPath: string | null = null;
    try {
      if (image) uploadedPath = await uploadV6WorkroomImage({ workroomId: workroom.id, ownerId: profile.id, file: image });
      await sendV6WorkroomMessage({
        workroomId: workroom.id,
        body: image ? body.trim() || 'Foto compartida' : body.trim(),
        kind: image ? 'image' : 'text',
        filePath: uploadedPath,
        fileName: image?.name || null,
        clientNonce: crypto.randomUUID(),
      });
      setBody('');
      setImage(null);
      if (inputRef.current) inputRef.current.value = '';
      await loadTimeline(workroom);
    } catch (caught) {
      if (uploadedPath) await removeV6WorkroomImage(uploadedPath).catch(() => undefined);
      setSendFailed(true);
      setError(caught instanceof Error ? caught.message : 'No se pudo enviar. Podés reintentar.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="v6-modal v6-workroom-modal" role="dialog" aria-modal="true" aria-label={title}>
      <section className="v6-sheet v6-workroom-sheet">
        <header className="v6-workroom-header">
          <div><small>{title}</small><h2>{counterpart}</h2><span>{statusText(order.status)}</span></div>
          <button className="v6-icon-button" type="button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </header>

        <div className="v6-workroom-next"><strong>Próximo paso</strong><p>{nextStep(order, profile)}</p>{onOpenOrder && <button type="button" onClick={onOpenOrder}>Ver trabajo</button>}</div>
        <details className="v6-inline-details v6-workroom-agreement">
          <summary>Ver acuerdo y total actual</summary>
          <AgreementSummary order={order} extras={extras} acceptedProposal={acceptedProposal} />
        </details>
        <p className="v6-chat-protection">Coordiná cambios, fotos y adicionales por MANITO para que queden registrados en el trabajo.</p>

        <div className="v6-workroom-timeline" aria-live="polite">
          {hasMore && <button className="v6-workroom-older" type="button" disabled={loadingOlder} onClick={() => {
            if (!workroom || !oldest) return;
            setLoadingOlder(true);
            void loadTimeline(workroom, oldest).finally(() => setLoadingOlder(false));
          }}><ChevronUp size={16} /> {loadingOlder ? 'Cargando...' : 'Ver mensajes anteriores'}</button>}
          {items.map((item) => item.item_type === 'event' ? (
            <TimelineEvent key={item.item_id} item={item} onOpenOrder={onOpenOrder} />
          ) : (
            <article className={item.sender_id === profile.id ? 'v6-bubble mine' : 'v6-bubble'} key={item.item_id}>
              {item.message_kind === 'image' && item.file_path && (
                signedUrls[item.file_path]
                  ? <Image unoptimized width={320} height={240} src={signedUrls[item.file_path]} alt={item.file_name || 'Foto compartida en el trabajo'} />
                  : <span className="v6-workroom-image-loading">Cargando foto...</span>
              )}
              <span>{item.body}</span><small>{time(item.created_at)}</small>
            </article>
          ))}
          {!loading && !items.length && <div className="v6-workroom-empty"><MessageCircle size={24} /><strong>Empezá la conversación</strong><span>Este espacio pertenece sólo a este trabajo.</span></div>}
          {loading && <div className="v6-workroom-empty"><span>Cargando conversación...</span></div>}
        </div>

        {canSend ? (
          <form className="v6-workroom-compose" onSubmit={send}>
            {image && <div className="v6-workroom-file"><span>{image.name}</span><button type="button" onClick={() => { setImage(null); if (inputRef.current) inputRef.current.value = ''; }}>Quitar</button></div>}
            {sendFailed && <button className="v6-workroom-retry" type="submit"><RefreshCw size={15} /> Reintentar envío</button>}
            <div>
              <label className="v6-workroom-camera" title="Agregar foto"><Camera size={20} /><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] || null)} /><span className="sr-only">Agregar foto</span></label>
              <input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Escribí un mensaje" maxLength={2000} />
              <button type="submit" disabled={sending || (!body.trim() && !image)}>{sending ? 'Enviando...' : 'Enviar'}</button>
            </div>
          </form>
        ) : (
          <p className="v6-workroom-readonly">Esta conversación quedó guardada como historial.</p>
        )}
      </section>
    </div>
  );
}

export function WorkroomList({ onOpen }: { onOpen: (workroom: V6Workroom) => void }) {
  const [workrooms, setWorkrooms] = useState<V6Workroom[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    let refreshing = false;
    const refresh = () => {
      if (refreshing) return;
      refreshing = true;
      void listV6Workrooms().then((rows) => { if (active) setWorkrooms(rows); }).finally(() => {
        refreshing = false;
        if (active) setLoading(false);
      });
    };
    refresh();
    const channel = subscribeV6WorkroomList(refresh);
    return () => { active = false; removeV6Channel(channel); };
  }, []);
  const totalUnread = useMemo(() => workrooms.reduce((sum, room) => sum + Number(room.unread_count || 0), 0), [workrooms]);
  return (
    <section className="v6-section v6-conversation-screen">
      <div className="v6-section-head"><h1>Mensajes</h1><span>{totalUnread ? `${totalUnread} sin leer` : workrooms.length}</span></div>
      <div className="v6-conversation-list">
        {workrooms.map((room) => (
          <button type="button" key={room.id} onClick={() => onOpen(room)}>
            <span className="v6-pro-avatar">{room.counterpart_name.slice(0, 1)}</span>
            <span><strong>{room.counterpart_name}</strong><small>{room.service_name} · {statusText(room.order_status)}</small><p>{room.last_item_kind === 'image' ? 'Foto compartida' : room.last_item || (room.phase === 'precontractual' ? 'Conversación del presupuesto' : 'Abrí el trabajo compartido')}</p></span>
            <span className="v6-conversation-time">{room.unread_count > 0 && <b className="v6-workroom-unread">{room.unread_count}</b>}{room.last_item_at ? time(room.last_item_at) : ''}</span>
          </button>
        ))}
      </div>
      {!loading && !workrooms.length && <div className="v6-workroom-empty"><MessageCircle size={24} /><strong>Todavía no hay conversaciones</strong><span>Se habilitan al contratar o cuando enviás un presupuesto.</span></div>}
    </section>
  );
}
