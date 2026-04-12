/**
 * tierTransition — detect when a user's taste profile tier has "leveled up"
 * since the last time we showed them a celebratory moment.
 *
 * We cache the last-seen tier per user in AsyncStorage. When the strip reads
 * a higher tier than cached, we fire a one-time unlock banner and update the
 * cache. No blocking UI, no modals — just a gentle acknowledgment.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TasteTier = 'locked' | 'basic' | 'enhanced' | 'full' | 'refined';

const TIER_RANK: Record<TasteTier, number> = {
  locked: 0,
  basic: 1,
  enhanced: 2,
  full: 3,
  refined: 4,
};

const storageKey = (userId: string) => `@taste_tier_last_seen:${userId}`;

/**
 * Get the last tier we've shown the user. Returns null if never cached.
 */
export async function getLastSeenTier(userId: string): Promise<TasteTier | null> {
  try {
    const v = await AsyncStorage.getItem(storageKey(userId));
    if (!v) return null;
    if (
      v === 'locked' ||
      v === 'basic' ||
      v === 'enhanced' ||
      v === 'full' ||
      v === 'refined'
    ) {
      return v;
    }
    return null;
  } catch (err) {
    console.warn('[tierTransition] getLastSeenTier error:', err);
    return null;
  }
}

/**
 * Persist the current tier as the last-seen tier for this user.
 */
export async function setLastSeenTier(
  userId: string,
  tier: TasteTier
): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(userId), tier);
  } catch (err) {
    console.warn('[tierTransition] setLastSeenTier error:', err);
  }
}

/**
 * Compare a new tier against the cached one and return the unlock message
 * to show, or null if there's no level-up.
 */
export function getUnlockMessage(
  lastTier: TasteTier | null,
  newTier: TasteTier
): string | null {
  const lastRank = lastTier ? TIER_RANK[lastTier] : -1;
  const newRank = TIER_RANK[newTier];
  if (newRank <= lastRank) return null;

  switch (newTier) {
    case 'basic':
      return 'Your taste profile is unlocked — first picture of who you are as an eater.';
    case 'enhanced':
      return 'Your profile is sharpening — your favorites are becoming clearer.';
    case 'full':
      return 'Your first taste insight is ready.';
    case 'refined':
      return null;
    default:
      return null;
  }
}
