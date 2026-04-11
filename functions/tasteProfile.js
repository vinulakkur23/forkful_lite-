/**
 * Taste Profile — Cloud Function Logic (Phase A)
 *
 * This module maintains a per-user taste profile aggregated from their
 * `mealEntries` documents. On every meal write or delete, we re-aggregate
 * from scratch (simple, drift-free, fine up to a few hundred meals per user)
 * and write the result to `users/{uid}/taste_profile/summary`.
 *
 * Data model (see /Users/vinulakkur/.claude/plans/harmonic-jingling-sphinx.md):
 *   users/{uid}/taste_profile/summary {
 *     tag_counts: { tag: count },
 *     tag_scores: { tag: weightedScore },
 *     top_flavors[], top_cuisines[], top_proteins[],
 *     top_cooking_methods[], top_dietary[],
 *     avoid_tags[],
 *     discovered: { flavors[], cuisines[], proteins[], carbs[],
 *                   cooking_methods[], dietary[], textures[] },
 *     signature_dish: { mealId, mealName, photoUrl, rating, repeat_count } | null,
 *     meal_count, unique_cuisines_count, unique_cities_count,
 *     tier: 'locked' | 'basic' | 'full' | 'refined',
 *     last_updated
 *   }
 *
 * Scoring:
 *   tag_counts[tag]++
 *   tag_scores[tag] += (rating - 3)   // 5★=+2, 3★=0, 1★=-2, missing=0
 *
 * Tier thresholds:
 *   0–4   locked
 *   5–14  basic
 *   15–29 full
 *   30+   refined
 */

const {getFirestore, FieldValue} = require('firebase-admin/firestore');

// =============================================================================
// Field → canonical vocabulary. Mirrors services/metadata_normalizer.py.
// If the backend vocab changes, update this too.
// =============================================================================

const FIELD_VOCAB = {
  flavor: new Set([
    'savory', 'sweet', 'sour', 'bitter', 'umami', 'salty', 'tangy',
    'smoky', 'herbaceous', 'mild', 'garlicky', 'buttery', 'cheesy',
    'fresh', 'acidic', 'earthy', 'aromatic',
  ]),
  dietary: new Set([
    'vegetarian', 'vegan', 'pescatarian', 'gluten-free', 'dairy-free',
    'nut-free', 'halal', 'kosher', 'keto', 'low-carb', 'high-protein',
    'low-calorie', 'raw', 'organic', 'contains-alcohol',
  ]),
  cookingMethod: new Set([
    'grilled', 'fried', 'baked', 'roasted', 'steamed', 'raw', 'braised',
    'sauteed', 'smoked', 'boiled',
  ]),
  protein: new Set([
    'beef', 'chicken', 'pork', 'fish', 'shellfish', 'tofu', 'egg', 'lamb',
  ]),
  carb: new Set([
    'rice', 'noodles', 'bread', 'potato', 'tortilla',
  ]),
  texture: new Set([
    'crispy', 'creamy', 'crunchy', 'tender', 'chewy', 'flaky', 'juicy',
    'soft',
  ]),
  mealType: new Set([
    'breakfast', 'brunch', 'lunch', 'dinner', 'snack', 'dessert',
  ]),
  // cuisine is open-ended (controlled on the prompt side), no hard Set.
};

const LIST_FIELDS = [
  {metaKey: 'flavor_profile', tagField: 'flavor'},
  {metaKey: 'dietary_info', tagField: 'dietary'},
  {metaKey: 'texture', tagField: 'texture'},
];

const SCALAR_FIELDS = [
  {metaKey: 'cooking_method', tagField: 'cookingMethod'},
  {metaKey: 'primary_protein', tagField: 'protein', skipNone: true},
  {metaKey: 'primary_carb', tagField: 'carb', skipNone: true},
  {metaKey: 'meal_type', tagField: 'mealType'},
];

// =============================================================================
// Tag extraction
// =============================================================================

/**
 * Extract a flat array of tag objects from a meal doc's metadata_enriched.
 * Each tag is { field, value } where value is a canonical string.
 * We also emit:
 *   - heat_level as { field: 'heat', value: <level> } if not 'none'
 *   - cuisine_type as { field: 'cuisine', value: <cuisine> }
 */
