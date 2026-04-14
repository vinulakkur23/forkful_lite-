import { useEffect, useState, useCallback, useRef } from 'react';
import auth from '@react-native-firebase/auth';
import {
  IconicEat,
  fetchNearbyIconicEats,
  subscribeToUnlockedIconicEats,
} from '../services/iconicEatsService';

interface Options {
  expanded?: boolean;
}

const DEFAULT_LIMIT = 8;
const EXPANDED_LIMIT = 20;
// TEMP: radius bumped for dev/testing so Portland eats surface from California.
// Revert to 25 / 50 before launch.
const DEFAULT_RADIUS_KM = 2000;
const EXPANDED_RADIUS_KM = 2000;

/**
 * Combined hook: fetches nearby iconic eats + subscribes to the user's
 * unlocked list, merges them so each item carries `unlocked: boolean`.
 *
 * When `expanded` is true (filter chip active), fetches a larger set with
 * bigger radius for the map's "all nearby" mode.
 */
export function useIconicEats(
  userLocation: { latitude: number; longitude: number } | null,
  options: Options = {},
) {
  const { expanded = false } = options;
  const [baseIconicEats, setBaseIconicEats] = useState<IconicEat[]>([]);
  const [unlockedSet, setUnlockedSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const fetchKey = useRef<string>('');

  const doFetch = useCallback(async () => {
    if (!userLocation) return;
    const limit = expanded ? EXPANDED_LIMIT : DEFAULT_LIMIT;
    const radius = expanded ? EXPANDED_RADIUS_KM : DEFAULT_RADIUS_KM;
    const key = `${userLocation.latitude.toFixed(3)},${userLocation.longitude.toFixed(3)},${limit},${radius}`;
    if (key === fetchKey.current) return;
    fetchKey.current = key;
    setLoading(true);
    try {
      const results = await fetchNearbyIconicEats(
        userLocation.latitude,
        userLocation.longitude,
        radius,
        limit,
      );
      setBaseIconicEats(results);
    } catch (e) {
      console.error('[useIconicEats] fetch failed:', e);
    } finally {
      setLoading(false);
    }
  }, [userLocation, expanded]);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  useEffect(() => {
    const uid = auth().currentUser?.uid;
    if (!uid) return;
    const unsub = subscribeToUnlockedIconicEats(uid, setUnlockedSet);
    return unsub;
  }, []);

  const iconicEats: IconicEat[] = baseIconicEats.map(e => ({
    ...e,
    unlocked: unlockedSet.has(e.id),
  }));

  return {
    iconicEats,
    loading,
    refresh: doFetch,
  };
}
