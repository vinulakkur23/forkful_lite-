const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');

const EARTH_RADIUS_KM = 6371;
const PROXIMITY_KM = 0.05; // 50 meters

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Normalize a restaurant name for loose matching:
 *   "Pok Pok PDX" → "pok pok pdx"
 * Strips common suffixes like ", City" tails, punctuation, and collapses spaces.
 */
function normalizeRestaurantName(name) {
  if (!name) return '';
  let s = String(name).toLowerCase().trim();
  // Strip trailing ", City [, State]" style tails
  const commaIdx = s.indexOf(',');
  if (commaIdx > 0) s = s.slice(0, commaIdx);
  // Remove punctuation except spaces and alphanumerics
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Returns true if two normalized restaurant names share meaningful overlap —
 * either name is a substring of the other, or they share at least one
 * significant (length > 2) token. Intentionally loose so "Pok Pok" matches
 * "Pok Pok PDX"; gated behind proximity so false positives are rare.
 */
function namesLooselyMatch(a, b) {
  const na = normalizeRestaurantName(a);
  const nb = normalizeRestaurantName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const tokensA = new Set(na.split(' ').filter((t) => t.length > 2));
  const tokensB = nb.split(' ').filter((t) => t.length > 2);
  return tokensB.some((t) => tokensA.has(t));
}

function extractMealCity(meal) {
  const raw =
    (meal && meal.city) ||
    (meal && meal.location && meal.location.city) ||
    null;
  if (!raw) return null;
  return String(raw).toLowerCase().trim();
}

function extractMealCoords(meal) {
  if (!meal || !meal.location) return null;
  const {latitude, longitude} = meal.location;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  return {latitude, longitude};
}

function extractEatCoords(eatData) {
  const geo = eatData && eatData.location;
  if (!geo) return null;
  const lat = geo.latitude;
  const lon = geo.longitude;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  return {latitude: lat, longitude: lon};
}

/**
 * Core matcher. Given a meal doc and an array of candidate best_eats docs
 * (already filtered to the meal's city), return the best matching dish or null.
 *
 * Match rules:
 *   1. Primary — meal.place_id === eat.place_id.
 *   2. Fallback — Haversine ≤ 50m AND restaurant names loosely match.
 *
 * Exported so the backfill script can reuse it.
 */
function findMatchingIconicEat(meal, candidates) {
  if (!meal || !candidates || candidates.length === 0) return null;

  // Primary: place_id
  if (meal.place_id) {
    const byPlaceId = candidates.find(
      (c) => c.data.place_id && c.data.place_id === meal.place_id,
    );
    if (byPlaceId) return byPlaceId;
  }

  // Fallback: proximity + name similarity
  const mealCoords = extractMealCoords(meal);
  if (!mealCoords) return null;

  for (const candidate of candidates) {
    const eatCoords = extractEatCoords(candidate.data);
    if (!eatCoords) continue;
    const distanceKm = haversineKm(
      mealCoords.latitude,
      mealCoords.longitude,
      eatCoords.latitude,
      eatCoords.longitude,
    );
    if (distanceKm > PROXIMITY_KM) continue;
    if (!namesLooselyMatch(meal.restaurant, candidate.data.restaurant_name)) continue;
    return candidate;
  }

  return null;
}

/**
 * Idempotent unlock: writes unlock subcollection doc, updates user profile
 * arrays, and stamps iconic_eat_id onto the meal. Safe to re-run — all writes
 * use merge / arrayUnion / set-if-missing semantics.
 */
async function applyIconicUnlock({db, userId, mealId, eatId, eatData}) {
  const unlockRef = db
    .collection('users')
    .doc(userId)
    .collection('iconic_eat_unlocks')
    .doc(eatId);

  const existing = await unlockRef.get();
  if (existing.exists) {
    // Already unlocked — still stamp the meal so subsequent logs at the same
    // place show the badge, but don't duplicate emoji/array entries.
    await db.collection('mealEntries').doc(mealId).set(
      {iconic_eat_id: eatId},
      {merge: true},
    );
    console.log(
      `[iconicEats] User ${userId} already unlocked ${eatId}; ` +
        `tagged meal ${mealId} with iconic_eat_id`,
    );
    return {fresh: false};
  }

  const now = FieldValue.serverTimestamp();
  const userRef = db.collection('users').doc(userId);
  const mealRef = db.collection('mealEntries').doc(mealId);

  const batch = db.batch();
  batch.set(unlockRef, {mealId, unlockedAt: now});
  batch.set(
    userRef,
    {
      unlocked_iconic_eats: FieldValue.arrayUnion(eatId),
      [`unlocked_iconic_eats_at.${eatId}`]: now,
      pixel_art_emoji_order: eatData.emoji_url
        ? FieldValue.arrayUnion(eatData.emoji_url)
        : FieldValue.arrayUnion(),
    },
    {merge: true},
  );
  batch.set(mealRef, {iconic_eat_id: eatId}, {merge: true});

  await batch.commit();
  console.log(
    `[iconicEats] Unlocked ${eatId} for user ${userId} via meal ${mealId}`,
  );
  return {fresh: true};
}

/**
 * Firestore trigger: on new meal creation, check if it matches any iconic eat
 * in the same city. If so, unlock it for the user.
 */
const onMealCreateCheckIconicUnlock = onDocumentCreated(
  'mealEntries/{mealId}',
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return null;
      const meal = snap.data();
      const mealId = event.params.mealId;
      if (!meal || !meal.userId) {
        console.log('[iconicEats] Meal missing userId; skipping');
        return null;
      }

      const city = extractMealCity(meal);
      if (!city) {
        console.log(`[iconicEats] Meal ${mealId} has no city; skipping`);
        return null;
      }

      const db = getFirestore();
      const candidatesSnap = await db
        .collection('best_eats')
        .where('city', '==', city)
        .where('active', '==', true)
        .get();

      if (candidatesSnap.empty) {
        // Also try capitalized city for legacy docs
        const capitalized = city.charAt(0).toUpperCase() + city.slice(1);
        const capSnap = await db
          .collection('best_eats')
          .where('city', '==', capitalized)
          .where('active', '==', true)
          .get();
        if (capSnap.empty) {
          console.log(
            `[iconicEats] No iconic eats in city "${city}" for meal ${mealId}`,
          );
          return null;
        }
        const candidates = capSnap.docs.map((d) => ({id: d.id, data: d.data()}));
        return handleCandidates({db, meal, mealId, candidates});
      }

      const candidates = candidatesSnap.docs.map((d) => ({
        id: d.id,
        data: d.data(),
      }));
      return handleCandidates({db, meal, mealId, candidates});
    } catch (err) {
      console.error('[iconicEats] Error in onMealCreate trigger:', err);
      return null;
    }
  },
);

async function handleCandidates({db, meal, mealId, candidates}) {
  const match = findMatchingIconicEat(meal, candidates);
  if (!match) {
    console.log(
      `[iconicEats] No match for meal ${mealId} among ${candidates.length} candidates`,
    );
    return null;
  }
  await applyIconicUnlock({
    db,
    userId: meal.userId,
    mealId,
    eatId: match.id,
    eatData: match.data,
  });
  return null;
}

module.exports = {
  onMealCreateCheckIconicUnlock,
  // Exported for backfill script + unit tests
  findMatchingIconicEat,
  applyIconicUnlock,
  namesLooselyMatch,
  normalizeRestaurantName,
  haversineKm,
};