function extractTagsFromMeal(mealData) {
  const tags = [];
  const meta = mealData && mealData.metadata_enriched;
  if (!meta || typeof meta !== 'object') return tags;

  // List fields
  for (const {metaKey, tagField} of LIST_FIELDS) {
    const arr = meta[metaKey];
    if (!Array.isArray(arr)) continue;
    const vocab = FIELD_VOCAB[tagField];
    for (const v of arr) {
      if (typeof v !== 'string') continue;
      const val = v.toLowerCase().trim();
      if (vocab && !vocab.has(val)) continue;
      tags.push({field: tagField, value: val});
    }
  }

  // Scalar fields
  for (const {metaKey, tagField, skipNone} of SCALAR_FIELDS) {
    const v = meta[metaKey];
    if (typeof v !== 'string') continue;
    const val = v.toLowerCase().trim();
    if (skipNone && val === 'none') continue;
    const vocab = FIELD_VOCAB[tagField];
    if (vocab && !vocab.has(val)) continue;
    tags.push({field: tagField, value: val});
  }

  // Heat level (special: skip 'none')
  if (typeof meta.heat_level === 'string') {
    const heat = meta.heat_level.toLowerCase().trim();
    if (heat && heat !== 'none') {
      tags.push({field: 'heat', value: heat});
    }
  }

  // Richness
  if (typeof meta.richness === 'string') {
    const r = meta.richness.toLowerCase().trim();
    if (r) tags.push({field: 'richness', value: r});
  }

  // Cuisine (open vocab)
  if (typeof meta.cuisine_type === 'string') {
    const c = meta.cuisine_type.toLowerCase().trim();
    if (c && c !== 'unknown' && c !== 'n/a') {
      tags.push({field: 'cuisine', value: c});
    }
  }

  return tags;
}

// =============================================================================
// Tier derivation
// =============================================================================

function deriveTier(mealCount) {
  if (mealCount < 5) return 'locked';
  if (mealCount < 15) return 'basic';
  if (mealCount < 30) return 'full';
  return 'refined';
}

// =============================================================================
// Top-N helper
// =============================================================================

/**
 * Return top N values for a given field from tag_scores, scoped to the
 * field's canonical vocab. Sorted by score descending, ties broken by count.
 */
function topNForField(field, tagScores, tagCounts, n) {
  const entries = [];
  for (const [key, score] of Object.entries(tagScores)) {
    const [f, v] = key.split('::');
    if (f !== field) continue;
    entries.push({value: v, score, count: tagCounts[key] || 0});
  }
  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.count - a.count;
  });
  return entries.slice(0, n).map((e) => e.value);
}

/**
 * Return the most-negative tags across all fields (the user's "avoid" list).
 * Only includes tags with a meaningfully negative score (< -1).
 */
function computeAvoidTags(tagScores, limit = 3) {
  const entries = [];
  for (const [key, score] of Object.entries(tagScores)) {
    if (score >= -1) continue;
    const [, v] = key.split('::');
    entries.push({value: v, score});
  }
  entries.sort((a, b) => a.score - b.score);
  return entries.slice(0, limit).map((e) => e.value);
}

// =============================================================================
// Signature dish
// =============================================================================

/**
 * Pick a signature dish from a list of meals: highest rating, tie-break on
 * meals whose primary_protein + cuisine_type has been repeated most often.
 */
function pickSignatureDish(meals) {
  if (!meals.length) return null;

  // Count protein+cuisine combos to compute repeat_count for any candidate.
  const comboCounts = {};
  for (const m of meals) {
    const meta = m.metadata_enriched || {};
    const proteinKey = (meta.primary_protein || '').toLowerCase();
    const cuisineKey = (meta.cuisine_type || '').toLowerCase();
    if (!proteinKey && !cuisineKey) continue;
    const combo = `${proteinKey}|${cuisineKey}`;
    comboCounts[combo] = (comboCounts[combo] || 0) + 1;
  }

  // Sort by rating desc, then by repeat_count desc, then by createdAt desc.
  const sorted = [...meals].sort((a, b) => {
    const ra = a.rating || 0;
    const rb = b.rating || 0;
    if (rb !== ra) return rb - ra;

    const metaA = a.metadata_enriched || {};
    const metaB = b.metadata_enriched || {};
    const comboA =
      `${(metaA.primary_protein || '').toLowerCase()}|${(metaA.cuisine_type || '').toLowerCase()}`;
    const comboB =
      `${(metaB.primary_protein || '').toLowerCase()}|${(metaB.cuisine_type || '').toLowerCase()}`;
    const repA = comboCounts[comboA] || 0;
    const repB = comboCounts[comboB] || 0;
    if (repB !== repA) return repB - repA;

    const tA = (a.createdAt && a.createdAt.toMillis && a.createdAt.toMillis()) || 0;
    const tB = (b.createdAt && b.createdAt.toMillis && b.createdAt.toMillis()) || 0;
    return tB - tA;
  });

  const top = sorted[0];
  if (!top || !top.rating) return null; // need at least one rated meal

  const meta = top.metadata_enriched || {};
  const combo =
    `${(meta.primary_protein || '').toLowerCase()}|${(meta.cuisine_type || '').toLowerCase()}`;

  return {
    mealId: top._id,
    mealName: top.meal || top.mealName || '',
    photoUrl: top.photoUrl || top.photoUri || '',
    rating: top.rating || 0,
    repeat_count: comboCounts[combo] || 1,
  };
}

// =============================================================================
// City extraction (mirrors extractCityFromMeal in index.js)
// =============================================================================

function extractCity(meal) {
  let city = null;
  if (meal.city) {
    city = meal.city;
  } else if (meal.location && meal.location.city) {
    city = meal.location.city;
  } else if (meal.restaurant && meal.restaurant.includes(',')) {
    const parts = meal.restaurant.split(',');
    if (parts.length > 1) city = parts[1].trim();
  }
  return city ? city.toLowerCase().trim() : null;
}

