/**
 * tasteMatch — compute a 0–100 "taste match" score between a meal and a
 * user's taste profile (written by the Cloud Function in functions/tasteProfile.js).
 *
 * Scoring approach: weighted dot product.
 *   For each tag on the meal, add the corresponding tag_score from the profile.
 *   Normalize against the sum of the user's top-5 positive scores (i.e. a meal
 *   that matches their strongest preferences scores ~100).
 *   Clamp to 0..100. Returns null if the profile is locked or missing.
 *
 * Keys in tag_scores are "field::value" (e.g. "flavor::garlicky",
 * "protein::chicken"). Must match the key format used in tasteProfile.js.
 */
import type { SearchableMeal } from './mealSearch';

/**
 * Shape of the taste profile doc at users/{uid}/taste_profile/summary.
 * Only the fields we actually read here are declared.
 */
export interface TasteProfile {
  tag_counts?: Record<string, number>;
  tag_scores?: Record<string, number>;
  top_flavors?: string[];
  top_cuisines?: string[];
  top_proteins?: string[];
  top_cooking_methods?: string[];
  top_dietary?: string[];
  avoid_tags?: string[];
  discovered?: {
    flavors?: string[];
    cuisines?: string[];
    proteins?: string[];
    carbs?: string[];
    cooking_methods?: string[];
    dietary?: string[];
    textures?: string[];
  };
  signature_dish?: {
    mealId: string;
    mealName: string;
    photoUrl: string;
    rating: number;
    repeat_count: number;
  } | null;
  meal_count?: number;
  unique_cuisines_count?: number;
  unique_cities_count?: number;
  tier?: 'locked' | 'basic' | 'full' | 'refined';
}

// =============================================================================
// Tag extraction (mirrors extractTagsFromMeal in functions/tasteProfile.js)
// =============================================================================

interface Tag {
  field: string;
  value: string;
}

function pushIfString(tags: Tag[], field: string, value: unknown, opts?: { skipNone?: boolean }) {
  if (typeof value !== 'string') return;
  const v = value.toLowerCase().trim();
  if (!v) return;
  if (opts?.skipNone && v === 'none') return;
  tags.push({ field, value: v });
}

function pushArray(tags: Tag[], field: string, values: unknown) {
  if (!Array.isArray(values)) return;
  for (const v of values) pushIfString(tags, field, v);
}

/**
 * Extract the same { field, value } tags from a meal that the Cloud Function
 * writes into tag_scores. If this drifts from tasteProfile.js, scoring breaks.
 */
export function extractMealTags(meal: SearchableMeal): Tag[] {
  const tags: Tag[] = [];
  const meta = meal.metadata_enriched;
  if (!meta) return tags;

  pushArray(tags, 'flavor', meta.flavor_profile);
  pushArray(tags, 'dietary', meta.dietary_info);
  pushArray(tags, 'texture', meta.texture);
  pushIfString(tags, 'cookingMethod', meta.cooking_method);
  pushIfString(tags, 'protein', meta.primary_protein, { skipNone: true });
  pushIfString(tags, 'carb', meta.primary_carb, { skipNone: true });
  pushIfString(tags, 'mealType', meta.meal_type);
  pushIfString(tags, 'richness', meta.richness);

  // Heat: skip 'none'
  if (typeof meta.heat_level === 'string') {
    const h = meta.heat_level.toLowerCase().trim();
    if (h && h !== 'none') tags.push({ field: 'heat', value: h });
  }

  // Cuisine: open vocab, filter obvious junk
  if (typeof meta.cuisine_type === 'string') {
    const c = meta.cuisine_type.toLowerCase().trim();
    if (c && c !== 'unknown' && c !== 'n/a') {
      tags.push({ field: 'cuisine', value: c });
    }
  }

  return tags;
}

// =============================================================================
// Scoring
// =============================================================================

/**
 * Compute a 0..100 taste match score for a meal against a taste profile.
 *
 * Returns null when:
 *   - profile is missing or null
 *   - profile.tier is 'locked' (not enough data to judge)
 *   - profile.tag_scores is empty
 *
 * Returns 0..100 otherwise. Higher = better match.
 */
export function computeTasteMatch(
  meal: SearchableMeal,
  profile: TasteProfile | null | undefined
): number | null {
  if (!profile) return null;
  if (profile.tier === 'locked') return null;

  const scores = profile.tag_scores || {};
  const keys = Object.keys(scores);
  if (keys.length === 0) return null;

  const tags = extractMealTags(meal);
  if (tags.length === 0) return 0;

  // Sum the user's scores for each tag present on the meal.
  let raw = 0;
  for (const { field, value } of tags) {
    const key = `${field}::${value}`;
    const s = scores[key];
    if (typeof s === 'number') raw += s;
  }

  // Normalization denominator: sum of the top-5 POSITIVE scores in the profile.
  // This represents the "best possible meal for this user" score.
  const positiveScores = Object.values(scores)
    .filter((s) => s > 0)
    .sort((a, b) => b - a);
  const denom = positiveScores.slice(0, 5).reduce((acc, s) => acc + s, 0);

  if (denom <= 0) return 0;

  // Map raw score into 0..100. A meal that hits the top-5 exactly → 100.
  // Meals with negative contributions pull below 50 baseline.
  // We use a linear mapping anchored at: raw=0 → 50 (neutral), raw=denom → 100.
  // That means a meal matching all top-5 preferences is 100, a meal with no
  // tag overlap sits at 50, and strongly disliked meals drop toward 0.
  const halfDenom = denom / 2;
  const score = 50 + (raw / halfDenom) * 50;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Threshold above which a meal is "a good match" — used by the feed badge.
 */
export const TASTE_MATCH_BADGE_THRESHOLD = 75;
