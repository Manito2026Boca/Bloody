import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { authoritativeRequestCoordinates } from '../app/lib/requestLocation';

const app = readFileSync('app/components/ManitoV6App.tsx', 'utf8');
const css = readFileSync('app/globals.css', 'utf8');

describe('UX-001R hotfix 01', () => {
  it('never sends old GPS coordinates after manual input becomes authoritative', () => {
    const gpsA = { lat: -38.0055, lng: -57.5426 };
    expect(authoritativeRequestCoordinates('manual', gpsA)).toBeNull();
    expect(authoritativeRequestCoordinates('manual_geocoded', { lat: -37.9, lng: -57.6 })).toEqual({ lat: -37.9, lng: -57.6 });
  });

  it('keeps confirmed GPS coordinates authoritative when accepted', () => {
    const gpsA = { lat: -38.0055, lng: -57.5426 };
    expect(authoritativeRequestCoordinates('gps', gpsA)).toEqual(gpsA);
  });

  it('uses manual locality fallback without stale coordinates when geocoding fails', () => {
    expect(authoritativeRequestCoordinates('manual', null)).toBeNull();
    expect(app).toContain('if (!confirmedCoordinates && !locationId)');
    expect(app).toContain("setLocationAuthority('manual')");
  });

  it('replaces GPS display and payload state when the user confirms manual location B', () => {
    expect(app).toContain('await confirmManualLocation()');
    expect(app).toContain("setLocationAuthority('manual_geocoded')");
    expect(app).toContain('lat: authoritativeCoords?.lat ?? null');
    expect(app).toContain('lng: authoritativeCoords?.lng ?? null');
  });

  it('uses a dynamic viewport with one scrollable stage above both action bars', () => {
    expect(css).toContain('.v6-app.v6-request-active');
    expect(css).toContain('height: 100dvh');
    expect(css).toContain('grid-template-rows: minmax(0, 1fr) auto');
    expect(css).toContain('.v6-request-active .v6-request-stage');
    expect(css).toContain('overflow-y: auto');
    expect(css).toContain('.v6-request-active .v6-request-actions');
    expect(css).toContain('position: static');
  });
});
