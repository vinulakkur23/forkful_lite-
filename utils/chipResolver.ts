/**
 * chipResolver — turn a user's taste profile into a personalized chip strip.
 *
 * The canonical taxonomies are small and stable, so we maintain a hand-written
 * lookup that maps every canonical value to the filter type it belongs to.
 * Given a taste profile, we pick up to 8 chips from the user's top tags and
 * return them in render-ready form.
 *
 * If the profile is locked or has no top tags, callers should fall back to
 * DEFAULT_CHIPS.
 */
import type { TasteProfile } from './tasteMatch';

export interface Chip {
  label: string;
  type: string;
  value: string;
}

// Hand-written map: canonical value → filter type used by
// SimpleFilterComponent / FoodPassportScreen filter application logic.
// Keep in sync with /constants/canonicalVocab.ts.
export const TAG_TO_FILTER_TYPE: Record<string, string> = {
  // dietary_info → 'dietary'
  vegetarian: 'dietary',
  vegan: 'dietary',
  pescatarian: 'dietary',
  'gluten-free': 'dietary',
  'dairy-free': 'dietary',
  'nut-free': 'dietary',
  halal: 'dietary',
  kosher: 'dietary',
  keto: 'dietary',
  'low-carb': 'dietary',
  'high-protein': 'dietary',
  'low-calorie': 'dietary',
  raw: 'dietary',
  organic: 'dietary',
  'contains-alcohol': 'dietary',

  // flavor_profile → 'flavor'
  savory: 'flavor',
  sweet: 'flavor',
  sour: 'flavor',
  bitter: 'flavor',
  umami: 'flavor',
  salty: 'flavor',
  tangy: 'flavor',
  smoky: 'flavor',
  herbaceous: 'flavor',
  mild: 'flavor',
  garlicky: 'flavor',
  buttery: 'flavor',
  cheesy: 'flavor',
  fresh: 'flavor',
  acidic: 'flavor',
  earthy: 'flavor',
  aromatic: 'flavor',

  // cooking_method → 'cookingMethod'
  grilled: 'cookingMethod',
  fried: 'cookingMethod',
  baked: 'cookingMethod',
  roasted: 'cookingMethod',
  steamed: 'cookingMethod',
  braised: 'cookingMethod',
  sauteed: 'cookingMethod',
  smoked: 'cookingMethod',
  boiled: 'cookingMethod',
  // 'raw' already mapped to dietary above — cooking_method 'raw' is ambiguous
  // at the tag level; callers that care should use field-aware resolution.

  // primary_protein → 'protein'
  beef: 'protein',
  chicken: 'protein',
  pork: 'protein',
  fish: 'protein',
  shellfish: 'protein',
  tofu: 'protein',
  egg: 'protein',
  lamb: 'protein',

  // primary_carb → 'carb'
  rice: 'carb',
  noodles: 'carb',
  bread: 'carb',
  potato: 'carb',
  tortilla: 'carb',

  // texture → 'texture'
  crispy: 'texture',
  creamy: 'texture',
  crunchy: 'texture',
  tender: 'texture',
  chewy: 'texture',
  flaky: 'texture',
  juicy: 'texture',
  soft: 'texture',

  // meal_type → 'mealType'
  breakfast: 'mealType',
  brunch: 'mealType',
  lunch: 'mealType',
  dinner: 'mealType',
  snack: 'mealType',
  dessert: 'mealType',
};

function humanize(value: string): string {
  return value
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Default fallback chips — used when the taste profile is locked or missing.
 * Matches the original hardcoded QUICK_FILTER_CHIPS that shipped with the
 * metadata consolidation work.
 */
export const DEFAULT_CHIPS: Chip[] = [
  { label: 'Vegetarian', type: 'dietary', value: 'vegetarian' },
  { label: 'Spicy', type: 'heat', value: 'medium' },
  { label: 'Grilled', type: 'cookingMethod', value: 'grilled' },
  { label: 'Breakfast', type: 'mealType', value: 'breakfast' },
  { label: 'Chicken', type: 'protein', value: 'chicken' },
  { label: 'Noodles', type: 'carb', value: 'noodles' },
  { label: 'Rich', type: 'richness', value: 'rich' },
  { label: 'Crispy', type: 'texture', value: 'crispy' },
];

/**
 * Build a personalized chip strip from the user's taste profile.
 *
 * Strategy: interleave top values across fields so the strip feels varied
 * (a user whose top_flavors are all similar doesn't get 8 flavor chips).
 * Falls back to DEFAULT_CHIPS when the profile is locked.
 */
export function buildDynamicChips(
  profile: TasteProfile | null | undefined,
  limit: number = 8
): Chip[] {
  if (!profile || profile.tier === 'locked') return DEFAULT_CHIPS;

  // Pull the top value(s) from each field in a priority order. Interleaving
  // gives the strip variety.
  const ordered: Array<{ field: string; value: string }> = [];

  const push = (field: string, values: string[] | undefined) => {
    if (!values) return;
    for (const v of values) ordered.push({ field, value: v });
  };

  // Priority: one of each field first (breadth), then 2nd-best of each
  const topFlavors = profile.top_flavors || [];
  const topProteins = profile.top_proteins || [];
  const topCuisines = profile.top_cuisines || [];
  const topCooking = profile.top_cooking_methods || [];
  const topDietary = profile.top_dietary || [];

  const maxRounds = 3;
  for (let i = 0; i < maxRounds; i++) {
    if (topFlavors[i]) ordered.push({ field: 'flavor', value: topFlavors[i] });
    if (topProteins[i]) ordered.push({ field: 'protein', value: topProteins[i] });
    if (topCuisines[i]) ordered.push({ field: 'cuisineType', value: topCuisines[i] });
    if (topCooking[i]) ordered.push({ field: 'cookingMethod', value: topCooking[i] });
    if (topDietary[i]) ordered.push({ field: 'dietary', value: topDietary[i] });
  }

  // Dedupe and cap
  const seen = new Set<string>();
  const chips: Chip[] = [];
  for (const { field, value } of ordered) {
    const key = `${field}::${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push({
      label: humanize(value),
      type: field,
      value,
    });
    if (chips.length >= limit) break;
  }

  // If we somehow ended up with nothing, fall back
  if (chips.length === 0) return DEFAULT_CHIPS;
  return chips;
}

/**
 * Build a city-chip strip from the existing `users/{uid}.uniqueCities` array.
 * This is standalone from the taste profile — it works for any user with
 * uniqueCities populated by the existing count-refresh Cloud Function.
 *
 * Dedupes case-insensitively (so "Venice" and "venice" collapse to one chip)
 * and always emits a Title-Cased label AND value. The filter application
 * logic in FoodPassportScreen compares city filters case-insensitively, so
 * standardizing the value to Title Case doesn't break existing filters.
 */
export function buildCityChips(
  uniqueCities: string[] | undefined | null,
  limit: number = 10
): Chip[] {
  if (!Array.isArray(uniqueCities) || uniqueCities.length === 0) return [];

  const titleCase = (s: string) =>
    s
      .trim()
      .split(/\s+/)
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
      .join(' ');

  const seen = new Set<string>();
  const chips: Chip[] = [];
  for (const raw of uniqueCities) {
    if (typeof raw !== 'string') continue;
    const key = raw.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const display = titleCase(raw);
    chips.push({ label: display, type: 'city', value: display });
    if (chips.length >= limit) break;
  }
  return chips;
}
