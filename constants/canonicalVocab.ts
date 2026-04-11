/**
 * canonicalVocab — frontend mirror of the controlled taxonomies enforced by
 * the Python backend normalizer.
 *
 * KEEP IN SYNC with:
 *   /Users/vinulakkur/Apps/Dishitout_ImageEnhancer/services/metadata_normalizer.py
 *
 * This file is the source of truth for:
 *   - Discovery grid totals ("X / 17 flavors discovered")
 *   - Dynamic chip resolution (tag → filter type)
 *   - Any UI that enumerates the canonical vocabulary
 *
 * If you add a value here, also add it to the Python file AND to the Gemini
 * extraction prompt in enhanced_metadata_service.py.
 */

export const CANONICAL_VOCAB = {
  dietary_info: [
    'vegetarian', 'vegan', 'pescatarian', 'gluten-free', 'dairy-free',
    'nut-free', 'halal', 'kosher', 'keto', 'low-carb', 'high-protein',
    'low-calorie', 'raw', 'organic', 'contains-alcohol',
  ],
  flavor_profile: [
    'savory', 'sweet', 'sour', 'bitter', 'umami', 'salty', 'tangy',
    'smoky', 'herbaceous', 'mild', 'garlicky', 'buttery', 'cheesy',
    'fresh', 'acidic', 'earthy', 'aromatic',
  ],
  cooking_method: [
    'grilled', 'fried', 'baked', 'roasted', 'steamed', 'raw', 'braised',
    'sauteed', 'smoked', 'boiled',
  ],
  heat_level: ['none', 'mild', 'medium', 'hot', 'very-hot'],
  richness: ['light', 'medium', 'rich', 'heavy'],
  primary_protein: [
    'beef', 'chicken', 'pork', 'fish', 'shellfish', 'tofu', 'egg',
    'lamb', 'none',
  ],
  primary_carb: [
    'rice', 'noodles', 'bread', 'potato', 'tortilla', 'none',
  ],
  texture: [
    'crispy', 'creamy', 'crunchy', 'tender', 'chewy', 'flaky', 'juicy',
    'soft',
  ],
  meal_type: [
    'breakfast', 'brunch', 'lunch', 'dinner', 'snack', 'dessert',
  ],
  presentation_style: [
    'plated', 'bowl', 'handheld', 'shared', 'casual',
  ],
} as const;

/**
 * Totals exposed for discovery grid X/Y counters.
 * For primary_protein and primary_carb, we exclude 'none' so "X / 9 proteins
 * tried" reflects actual protein diversity instead of counting the absence.
 */
export const VOCAB_TOTALS = {
  dietary_info: CANONICAL_VOCAB.dietary_info.length,
  flavor_profile: CANONICAL_VOCAB.flavor_profile.length,
  cooking_method: CANONICAL_VOCAB.cooking_method.length,
  primary_protein: CANONICAL_VOCAB.primary_protein.filter((v) => v !== 'none').length,
  primary_carb: CANONICAL_VOCAB.primary_carb.filter((v) => v !== 'none').length,
  texture: CANONICAL_VOCAB.texture.length,
  meal_type: CANONICAL_VOCAB.meal_type.length,
} as const;

/**
 * The list of values used in each discovery grid (excludes 'none' from
 * protein/carb).
 */
export const DISCOVERY_VALUES = {
  flavors: [...CANONICAL_VOCAB.flavor_profile],
  cuisines: [] as string[], // open vocab — filled from user data, not enumerated
  proteins: CANONICAL_VOCAB.primary_protein.filter((v) => v !== 'none'),
  carbs: CANONICAL_VOCAB.primary_carb.filter((v) => v !== 'none'),
  cooking_methods: [...CANONICAL_VOCAB.cooking_method],
  dietary: [...CANONICAL_VOCAB.dietary_info],
  textures: [...CANONICAL_VOCAB.texture],
} as const;

/**
 * Humanize a canonical value for display (lowercased canonical → Title Case).
 * "high-protein" → "High Protein", "very-hot" → "Very Hot"
 */
export function humanizeVocab(value: string): string {
  return value
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
