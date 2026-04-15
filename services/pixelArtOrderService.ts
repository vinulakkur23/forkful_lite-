/**
 * Pixel Art Order Service
 * Manages custom emoji ordering and table structure on user profiles.
 * Data is stored on the user document in Firestore.
 */

import { firestore } from '../firebaseConfig';

// --- Types ---

export type FurnitureType = 'wooden_table'; // extend later: 'picnic_blanket' | 'bookshelf'

export interface TableConfig {
  columns: number;
  maxRows: number;
  furniture: FurnitureType;
}

export const TABLE_PRESETS = {
  small: { columns: 3, maxRows: 3, furniture: 'wooden_table' as const },  // 9 items
  large: { columns: 6, maxRows: 3, furniture: 'wooden_table' as const },  // 18 items
};

export type TablePresetKey = keyof typeof TABLE_PRESETS;

export const DEFAULT_CONFIG: TableConfig = TABLE_PRESETS.large;

export interface PixelArtLayout {
  order: string[];
  tableSizes: number[];
  tableConfigs?: TableConfig[];
}

export interface ReconciledResult {
  tables: string[][];
  configs: TableConfig[];
}

// --- Helpers ---

const getCapacity = (config: TableConfig): number => config.columns * config.maxRows;

const configsEqual = (a: TableConfig, b: TableConfig): boolean =>
  a.columns === b.columns && a.maxRows === b.maxRows && a.furniture === b.furniture;

// --- Load ---

export const loadPixelArtLayout = async (userId: string): Promise<PixelArtLayout | null> => {
  try {
    const userDoc = await firestore().collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData?.pixel_art_emoji_order?.length) return null;

    return {
      order: userData.pixel_art_emoji_order,
      tableSizes: userData.pixel_art_table_sizes || [],
      tableConfigs: userData.pixel_art_table_configs || undefined,
    };
  } catch (error) {
    console.error('PixelArtOrderService: Error loading layout:', error);
    return null;
  }
};

// --- Save ---

export const savePixelArtLayout = async (
  userId: string,
  tables: string[][],
  configs: TableConfig[],
): Promise<void> => {
  try {
    const flat = tables.reduce((acc, t) => [...acc, ...t], []);
    const urlsOnly = flat.filter(url => !url.startsWith('data:'));

    // Compute URL-only table sizes for backward compat
    const tableSizes: number[] = [];
    for (const table of tables) {
      let urlCount = 0;
      for (const url of table) {
        if (!url.startsWith('data:')) urlCount++;
      }
      tableSizes.push(urlCount);
    }

    await firestore().collection('users').doc(userId).update({
      pixel_art_emoji_order: urlsOnly,
      pixel_art_table_sizes: tableSizes,
      pixel_art_table_configs: configs,
    });
    console.log('PixelArtOrderService: Layout saved');
  } catch (error) {
    console.error('PixelArtOrderService: Error saving layout:', error);
    throw error;
  }
};

// --- Save (flat order only) ---

// Used by the simple pixel-art modal on the Food Passport: it only reorders
// the flat list, so we don't want to overwrite the multi-table
// `pixel_art_table_sizes` / `pixel_art_table_configs` that the richer modal
// (currently sunsetted) relies on. When that fancy modal is reopened, its
// reconcile pass will re-chunk the new order into the saved table sizes.
export const savePixelArtOrder = async (
  userId: string,
  flatEmojis: string[],
): Promise<void> => {
  try {
    const urlsOnly = flatEmojis.filter(url => !url.startsWith('data:'));
    await firestore().collection('users').doc(userId).update({
      pixel_art_emoji_order: urlsOnly,
    });
    console.log('PixelArtOrderService: Flat order saved');
  } catch (error) {
    console.error('PixelArtOrderService: Error saving flat order:', error);
    throw error;
  }
};

// --- Reconcile ---

