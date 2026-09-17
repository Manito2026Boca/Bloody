import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  detectPwaInstallPlatform,
  pwaInstallDismissed,
  pwaInstallDismissUntil,
  PWA_INSTALL_DISMISS_DAYS,
} from '../app/lib/pwaInstall';

const app = readFileSync('app/components/ManitoV6App.tsx', 'utf8');
const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));

describe('PWA-INSTALL-001', () => {
  it('detects Android, iOS, iPadOS and desktop without inventing native support', () => {
    expect(detectPwaInstallPlatform('Mozilla/5.0 (Linux; Android 15)')).toBe('android');
    expect(detectPwaInstallPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)')).toBe('ios');
    expect(detectPwaInstallPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 5)).toBe('ios');
    expect(detectPwaInstallPlatform('Mozilla/5.0 (Windows NT 10.0)')).toBe('desktop');
  });

  it('dismisses the compact offer for seven days', () => {
    const now = 1_000;
    const until = pwaInstallDismissUntil(now);
    expect(PWA_INSTALL_DISMISS_DAYS).toBe(7);
    expect(pwaInstallDismissed(until, now)).toBe(true);
    expect(pwaInstallDismissed(until, Number(until) + 1)).toBe(false);
  });

  it('uses the native Android prompt and an honest iOS guide', () => {
    expect(app).toContain("window.addEventListener('beforeinstallprompt'");
    expect(app).toContain('await installPrompt.prompt()');
    expect(app).toContain("choice.outcome === 'dismissed'");
    expect(app).toContain('Instalá MANITO en tu iPhone');
    expect(app).toContain('Añadir a pantalla de inicio');
    expect(app).toContain('display-mode: standalone');
  });

  it('keeps the current install branding references intact', () => {
    expect(manifest.name).toBe('MANITO');
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: '/brand/manito-icon-192.png' }),
      expect.objectContaining({ src: '/brand/manito-icon-512.png' }),
      expect.objectContaining({ src: '/brand/manito-maskable-512.png', purpose: 'maskable' }),
    ]));
  });
});