// =============================================================================
// Main aggregation
// =============================================================================

/**
 * Recompute the taste profile for a user from scratch by reading all of their
 * meals and writing `users/{uid}/taste_profile/summary`.
 */
async function recomputeTasteProfile(userId) {
  if (!userId) {
    console.warn('recomputeTasteProfile called without userId');
    return;
  }

  const db = getFirestore();
  console.log(`[tasteProfile] Recomputing for user ${userId}`);

  const mealsSnapshot = await db
    .collection('mealEntries')
    .where('userId', '==', userId)
    .get();

  const meals = [];
  mealsSnapshot.forEach((doc) => {
    meals.push({_id: doc.id, ...doc.data()});
  });

  const mealCount = meals.length;

  // Short-circuit: user has no meals. Write a locked profile and bail.
  if (mealCount === 0) {
    await db
      .collection('users')
      .doc(userId)
      .collection('taste_profile')
      .doc('summary')
      .set({
        tag_counts: {},
        tag_scores: {},
        top_flavors: [],
        top_cuisines: [],
        top_proteins: [],
        top_cooking_methods: [],
        top_dietary: [],
        avoid_tags: [],
        discovered: {
          flavors: [],
          cuisines: [],
          proteins: [],
          carbs: [],
          cooking_methods: [],
          dietary: [],
          textures: [],
        },
        signature_dish: null,
        meal_count: 0,
        unique_cuisines_count: 0,
        unique_cities_count: 0,
        tier: 'locked',
        last_updated: FieldValue.serverTimestamp(),
      });
    return;
  }

  // Aggregation state
  const tagCounts = {}; // 'field::value' -> count
  const tagScores = {}; // 'field::value' -> weighted score
  const discovered = {
    flavors: new Set(),
    cuisines: new Set(),
    proteins: new Set(),
    carbs: new Set(),
    cooking_methods: new Set(),
    dietary: new Set(),
    textures: new Set(),
  };
  const discoveredFieldMap = {
    flavor: 'flavors',
    cuisine: 'cuisines',
    protein: 'proteins',
    carb: 'carbs',
    cookingMethod: 'cooking_methods',
    dietary: 'dietary',
    texture: 'textures',
  };
  const uniqueCities = new Set();

  for (const meal of meals) {
    const rating = typeof meal.rating === 'number' ? meal.rating : 0;
    const weight = rating > 0 ? rating - 3 : 0;

    const city = extractCity(meal);
    if (city) uniqueCities.add(city);

    const tags = extractTagsFromMeal(meal);
    for (const {field, value} of tags) {
      const key = `${field}::${value}`;
      tagCounts[key] = (tagCounts[key] || 0) + 1;
      tagScores[key] = (tagScores[key] || 0) + weight;

      const discKey = discoveredFieldMap[field];
      if (discKey) discovered[discKey].add(value);
    }
  }

  // Derive top-N per field
  const topFlavors = topNForField('flavor', tagScores, tagCounts, 5);
  const topCuisines = topNForField('cuisine', tagScores, tagCounts, 5);
  const topProteins = topNForField('protein', tagScores, tagCounts, 3);
  const topCookingMethods = topNForField('cookingMethod', tagScores, tagCounts, 3);
  const topDietary = topNForField('dietary', tagScores, tagCounts, 3);
  const avoidTags = computeAvoidTags(tagScores, 3);

  const signatureDish = pickSignatureDish(meals);

  const profile = {
    tag_counts: tagCounts,
    tag_scores: tagScores,
    top_flavors: topFlavors,
    top_cuisines: topCuisines,
    top_proteins: topProteins,
    top_cooking_methods: topCookingMethods,
    top_dietary: topDietary,
    avoid_tags: avoidTags,
    discovered: {
      flavors: Array.from(discovered.flavors),
      cuisines: Array.from(discovered.cuisines),
      proteins: Array.from(discovered.proteins),
      carbs: Array.from(discovered.carbs),
      cooking_methods: Array.from(discovered.cooking_methods),
      dietary: Array.from(discovered.dietary),
      textures: Array.from(discovered.textures),
    },
    signature_dish: signatureDish,
    meal_count: mealCount,
    unique_cuisines_count: discovered.cuisines.size,
    unique_cities_count: uniqueCities.size,
    tier: deriveTier(mealCount),
    last_updated: FieldValue.serverTimestamp(),
  };

  await db
    .collection('users')
    .doc(userId)
    .collection('taste_profile')
    .doc('summary')
    .set(profile);

  console.log(
    `[tasteProfile] Wrote profile for ${userId}: tier=${profile.tier}, ` +
    `meals=${mealCount}, topFlavors=[${topFlavors.join(',')}]`
  );
}

module.exports = {
  extractTagsFromMeal,
  recomputeTasteProfile,
  deriveTier,
  // Exposed for tests / manual triggers
  topNForField,
  computeAvoidTags,
  pickSignatureDish,
};
