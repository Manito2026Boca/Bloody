import {
  buildAppIntentUrl,
  parseDomainIntent,
  type DomainIntent,
  type IntentContext,
  type ParsedDomainIntent,
} from './domainMigrationContract';

const PENDING_INTENT_KEY = 'manito_pending_domain_intent_v1';

type IntentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function storeIncomingDomainIntent(
  url: string | URL,
  context: IntentContext,
  storage: IntentStorage,
): ParsedDomainIntent {
  const parsed = parseDomainIntent(url, context);
  if (parsed.ok) storage.setItem(PENDING_INTENT_KEY, JSON.stringify(parsed.intent));
  else if (parsed.reason !== 'not-intent') storage.removeItem(PENDING_INTENT_KEY);
  return parsed;
}

export function consumePendingDomainIntent(
  context: IntentContext,
  storage: IntentStorage,
): DomainIntent | null {
  const raw = storage.getItem(PENDING_INTENT_KEY);
  if (!raw) return null;
  storage.removeItem(PENDING_INTENT_KEY);
  try {
    const candidate = JSON.parse(raw) as DomainIntent;
    const url = buildAppIntentUrl(candidate, context);
    const parsed = parseDomainIntent(url, context);
    return parsed.ok ? parsed.intent : null;
  } catch {
    return null;
  }
}
