/**
 * applyHomeFilters — pure version of HomeScreen's filter pipeline.
 *
 * Extracted so screens that share the Discover meal set (HomeScreen,
 * FullMapScreen) can apply the same filter semantics without duplicating
 * the long predicate ladder. No console.log spam, no React state — just
 * (meals, filters) → meals.
 *
 * Semantics mirror the original HomeScreen.applyFilter:
 * - Always strips homemade meals up front.
 * - activeFilters is AND-ed across entries.
 * - 'iconicEats' is a post-filter: keeps only meals with iconic_eat_id.
 * - Rating filter applied last.
 *
 * FullMap-specific additions (behind the optional `opts` argument so
 * HomeScreen stays untouched):
 * - 'following' — keeps meals whose userId is in opts.followingIds.
 * - 'critic'    — keeps meals whose userId is in opts.criticIds.
 * - Canonical-taxonomy types backing personalized taste chips:
 *   'dietary', 'flavor', 'cookingMethod', 'mealType', 'texture',
 *   'heat', 'richness', 'protein', 'carb'. These read from the same
 *   metadata_enriched / enhanced_facts ladders SimpleFilterComponent
 *   uses to *extract* the options, so round-trip is consistent.
 */
import type { FilterItem } from '../components/SimpleFilterComponent';

interface FilterableMeal {
  id: string;
  userId?: string;
  meal?: string;
  restaurant?: string;
  city?: string;
  mealType?: string;
  rating?: number;
  iconic_eat_id?: string | null;
  location?: { city?: string } | null;
  aiMetadata?: any;
  metadata_enriched?: any;
  enhanced_facts?: any;
  quick_criteria_result?: any;
}

export interface ApplyHomeFiltersOpts {
  followingIds?: Set<string> | null;
  criticIds?: Set<string> | null;
}

// Canonical-taxonomy filter types. For each, we try a sequence of data
// locations: first the canonical `metadata_enriched` field, then any
// legacy mirrors on `enhanced_facts` / `aiMetadata`. Each handler
// returns true when the meal matches the filter value.
function matchesCanonicalTag(
  meal: FilterableMeal,
  filterType: string,
  filterValue: string
): boolean {
  const me = meal.metadata_enriched || {};
  const ef = meal.enhanced_facts?.food_facts || {};
  const am = meal.aiMetadata || {};

  const includesCI = (arr: unknown, v: string) =>
    Array.isArray(arr) && arr.some((x: unknown) => typeof x === 'string' && x.toLowerCase() === v.toLowerCase());
  const eqCI = (x: unknown, v: string) =>
    typeof x === 'string' && x.toLowerCase() === v.toLowerCase();

  switch (filterType) {
    case 'dietary':
      return (
        includesCI(me.dietary_info, filterValue) ||
        includesCI(ef.dietary_info, filterValue) ||
        eqCI(am.dietType, filterValue)
      );
    case 'flavor':
      return includesCI(me.flavor_profile, filterValue) || includesCI(ef.flavor_profile, filterValue);
    case 'texture':
      return includesCI(me.texture, filterValue) || includesCI(ef.texture, filterValue);
    case 'cookingMethod':
      return eqCI(me.cooking_method, filterValue) || eqCI(ef.cooking_method, filterValue);
    case 'mealType':
      return eqCI(me.meal_type, filterValue) || eqCI(ef.meal_type, filterValue) || eqCI(meal.mealType, filterValue);
    case 'heat':
      return eqCI(me.heat_level, filterValue) || eqCI(ef.heat_level, filterValue);
    case 'richness':
      return eqCI(me.richness, filterValue) || eqCI(ef.richness, filterValue);
    case 'protein':
      return (
        eqCI(me.primary_protein, filterValue) ||
        eqCI(ef.primary_protein, filterValue) ||
        eqCI(am.primaryProtein, filterValue)
      );
    case 'carb':
      return eqCI(me.primary_carb, filterValue) || eqCI(ef.primary_carb, filterValue);
    default:
      return false;
  }
}

const CANONICAL_FILTER_TYPES = new Set([
  'dietary',
  'flavor',
  'cookingMethod',
  'mealType',
  'texture',
  'heat',
  'richness',
  'protein',
  'carb',
]);

