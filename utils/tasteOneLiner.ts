/**
 * tasteOneLiner — deterministic one-liner summary of a user's taste profile.
 *
 * No LLM. Pure string templates driven by the top tags written by the
 * functions/tasteProfile.js Cloud Function. Phase H layers three tiers of copy:
 *
 *   locked (0–4):   "Log N more meals to unlock your taste profile."
 *   basic  (5–9):   "You lean garlicky — chicken is your go-to." (simple)
 *   enhanced(10–14):"Your top ratings skew garlicky and rich — especially
 *                    chicken with crispy texture. Sweet dishes rarely make
 *                    your list." (rating-framed, uses avoid_tags + texture)
 *   full/refined:   LLM-generated taste story (see functions/tasteStory.js).
 *                    Falls back to the enhanced template if not yet generated.
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

  if (tier === 'enhanced') {
    return buildTasteOneLinerEnhanced(profile);
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
 * Enhanced tier template (Phase H, 10–14 meals).
 *
 * Uses rating-weighted framing ("Your top ratings skew…") rather than
 * frequency framing ("You like…"), and weaves in avoid_tags, top_textures,
 * and signature dish repeat count when available.
 *
 * Priority of signals:
 *   1. top_flavors[0..1]
 *   2. top_proteins[0]
 *   3. top_textures[0]
 *   4. avoid_tags[0]
 *   5. signature_dish.repeat_count (when ≥ 2)
 */
export function buildTasteOneLinerEnhanced(
  profile: TasteProfile | null | undefined
): string {
  if (!profile) return 'Your taste is still taking shape.';

  const topFlavors = (profile.top_flavors || []).map(humanize);
  const topProteins = (profile.top_proteins || []).map(humanize);
  const topTextures = (profile.top_textures || []).map(humanize);
  const avoidTags = (profile.avoid_tags || []).map(humanize);
  const sig = profile.signature_dish;

  const flavor1 = topFlavors[0];
  const flavor2 = topFlavors[1];
  const protein1 = topProteins[0];
  const texture1 = topTextures[0];
  const avoid1 = avoidTags[0];

  // Build the head clause ("Your top ratings skew ...")
  let head = '';
  if (flavor1 && flavor2) {
    head = `Your top ratings skew ${flavor1} and ${flavor2}`;
  } else if (flavor1) {
    head = `Your favorites lean ${flavor1}`;
  } else if (protein1) {
    head = `${capitalize(protein1)} is your go-to`;
  }

  // Special case: repeated signature dish beats everything — it's our
  // single strongest signal.
  if (sig && sig.repeat_count >= 2 && sig.mealName) {
    if (head) {
      return `${head} — especially ${sig.mealName}, which you've logged ${sig.repeat_count}×.`;
    }
    return `You keep coming back to ${sig.mealName} — logged ${sig.repeat_count}×.`;
  }

  if (!head) return 'Your taste is still taking shape.';

  // "Especially {protein} with {texture} texture"
  const extras: string[] = [];
  if (protein1) {
    if (texture1) {
      extras.push(`especially ${protein1} with ${texture1} texture`);
    } else {
      extras.push(`especially ${protein1}`);
    }
  } else if (texture1) {
    extras.push(`especially anything ${texture1}`);
  }

  const firstSentence = extras.length
    ? `${head} — ${extras[0]}.`
    : `${head}.`;

  // Contrast clause from avoid_tags.
  if (avoid1) {
    return `${firstSentence} ${capitalize(avoid1)} dishes rarely make your list.`;
  }

  return firstSentence;
}

/**
 * Short subtitle for the profile strip when tier === 'basic' or 'enhanced'.
 * Used to hint that more data will refine the picture. Points at the next
 * threshold in the ladder (basic→enhanced=10, enhanced→full=15).
 */
export function buildTasteSubtitle(profile: TasteProfile | null | undefined): string | null {
  if (!profile) return null;
  const meals = profile.meal_count || 0;
  if (profile.tier === 'basic') {
    const remaining = Math.max(0, 10 - meals);
    if (remaining <= 0) return 'Sharpening…';
    return `Log ${remaining} more to sharpen.`;
  }
  if (profile.tier === 'enhanced') {
    const remaining = Math.max(0, 15 - meals);
    if (remaining <= 0) return 'Unlocking your story…';
    return `Log ${remaining} more for your taste story.`;
  }
  return null;
}
