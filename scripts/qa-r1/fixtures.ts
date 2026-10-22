import type { V6Order, V6Profile, V6PublicProfessional, V6Service } from '../../app/lib/v6Types';

export const service: V6Service = { id: 901, slug: 'plomeria', name: 'Plomeria sintetica R1', emoji: '', base_price: 18000, active: true, allow_immediate: true, allow_scheduled: true, allow_quote: true };
const stamp = '2026-10-22T12:00:00Z';
export const client: V6Profile = { id: 'r1-client-synthetic', email: null, full_name: 'Cliente sintetico R1', role: 'client', phone: null, city: 'Mar del Plata', is_available: false, lat: -38, lng: -57.55, created_at: stamp, updated_at: stamp };
export const pro: V6Profile = { ...client, id: 'r1-pro-synthetic', full_name: 'Profesional sintetico R1', role: 'professional', is_available: true };
export const professional: V6PublicProfessional = {
  profile: pro,
  professional_profile: { professional_id: pro.id, headline: 'Plomeria sintetica', bio: '', years_experience: 5, public_slug: null, verified: true, manito_pro: false, rating_avg: 5, jobs_completed: 10, response_minutes: 20, insurance_label: null, work_city: 'Mar del Plata', service_radius_km: 30, updated_at: stamp },
  services: [{ professional_id: pro.id, service_id: service.id, price_from: 18000 }], specialties: [],
};
export function order(overrides: Partial<V6Order> = {}): V6Order {
  return { id: 'r1-order-synthetic', client_id: client.id, professional_id: pro.id, service_id: service.id, description: 'Reparacion sintetica de una perdida en la cocina', address: 'Direccion sintetica 123, Mar del Plata', mode: 'immediate', status: 'accepted', price: 18000, estimated_price: 18000, agreed_price: 18000, payment_method: 'cash', payment_status: 'unpaid', scheduled_at: null, client_lat: -38, client_lng: -57.55, created_at: stamp, updated_at: stamp, accepted_at: stamp, completed_at: null, service, client, professional: pro, ...overrides };
}

