export const PWA_UPDATE_PROTOCOL = 1 as const;
export const PWA_UPDATE_CHANNEL = 'manito:pwa:update' as const;

export type PwaBuildIdentity = {
  schemaVersion: 1;
  protocolVersion: typeof PWA_UPDATE_PROTOCOL;
  appVersion: string;
  buildId: string;
  commit: string;
  builtAt: string;
};

export type PwaUpdatePhase =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'waiting'
  | 'activating'
  | 'ready-to-reload'
  | 'deferred'
  | 'failed';

export type PwaCheckReason = 'startup' | 'foreground' | 'reconnect' | 'interval' | 'manual';
export type PwaReadinessLevel = 'unknown' | 'clean' | 'dirty' | 'saving' | 'critical';
export type PwaUpdateError =
  | 'unsupported'
  | 'offline'
  | 'version-unavailable'
  | 'download-failed'
  | 'protocol-mismatch'
  | 'activation-blocked'
  | 'startup-failed';

export type PwaUpdateSnapshot = {
  phase: PwaUpdatePhase;
  runningBuild: PwaBuildIdentity;
  publishedBuild: PwaBuildIdentity | null;
  activeWorkerBuildId: string | null;
  waitingWorkerBuildId: string | null;
  lastCheckedAt: string | null;
  error: PwaUpdateError | null;
};

export type PwaPrepareRequest = {
  attemptId: string;
  targetBuildId: string;
  expiresAt: number;
};

export type PwaPrepareResult = 'ready' | 'blocked';
export type PwaActivationResult = 'activated' | 'deferred' | 'failed';

export type PwaUpdateHandlers = {
  prepare: (request: PwaPrepareRequest) => PwaPrepareResult | Promise<PwaPrepareResult>;
  release: (attemptId: string) => void;
};

export interface PwaUpdatePort {
  start(handlers: PwaUpdateHandlers): Promise<void>;
  stop(): void;
  snapshot(): PwaUpdateSnapshot;
  subscribe(listener: (snapshot: PwaUpdateSnapshot) => void): () => void;
  check(reason: PwaCheckReason): Promise<void>;
  activate(targetBuildId: string): Promise<PwaActivationResult>;
}

type PwaWireBase = {
  channel: typeof PWA_UPDATE_CHANNEL;
  protocolVersion: typeof PWA_UPDATE_PROTOCOL;
};

export type PwaWireMessage = PwaWireBase & (
  | { type: 'STATUS_REQUEST'; requestId: string }
  | { type: 'STATUS_REPLY'; requestId: string; build: PwaBuildIdentity }
  | { type: 'ACTIVATE_REQUEST'; attemptId: string; targetBuildId: string }
  | { type: 'PREPARE'; request: PwaPrepareRequest }
  | { type: 'PREPARE_REPLY'; attemptId: string; targetBuildId: string; result: PwaPrepareResult }
  | { type: 'RELEASE'; attemptId: string }
  | { type: 'ACTIVATE_RESULT'; attemptId: string; result: PwaActivationResult }
);
