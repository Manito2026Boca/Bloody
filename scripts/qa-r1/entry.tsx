import React from 'react';
import { createRoot } from 'react-dom/client';
import ManitoV6App from '../../app/components/ManitoV6App';
import { PwaUpdateProvider } from '../../app/components/PwaUpdateProvider';
import { createPwaUpdatePortFixture } from '../../tests/fixtures/pwaUpdatePort';
import './fixtures';

const port = createPwaUpdatePortFixture({ phase: 'idle', runningBuild: { schemaVersion: 1, protocolVersion: 1, appVersion: 'r1-isolated', buildId: 'r1-isolated', commit: 'synthetic', builtAt: '2026-10-22T00:00:00Z' }, publishedBuild: null, activeWorkerBuildId: null, waitingWorkerBuildId: null, lastCheckedAt: null, error: null });
createRoot(document.getElementById('root')!).render(<PwaUpdateProvider port={port.port}><ManitoV6App /></PwaUpdateProvider>);
