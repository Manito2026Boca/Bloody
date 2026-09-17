export type PwaInstallPlatform = 'android' | 'ios' | 'desktop';

export const PWA_INSTALL_DISMISS_KEY = 'manito_pwa_install_dismissed_until';
export const PWA_INSTALL_DISMISS_DAYS = 7;

export function detectPwaInstallPlatform(userAgent: string, maxTouchPoints = 0): PwaInstallPlatform {
  const normalized = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(normalized) || (normalized.includes('macintosh') && maxTouchPoints > 1)) {
    return 'ios';
  }
  if (normalized.includes('android')) return 'android';
  return 'desktop';
}

export function pwaInstallDismissed(until: string | null, now = Date.now()) {
  const timestamp = Number(until);
  return Number.isFinite(timestamp) && timestamp > now;
}

export function pwaInstallDismissUntil(now = Date.now()) {
  return String(now + PWA_INSTALL_DISMISS_DAYS * 24 * 60 * 60 * 1000);
}
