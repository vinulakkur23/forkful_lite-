/**
 * useTasteProfile — React hook for subscribing to a user's taste profile.
 *
 * Subscribes to `users/{uid}/taste_profile/summary` with onSnapshot and
 * returns { profile, loading, error }. Designed to be called in one place
 * (e.g. the Food Passport screen) and passed down to any child components
 * that need the data, so we don't open redundant subscriptions.
 */
import { useEffect, useState } from 'react';
import { firestore } from '../firebaseConfig';
import type { TasteProfile } from './tasteMatch';

interface Result {
  profile: TasteProfile | null;
  loading: boolean;
  error: boolean;
}

export function useTasteProfile(userId: string | null | undefined): Result {
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);

    const unsub = firestore()
      .collection('users')
      .doc(userId)
      .collection('taste_profile')
      .doc('summary')
      .onSnapshot(
        (doc) => {
          if (doc.exists) {
            setProfile(doc.data() as TasteProfile);
          } else {
            // Fresh user — render as locked with 0 meals.
            setProfile({
              tier: 'locked',
              meal_count: 0,
              tag_counts: {},
              tag_scores: {},
              top_flavors: [],
              top_cuisines: [],
              top_proteins: [],
              top_cooking_methods: [],
              top_dietary: [],
              discovered: {},
              signature_dish: null,
            });
          }
          setLoading(false);
        },
        (err) => {
          console.error('[useTasteProfile] snapshot error:', err);
          setError(true);
          setLoading(false);
        }
      );

    return () => unsub();
  }, [userId]);

  return { profile, loading, error };
}
