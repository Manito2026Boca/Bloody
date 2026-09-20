import { getV6Supabase } from './v6Supabase';

export type WebPushState = 'unsupported' | 'default' | 'denied' | 'enabled';

function decodeApplicationServerKey(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export function webPushState(): WebPushState {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' ? 'enabled' : 'default';
}

async function registerSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('La suscripción del navegador está incompleta.');
  const { error } = await getV6Supabase().rpc('register_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
}

export async function syncExistingWebPush() {
  if (webPushState() !== 'enabled') return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;
  await registerSubscription(subscription);
  return true;
}

export async function enableWebPush() {
  if (webPushState() === 'unsupported') throw new Error('Este navegador no admite avisos push.');
  if (Notification.permission === 'denied') throw new Error('Las notificaciones están bloqueadas en la configuración del navegador.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied' as const;

  const { data: publicKey, error } = await getV6Supabase().rpc('get_web_push_public_key');
  if (error || !publicKey) throw error || new Error('Los avisos todavía no están configurados.');
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeApplicationServerKey(String(publicKey)),
  });
  await registerSubscription(subscription);
  return 'enabled' as const;
}

export async function disableWebPushForCurrentDevice() {
  if (webPushState() === 'unsupported') return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  try {
    await getV6Supabase().rpc('unregister_push_subscription', { p_endpoint: subscription.endpoint });
  } catch {
    // Browser unsubscribe still prevents this device from receiving the old account's push.
  }
  await subscription.unsubscribe().catch(() => false);
}
