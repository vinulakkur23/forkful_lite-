/**
 * WordCloud — SVG-based word cloud renderer for React Native.
 *
 * Uses a spiral placement algorithm to position words without overlap.
 * Each word's font size is driven by `normalizedSize` and its color by
 * `normalizedScore` (via `scoreToColor`).
 *
 * No external dependencies beyond react-native-svg (already installed).
 */
import React, {useMemo} from 'react';
import Svg, {Text as SvgText, G} from 'react-native-svg';
import type {WordCloudItem} from '../utils/wordCloudData';
import {scoreToColor} from '../utils/wordCloudData';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WordCloudProps {
  items: WordCloudItem[];
  width: number;
  height: number;
  onWordPress?: (item: WordCloudItem) => void;
  minFontSize?: number;
  maxFontSize?: number;
}

interface PlacedWord {
  item: WordCloudItem;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  fontWeight: string;
  color: string;
  rotation: number;
}

// ---------------------------------------------------------------------------
// Seeded PRNG (deterministic layout — same data = same cloud every render)
// ---------------------------------------------------------------------------

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ---------------------------------------------------------------------------
// AABB overlap test
// ---------------------------------------------------------------------------

interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: AABB, b: AABB): boolean {
  return !(
    a.x + a.w / 2 < b.x - b.w / 2 ||
    a.x - a.w / 2 > b.x + b.w / 2 ||
    a.y + a.h / 2 < b.y - b.h / 2 ||
    a.y - a.h / 2 > b.y + b.h / 2
  );
}

function inBounds(box: AABB, canvasW: number, canvasH: number): boolean {
  return (
    box.x - box.w / 2 >= 0 &&
    box.x + box.w / 2 <= canvasW &&
    box.y - box.h / 2 >= 0 &&
    box.y + box.h / 2 <= canvasH
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function layoutWords(
  items: WordCloudItem[],
  width: number,
  height: number,
  minFont: number,
  maxFont: number,
): PlacedWord[] {
  if (width <= 0 || height <= 0 || items.length === 0) return [];

  const rng = seededRng(42);

  // 1. Compute visual properties for each item.
  const withVisuals = items
    .map((item) => {
      const fontSize = minFont + item.normalizedSize * (maxFont - minFont);
      const fontWeight =
        item.normalizedSize > 0.7
          ? '700'
          : item.normalizedSize > 0.4
            ? '600'
            : '400';
      const color = scoreToColor(item.normalizedScore);

      // Subtle rotation for all words — gives an organic, hand-placed feel.
      const rotation = (rng() - 0.5) * 16; // ±8°

      // Estimate bounding box.
      const charWidth = fontSize * 0.55;
      const w = item.label.length * charWidth + 8;
      const h = fontSize * 1.3;

      return {item, fontSize, fontWeight, color, rotation, w, h};
    })
    // 2. Sort by fontSize desc — place biggest first.
    .sort((a, b) => b.fontSize - a.fontSize);

  // 3. Spiral placement.
  const placed: PlacedWord[] = [];
  const cx = width / 2;
  const cy = height / 2;

  for (const entry of withVisuals) {
    let found = false;
    let angle = rng() * Math.PI * 2; // random start angle per word
    let radius = 0;

    for (let attempt = 0; attempt < 250; attempt++) {
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;

      const candidate: AABB = {x, y, w: entry.w, h: entry.h};

      if (inBounds(candidate, width, height)) {
        const collides = placed.some((p) => overlaps(candidate, p));
        if (!collides) {
          placed.push({...entry, x, y});
          found = true;
          break;
        }
      }

      angle += 0.3;
      radius += 1.2;
    }

    // Skip unplaceable words rather than overlapping.
    if (!found) continue;
  }

  return placed;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const WordCloud: React.FC<WordCloudProps> = ({
  items,
  width,
  height,
  onWordPress,
  minFontSize = 11,
  maxFontSize = 28,
}) => {
  const placedWords = useMemo(
    () => layoutWords(items, width, height, minFontSize, maxFontSize),
    [items, width, height, minFontSize, maxFontSize],
  );

  if (placedWords.length === 0) return null;

  return (
    <Svg width={width} height={height}>
      {placedWords.map((w) => (
        <G
          key={w.item.rawKey}
          rotation={w.rotation}
          origin={`${w.x}, ${w.y}`}
        >
          <SvgText
            x={w.x}
            y={w.y}
            fontSize={w.fontSize}
            fill={w.color}
            fontFamily="Inter-Regular"
            fontWeight={w.fontWeight}
            textAnchor="middle"
            alignmentBaseline="central"
            onPress={onWordPress ? () => onWordPress(w.item) : undefined}
          >
            {w.item.label}
          </SvgText>
        </G>
      ))}
    </Svg>
  );
};

export default WordCloud;
