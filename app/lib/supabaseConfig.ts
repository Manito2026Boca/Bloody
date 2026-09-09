export type PublicSupabaseConfig = { url: string; key: string };

// Never combine a deployment URL with a key left in a different browser project.
export function resolveSupabaseConfig(
  environment: { url?: string; key?: string }, stored: unknown,
): PublicSupabaseConfig | null {
  const candidate = environment.url || environment.key ? environment : stored;
  if (!candidate || typeof candidate !== 'object') return null;
  const { url, key } = candidate as Record<string, unknown>;
  if (typeof url !== 'string' || typeof key !== 'string' || !url.trim() || !key.trim()) return null;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return null;
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost','127.0.0.1'].includes(parsed.hostname))) return null;
  } catch { return null; }
  if (key.startsWith('sb_secret_')) return null;
  return { url: url.trim(), key: key.trim() };
}
