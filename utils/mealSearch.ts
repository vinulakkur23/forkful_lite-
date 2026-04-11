/**
 * mealSearch — in-memory text search across meal entries.
 *
 * Searches across canonical v2.0 metadata fields so a user can type
 * "vegetarian spicy" and get all meals that are both vegetarian AND spicy,
 * regardless of how the data was originally tagged.
 *
 * Multi-word queries are AND-ed: every token in the query must match somewhere
 * in the meal's searchable surface. Matching is lowercase substring.
 *
 * Designed to be called from FoodPassportScreen after faceted filters have
 * been applied, so search composes cleanly with quick-filter chips.
 */

export interface SearchableMeal {
  id?: string;
  meal?: string;
  restaurant?: string;
  notes?: string;
  comments?: string;
  thoughts?: string;
  metadata_enriched?: {
    dish_specific?: string;
    dish_general?: string;
    cuisine_type?: string;
    cooking_method?: string;
    meal_type?: string;
    heat_level?: string;
    richness?: string;
    primary_protein?: string;
    primary_carb?: string;
    presentation_style?: string;
    dietary_info?: string[];
    flavor_profile?: string[];
    texture?: string[];
    key_ingredients?: string[];
    interesting_ingredient?: string;
  };
  // Legacy fields — still searched as a fallback for un-migrated meals.
  aiMetadata?: {
    cuisineType?: string;
    foodType?: string | string[];
  };
}

/**
 * Flatten every searchable field of a meal into one lowercase string.
 * The returned haystack is what tokens are matched against.
 */
function buildHaystack(meal: SearchableMeal): string {
  const parts: string[] = [];

  const pushIfString = (v: unknown) => {
    if (typeof v === 'string' && v.length > 0) parts.push(v);
  };
  const pushArray = (v: unknown) => {
    if (Array.isArray(v)) {
      v.forEach(pushIfString);
    }
  };

  // Top-level fields users think about.
  pushIfString(meal.meal);
  pushIfString(meal.restaurant);
  pushIfString(meal.notes);
  pushIfString(meal.comments);
  pushIfString(meal.thoughts);

  const enriched = meal.metadata_enriched;
  if (enriched) {
    pushIfString(enriched.dish_specific);
    pushIfString(enriched.dish_general);
    pushIfString(enriched.cuisine_type);
    pushIfString(enriched.cooking_method);
    pushIfString(enriched.meal_type);
    pushIfString(enriched.heat_level);
    pushIfString(enriched.richness);
    pushIfString(enriched.primary_protein);
    pushIfString(enriched.primary_carb);
    pushIfString(enriched.presentation_style);
    pushIfString(enriched.interesting_ingredient);
    pushArray(enriched.dietary_info);
    pushArray(enriched.flavor_profile);
    pushArray(enriched.texture);
    pushArray(enriched.key_ingredients);
  }

  // Legacy metadata fallback for un-migrated meals.
  if (meal.aiMetadata) {
    pushIfString(meal.aiMetadata.cuisineType);
    if (Array.isArray(meal.aiMetadata.foodType)) {
      pushArray(meal.aiMetadata.foodType);
    } else {
      pushIfString(meal.aiMetadata.foodType);
    }
  }

  // Also treat the word "spicy" as matching any non-"none" heat level, so
  // legacy mental models still work. ("spicy" typed, heat_level: "medium" meal)
  if (enriched?.heat_level && enriched.heat_level !== 'none') {
    parts.push('spicy');
  }

  return parts.join(' ').toLowerCase();
}

/**
 * Tokenize a query into lowercase words. Handles multiple spaces, quotes
 * are ignored (treated as whitespace).
 */
function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/["']/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

/**
 * Search a list of meals against a free-text query.
 *
 * - Empty/whitespace queries return the input unchanged.
 * - All tokens must match (AND semantics).
 * - Matching is lowercase substring on a flattened haystack.
 */
export function searchMeals<T extends SearchableMeal>(
  query: string,
  meals: T[]
): T[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return meals;

  return meals.filter(meal => {
    const haystack = buildHaystack(meal);
    return tokens.every(token => haystack.includes(token));
  });
}

/**
 * Convenience: check if a single meal matches a query.
 * Useful inside existing filter pipelines that already loop over meals.
 */
export function mealMatchesQuery(meal: SearchableMeal, query: string): boolean {
  const tokens = tokenize(query);
  if (tokens.length === 0) return true;
  const haystack = buildHaystack(meal);
  return tokens.every(token => haystack.includes(token));
}
