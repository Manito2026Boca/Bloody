'use client';

import {
  ArrowLeft,
  BadgeCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  FileText,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getV6AdminProfessionalReview,
  getV6MediaSignedUrl,
  listV6AdminProfessionalReviewQueue,
  listV6Services,
  reviewV6ProfessionalDocument,
  reviewV6ProfessionalOnboarding,
} from '../lib/v6Api';
import type {
  V6AdminProfessionalReview,
  V6AdminProfessionalReviewSummary,
  V6AdminReviewDocument,
  V6AdminReviewStatus,
  V6ProfessionalDocument,
  V6Service,
} from '../lib/v6Types';

type QueueScope = 'active' | 'resolved';
type QueueState = 'all' | 'ready' | 'incomplete' | 'correction' | 'approved' | 'rejected';
type QueueSort = 'oldest' | 'newest' | 'complete';

const PAGE_SIZE = 20;

function dateLabel(value?: string | null) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function ageLabel(value?: string | null) {
  if (!value) return 'Sin envío';
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Hace 1 día';
  return `Hace ${days} días`;
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    ready: 'Lista para revisar',
    incomplete: 'Incompleta',
    correction: 'Requiere corrección',
    approved: 'Aprobada',
    rejected: 'Rechazada',
    verified: 'Verificada',
    requires_review: 'Pendiente de revisión',
    requires_correction: 'Requiere corrección',
    submitted: 'Enviada',
    in_review: 'En revisión',
    observed: 'Requiere corrección',
    uploaded: 'Pendiente',
    pending: 'Pendiente',
  };
  return labels[value] || value;
}

function documentStatusLabel(status: V6ProfessionalDocument['status']) {
  if (status === 'observed') return 'Requiere corrección';
  return statusLabel(status);
}

function isPdf(path: string) {
  return path.toLowerCase().split('?')[0].endsWith('.pdf');
}

function reviewNote(document: V6AdminReviewDocument) {
  const value = document.observation?.trim() || '';
  return /^[^/\\]+\.(?:jpe?g|png|webp|pdf)$/i.test(value) ? '' : value;
}

