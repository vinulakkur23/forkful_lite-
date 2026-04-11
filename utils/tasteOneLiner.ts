/**
 * tasteOneLiner — deterministic one-liner summary of a user's taste profile.
 *
 * No LLM. Pure string templates driven by the top tags written by the
 * functions/tasteProfile.js Cloud Function. Examples:
 *
 *   locked:  "Log 5 meals to unlock your taste profile."
 *   basic:   "You like chicken and lean garlicky."
 *   full:    "You lean toward garlicky, rich meals — especially chicken and Thai."
 *
 * The template gets richer as more data is available, which creates a
 * satisfying "the app learns me" moment as users log more meals.
 */
import type { TasteProfile } from './tasteMatch';

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Turn canonical tag values into presentable display strings.
 * (e.g. "high-protein" → "high protein", "very-hot" → "very hot")
 */
function humanize(tag: string | undefined): string {
  if (!tag) return '';
  return tag.replace(/-/g, ' ');
}

/**
 * Build a one-liner for the profile strip. Returns a string appropriate for
 * the user's tier. Callers may further wrap in quotes, emoji, etc.
 */
export function buildTasteOneLiner(profile: TasteProfile | null | undefined): string {
  if (!profile) return 'Log 5 meals to unlock your taste profile.';

  const tier = profile.tier || 'locked';
  if (tier === 'locked') {
    const meals = profile.meal_count || 0;
    const remaining = Math.max(0, 5 - meals);
    if (remaining === 0) {
      return 'Unlocking your taste profile…';
    }
    const mealWord = remaining === 1 ? 'meal' : 'meals';
    return `Log ${remaining} more ${mealWord} to unlock your taste profile.`;
  }

  const topFlavors = (profile.top_flavors || []).map(humanize);
  const topCuisines = (profile.top_cuisines || []).map(humanize);
  const topProteins = (profile.top_proteins || []).map(humanize);

  const flavor1 = topFlavors[0];
  const flavor2 = topFlavors[1];
  const cuisine1 = topCuisines[0];
  const protein1 = topProteins[0];

  if (tier === 'basic') {
    // Prefer protein + flavor. Fall back gracefully if either is missing.
    if (protein1 && flavor1) {
      return `You like ${protein1} and lean ${flavor1}.`;
    }
    if (flavor1 && flavor2) {
      return `You lean ${flavor1} and ${flavor2}.`;
    }
    if (flavor1) return `You lean ${flavor1}.`;
    if (protein1) return `${capitalize(protein1)} is your go-to.`;
    if (cuisine1) return `${capitalize(cuisine1)} is your go-to cuisine.`;
    return 'Your taste is still taking shape.';
  }

  // full / refined — include two flavors + protein + cuisine when possible
  const parts: string[] = [];
  if (flavor1 && flavor2) {
    parts.push(`You lean toward ${flavor1}, ${flavor2} meals`);
  } else if (flavor1) {
    parts.push(`You lean toward ${flavor1} meals`);
  } else {
    parts.push('You have a clear taste');
  }

  const tail: string[] = [];
  if (protein1) tail.push(protein1);
  if (cuisine1 && cuisine1 !== protein1) tail.push(capitalize(cuisine1));

  if (tail.length === 2) {
    return `${parts[0]} — especially ${tail[0]} and ${tail[1]}.`;
  }
  if (tail.length === 1) {
    return `${parts[0]} — especially ${tail[0]}.`;
  }
  return `${parts[0]}.`;
}

/**
 * Short subtitle for the profile strip when tier === 'basic'.
 * Used to hint that more data will refine the picture.
 */
export function buildTasteSubtitle(profile: TasteProfile | null | undefined): string | null {
  if (!profile) return null;
  if (profile.tier === 'basic') {
    const meals = profile.meal_count || 0;
    const remaining = Math.max(0, 15 - meals);
    if (remaining <= 0) return 'Refining…';
    return `Log ${remaining} more to refine.`;
  }
  return null;
}
