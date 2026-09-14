import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync('app/components/ManitoV6App.tsx', 'utf8');
const confirmation = readFileSync('app/components/AuthConfirmationScreen.tsx', 'utf8');
const setup = readFileSync('app/components/SetupNotice.tsx', 'utf8');
const layout = readFileSync('app/layout.tsx', 'utf8');
const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
  icons: Array<{ src: string; sizes: string; purpose: string }>;
};
const worker = readFileSync('public/sw.js', 'utf8');

const oldAssets = [
  '/logo-main.jpg',
  '/logo-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.png',
  '/brand/manito-logo.svg',
  '/brand/manito-mark-light.svg',
  '/brand/manito-favicon.svg',
  '/brand/manito-social.png',
];
const activeBranding = [app, confirmation, setup, layout, JSON.stringify(manifest), worker].join('\n');

function pngSize(path: string) {
  const png = readFileSync(path);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe('BRAND-002 asset contracts', () => {
  it('ships the complete production brand family', () => {
    for (const path of [
      'public/brand/source/manito-brand-reference.jpg',
      'public/brand/manito-reference-horizontal.png',
      'public/brand/manito-reference-mark.png',
      'public/brand/manito-reference-stacked.png',
      'public/brand/manito-reference-app-icon.png',
      'public/brand/manito-favicon-64.png',
      'public/brand/manito-icon-192.png',
      'public/brand/manito-icon-512.png',
      'public/brand/manito-maskable-512.png',
      'public/brand/apple-touch-icon.png',
    ]) expect(existsSync(path), path).toBe(true);
    for (const path of [
      'public/brand/archive/brand-002-reconstructed/manito-logo.svg',
      'public/brand/archive/brand-002-reconstructed/manito-mark.svg',
      'public/brand/archive/brand-002-reconstructed/manito-app-icon.svg',
    ]) expect(existsSync(path), path).toBe(true);
  });

  it('uses exact crops from the approved reference for auth and the app header', () => {
    expect(app).toContain('src="/brand/manito-reference-app-icon.png"');
    expect(app).toContain('src="/brand/manito-reference-horizontal.png"');
    expect(confirmation).toContain('src="/brand/manito-reference-horizontal.png"');
    expect(setup).toContain('src="/brand/manito-reference-horizontal.png"');
  });

  it('does not expose legacy logo paths from active product surfaces', () => {
    for (const path of oldAssets) expect(activeBranding).not.toContain(path);
  });

  it('publishes dedicated PWA, maskable and favicon assets', () => {
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: '/brand/manito-icon-192.png', sizes: '192x192', purpose: 'any' }),
      expect.objectContaining({ src: '/brand/manito-icon-512.png', sizes: '512x512', purpose: 'any' }),
      expect.objectContaining({ src: '/brand/manito-maskable-512.png', sizes: '512x512', purpose: 'maskable' }),
    ]));
    expect(layout).toContain('/brand/manito-favicon-64.png');
    expect(layout).toContain('/brand/apple-touch-icon.png');
    expect(pngSize('public/brand/manito-favicon-64.png')).toEqual({ width: 64, height: 64 });
    expect(pngSize('public/brand/apple-touch-icon.png')).toEqual({ width: 180, height: 180 });
    expect(pngSize('public/brand/manito-icon-192.png')).toEqual({ width: 192, height: 192 });
    expect(pngSize('public/brand/manito-icon-512.png')).toEqual({ width: 512, height: 512 });
    expect(pngSize('public/brand/manito-maskable-512.png')).toEqual({ width: 512, height: 512 });
  });

  it('invalidates the old PWA shell and precaches only new brand assets', () => {
    expect(worker).toContain("const CACHE_NAME = 'manito-shell-brand-reference-v1'");
    expect(worker).toContain('/brand/manito-reference-horizontal.png');
    expect(worker).toContain('/brand/manito-reference-app-icon.png');
    for (const path of oldAssets) expect(worker).not.toContain(path);
  });
});