export function AdminVerificationInbox({ setNotice }: { setNotice: (message: string) => void }) {
  const [scope, setScope] = useState<QueueScope>('active');
  const [queueState, setQueueState] = useState<QueueState>('all');
  const [sort, setSort] = useState<QueueSort>('oldest');
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [services, setServices] = useState<V6Service[]>([]);
  const [rows, setRows] = useState<V6AdminProfessionalReviewSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<V6AdminProfessionalReview | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [applicationNote, setApplicationNote] = useState('');
  const [documentNotes, setDocumentNotes] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ document: V6AdminReviewDocument; url: string; zoom: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    void listV6Services().then(setServices).catch(() => setServices([]));
  }, []);

  const loadQueue = useCallback(async (preferredId?: string | null) => {
    setLoadingList(true);
    try {
      const nextRows = await listV6AdminProfessionalReviewQueue({
        scope,
        queueState,
        serviceId,
        search: debouncedSearch,
        sort,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setRows(nextRows);
      setTotal(Number(nextRows[0]?.total_count || 0));
      const preferred = preferredId && nextRows.some((row) => row.professional_id === preferredId) ? preferredId : null;
      const desktopDefault = typeof window !== 'undefined' && !window.matchMedia('(max-width: 719px)').matches
        ? nextRows[0]?.professional_id || null
        : null;
      const nextId = preferred || desktopDefault;
      setSelectedId((current) => current && nextRows.some((row) => row.professional_id === current) ? current : nextId);
      if (!nextId && !nextRows.length) setDetail(null);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'No pudimos cargar las verificaciones.');
    } finally {
      setLoadingList(false);
    }
  }, [debouncedSearch, page, queueState, scope, serviceId, setNotice, sort]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let active = true;
    setLoadingDetail(true);
    void getV6AdminProfessionalReview(selectedId)
      .then((next) => {
        if (!active) return;
        setDetail(next);
        setApplicationNote(next.onboarding_notes || '');
        setDocumentNotes(Object.fromEntries(next.documents.map((document) => [document.id, reviewNote(document)])));
      })
      .catch((caught) => active && setNotice(caught instanceof Error ? caught.message : 'No pudimos abrir el expediente.'))
      .finally(() => active && setLoadingDetail(false));
    return () => { active = false; };
  }, [selectedId, setNotice]);

  useEffect(() => {
    if (!preview) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  const selectedIndex = rows.findIndex((row) => row.professional_id === selectedId);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const mergedDocuments = useMemo(() => {
    if (!detail) return [];
    const byKind = new Map(detail.documents.map((document) => [document.kind, document]));
    const configured = (detail.requirements || []).map((requirement) => ({
      requirement,
      document: byKind.get(requirement.kind) || null,
    }));
    const configuredKinds = new Set((detail.requirements || []).map((item) => item.kind));
    const extras = detail.documents
      .filter((document) => !configuredKinds.has(document.kind))
      .map((document) => ({ requirement: { kind: document.kind, label: document.label, category: 'professional' as const }, document }));
    return [...configured, ...extras];
  }, [detail]);

  async function reloadDetail() {
    if (!selectedId) return;
    const next = await getV6AdminProfessionalReview(selectedId);
    setDetail(next);
    setApplicationNote(next.onboarding_notes || '');
    setDocumentNotes(Object.fromEntries(next.documents.map((document) => [document.id, reviewNote(document)])));
  }

  async function openDocument(document: V6AdminReviewDocument) {
    if (!document.file_path || document.file_path.startsWith('http')) {
      setNotice('Este expediente no tiene un archivo privado válido para mostrar.');
      return;
    }
    setPreviewLoading(true);
    try {
      const url = await getV6MediaSignedUrl(document.file_path);
      if (!url) throw new Error('No pudimos generar un acceso temporal al documento.');
      setPreview({ document, url, zoom: 1 });
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'No pudimos abrir el documento.');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function decideDocument(document: V6AdminReviewDocument, status: 'approved' | 'observed' | 'rejected') {
    const note = (documentNotes[document.id] || '').trim();
    if (status !== 'approved' && !note) {
      setNotice('Escribí el motivo para solicitar una corrección o rechazar el documento.');
      return;
    }
    const key = `${document.id}:${status}`;
    setBusyKey(key);
    try {
      await reviewV6ProfessionalDocument({ documentId: document.id, status, observation: note || null });
      await Promise.all([reloadDetail(), loadQueue(selectedId)]);
      setNotice(status === 'approved' ? 'Documento aprobado.' : status === 'observed' ? 'Corrección solicitada.' : 'Documento rechazado.');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'No pudimos actualizar el documento.');
    } finally {
      setBusyKey(null);
    }
  }

  async function decideApplication(status: V6AdminReviewStatus) {
    if (!detail) return;
    const note = applicationNote.trim();
    if ((status === 'observed' || status === 'rejected') && !note) {
      setNotice('Escribí una observación antes de solicitar correcciones o rechazar el alta.');
      return;
    }
    const action = status === 'approved' ? 'aprobar' : status === 'rejected' ? 'rechazar' : 'solicitar correcciones para';
    if (!window.confirm(`¿Querés ${action} el alta de ${detail.full_name}?`)) return;
    const key = `${detail.professional_id}:${status}`;
    setBusyKey(key);
    try {
      await reviewV6ProfessionalOnboarding({
        professionalId: detail.professional_id,
        status,
        notes: note || null,
        verified: status === 'approved' ? true : false,
        manitoPro: status === 'approved' ? detail.manito_pro : null,
      });
      const nextId = rows[selectedIndex + 1]?.professional_id || rows[selectedIndex - 1]?.professional_id || null;
      setSelectedId(nextId);
      setDetail(null);
      await loadQueue(nextId);
      setNotice(status === 'approved' ? 'Alta aprobada y archivada en Resueltas.' : status === 'rejected' ? 'Alta rechazada y archivada en Resueltas.' : 'Correcciones solicitadas.');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'No pudimos resolver el alta.');
    } finally {
      setBusyKey(null);
    }
  }

  function changeScope(next: QueueScope) {
    setScope(next);
    setQueueState(next === 'active' ? 'all' : 'all');
    setPage(0);
    setSelectedId(null);
    setDetail(null);
  }

  return (
    <section className={`admin-verification ${selectedId ? 'has-selection' : ''}`}>
      <header className="admin-verification-head">
        <div>
          <span className="admin-eyebrow">ADMIN · VERIFICACIONES</span>
          <h1>Altas profesionales</h1>
          <p>Revisá identidad, documentación y requisitos antes de habilitar a un profesional.</p>
        </div>
        <button className="v6-secondary" type="button" onClick={() => void loadQueue(selectedId)} disabled={loadingList}>
          <RefreshCw size={17} aria-hidden="true" /> Actualizar
        </button>
      </header>

      <div className="admin-scope-tabs" role="tablist" aria-label="Bandejas de verificación">
        <button type="button" role="tab" aria-selected={scope === 'active'} onClick={() => changeScope('active')}>
          Necesitan acción
        </button>
        <button type="button" role="tab" aria-selected={scope === 'resolved'} onClick={() => changeScope('resolved')}>
          Resueltas
        </button>
      </div>

      <div className="admin-filters">
        <label className="admin-search">
          <Search size={17} aria-hidden="true" />
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Buscar nombre, email o rubro" />
        </label>
        <label>
          <span>Estado</span>
          <select value={queueState} onChange={(event) => { setQueueState(event.target.value as QueueState); setPage(0); }}>
            <option value="all">{scope === 'active' ? 'Todos los que requieren acción' : 'Todas las resueltas'}</option>
            {scope === 'active' ? <>
              <option value="ready">Listas para revisar</option>
              <option value="incomplete">Incompletas</option>
              <option value="correction">Requieren corrección</option>
            </> : <>
              <option value="approved">Aprobadas</option>
              <option value="rejected">Rechazadas</option>
            </>}
          </select>
        </label>
        <label>
          <span>Rubro</span>
          <select value={serviceId || ''} onChange={(event) => { setServiceId(event.target.value ? Number(event.target.value) : null); setPage(0); }}>
            <option value="">Todos</option>
            {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select>
        </label>
        <label>
          <span>Orden</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as QueueSort)}>
            <option value="oldest">Más antiguas</option>
            <option value="newest">Más recientes</option>
            <option value="complete">Más completas</option>
          </select>
        </label>
      </div>

      <div className="admin-master-detail">
        <aside className="admin-queue" aria-label="Solicitudes profesionales">
          <div className="admin-queue-meta"><strong>{total}</strong><span>{scope === 'active' ? 'solicitudes por atender' : 'expedientes resueltos'}</span></div>
          {loadingList ? <div className="admin-loading">Cargando solicitudes...</div> : rows.map((row) => (
            <button
              className="admin-queue-item"
              type="button"
              aria-current={row.professional_id === selectedId ? 'true' : undefined}
              key={row.professional_id}
              onClick={() => setSelectedId(row.professional_id)}
            >
              <div className="admin-queue-title"><strong>{row.full_name || 'Sin nombre'}</strong><ChevronRight size={17} aria-hidden="true" /></div>
              <span>{row.primary_service_name || 'Sin rubro'} · {row.city || 'Sin localidad'}</span>
              <div className="admin-queue-facts">
                <small className={`admin-status ${row.queue_state}`}>{statusLabel(row.queue_state)}</small>
                <small>{row.documents_present}/{row.documents_required} documentos</small>
                <small>{ageLabel(row.submitted_at)}</small>
              </div>
            </button>
          ))}
          {!loadingList && !rows.length && (
            <div className="admin-empty"><BadgeCheck size={28} aria-hidden="true" /><strong>No hay solicitudes en esta vista</strong><p>Probá otro filtro o revisá la bandeja de resueltas.</p></div>
          )}
          {total > PAGE_SIZE && (
            <div className="admin-pagination">
              <button type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={17} /> Anterior</button>
              <span>{page + 1} de {pageCount}</span>
              <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}>Siguiente <ChevronRight size={17} /></button>
            </div>
          )}
        </aside>

        <main className="admin-detail">
          {selectedId && <button className="admin-mobile-back" type="button" onClick={() => setSelectedId(null)}><ArrowLeft size={18} /> Volver a solicitudes</button>}
          {loadingDetail ? <div className="admin-loading">Abriendo expediente...</div> : detail ? (
            <>
              <div className="admin-detail-nav">
                <button type="button" disabled={selectedIndex <= 0} onClick={() => setSelectedId(rows[selectedIndex - 1]?.professional_id || null)}><ChevronLeft size={17} /> Anterior</button>
                <span>Solicitud {selectedIndex + 1} de {rows.length}</span>
                <button type="button" disabled={selectedIndex < 0 || selectedIndex >= rows.length - 1} onClick={() => setSelectedId(rows[selectedIndex + 1]?.professional_id || null)}>Siguiente <ChevronRight size={17} /></button>
              </div>

              <section className="admin-detail-section admin-applicant-head">
                <div>
                  <span className="admin-eyebrow">EXPEDIENTE PROFESIONAL</span>
                  <h2>{detail.full_name || 'Profesional sin nombre'}</h2>
                  <p>{detail.email || 'Sin email'} · {detail.phone || 'Sin teléfono'}</p>
                </div>
                <span className={`admin-status ${rows[selectedIndex]?.queue_state || detail.onboarding_status}`}>{statusLabel(rows[selectedIndex]?.queue_state || detail.onboarding_status)}</span>
              </section>

              <section className="admin-detail-section">
                <h3>Estado de la verificación</h3>
                <div className="admin-verification-states">
                  <article><ShieldAlert size={20} /><div><strong>Identidad</strong><span>{statusLabel(rows[selectedIndex]?.identity_status || 'requires_review')}</span></div></article>
                  <article><BadgeCheck size={20} /><div><strong>Verificación profesional</strong><span>{statusLabel(rows[selectedIndex]?.professional_verification_status || 'requires_review')}</span></div></article>
                  <article><Check size={20} /><div><strong>Estado operativo</strong><span>{detail.verified ? 'Profesional activo' : 'Todavía no habilitado'}</span></div></article>
                </div>
              </section>

              <section className="admin-detail-section">
                <h3>Perfil y actividad</h3>
                <dl className="admin-fact-grid">
                  <div><dt>Localidad</dt><dd>{detail.work_city || detail.city || 'Sin definir'}</dd></div>
                  <div><dt>Experiencia</dt><dd>{detail.years_experience ?? 0} años</dd></div>
                  <div><dt>Radio</dt><dd>{detail.service_radius_km ?? 0} km</dd></div>
                  <div><dt>Enviada</dt><dd>{dateLabel(detail.submitted_at)}</dd></div>
                </dl>
                {detail.bio && <p className="admin-profile-copy">{detail.bio}</p>}
                <div className="admin-service-list">
                  {detail.services.map((service) => <div key={service.service_id}><strong>{service.service_name}</strong><span>{service.specialties.map((item) => item.specialty_name).join(', ') || 'Sin especialidades'}</span></div>)}
                  {!detail.services.length && <p className="v6-muted">No declaró servicios.</p>}
                </div>
              </section>

              <section className="admin-detail-section">
                <div className="admin-section-heading"><div><h3>Documentación</h3><p>{detail.documents.filter((item) => item.file_path).length}/{detail.requirements?.length || detail.documents.length} presentes</p></div></div>
                <div className="admin-document-list">
                  {mergedDocuments.map(({ requirement, document }) => (
                    <article className="admin-document-row" key={requirement.kind}>
                      <div className="admin-document-main">
                        <FileText size={20} aria-hidden="true" />
                        <div><strong>{requirement.label}</strong><span>{document ? documentStatusLabel(document.status) : 'Faltante'} · {requirement.category === 'identity' ? 'Identidad' : 'Profesional'}</span></div>
                        <small className={`admin-status ${document?.status || 'incomplete'}`}>{document ? documentStatusLabel(document.status) : 'Faltante'}</small>
                      </div>
                      {document ? <>
                        <div className="admin-objective-checks">
                          <span className={document.file_path ? 'ok' : 'missing'}>{document.file_path ? 'Archivo presente' : 'Sin archivo'}</span>
                          <span className={document.file_accessible ? 'ok' : 'missing'}>{document.file_accessible ? 'Archivo accesible' : 'Archivo no disponible'}</span>
                          <span className={document.format_allowed ? 'ok' : 'missing'}>{document.format_allowed ? 'Formato permitido' : 'Formato no permitido'}</span>
                        </div>
                        <button className="v6-secondary admin-view-document" type="button" disabled={!document.file_path || !document.file_accessible || previewLoading} onClick={() => void openDocument(document)}><Eye size={17} /> Ver documento</button>
                        {scope === 'active' ? <>
                          <label className="v6-field"><span>Observación del documento</span><textarea value={documentNotes[document.id] || ''} onChange={(event) => setDocumentNotes((current) => ({ ...current, [document.id]: event.target.value }))} placeholder="Motivo o indicación para el profesional" /></label>
                          <div className="admin-document-actions">
                            <button className="v6-secondary" type="button" disabled={busyKey !== null} onClick={() => void decideDocument(document, 'approved')}>Aprobar</button>
                            <button className="v6-secondary" type="button" disabled={busyKey !== null} onClick={() => void decideDocument(document, 'observed')}>Solicitar corrección</button>
                            <button className="v6-danger" type="button" disabled={busyKey !== null} onClick={() => void decideDocument(document, 'rejected')}>Rechazar</button>
                          </div>
                        </> : documentNotes[document.id] ? <p className="admin-missing-copy">Observación: {documentNotes[document.id]}</p> : null}
                      </> : <p className="admin-missing-copy">Este requisito todavía no tiene un archivo cargado.</p>}
                    </article>
                  ))}
                </div>
              </section>

              <section className="admin-detail-section">
                <h3>Decisión del alta</h3>
                <label className="v6-field"><span>Observación de la solicitud</span><textarea value={applicationNote} onChange={(event) => setApplicationNote(event.target.value)} placeholder="Resumen de la revisión o correcciones solicitadas" /></label>
                {scope === 'active' ? <div className="admin-final-actions">
                  <button className="v6-primary" type="button" disabled={busyKey !== null} onClick={() => void decideApplication('approved')}>Aprobar alta</button>
                  <button className="v6-secondary" type="button" disabled={busyKey !== null} onClick={() => void decideApplication('observed')}>Solicitar correcciones</button>
                  <button className="v6-danger" type="button" disabled={busyKey !== null} onClick={() => void decideApplication('rejected')}>Rechazar alta</button>
                </div> : <p className="admin-resolved-note">Este expediente está resuelto y se conserva como historial.</p>}
              </section>

              {!!detail.history?.length && <section className="admin-detail-section"><h3>Historial de decisiones</h3><div className="admin-history">{detail.history.map((event) => <article key={event.id}><Clock3 size={16} /><div><strong>{event.event_type === 'document_status' ? 'Documento' : 'Solicitud'} · {statusLabel(event.to_status)}</strong><span>{dateLabel(event.created_at)}{event.note ? ` · ${event.note}` : ''}</span></div></article>)}</div></section>}
            </>
          ) : <div className="admin-empty admin-detail-empty"><FileText size={30} /><strong>Elegí una solicitud</strong><p>El expediente completo se carga acá, sin perder tu lugar en la cola.</p></div>}
        </main>
      </div>

      {preview && (
        <div className="admin-document-modal" role="dialog" aria-modal="true" aria-label={`Documento ${preview.document.label}`}>
          <div className="admin-document-modal-head"><div><strong>{preview.document.label}</strong><span>Acceso privado temporal</span></div><button type="button" aria-label="Cerrar documento" onClick={() => setPreview(null)}><X size={22} /></button></div>
          <div className="admin-document-preview">
            {isPdf(preview.document.file_path || '') ? <iframe src={preview.url} title={preview.document.label} /> : <img src={preview.url} alt={preview.document.label} style={{ transform: `scale(${preview.zoom})` }} />}
          </div>
          {!isPdf(preview.document.file_path || '') && <div className="admin-document-zoom"><button type="button" onClick={() => setPreview((current) => current ? { ...current, zoom: Math.max(0.75, current.zoom - 0.25) } : current)}><ZoomOut size={18} /> Alejar</button><span>{Math.round(preview.zoom * 100)}%</span><button type="button" onClick={() => setPreview((current) => current ? { ...current, zoom: Math.min(2.5, current.zoom + 0.25) } : current)}>Acercar <ZoomIn size={18} /></button></div>}
        </div>
      )}
    </section>
  );
}
