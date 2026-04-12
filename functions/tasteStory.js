/**
 * Taste Story — Cloud Function Logic (Phase H)
 *
 * After `recomputeTasteProfile` runs in the meal-write trigger, this module
 * decides whether to call the Python backend's `/generate-taste-story`
 * endpoint to (re)generate the user's LLM-written taste story.
 *
 * Regeneration gate — any ONE of the following fires a call:
 *   A. First time in full/refined tier (!oldDoc.taste_story)
 *   B. Tier transitioned upward to full or refined
 *   C. Top-1 of flavors, proteins, OR cuisines changed
 *   D. Signature dish changed
 *   E. Staleness (>30 days since last story AND meal_count grew)
 *   F. A meal was deleted (mealCountDelta < 0) — the old story may reference
 *      the now-deleted meal, so force a regen even if top-1 didn't shift.
 *
 * If none fire, we reuse the cached story (already preserved inside
 * `recomputeTasteProfile` when it wrote the new summary).
 *
 * The LLM call is HTTP to the Python backend (not inside the CF process),
 * so no new dependencies are required — the CF runtime already has
 * `node-fetch` for the metadata extraction calls.
 */

const fetch = require('node-fetch');
const {getFirestore, FieldValue, Timestamp} = require('firebase-admin/firestore');

const BACKEND_URL = 'https://dishitout-imageinhancer.onrender.com';
const GENERATE_ENDPOINT = `${BACKEND_URL}/generate-taste-story`;
const RECENT_MEAL_LIMIT = 30;
const STALENESS_DAYS = 30;
const THROTTLE_SECONDS = 300; // 5 min, used by dev callable

// Emoji rating metadata — MUST stay in sync with RatingScreen1.EMOJI_DESCRIPTIONS
// and EmojiRating.EMOJI_RATINGS. Sent to the LLM so it can reference the
// user-facing phrasing instead of the raw number.
const EMOJI_LABELS = {
  1: 'bad',
  2: 'ok',
  3: 'good',
  4: 'great',
  5: 'amazing',
  6: 'thebest',
};
const EMOJI_DESCRIPTIONS = {
  1: 'Not a tasty meal.',
  2: "Ok, but I won't be getting it again.",
  3: 'Tasty food. I enjoyed it!',
  4: "Very tasty. I'd order this again if I come back.",
  5: 'Delicious. I plan to make a trip back just for this.',
  6: "One of the best things I've ever eaten.",
};

// Tier rank — only generate for full and above.
const TIER_RANK = {
  locked: 0,
  basic: 1,
  enhanced: 2,
  full: 3,
  refined: 4,
};

function tierRank(t) {
  return TIER_RANK[t] != null ? TIER_RANK[t] : 0;
}

// =============================================================================
// Gate evaluation
// =============================================================================

function shouldGenerate(signal) {
  if (!signal) return {fire: false, reason: 'no-signal'};

  const newTier = signal.newTier;
  if (newTier !== 'full' && newTier !== 'refined') {
    return {fire: false, reason: 'not-full-tier'};
  }

  // A. First time in full tier — gated on absence of stored story.
  // (The caller will check `profile.taste_story` from oldDoc snapshot.)
  if (signal.firstFullEver) {
    return {fire: true, reason: 'first-full'};
  }

  // B. Tier transition upward.
  if (tierRank(newTier) > tierRank(signal.oldTier)) {
    return {fire: true, reason: 'tier-up'};
  }

  // C. Top-1 of flavors / proteins / cuisines changed.
  const top1 = (arr) => (Array.isArray(arr) && arr.length > 0 ? arr[0] : null);
  if (top1(signal.oldTopFlavors) !== top1(signal.newTopFlavors)) {
    return {fire: true, reason: 'top1-flavor'};
  }
  if (top1(signal.oldTopProteins) !== top1(signal.newTopProteins)) {
    return {fire: true, reason: 'top1-protein'};
  }
  if (top1(signal.oldTopCuisines) !== top1(signal.newTopCuisines)) {
    return {fire: true, reason: 'top1-cuisine'};
  }

  // D. Signature dish changed.
  if (signal.oldSignatureId !== signal.newSignatureId) {
    return {fire: true, reason: 'signature-changed'};
  }

  // F. Meal was deleted. The old story may reference the deleted meal
  // (by name, by restaurant, or by a metric the deletion invalidated),
  // so we always regenerate on delete when the user is in the full/refined
  // tier. Handled before staleness so the reason is clearer in logs.
  if (typeof signal.mealCountDelta === 'number' && signal.mealCountDelta < 0) {
    return {fire: true, reason: 'meal-deleted'};
  }

  // E. Staleness + meal_count growth.
  if (signal.oldStoryUpdatedAt && signal.mealCountDelta > 0) {
    const ageMs = Date.now() - tsToMillis(signal.oldStoryUpdatedAt);
    if (ageMs > STALENESS_DAYS * 24 * 60 * 60 * 1000) {
      return {fire: true, reason: 'stale'};
    }
  }

  // G. Every-5-meals refresh. Once in full/refined tier, regenerate whenever
  // the meal count crosses a multiple of 5 (15, 20, 25, 30, ...). This keeps
  // insights fresh as the user's palate evolves.
  if (
    typeof signal.newMealCount === 'number' &&
    typeof signal.mealCountDelta === 'number' &&
    signal.mealCountDelta > 0
  ) {
    const oldCount = signal.newMealCount - signal.mealCountDelta;
    // Did we cross a 5-meal boundary?
    if (Math.floor(signal.newMealCount / 5) > Math.floor(oldCount / 5)) {
      return {fire: true, reason: 'every-5-refresh'};
    }
  }

  return {fire: false, reason: 'no-change'};
}

function tsToMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts === 'number') return ts;
  if (ts._seconds != null) return ts._seconds * 1000;
  return 0;
}

// =============================================================================
// Recent meals fetch
// =============================================================================

/**
 * Fetch the user's most-recent rated meals (up to RECENT_MEAL_LIMIT),
 * compressed to a shape suitable for inclusion in the LLM prompt payload.
 *
 * Each meal entry includes the rating NUMBER (1–6), the user-visible
 * LABEL (bad/ok/good/great/amazing/thebest), and the DESCRIPTION the user
 * actually saw when they picked that emoji. The LLM uses these to talk
 * about ratings in the user's own language rather than "stars".
 *
 * Also preserves the user's own review text (`comments.thoughts`) —
 * the richest single signal in the payload.
 *
 * NOTE: hard-deleted meals will not appear here because Firestore queries
 * do not return deleted documents. If a user reports stale references, the
 * gate (rule F) force-regenerates on delete to flush the cache.
 */
async function fetchRecentMealsForStory(userId) {
  const db = getFirestore();
  const snap = await db
    .collection('mealEntries')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(60) // over-fetch; we filter for rated meals below
    .get();

  const meals = [];
  snap.forEach((doc) => {
    const d = doc.data() || {};
    if (typeof d.rating !== 'number' || d.rating <= 0) return;
    const meta = d.metadata_enriched || {};
    const comments = d.comments || {};
    const thoughts = (comments.thoughts || d.thoughts || '').toString().trim();

    meals.push({
      dish: d.meal || d.mealName || meta.dish_specific || '',
      dish_general: meta.dish_general || '',
      restaurant: d.restaurant || '',
      rating: d.rating,
      rating_label: EMOJI_LABELS[d.rating] || null,
      rating_description: EMOJI_DESCRIPTIONS[d.rating] || null,
      thoughts,
      cuisine: meta.cuisine_type || '',
      protein: meta.primary_protein || '',
      carb: meta.primary_carb || '',
      cooking_method: meta.cooking_method || '',
      flavors: Array.isArray(meta.flavor_profile) ? meta.flavor_profile : [],
      textures: Array.isArray(meta.texture) ? meta.texture : [],
      heat_level: meta.heat_level || '',
      richness: meta.richness || '',
      meal_type: meta.meal_type || '',
      key_ingredients: Array.isArray(meta.key_ingredients)
        ? meta.key_ingredients.slice(0, 8)
        : [],
      interesting_ingredient: meta.interesting_ingredient || '',
      presentation_style: meta.presentation_style || '',
    });
  });

  return meals.slice(0, RECENT_MEAL_LIMIT);
}

// =============================================================================
// Main entrypoint
// =============================================================================

/**
 * Evaluate the gate and, if it fires, call the backend and write the result
 * back to users/{uid}/taste_profile/summary.
 *
 * Must be called AFTER recomputeTasteProfile so oldDoc.taste_story (if any)
 * has already been preserved onto the freshly-written summary doc.
 */
async function maybeGenerateTasteStory(userId, signal) {
  if (!userId) return {fired: false, reason: 'no-userId'};

  const db = getFirestore();
  const summaryRef = db
    .collection('users')
    .doc(userId)
    .collection('taste_profile')
    .doc('summary');

  // We need to know whether a cached story already exists for rule A.
  const snap = await summaryRef.get();
  const summary = snap.exists ? snap.data() : null;
  if (!summary) return {fired: false, reason: 'no-summary'};

  const augmented = {
    ...signal,
    firstFullEver:
      (signal.newTier === 'full' || signal.newTier === 'refined') &&
      !summary.taste_story,
  };

  const decision = shouldGenerate(augmented);
  if (!decision.fire) {
    console.log(
      `[tasteStory] Skipping story generation for ${userId}: ${decision.reason}`
    );
    return {fired: false, reason: decision.reason};
  }

  console.log(
    `[tasteStory] Generating story for ${userId}: ${decision.reason}`
  );

  return generateAndWriteStory(userId, summary, signal);
}

/**
 * Bypass the gate (used by the dev callable). Still throttled at
 * THROTTLE_SECONDS to avoid accidental hammer loops.
 *
 * @param {string} userId
 * @param {{bypassThrottle?: boolean}} [opts]
 */