const params = new URLSearchParams(location.search);
// Optional race controls seeded by the test before load, so the URL can stay exactly as a real deep link.
type RaceInit = { actor?: string; scenario?: string; orders?: Record<string, Array<Partial<V6Order>>>; holds?: Array<{ name: string; actorId?: string; skip?: number }> };
function readRaceInit(): RaceInit {
  try { return JSON.parse(sessionStorage.getItem('qa-r1:race') || '{}') as RaceInit; } catch { return {}; }
}
const race = readRaceInit();
const scenario = params.get('scenario') || race.scenario || 'wizard';
function syntheticActor(name: string | null): V6Profile {
  if (name === 'professional') return pro;
  if (name === 'professional-b') return { ...pro, id: 'r1-pro-b-synthetic', full_name: 'Profesional B sintetico R1' };
  return client;
}
const actor = syntheticActor(params.get('actor') ?? race.actor ?? null);
const ordersByActor = new Map<string, V6Order[]>(Object.entries(race.orders || {}).map(([actorId, rows]) => [actorId, rows.map(row => order(row))]));
// Each entry holds exactly one future invocation (after `skip` matches) and snapshots its response at call time.
const queuedHolds = (race.holds || []).map(hold => ({ name: hold.name, actorId: hold.actorId, skip: hold.skip ?? 0 }));
const response = params.get('response') || 'expired';
const future = new Date(Date.now() + 3600000).toISOString();
const manual = order({ professional_id: null, professional: null, agreed_price: null, status: 'open', assignment_mode: 'manual', manual_requested_professional_id: pro.id, preferred_professional_id: pro.id, manual_response_status: response as V6Order['manual_response_status'], manual_response_deadline_at: future, eta_minutes: 20 });
const reservation = order({ professional_id: null, professional: null, reserved_professional: pro, status: 'pending_client_confirmation', agreed_price: null, price_confirmation_status: 'pending', price_confirmation_professional_id: pro.id, price_confirmation_deadline_at: future, price_confirmation_estimated_amount: 18000, price_confirmation_proposed_amount: 20000, price_confirmation_scope: 'Reparacion sintetica' });
export const state = {
  scenario, actor, calls: [] as Array<{ name: string; args: unknown[] }>, unexpected: [] as string[],
  orders: ['wizard', 'recommendations', 'experience'].includes(scenario) ? [] : [scenario === 'manual' ? manual : scenario === 'reservation' ? reservation : scenario === 'edit' ? order({ professional_id: null, professional: null, agreed_price: null, status: 'waiting_quotes', mode: 'quote' }) : order({ status: scenario === 'completed' ? 'completed' : 'accepted', payment_status: params.get('paid') === 'yes' ? 'paid' : 'unpaid', completed_at: scenario === 'completed' ? stamp : null })],
  eligible: params.get('eligibility') === 'empty' ? [] : [pro.id], eligibility: params.get('eligibility') || 'ready',
  ratings: params.get('rated') === 'yes' ? [{ id: 'r1-rating', order_id: 'r1-order-synthetic', client_id: client.id, professional_id: pro.id, stars: 5, comment: 'Sintetico', created_at: stamp }] : [],
  pending: new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; args?: unknown[] }>(),
  hold: new Set<string>(), failures: new Set<string>(),
  held: [] as Array<{ name: string; actorId: string; released: boolean; release: (fail?: boolean) => void }>,
};
const visibleOrders = () => ordersByActor.get(state.actor.id) ?? state.orders;
if (params.get('long') === 'yes') state.orders = state.orders.map(row => ({ ...row, price: 123456789.12, estimated_price: 123456789.12, agreed_price: row.agreed_price == null ? null : 123456789.12, price_confirmation_proposed_amount: 123456789.12, address: 'Avenida Constitucion 12345, departamento 12 B, Mar del Plata', description: 'Reparacion sintetica: perdida de agua bajo la pileta, cambio de flexible y revision completa de las conexiones existentes.' }));
if (params.has('status')) state.orders = state.orders.map(row => ({ ...row, status: params.get('status') as V6Order['status'], eta_minutes: Number(params.get('eta') ?? 20) }));
if (params.has('orderPayment')) state.orders = state.orders.map(row => ({ ...row, payment_status: params.get('orderPayment') as V6Order['payment_status'] }));
if (params.get('deadline') === 'expired') state.orders = state.orders.map(row => ({ ...row, manual_response_deadline_at: new Date(Date.now() - 60000).toISOString(), price_confirmation_deadline_at: new Date(Date.now() - 60000).toISOString() }));
if (params.get('reservationOwner') === 'foreign') state.orders = state.orders.map(row => ({ ...row, price_confirmation_professional_id: 'r1-foreign-synthetic' }));
if (params.get('paymentLoad') === 'error') state.failures.add('listV6PaymentsForOrder');
if (params.get('ratingLoad') === 'error') state.failures.add('listV6OrderRatings');
if (params.get('paymentLoad') === 'pending') state.hold.add('listV6PaymentsForOrder');
if (params.get('ratingLoad') === 'pending') state.hold.add('listV6OrderRatings');
if (params.get('catalog') === 'error') state.failures.add('listV6Services');
const paymentState = params.get('payment') || (params.get('paid') === 'yes' ? 'confirmed' : null);
const payments = paymentState ? [{ id: 'r1-payment', order_id: 'r1-order-synthetic', client_id: client.id, professional_id: pro.id, source_type: 'original', provider: 'cash', amount: 18000, manito_fee: 0, professional_amount: 18000, currency: 'ARS', status: paymentState, payment_method: 'cash', created_at: stamp, updated_at: stamp }] : [];
if (params.get('paymentHistory') === 'approved-refunded') payments.push({ ...payments[0], id: 'r1-historical-approved', status: 'approved', created_at: '2026-10-21T12:00:00Z' });
const excludedProfessional = { ...professional, profile: { ...pro, id: 'r1-excluded-synthetic', full_name: 'Profesional excluido sintetico' }, professional_profile: { ...professional.professional_profile!, professional_id: 'r1-excluded-synthetic', jobs_completed: 12 } };
const publicProfessionals = params.get('candidates') === 'filtered' ? [excludedProfessional, professional] : [professional];
function record(name: string, args: unknown[]) { state.calls.push({ name, args }); }
function unexpected(name: string): never { state.unexpected.push(name); throw new Error(`Unconfigured isolated API: ${name}`); }
const channel = { on() { return this; }, subscribe() { return this; }, unsubscribe() {} };
type SyntheticSession = { user: { id: string; email: string; user_metadata: Record<string, never> } };
const authListeners = new Set<(event: string, session: SyntheticSession | null) => void>();
let signedIn = true;
function syntheticSession(): SyntheticSession | null {
  return signedIn ? { user: { id: state.actor.id, email: `${state.actor.id}@example.invalid`, user_metadata: {} } } : null;
}
function emitSyntheticAuth(event: string) { for (const listener of authListeners) listener(event, syntheticSession()); }
const supabase = {
  auth: {
    async getSession() { return { data: { session: syntheticSession() } }; },
    onAuthStateChange(listener: (event: string, session: SyntheticSession | null) => void) { authListeners.add(listener); return { data: { subscription: { unsubscribe() { authListeners.delete(listener); } } } }; },
    async signOut() { record('auth:signOut', []); signedIn = false; emitSyntheticAuth('SIGNED_OUT'); return { error: null }; },
  },
  channel() { return channel; }, removeAllChannels() {},
  rpc(name: string, args: unknown) {
    record(`rpc:${name}`, [args]);
    if (name !== 'list_eligible_request_professionals') return unexpected(`rpc:${name}`);
    if (state.eligibility === 'pending') return new Promise(resolve => state.pending.set('eligibility', { resolve, reject() {} }));
    return Promise.resolve(state.eligibility === 'error' ? { data: null, error: { message: 'Synthetic eligibility failure' } } : { data: state.eligible, error: null });
  },
  from(table: string) {
    if (table !== 'service_locations') return unexpected(`from:${table}`);
    const result = { select() { return this; }, eq() { return this; }, order() { return Promise.resolve({ data: [{ id: 'ar-ba-mar-del-plata', name: 'Mar del Plata', region: 'Buenos Aires', country_code: 'AR' }], error: null }); } };
    return result;
  },
};
export function invoke(name: string, args: unknown[], recordCall = true): unknown {
  if (recordCall) record(name, args);
  if (name === 'getV6Supabase') return supabase;
  if (name === 'isV6SupabaseConfigured') return true;
  if (name === 'webPushState') return 'unsupported';
  if (name === 'disableWebPushForCurrentDevice') return Promise.resolve();
  if (name.startsWith('subscribeV6')) return channel;
  if (name === 'removeV6Channel') return undefined;
  const queued = recordCall ? queuedHolds.findIndex(entry => entry.name === name && (!entry.actorId || entry.actorId === state.actor.id)) : -1;
  if (queued >= 0) {
    if (queuedHolds[queued].skip > 0) queuedHolds[queued].skip--;
    else {
      queuedHolds.splice(queued, 1);
      const snapshot = invoke(name, args, false);
      return new Promise((resolve, reject) => {
        const gate = { name, actorId: state.actor.id, released: false, release(fail = false) { gate.released = true; if (fail) reject(new Error(`Synthetic failure: ${name}`)); else resolve(snapshot); } };
        state.held.push(gate);
      });
    }
  }
  if (state.hold.has(name)) return new Promise((resolve, reject) => state.pending.set(name, { resolve, reject, args }));
  if (state.failures.has(name)) return Promise.reject(new Error(`Synthetic failure: ${name}`));
  const values: Record<string, unknown> = {
    getOrRecoverV6Profile: state.actor, getV6Profile: state.actor, getV6MyCapabilities: { admin: false },
    listV6Services: params.get('catalog') === 'empty' ? [] : [service], listV6Specialties: [], listV6Orders: visibleOrders(),
    getV6NotificationDestination: { notification_id: params.get('notification'), order_id: visibleOrders()[0]?.id, action_key: 'open_order', entity_type: 'order', entity_id: visibleOrders()[0]?.id },
    listV6Notifications: { items: [], unreadCount: 0 }, listV6ProfessionalServices: professional.services,
    listV6ProfessionalSpecialties: [], listV6PublicProfessionals: publicProfessionals,
    listV6ClientAddresses: [{ id: 'r1-address', client_id: client.id, label: 'Casa sintetica', line: 'Direccion sintetica 123', city: 'Mar del Plata', lat: -38, lng: -57.55, is_default: true }],
    listV6PaymentProfiles: [{ id: 'r1-cash', profile_id: client.id, type: 'cash', is_default: true }],
    listV6Workrooms: [], listV6OrderProposals: [], listV6OrderExtras: [], listV6PaymentsForOrder: payments, listV6OrderPhotos: [], listV6OrderRatings: state.ratings,
    getV6ProfessionalProfile: professional.professional_profile, getV6ProfessionalOnboarding: { professional_id: pro.id, status: 'approved', current_step: 5 },
    getMyProviderIdentity: { status: 'VERIFIED', operational_status: 'ENABLED', masked_cuit: null, can_submit: false },
    getMyProviderActivityRequirements: [], getV6UserSecurityPreferences: null, getV6ProfessionalPaymentAccount: null,
    listV6OrderComplaints: [], listV6Complaints: [], getV6OrderProtection: null,
  };
  if (Object.hasOwn(values, name)) return Promise.resolve(structuredClone(values[name]));
  if (name === 'createV6Order' || name === 'editV6UncontractedOrder') {
    const input = args[0] as Record<string, unknown>;
    const created = order({ professional_id: null, professional: null, agreed_price: null, status: 'open', description: String(input.description), address: String(input.address) });
    state.orders = [created]; return Promise.resolve(created);
  }
  if (name === 'acceptV6Order') { state.orders = [reservation]; return Promise.resolve(reservation); }
  if (name === 'advanceV6Order') { state.orders = state.orders.map(row => ({ ...row, status: 'en_camino' })); return Promise.resolve(state.orders[0]); }
  if (name === 'refreshV6OrderPriceConfirmation') return Promise.resolve(state.orders[0]);
  return unexpected(name);
}

