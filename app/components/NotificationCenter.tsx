'use client';

import { Archive, ArrowLeft, CheckCheck, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  archiveV6Notification,
  listV6NotificationHistory,
} from '../lib/v6Api';
import type { V6Notification } from '../lib/v6Types';

const HISTORY_PAGE_SIZE = 20;

export function notificationTimeLabel(value: string, now = new Date()) {
  const date = new Date(value);
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return 'Ahora';
  if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
  if (date.toDateString() === now.toDateString()) return `Hace ${Math.floor(seconds / 3600)} h`;
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(date);
}

export function notificationActionLabel(item: V6Notification) {
  if (!item.order_id) return null;
  if (!item.action_pending) return 'Ver estado';
  switch (item.action_key) {
    case 'open_direct_request': return 'Responder solicitud';
    case 'compare_proposals': return 'Comparar presupuestos';
    case 'review_extra': return 'Revisar adicional';
    case 'review_payment': return 'Revisar pago';
    case 'open_chat': return 'Abrir conversación';
    case 'open_protection': return 'Ver Protección MANITO';
    default: return 'Ver trabajo';
  }
}

function NotificationItem({
  item,
  onOpen,
  onArchive,
  showArchive = false,
}: {
  item: V6Notification;
  onOpen: (item: V6Notification) => void;
  onArchive?: (item: V6Notification) => void;
  showArchive?: boolean;
}) {
  const actionLabel = notificationActionLabel(item);
  return (
    <article className={`v6-notification-item ${item.read_at ? 'read' : 'unread'}`}>
      <button type="button" className="v6-notification-main" onClick={() => onOpen(item)}>
        <span className="v6-notification-dot" aria-hidden="true" />
        <span className="v6-notification-copy">
          <strong>{item.title}</strong>
          {item.body && <span>{item.body}</span>}
          <small>{notificationTimeLabel(item.created_at)}</small>
        </span>
        {actionLabel && <span className="v6-notification-action">{actionLabel}</span>}
      </button>
      {showArchive && !item.archived_at && (
        <button
          className="v6-notification-archive"
          type="button"
          aria-label={`Archivar: ${item.title}`}
          title="Archivar"
          onClick={() => onArchive?.(item)}
        >
          <Archive size={17} aria-hidden="true" />
        </button>
      )}
    </article>
  );
}

export function NotificationQuickPanel({
  notifications,
  unreadCount,
  busy,
  onClose,
  onOpen,
  onMarkAllRead,
  onViewAll,
}: {
  notifications: V6Notification[];
  unreadCount: number;
  busy: boolean;
  onClose: () => void;
  onOpen: (item: V6Notification) => void;
  onMarkAllRead: () => void;
  onViewAll: () => void;
}) {
  const unread = notifications.filter((item) => !item.read_at);
  const previous = notifications.filter((item) => item.read_at);

  return (
    <section className="v6-notification-panel" role="dialog" aria-modal="true" aria-label="Notificaciones">
      <header className="v6-notification-head">
        <div><h2>Notificaciones</h2><span>{unreadCount ? `${unreadCount} sin leer` : 'Todo al día'}</span></div>
        <button className="v6-icon-button" type="button" onClick={onClose} aria-label="Cerrar notificaciones">
          <X size={19} aria-hidden="true" />
        </button>
      </header>

      <div className="v6-notification-feed">
        {unread.length > 0 && <h3>Nuevas</h3>}
        {unread.map((item) => <NotificationItem item={item} onOpen={onOpen} key={item.id} />)}
        {previous.length > 0 && <h3>Anteriores</h3>}
        {previous.map((item) => <NotificationItem item={item} onOpen={onOpen} key={item.id} />)}
        {!notifications.length && <p className="v6-notification-empty">No tenés nada pendiente.</p>}
      </div>

      <footer className="v6-notification-footer">
        <button className="v6-text-button" type="button" disabled={!unreadCount || busy} onClick={onMarkAllRead}>
          <CheckCheck size={17} aria-hidden="true" /> Marcar todas como leídas
        </button>
        <button className="v6-secondary" type="button" onClick={onViewAll}>Ver todas</button>
      </footer>
    </section>
  );
}

export function NotificationHistory({
  refreshKey,
  onBack,
  onOpen,
  onChanged,
}: {
  refreshKey: number;
  onBack: () => void;
  onOpen: (item: V6Notification) => void;
  onChanged: () => void;
}) {
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<V6Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listV6NotificationHistory(page * HISTORY_PAGE_SIZE, HISTORY_PAGE_SIZE);
      setItems(result.items);
      setTotal(result.total);
    } catch {
      setError('No pudimos cargar tus notificaciones.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  const groups = useMemo(() => ({
    unread: items.filter((item) => !item.read_at),
    previous: items.filter((item) => item.read_at),
  }), [items]);

  async function archive(item: V6Notification) {
    setItems((current) => current.map((entry) => entry.id === item.id
      ? { ...entry, archived_at: new Date().toISOString(), read_at: entry.read_at || new Date().toISOString() }
      : entry));
    try {
      await archiveV6Notification(item.id);
      onChanged();
    } catch {
      await load();
      setError('No pudimos archivar la notificación.');
    }
  }

  function open(item: V6Notification) {
    if (!item.read_at) {
      const readAt = new Date().toISOString();
      setItems((current) => current.map((entry) => entry.id === item.id
        ? { ...entry, read_at: readAt }
        : entry));
      onOpen(item);
      return;
    }
    onOpen(item);
  }

  return (
    <section className="v6-notification-history v6-section">
      <header className="v6-notification-history-head">
        <button className="v6-icon-button" type="button" onClick={onBack} aria-label="Volver">
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <div><h1>Notificaciones</h1><p>{total ? `${total} en tu historial` : 'Tu centro de atención'}</p></div>
      </header>

      {loading && <p className="v6-notification-empty">Cargando...</p>}
      {error && <p className="v6-inline-error">{error}</p>}
      {!loading && groups.unread.length > 0 && <h2>Nuevas</h2>}
      {groups.unread.map((item) => <NotificationItem item={item} onOpen={open} onArchive={archive} showArchive key={item.id} />)}
      {!loading && groups.previous.length > 0 && <h2>Anteriores</h2>}
      {groups.previous.map((item) => <NotificationItem item={item} onOpen={open} onArchive={archive} showArchive key={item.id} />)}
      {!loading && !items.length && <p className="v6-notification-empty">Todavía no hay notificaciones.</p>}

      {totalPages > 1 && (
        <nav className="v6-notification-pagination" aria-label="Páginas de notificaciones">
          <button type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
            <ChevronLeft size={17} aria-hidden="true" /> Anterior
          </button>
          <span>{page + 1} de {totalPages}</span>
          <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((value) => value + 1)}>
            Siguiente <ChevronRight size={17} aria-hidden="true" />
          </button>
        </nav>
      )}
    </section>
  );
}