export function applyHomeFilters<T extends FilterableMeal>(
  meals: T[],
  activeFilters: FilterItem[] | null,
  activeRatingFilters: number[] | null,
  opts?: ApplyHomeFiltersOpts
): T[] {
  if (!meals.length) return [];

  // Strip homemade up front
  let result = meals.filter(m => m.mealType !== 'Homemade');

  const iconicChipActive = !!activeFilters?.some(f => f.type === 'iconicEats');

  if (activeFilters && activeFilters.length > 0) {
    activeFilters.forEach(filter => {
      if (filter.type === 'iconicEats') return; // post-filter

      if (filter.type === 'cuisineType') {
        // Case-insensitive: search-bar chips come in Title Case (extracted
        // from meal docs), but personalized taste-profile chips come in
        // lowercase canonical form (e.g. "peruvian" vs stored "Peruvian").
        const target = filter.value.toLowerCase();
        const eqCI = (x: unknown) => typeof x === 'string' && x.toLowerCase() === target;
        result = result.filter(meal => {
          if (eqCI(meal.aiMetadata?.cuisineType)) return true;
          if (eqCI(meal.metadata_enriched?.cuisine_type)) return true;
          if (eqCI(meal.enhanced_facts?.food_facts?.cuisine_type)) return true;
          if (eqCI(meal.quick_criteria_result?.cuisine_type)) return true;
          return false;
        });
      } else if (filter.type === 'foodType') {
        const target = filter.value.toLowerCase();
        const eqCI = (x: unknown) => typeof x === 'string' && x.toLowerCase() === target;
        const includesCI = (arr: unknown) =>
          Array.isArray(arr) && arr.some((x: unknown) => typeof x === 'string' && x.toLowerCase() === target);
        result = result.filter(meal => {
          if (meal.aiMetadata?.foodType) {
            if (Array.isArray(meal.aiMetadata.foodType)) {
              if (includesCI(meal.aiMetadata.foodType)) return true;
            } else if (eqCI(meal.aiMetadata.foodType)) {
              return true;
            }
          }
          if (eqCI(meal.metadata_enriched?.dish_general)) return true;
          if (eqCI(meal.enhanced_facts?.food_facts?.dish_general)) return true;
          if (eqCI(meal.quick_criteria_result?.dish_general)) return true;
          return false;
        });
      } else if (filter.type === 'city') {
        const target = filter.value.toLowerCase();
        result = result.filter(meal => {
          if (meal.city) return meal.city.toLowerCase() === target;
          if (meal.location?.city) return meal.location.city.toLowerCase() === target;
          if (meal.restaurant && meal.restaurant.includes(',')) {
            const parts = meal.restaurant.split(',');
            if (parts.length > 1) {
              const second = parts[1].trim();
              const cityPart = second.includes(' ') ? second.split(' ')[0] : second;
              return cityPart.toLowerCase() === target;
            }
          }
          return false;
        });
      } else if (filter.type === 'dishName') {
        const target = filter.value.toLowerCase();
        result = result.filter(meal => {
          if (meal.meal?.toLowerCase().includes(target)) return true;
          if (meal.metadata_enriched?.dish_specific?.toLowerCase().includes(target)) return true;
          if (meal.enhanced_facts?.food_facts?.dish_specific?.toLowerCase().includes(target)) return true;
          if (meal.quick_criteria_result?.dish_specific?.toLowerCase().includes(target)) return true;
          return false;
        });
      } else if (filter.type === 'ingredient') {
        const target = filter.value.toLowerCase();
        result = result.filter(meal => {
          const enrichedIngs = meal.metadata_enriched?.key_ingredients;
          if (Array.isArray(enrichedIngs) && enrichedIngs.some((i: string) => i.toLowerCase().includes(target))) {
            return true;
          }
          if (meal.metadata_enriched?.interesting_ingredient?.toLowerCase().includes(target)) return true;
          const efIngs = meal.enhanced_facts?.food_facts?.key_ingredients;
          if (Array.isArray(efIngs) && efIngs.some((i: string) => i.toLowerCase().includes(target))) {
            return true;
          }
          return false;
        });
      } else if (filter.type === 'following') {
        // FullMap-only. `opts.followingIds` must be supplied by the caller;
        // if it's missing we treat the filter as matching nothing so stale
        // chips never masquerade as "everyone".
        const ids = opts?.followingIds;
        if (!ids || ids.size === 0) {
          result = [];
        } else {
          result = result.filter(meal => !!meal.userId && ids.has(meal.userId));
        }
      } else if (filter.type === 'critic') {
        const ids = opts?.criticIds;
        if (!ids || ids.size === 0) {
          result = [];
        } else {
          result = result.filter(meal => !!meal.userId && ids.has(meal.userId));
        }
      } else if (CANONICAL_FILTER_TYPES.has(filter.type)) {
        result = result.filter(meal => matchesCanonicalTag(meal, filter.type, filter.value));
      }
    });
  }

  if (activeRatingFilters && activeRatingFilters.length > 0) {
    result = result.filter(meal => meal.rating != null && activeRatingFilters.includes(meal.rating));
  }

  if (iconicChipActive) {
    result = result.filter(meal => !!meal.iconic_eat_id);
  }

  return result;
}
