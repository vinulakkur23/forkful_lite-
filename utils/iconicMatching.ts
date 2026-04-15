/**
 * Shared matching helpers for iconic-eat detection. The Cloud Function
 * (functions/iconicEatsUnlock.js) has a JS mirror of these — keep them in sync
 * when changing thresholds or normalization rules.
 *
 * Why trigrams for dish names: users often type a slight variation of the
 * canonical dish name ("Amore Pizza" vs "Apizza Amore Pie"). Trigram Jaccard
 * handles word-order, partial matches, and minor typos with a single cheap
 * set-comparison — no embeddings, no ML, runs in <1ms on typical strings.
 */

const DEFAULT_DISH_TRIGRAM_THRESHOLD = 0.35;
const EARTH_RADIUS_KM = 6371;

/** Strip punctuation, lowercase, collapse whitespace. */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return '';
  let s = String(name).toLowerCase().trim();
  const commaIdx = s.indexOf(',');
  if (commaIdx > 0) s = s.slice(0, commaIdx);
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Loose restaurant-name match — either name is a substring of the other, or
 * they share a token longer than 2 chars. Kept intentionally permissive;
 * always gated behind proximity in the caller.
 */
export function restaurantsLooselyMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const tokensA = new Set(na.split(' ').filter(t => t.length > 2));
  const tokensB = nb.split(' ').filter(t => t.length > 2);
  return tokensB.some(t => tokensA.has(t));
}

/** Build the set of char trigrams for a normalized string. */
function trigrams(s: string): Set<string> {
  const padded = `  ${s}  `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    out.add(padded.slice(i, i + 3));
  }
  return out;
}

/**
 * Jaccard similarity of trigram sets. Returns 0..1.
 * Padding handles short strings and boundary matches.
 */
export function trigramSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = trigrams(na);
  const tb = trigrams(nb);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersect = 0;
  ta.forEach(g => {
    if (tb.has(g)) intersect++;
  });
  const union = ta.size + tb.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

/**
 * Returns true if two dish names are similar enough to consider the same dish.
 * Also returns true if one name is contained in the other after normalization
 * (covers "Margherita" vs "Margherita Pizza" where trigram similarity drops
 * due to the extra word but intent is clearly the same).
 *
 * Threshold is 0.35 by default — empirically catches "Amore Pie" vs "Apizza
 * Amore" while rejecting "Khao Soi" vs "Latte". Tune if false positives appear.
 */
export function dishNamesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
  threshold: number = DEFAULT_DISH_TRIGRAM_THRESHOLD,
): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return trigramSimilarity(na, nb) >= threshold;
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const ICONIC_MATCH_PROXIMITY_KM = 0.05; // 50 meters
export const ICONIC_DISH_TRIGRAM_THRESHOLD = DEFAULT_DISH_TRIGRAM_THRESHOLD;