async function forceGenerateTasteStory(userId, opts = {}) {
  const db = getFirestore();
  const summaryRef = db
    .collection('users')
    .doc(userId)
    .collection('taste_profile')
    .doc('summary');
  const snap = await summaryRef.get();
  const summary = snap.exists ? snap.data() : null;
  if (!summary) {
    return {fired: false, reason: 'no-summary'};
  }
  if (!opts.bypassThrottle) {
    const lastMs = tsToMillis(summary.taste_story_updated_at);
    if (lastMs && Date.now() - lastMs < THROTTLE_SECONDS * 1000) {
      return {fired: false, reason: 'throttled'};
    }
  }
  return generateAndWriteStory(userId, summary, null);
}

async function generateAndWriteStory(userId, summary, signal) {
  const summaryRef = getFirestore()
    .collection('users')
    .doc(userId)
    .collection('taste_profile')
    .doc('summary');

  // Prefer scored top-N from the fresh signal snapshot if the caller has it;
  // fall back to the plain top-N arrays on the summary doc.
  const snapshot = (signal && signal.profileSnapshot) || {};
  const asPairs = (arr) =>
    Array.isArray(arr) ? arr.map((v) => [v, null]) : [];

  const recentMeals = await fetchRecentMealsForStory(userId);

  // IMPORTANT: `summary.signature_dish.repeat_count` is computed by
  // pickSignatureDish() as the count of meals sharing the same
  // protein+cuisine combo — NOT the count of meals with the same dish name.
  // If we forwarded that as `repeats`, the LLM faithfully writes
  // "you've ordered this twice" even when the user only logged that exact
  // dish once. Recompute the *real* dish-name match count from recent_meals
  // and only forward `repeats` when it's a genuine repeat (>= 2).
  let signatureBlock = null;
  if (summary.signature_dish) {
    const sigName = (summary.signature_dish.mealName || '').toLowerCase().trim();
    let actualRepeats = 0;
    if (sigName) {
      for (const m of recentMeals) {
        if ((m.dish || '').toLowerCase().trim() === sigName) actualRepeats += 1;
      }
    }
    signatureBlock = {
      name: summary.signature_dish.mealName,
      rating: summary.signature_dish.rating || null,
    };
    if (actualRepeats >= 2) {
      signatureBlock.repeats = actualRepeats;
    }
  }

  const payload = {
    profile: {
      tier: summary.tier,
      meal_count: summary.meal_count,
      top_flavors: snapshot.top_flavors_scored || asPairs(summary.top_flavors),
      top_proteins:
        snapshot.top_proteins_scored || asPairs(summary.top_proteins),
      top_cuisines:
        snapshot.top_cuisines_scored || asPairs(summary.top_cuisines),
      top_cooking_methods:
        snapshot.top_cooking_methods_scored ||
        asPairs(summary.top_cooking_methods),
      top_textures:
        snapshot.top_textures_scored || asPairs(summary.top_textures),
      top_dietary:
        snapshot.top_dietary_scored || asPairs(summary.top_dietary),
      avoid_tags: summary.avoid_tags || [],
      signature_dish: signatureBlock,
    },
    recent_meals: recentMeals,
  };

  let resJson;
  try {
    const res = await fetch(GENERATE_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      // 120s — Render free-tier cold starts can be 20-30s and gemini-2.5-pro
      // with the rich prompt typically takes 10-20s to respond. We have a
      // 540s function timeout, so plenty of headroom.
      timeout: 120000,
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error(
        `[tasteStory] Backend returned ${res.status}: ${txt.slice(0, 200)}`
      );
      return {fired: false, reason: 'backend-error', status: res.status};
    }
    resJson = await res.json();
  } catch (err) {
    console.error('[tasteStory] fetch failed:', err);
    return {fired: false, reason: 'fetch-failed', error: err.message};
  }

  const story = resJson && resJson.story;
  const archetype = resJson && resJson.archetype;
  // Insights are optional — older backend deploys may not return them. Coerce
  // to a string array, drop empties, cap at 3.
  const rawInsights = (resJson && resJson.insights) || [];
  const insights = Array.isArray(rawInsights)
    ? rawInsights
        .filter((s) => typeof s === 'string' && s.trim().length > 0)
        .map((s) => s.trim())
        .slice(0, 3)
    : [];
  if (!story || !archetype) {
    console.warn('[tasteStory] Backend returned empty story/archetype');
    return {fired: false, reason: 'empty-response'};
  }

  await summaryRef.set(
    {
      taste_story: story,
      taste_story_archetype: archetype,
      taste_story_insights: insights,
      taste_story_updated_at: FieldValue.serverTimestamp(),
    },
    {merge: true}
  );

  console.log(
    `[tasteStory] Wrote story for ${userId}: "${story.slice(0, 60)}..." (${archetype}) +${insights.length} insights`
  );

  return {fired: true, story, archetype, insights};
}

module.exports = {
  maybeGenerateTasteStory,
  forceGenerateTasteStory,
  shouldGenerate,
};
