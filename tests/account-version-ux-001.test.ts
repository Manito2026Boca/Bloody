import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PwaUpdateProvider, PwaVersionDetails } from '../app/components/PwaUpdateProvider';
import { formatPwaDiagnostic, pwaUpdateStatus } from '../app/lib/pwaDiagnostics';
import type { PwaUpdatePort, PwaUpdateSnapshot } from '../app/lib/pwaUpdateContract';

const build = {
  schemaVersion: 1 as const,
  protocolVersion: 1 as const,
  appVersion: '0.1.0',
  buildId: '2a34edbf-c70a-4c68-87f0-4ddda9451900',
  commit: 'd9361ad257bbe47f122e56d5d5911e98cc15e5ac',
  builtAt: '2026-09-27T19:02:50.140Z',
};

function snapshot(overrides: Partial<PwaUpdateSnapshot> = {}): PwaUpdateSnapshot {
  return {
    phase: 'idle',
    runningBuild: build,
    publishedBuild: build,
    activeWorkerBuildId: build.buildId,
    waitingWorkerBuildId: null,
    lastCheckedAt: '2026-09-27T19:12:50.140Z',
    error: null,
    ...overrides,
  };
}

describe('Account version diagnostics', () => {
  it('renders only a compact version entry until technical details are opened', () => {
    const port: PwaUpdatePort = {
      start: async () => undefined,
      stop: () => undefined,
      snapshot: () => snapshot(),
      subscribe: () => () => undefined,
      check: async () => undefined,
      activate: async () => 'deferred',
    };
    const html = renderToStaticMarkup(createElement(PwaUpdateProvider, { port, children: createElement(PwaVersionDetails) }));
    expect(html).toContain('MANITO · v0.1.0');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('pwa-version-panel');
    expect(html).not.toContain(build.buildId);
  });

  it('labels current, pending, and unknown update states from the existing snapshot', () => {
    expect(pwaUpdateStatus(snapshot())).toBe('Al día');
    expect(pwaUpdateStatus(snapshot({ phase: 'waiting' }))).toBe('Pendiente');
    expect(pwaUpdateStatus(snapshot({ phase: 'ready-to-reload' }))).toBe('Lista para abrir');
    expect(pwaUpdateStatus(snapshot({ publishedBuild: null }))).toBe('Sin verificar');
  });

  it('copies only approved technical fields, never account or session data', () => {
    const diagnostic = JSON.parse(formatPwaDiagnostic({
      ...snapshot({ phase: 'waiting' }),
      email: 'private@example.com',
      access_token: 'sensitive-token',
      address: 'private address',
    } as PwaUpdateSnapshot));
    expect(diagnostic).toEqual({
      appVersion: build.appVersion,
      buildId: build.buildId,
      commit: build.commit,
      builtAt: build.builtAt,
      activeWorkerBuildId: build.buildId,
      waitingWorkerBuildId: null,
      publishedBuildId: build.buildId,
      updatePhase: 'waiting',
      updatePending: true,
      updateStatus: 'Pendiente',
      lastCheckedAt: '2026-09-27T19:12:50.140Z',
      blockerCount: 0,
      blockers: [],
    });
    expect(JSON.stringify(diagnostic)).not.toMatch(/private|sensitive/);
  });
});
