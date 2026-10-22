export type PreferredExperience = 'client' | 'professional';
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
const key = (userId: string) => `manito:preferred-mode:v1:${userId}`;

export function readPreferredExperience(
  userId: string,
  storage: () => PreferenceStorage = () => window.localStorage,
  canUseProfessional = true,
): PreferredExperience {
  try {
    return userId && canUseProfessional && storage().getItem(key(userId)) === 'professional'
      ? 'professional' : 'client';
  } catch { return 'client'; }
}

export function savePreferredExperience(
  userId: string,
  mode: PreferredExperience,
  storage: () => PreferenceStorage = () => window.localStorage,
) {
  if (!userId || (mode !== 'client' && mode !== 'professional')) return;
  try { storage().setItem(key(userId), mode); }
  catch { /* An unavailable browser preference must not block navigation. */ }
}