export const reconcilePixelArtLayout = (
  currentEmojis: string[],
  layout: PixelArtLayout,
): ReconciledResult => {
  const currentSet = new Set(currentEmojis);

  // Derive configs: use saved configs, or infer all-large from tableSizes
  const savedConfigs: TableConfig[] = layout.tableConfigs && layout.tableConfigs.length > 0
    ? layout.tableConfigs
    : layout.tableSizes.map(() => ({ ...DEFAULT_CONFIG }));

  // Step 1: Reconstruct tables from saved order using saved sizes,
  // then filter deleted items within each table.
  const rawTables: string[][] = [];
  const rawConfigs: TableConfig[] = [];
  let idx = 0;

  if (layout.tableSizes.length > 0) {
    for (let i = 0; i < layout.tableSizes.length; i++) {
      const size = layout.tableSizes[i];
      const config = savedConfigs[i] || { ...DEFAULT_CONFIG };
      const originalTable = layout.order.slice(idx, idx + size);
      const filtered = originalTable.filter(url => currentSet.has(url));
      if (filtered.length > 0) {
        rawTables.push(filtered);
        rawConfigs.push(config);
      }
      idx += size;
    }
    if (idx < layout.order.length) {
      const remainder = layout.order.slice(idx).filter(url => currentSet.has(url));
      if (remainder.length > 0) {
        if (rawTables.length > 0) {
          rawTables[rawTables.length - 1].push(...remainder);
        } else {
          rawTables.push(remainder);
          rawConfigs.push({ ...DEFAULT_CONFIG });
        }
      }
    }
  } else {
    const cleaned = layout.order.filter(url => currentSet.has(url));
    const cap = getCapacity(DEFAULT_CONFIG);
    for (let i = 0; i < cleaned.length; i += cap) {
      rawTables.push(cleaned.slice(i, i + cap));
      rawConfigs.push({ ...DEFAULT_CONFIG });
    }
  }

  // Find new emojis not in saved order
  const placedSet = new Set(layout.order.filter(url => currentSet.has(url)));
  const newEmojis = currentEmojis.filter(url => !placedSet.has(url));

  // Consolidation: merge undersized tables into neighbors,
  // but ONLY if they share the same config (don't merge a small table into a large one).
  const minTableSize = 3;
  const tables: string[][] = [];
  const configs: TableConfig[] = [];

  for (let i = 0; i < rawTables.length; i++) {
    const table = rawTables[i];
    const config = rawConfigs[i];

    if (tables.length > 0 && table.length < minTableSize) {
      const prevIdx = tables.length - 1;
      const prevConfig = configs[prevIdx];
      if (configsEqual(config, prevConfig) && tables[prevIdx].length + table.length <= getCapacity(prevConfig)) {
        tables[prevIdx].push(...table);
        continue;
      }
    }
    tables.push([...table]);
    configs.push({ ...config });
  }

  // Merge last table backward if tiny and same config
  if (tables.length >= 2) {
    const lastIdx = tables.length - 1;
    const secondLastIdx = lastIdx - 1;
    if (
      tables[lastIdx].length < minTableSize &&
      configsEqual(configs[lastIdx], configs[secondLastIdx]) &&
      tables[secondLastIdx].length + tables[lastIdx].length <= getCapacity(configs[secondLastIdx])
    ) {
      tables[secondLastIdx].push(...tables[lastIdx]);
      tables.pop();
      configs.pop();
    }
  }

  // Append new emojis to the last table (using large preset for overflow)
  if (newEmojis.length > 0) {
    if (tables.length === 0) {
      tables.push([]);
      configs.push({ ...DEFAULT_CONFIG });
    }
    let lastTable = tables[tables.length - 1];
    let lastConfig = configs[configs.length - 1];
    let lastCap = getCapacity(lastConfig);

    for (const emoji of newEmojis) {
      if (lastTable.length < lastCap) {
        lastTable.push(emoji);
      } else {
        const newConfig = { ...DEFAULT_CONFIG };
        const newTable = [emoji];
        tables.push(newTable);
        configs.push(newConfig);
        lastTable = newTable;
        lastConfig = newConfig;
        lastCap = getCapacity(newConfig);
      }
    }
  }

  return { tables, configs };
};
