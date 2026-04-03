/**
 * Pixel Art Order Service
 * Manages custom emoji ordering and table structure on user profiles.
 * Data is stored on the user document in Firestore.
 */

import { firestore } from '../firebaseConfig';

export interface PixelArtLayout {
  order: string[];       // flat emoji URL array (order preserved)
  tableSizes: number[];  // how many emojis per table, e.g. [18, 18, 15, 10]
}

/**
 * Load saved pixel art layout from a user's profile
 */
export const loadPixelArtLayout = async (userId: string): Promise<PixelArtLayout | null> => {
  try {
    const userDoc = await firestore().collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData?.pixel_art_emoji_order?.length) return null;

    return {
      order: userData.pixel_art_emoji_order,
      tableSizes: userData.pixel_art_table_sizes || [],
    };
  } catch (error) {
    console.error('PixelArtOrderService: Error loading layout:', error);
    return null;
  }
};

/**
 * Save pixel art layout (order + table sizes) to a user's profile
 */
export const savePixelArtLayout = async (
  userId: string,
  tables: string[][],
): Promise<void> => {
  try {
    // Flatten tables to a single order array
    const flat = tables.reduce((acc, t) => [...acc, ...t], []);
    // Only persist Firebase Storage URLs — base64 data strings are too large
    // for Firestore. Base64 emojis will appear at the end on next load.
    const urlsOnly = flat.filter(url => !url.startsWith('data:'));

    // Store table sizes so we can reconstruct the table structure on load.
    // Adjust sizes to account for filtered base64 entries.
    const tableSizes: number[] = [];
    let flatIdx = 0;
    for (const table of tables) {
      let urlCount = 0;
      for (const url of table) {
        if (!url.startsWith('data:')) urlCount++;
      }
      tableSizes.push(urlCount);
      flatIdx += table.length;
    }

    await firestore().collection('users').doc(userId).update({
      pixel_art_emoji_order: urlsOnly,
      pixel_art_table_sizes: tableSizes,
    });
    console.log('PixelArtOrderService: Layout saved');
  } catch (error) {
    console.error('PixelArtOrderService: Error saving layout:', error);
    throw error;
  }
};

/**
 * Reconcile saved layout with current emojis.
 * Returns a table structure (string[][]) preserving saved table sizes.
 * New emojis are appended to the last table.
 */
export const reconcilePixelArtLayout = (
  currentEmojis: string[],
  layout: PixelArtLayout,
  maxPerTable: number,
): string[][] => {
  const currentSet = new Set(currentEmojis);

  // Step 1: Reconstruct tables from saved order using saved sizes FIRST,
  // THEN filter deleted items within each table. This preserves table
  // boundaries — a deletion in Table 3 only affects Table 3.
  let rawTables: string[][] = [];
  let idx = 0;
  if (layout.tableSizes.length > 0) {
    for (const size of layout.tableSizes) {
      // Slice the saved order by original table size
      const originalTable = layout.order.slice(idx, idx + size);
      // Filter to only items that still exist
      const filtered = originalTable.filter(url => currentSet.has(url));
      if (filtered.length > 0) {
        rawTables.push(filtered);
      }
      idx += size;
    }
    // Any remaining saved items not covered by sizes
    if (idx < layout.order.length) {
      const remainder = layout.order.slice(idx).filter(url => currentSet.has(url));
      if (remainder.length > 0) {
        if (rawTables.length > 0) {
          rawTables[rawTables.length - 1].push(...remainder);
        } else {
          rawTables.push(remainder);
        }
      }
    }
  } else {
    // No saved table sizes — filter then chunk
    const cleaned = layout.order.filter(url => currentSet.has(url));
    for (let i = 0; i < cleaned.length; i += maxPerTable) {
      rawTables.push(cleaned.slice(i, i + maxPerTable));
    }
  }

  // Find new emojis not in saved order
  const placedSet = new Set(layout.order.filter(url => currentSet.has(url)));
  const newEmojis = currentEmojis.filter(url => !placedSet.has(url));

  // Consolidate: merge undersized tables into their neighbors.
  // A table is "undersized" if it has fewer than half a row (< columns/2 = 3).
  // Merge small trailing tables into the previous one if they fit.
  const minTableSize = 3; // less than half a row
  const tables: string[][] = [];
  for (const table of rawTables) {
    if (tables.length > 0 && table.length < minTableSize) {
      const prev = tables[tables.length - 1];
      if (prev.length + table.length <= maxPerTable) {
        prev.push(...table);
        continue;
      }
    }
    tables.push([...table]);
  }
  // Also merge the last table backward if it's tiny
  if (tables.length >= 2) {
    const last = tables[tables.length - 1];
    const secondLast = tables[tables.length - 2];
    if (last.length < minTableSize && secondLast.length + last.length <= maxPerTable) {
      secondLast.push(...last);
      tables.pop();
    }
  }

  // Append new emojis to the last table (or create a new one)
  if (newEmojis.length > 0) {
    if (tables.length === 0) {
      tables.push([]);
    }
    let lastTable = tables[tables.length - 1];
    for (const emoji of newEmojis) {
      if (lastTable.length < maxPerTable) {
        lastTable.push(emoji);
      } else {
        // Last table is full, create a new one and update reference
        const newTable = [emoji];
        tables.push(newTable);
        lastTable = newTable;
      }
    }
  }

  return tables;
};
