import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { GOOGLE_MAPS_API_KEY } from '../config/googleMapsConfig';
import { dishNamesMatch } from '../utils/iconicMatching';

export interface IconicEat {
  id: string;
  dish_name: string;
  restaurant_name: string;
  why_selected: string;
  // Editorial label shown above the dish name in the modal, e.g.
  // "Hidden Gem", "Classic", "Newcomer". When absent we fall back to
  // "Iconic Eat" so older docs still render.
  category?: string;
  place_id?: string;
  formatted_address?: string;
  photo_references?: string[];
  google_rating?: number;
  website?: string;
  emoji_url: string;
  shadow_emoji_url: string;
  city?: string;
  active: boolean;
  latitude: number;
  longitude: number;
  distance?: number; // km from user, injected after Haversine
  unlocked: boolean; // injected from user's unlocked_iconic_eats
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Fetch all active iconic eats within radiusKm of the given coords,
 * sorted by distance ascending. Returns up to `limit` items.
 * Note: Firestore doesn't support geo-queries natively, so we fetch all
 * `active == true` docs and filter client-side. Acceptable while the
 * collection is small (hundreds). Revisit with geo-hashing if it grows.
 */
export async function fetchNearbyIconicEats(
  lat: number,
  lon: number,
  radiusKm: number,
  limit: number,
): Promise<IconicEat[]> {
  const snapshot = await firestore()
    .collection('best_eats')
    .where('active', '==', true)
    .get();

  const results: IconicEat[] = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    const geo = data.location as
      | FirebaseFirestoreTypes.GeoPoint
      | { latitude: number; longitude: number }
      | undefined;
    if (!geo) return;
    const eatLat = (geo as any).latitude;
    const eatLon = (geo as any).longitude;
    if (typeof eatLat !== 'number' || typeof eatLon !== 'number') return;

    const distance = haversineKm(lat, lon, eatLat, eatLon);
    if (distance > radiusKm) return;

    results.push({
      id: doc.id,
      dish_name: data.dish_name,
      restaurant_name: data.restaurant_name,
      why_selected: data.why_selected,
      place_id: data.place_id,
      formatted_address: data.formatted_address,
      photo_references: data.photo_references || [],
      google_rating: data.google_rating,
      website: data.website,
      emoji_url: data.emoji_url,
      shadow_emoji_url: data.shadow_emoji_url,
      category: data.category,
      city: data.city,
      active: data.active,
      latitude: eatLat,
      longitude: eatLon,
      distance,
      unlocked: false,
    });
  });

  results.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  return results.slice(0, limit);
}

/**
 * Fetch a single iconic eat by dish ID. Returns null if the doc doesn't exist
 * or is inactive. `unlocked` is left false; callers should set it if they have
 * the user's unlocked set.
 */
export async function fetchIconicEatById(id: string): Promise<IconicEat | null> {
  const doc = await firestore().collection('best_eats').doc(id).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (!data || data.active === false) return null;
  const geo = data.location as
    | FirebaseFirestoreTypes.GeoPoint
    | { latitude: number; longitude: number }
    | undefined;
  const eatLat = geo ? (geo as any).latitude : 0;
  const eatLon = geo ? (geo as any).longitude : 0;
  return {
    id: doc.id,
    dish_name: data.dish_name,
    restaurant_name: data.restaurant_name,
    why_selected: data.why_selected,
    place_id: data.place_id,
    formatted_address: data.formatted_address,
    photo_references: data.photo_references || [],
    google_rating: data.google_rating,
    website: data.website,
    emoji_url: data.emoji_url,
    shadow_emoji_url: data.shadow_emoji_url,
    city: data.city,
    active: data.active,
    latitude: eatLat,
    longitude: eatLon,
    unlocked: false,
  };
}

/**
 * Subscribe to the user's `unlocked_iconic_eats` array. Emits a Set of
 * unlocked dish IDs on every user-doc change. Returns an unsubscribe fn.
 */
export function subscribeToUnlockedIconicEats(
  uid: string,
  callback: (unlocked: Set<string>) => void,
): () => void {
  return firestore()
    .collection('users')
    .doc(uid)
    .onSnapshot(
      doc => {
        const data = doc.data();
        const arr = (data?.unlocked_iconic_eats as string[]) || [];
        callback(new Set(arr));
      },
      error => {
        console.error('[iconicEatsService] unlocked subscription error:', error);
      },
    );
}

/**
 * Map a Firestore best_eats doc to an IconicEat. Shared between query paths.
 */
function docToIconicEat(
  id: string,
  data: FirebaseFirestoreTypes.DocumentData,
): IconicEat | null {
  const geo = data.location as
    | FirebaseFirestoreTypes.GeoPoint
    | { latitude: number; longitude: number }
    | undefined;
  const eatLat = geo ? (geo as any).latitude : 0;
  const eatLon = geo ? (geo as any).longitude : 0;
  if (typeof eatLat !== 'number' || typeof eatLon !== 'number') return null;
  return {
    id,
    dish_name: data.dish_name,
    restaurant_name: data.restaurant_name,
    why_selected: data.why_selected,
    place_id: data.place_id,
    formatted_address: data.formatted_address,
    photo_references: data.photo_references || [],
    google_rating: data.google_rating,
    website: data.website,
    emoji_url: data.emoji_url,
    shadow_emoji_url: data.shadow_emoji_url,
    city: data.city,
    active: data.active,
    latitude: eatLat,
    longitude: eatLon,
    unlocked: false,
  };
}

export interface IconicMatchInput {
  place_id?: string | null;
  dish_name: string;
}

/**
 * Fast, scoped iconic-eat lookup for meal-save time. place_id-only by design:
 *
 *   - If a place_id is present (user picked the restaurant from Google Places
 *     autocomplete — the ~80%+ case), we fire a single indexed Firestore query
 *     and trigram-match the dish. Typical latency: 50–150ms, returns 0 docs
 *     99% of the time.
 *   - If no place_id (user typed the restaurant freely), we do nothing and
 *     return null. The server-side Cloud Function still catches this case
 *     asynchronously via proximity + name matching.
 *
 * Why no client-side city/proximity fallback: extra queries that almost never
 * fire for real users, and they'd add latency to every save. The Cloud
 * Function owns the slow-path matching. This function exists only to make
 * the celebration modal feel instant when we can be confident about a match.
 */
export async function findIconicEatMatch(
  input: IconicMatchInput,
): Promise<IconicEat | null> {
  const { place_id, dish_name } = input;
  if (!place_id) return null;

  const snap = await firestore()
    .collection('best_eats')
    .where('place_id', '==', place_id)
    .where('active', '==', true)
    .get();

  if (snap.empty) return null;

  const candidates = snap.docs
    .map(d => docToIconicEat(d.id, d.data()))
    .filter((x): x is IconicEat => x !== null);

  // Trigram + substring match on dish name. If multiple candidates exist at
  // the same restaurant (rare), take the first that passes.
  return candidates.find(c => dishNamesMatch(dish_name, c.dish_name)) ?? null;
}

/**
 * Build a Google Places Photo URL from a photo_reference token.
 * Falls back to empty string if no reference given.
 */
export function buildPlacesPhotoUrl(
  photoReference?: string,
  maxWidth: number = 600,
): string {
  if (!photoReference) return '';
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${GOOGLE_MAPS_API_KEY}`;
}
