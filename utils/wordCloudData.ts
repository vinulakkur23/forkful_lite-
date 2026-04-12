/**
 * wordCloudData — transforms a TasteProfile's tag_counts + tag_scores into
 * a flat array of items ready for the WordCloud renderer.
 *
 * Each item carries:
 *   - normalizedSize  (0..1)  — derived from raw count. Controls font size.
 *   - normalizedScore (-1..1) — derived from rating-weighted score. Controls color.
 *
 * Color interpolation: gray (#858585) → taupe (#8B7355) → green (#3A8F5C).
 */
import type {TasteProfile} from './tasteMatch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WordCloudItem {
  /** Display label, e.g. "Garlicky" */
  label: string;
  /** Raw field key: "flavor", "protein", "texture", "cookingMethod" */
  field: string;
  /** Original tag_counts / tag_scores key, e.g. "flavor::garlicky" */
  rawKey: string;
  /** Raw count of meals containing this tag */
  count: number;
  /** Rating-weighted score (can be negative) */
  score: number;
  /** 0..1 — proportional to count within the selected set */
  normalizedSize: number;
  /** -1..1 — proportional to score within the selected set */
  normalizedScore: number;
}

// ---------------------------------------------------------------------------
// Word cloud categories — each renders as its own mini cloud
// ---------------------------------------------------------------------------

export interface WordCloudCategory {
  key: string;
  label: string;
  fields: string[];
}

export const WORD_CLOUD_CATEGORIES: WordCloudCategory[] = [
  {key: 'flavors', label: 'Flavors & Textures', fields: ['flavor', 'texture']},
  {key: 'proteins', label: 'Proteins', fields: ['protein']},
  {key: 'methods', label: 'Cooking Methods', fields: ['cookingMethod']},
];

// ---------------------------------------------------------------------------
// Color stops for the 3-stop gradient
// ---------------------------------------------------------------------------

const COLOR_STOPS: [number, [number, number, number]][] = [
  [-1, [0xb0, 0xb0, 0xb0]], // light gray   — neutral / low preference
  [0, [0x7a, 0xa3, 0x88]],  // muted green  — mid preference
  [1, [0x3a, 0x8f, 0x5c]],  // tasteGreen   — loved
];

function hexFromRgb(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    clamp(r).toString(16).padStart(2, '0') +
    clamp(g).toString(16).padStart(2, '0') +
    clamp(b).toString(16).padStart(2, '0')
  );
}

/**
 * Map a normalizedScore (-1..1) to a hex color via 3-stop linear interpolation.
 */
export function scoreToColor(ns: number): string {
  const s = Math.max(-1, Math.min(1, ns));

  // Find the two stops that bracket `s`.
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const [lo, loRgb] = COLOR_STOPS[i];
    const [hi, hiRgb] = COLOR_STOPS[i + 1];
    if (s >= lo && s <= hi) {
      const t = hi === lo ? 0.5 : (s - lo) / (hi - lo);
      return hexFromRgb(
        loRgb[0] + (hiRgb[0] - loRgb[0]) * t,
        loRgb[1] + (hiRgb[1] - loRgb[1]) * t,
        loRgb[2] + (hiRgb[2] - loRgb[2]) * t,
      );
    }
  }
  // Fallback — shouldn't happen with clamped input.
  return '#8B7355';
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

function humanize(raw: string): string {
  const s = raw.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Build a list of WordCloudItems from a TasteProfile for specific fields.
 *
 * Size and color are normalized **per field** so that, e.g., textures compete
 * only against other textures and flavors only against other flavors — even
 * when they're rendered in the same cloud. This prevents a high-count flavor
 * from making every texture look tiny.
 *
 * @param profile  The user's taste profile (must have tag_counts / tag_scores).
 * @param fields   Which tag fields to include (e.g. ['flavor', 'texture']).
 * @param maxWords Optional cap on word count per field (default: no cap).
 */
export function buildWordCloudItems(
  profile: TasteProfile,
  fields: string[],
  maxWords?: number,
): WordCloudItem[] {
  const counts = profile.tag_counts || {};
  const scores = profile.tag_scores || {};
  const fieldSet = new Set(fields);

  // 1. Group raw entries by field.
  const byField: Record<string, {key: string; field: string; value: string; count: number; score: number}[]> = {};
  for (const [key, count] of Object.entries(counts)) {
    if (typeof count !== 'number' || count <= 0) continue;
    const sep = key.indexOf('::');
    if (sep === -1) continue;
    const field = key.slice(0, sep);
    const value = key.slice(sep + 2);
    if (!fieldSet.has(field)) continue;
    if (!value) continue;
    if (!byField[field]) byField[field] = [];
    byField[field].push({key, field, value, count, score: (scores[key] as number) || 0});
  }

  // 2. Normalize each field independently, then merge.
  const result: WordCloudItem[] = [];

  for (const entries of Object.values(byField)) {
    // Sort by count desc, optionally cap per field.
    entries.sort((a, b) => b.count - a.count);
    const selected = maxWords ? entries.slice(0, maxWords) : entries;
    if (selected.length === 0) continue;

    // Size normalization within this field.
    const minCount = Math.min(...selected.map((s) => s.count));
    const maxCount = Math.max(...selected.map((s) => s.count));
    const countRange = maxCount - minCount || 1;

    // Score normalization within this field.
    const fieldScores = selected.map((s) => s.score);
    const minScore = Math.min(...fieldScores);
    const maxScore = Math.max(...fieldScores);
    const scoreRange = maxScore - minScore || 1;

    for (const s of selected) {
      result.push({
        label: humanize(s.value),
        field: s.field,
        rawKey: s.key,
        count: s.count,
        score: s.score,
        normalizedSize: (s.count - minCount) / countRange,
        normalizedScore: ((s.score - minScore) / scoreRange) * 2 - 1,
      });
    }
  }

  return result;
}
