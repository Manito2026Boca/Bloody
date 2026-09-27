import type {
  PwaActivationResult,
  PwaCheckReason,
  PwaUpdateHandlers,
  PwaUpdatePort,
  PwaUpdateSnapshot,
} from '../../app/lib/pwaUpdateContract';

export function createPwaUpdatePortFixture(initial: PwaUpdateSnapshot) {
  let current = initial;
  let handlers: PwaUpdateHandlers | null = null;
  const listeners = new Set<(snapshot: PwaUpdateSnapshot) => void>();
  const checks: PwaCheckReason[] = [];
  const activations: string[] = [];

  const port: PwaUpdatePort = {
    async start(nextHandlers) { handlers = nextHandlers; },
    stop() { handlers = null; listeners.clear(); },
    snapshot() { return current; },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async check(reason) { checks.push(reason); },
    async activate(targetBuildId): Promise<PwaActivationResult> {
      activations.push(targetBuildId);
      return 'deferred';
    },
  };

  return {
    port,
    checks,
    activations,
    handlers: () => handlers,
    publish(snapshot: PwaUpdateSnapshot) {
      current = snapshot;
      listeners.forEach((listener) => listener(snapshot));
    },
  };
}