Object.assign(window, { __qa: {
  state,
  calls: () => state.calls,
  signOut: () => supabase.auth.signOut(),
  signIn(name: 'client' | 'professional' | 'professional-b') {
    state.actor = syntheticActor(name); signedIn = true;
    const url = new URL(location.href); url.searchParams.set('actor', name); history.replaceState({}, '', url);
    record('auth:syntheticSignIn', [state.actor.id]); emitSyntheticAuth('SIGNED_IN');
  },
  held: () => state.held.map(({ name, actorId, released }) => ({ name, actorId, released })),
  releaseHeld(index: number, fail = false) { const gate = state.held[index]; if (!gate || gate.released) throw new Error(`No held call #${index}`); gate.release(fail); },
  hold(name: string) { state.hold.add(name); },
  release(name: string, fail = false) { const pending = state.pending.get(name); if (!pending) throw new Error(`No pending ${name}`); state.hold.delete(name); state.pending.delete(name); if (fail) pending.reject(new Error(`Synthetic failure: ${name}`)); else pending.resolve(invoke(name, pending.args || [], false)); },
  eligibility(ids: string[]) { state.eligible = ids; state.eligibility = 'ready'; state.pending.get('eligibility')?.resolve({ data: ids, error: null }); state.pending.delete('eligibility'); },
} });
