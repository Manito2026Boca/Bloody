'use client';

import { useState } from 'react';
import ManitoV6App from './components/ManitoV6App';
import { PwaUpdateProvider } from './components/PwaUpdateProvider';
import { CURRENT_PWA_BUILD } from './lib/pwaBuildIdentity';
import { createPwaUpdatePort } from './lib/pwaUpdateRuntime';

export default function Home() {
  const [updatePort] = useState(() => createPwaUpdatePort(CURRENT_PWA_BUILD));
  return <PwaUpdateProvider port={updatePort}><ManitoV6App /></PwaUpdateProvider>;
}
