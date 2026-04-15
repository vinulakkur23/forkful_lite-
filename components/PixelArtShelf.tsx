import React, { useMemo, useState } from 'react';
import {
  View,
  Image,
  Dimensions,
  StyleSheet,
  Platform,
  Modal,
  TouchableOpacity,
  Text,
  SafeAreaView,
  ScrollView,
  ActionSheetIOS,
  Alert,
  ImageSourcePropType,
} from 'react-native';
import { colors, spacing } from '../themes';
import DraggableEmojiGrid from './DraggableEmojiGrid';
import { TableConfig, FurnitureType, TABLE_PRESETS, DEFAULT_CONFIG } from '../services/pixelArtOrderService';

// Tile assets — one set per furniture type
const woodenTableTiles = {
  tl: require('../assets/tiles/wooden_table/tl.png'),
  tc: require('../assets/tiles/wooden_table/tc.png'),
  tr: require('../assets/tiles/wooden_table/tr.png'),
  ml: require('../assets/tiles/wooden_table/ml.png'),
  mc: require('../assets/tiles/wooden_table/mc.png'),
  mr: require('../assets/tiles/wooden_table/mr.png'),
  bl: require('../assets/tiles/wooden_table/bl.png'),
  bc: require('../assets/tiles/wooden_table/bc.png'),
  br: require('../assets/tiles/wooden_table/br.png'),
  leg_l: require('../assets/tiles/wooden_table/leg_l.png'),
  leg_r: require('../assets/tiles/wooden_table/leg_r.png'),
};

type TileSet = typeof woodenTableTiles;
type TileKey = keyof TileSet;

const TILE_SETS: Record<FurnitureType, TileSet> = {
  wooden_table: woodenTableTiles,
  // picnic_blanket: picnicBlanketTiles,  // future
};

const HORIZONTAL_PADDING = 16;
const TABLE_GAP = 12;
const DEFAULT_COLUMNS = 6;

// Re-exported so DraggableEmojiGrid can render the wooden-tile background
// directly (the modal's read-only view drives its layout from DraggableEmojiGrid
// now, but still wants the TableGrid aesthetic).
export { TILE_SETS, HORIZONTAL_PADDING, TABLE_GAP };

// Standalone backdrop (tiles + legs, no emojis) for use as a render prop into
// DraggableEmojiGrid. Kept here (rather than in DraggableEmojiGrid) so the
// tile-asset imports live in one place, and to avoid a circular import with
// this file.
export const TableBackdrop: React.FC<{
  columns: number;
  rows: number;           // rows of content; backdrop enforces min 2 internally
  cellSize: number;
  gridWidth: number;
  furniture?: FurnitureType;
  showLegs?: boolean;
}> = ({ columns, rows, cellSize, gridWidth, furniture = 'wooden_table', showLegs = true }) => {
  const tileSet = TILE_SETS[furniture];
  const totalRows = Math.max(2, rows);
  const legHeight = cellSize;
  const height = totalRows * cellSize + (showLegs ? legHeight : 0);

  const cells: Array<{ row: number; col: number; key: TileKey }> = [];
  for (let r = 0; r < totalRows; r++) {
    for (let c = 0; c < columns; c++) {
      cells.push({ row: r, col: c, key: getTileKey(r, c, totalRows, columns) });
    }
  }

  return (
    <View style={[styles.tableContainer, { width: gridWidth, height }]} pointerEvents="none">
      {cells.map(({ row, col, key }) => (
        <Image
          key={`tile_${row}_${col}`}
          source={tileSet[key]}
          style={[
            styles.tile,
            { left: col * cellSize, top: row * cellSize, width: cellSize, height: cellSize },
          ]}
          resizeMode="stretch"
        />
      ))}
      {showLegs && (
        <>
          <Image
            source={tileSet.leg_l}
            style={[
              styles.tile,
              { left: 0, top: totalRows * cellSize, width: cellSize, height: legHeight },
            ]}
            resizeMode="stretch"
          />
          <Image
            source={tileSet.leg_r}
            style={[
              styles.tile,
              { left: (columns - 1) * cellSize, top: totalRows * cellSize, width: cellSize, height: legHeight },
            ]}
            resizeMode="stretch"
          />
        </>
      )}
    </View>
  );
};

const getTileKey = (
  row: number,
  col: number,
  totalRows: number,
  totalCols: number,
): TileKey => {
  const isTop = row === 0;
  const isBottom = row === totalRows - 1;
  const isLeft = col === 0;
  const isRight = col === totalCols - 1;

  if (isTop && isLeft) return 'tl';
  if (isTop && isRight) return 'tr';
  if (isTop) return 'tc';
  if (isBottom && isLeft) return 'bl';
  if (isBottom && isRight) return 'br';
  if (isBottom) return 'bc';
  if (isLeft) return 'ml';
  if (isRight) return 'mr';
  return 'mc';
};

// A single table grid with tile background and emoji overlay
const TableGrid: React.FC<{
  emojis: string[];
  columns: number;
  cellSize: number;
  gridWidth: number;
  furniture?: FurnitureType;
}> = ({ emojis, columns, cellSize, gridWidth, furniture = 'wooden_table' }) => {
  const tileSet = TILE_SETS[furniture];
  const totalRows = Math.max(2, Math.ceil(emojis.length / columns));
  const legHeight = cellSize;
  const gridHeight = totalRows * cellSize + legHeight;

  const tileGrid = useMemo(() => {
    const cells: { row: number; col: number; key: TileKey }[] = [];
    for (let r = 0; r < totalRows; r++) {
      for (let c = 0; c < columns; c++) {
        cells.push({
          row: r,
          col: c,
          key: getTileKey(r, c, totalRows, columns),
        });
      }
    }
    return cells;
  }, [totalRows, columns]);

  const emojiPositions = useMemo(() => {
    return emojis.map((uri, index) => ({
      uri,
      row: Math.floor(index / columns),
      col: index % columns,
    }));
  }, [emojis, columns]);

  const emojiSize = Math.floor(cellSize * 0.75);
  const emojiOffset = Math.floor((cellSize - emojiSize) / 2);

  return (
    <View style={[styles.tableContainer, { width: gridWidth, height: gridHeight }]}>
      {tileGrid.map(({ row, col, key }) => (
        <Image
          key={`tile_${row}_${col}`}
          source={tileSet[key]}
          style={[
            styles.tile,
            {
              left: col * cellSize,
              top: row * cellSize,
              width: cellSize,
              height: cellSize,
            },
          ]}
          resizeMode="stretch"
        />
      ))}
      {/* Table legs */}
      <Image
        source={tileSet.leg_l}
        style={[
          styles.tile,
          {
            left: 0,
            top: totalRows * cellSize,
            width: cellSize,
            height: legHeight,
          },
        ]}
        resizeMode="stretch"
      />
      <Image
        source={tileSet.leg_r}
        style={[
          styles.tile,
          {
            left: (columns - 1) * cellSize,
            top: totalRows * cellSize,
            width: cellSize,
            height: legHeight,
          },
        ]}
        resizeMode="stretch"
      />
      {emojiPositions.map(({ uri, row, col }, index) => (
        <View
          key={`emoji_${index}`}
          style={[
            styles.emojiShadow,
            {
              left: col * cellSize + emojiOffset,
              top: row * cellSize + emojiOffset,
              width: emojiSize,
              height: emojiSize,
            },
          ]}
        >
          <Image
            source={{ uri }}
            style={styles.emojiImage}
            resizeMode="contain"
          />
        </View>
      ))}
    </View>
  );
};

// Chest visual options
export type ChestVisualKey = 'wooden' | 'fridge' | 'picnic-basket' | 'food-crate';

const CHEST_ASSETS: Record<ChestVisualKey, ImageSourcePropType> = {
  wooden: require('../assets/icons/chest-wooden.png'),
  fridge: require('../assets/icons/chest-fridge.png'),
  'picnic-basket': require('../assets/icons/chest-picnic-basket.png'),
  'food-crate': require('../assets/icons/chest-food-crate.png'),
};

const CHEST_LABELS: Record<ChestVisualKey, string> = {
  wooden: 'Wooden Chest',
  fridge: 'Fridge',
  'picnic-basket': 'Picnic Basket',
  'food-crate': 'Food Crate',
};

const CHEST_KEYS: ChestVisualKey[] = ['wooden', 'fridge', 'picnic-basket', 'food-crate'];

/**
 * Chest icon trigger — shows selected chest visual.
 * Long-press opens a picker to change the visual.
 */
export const PixelArtChest: React.FC<{
  count: number;
  onPress: () => void;
  chestVisual?: ChestVisualKey;
  onChangeVisual?: (visual: ChestVisualKey) => void;
  isOwnProfile?: boolean;
}> = ({ count, onPress, chestVisual = 'wooden', onChangeVisual, isOwnProfile = true }) => {
  const [showPicker, setShowPicker] = useState(false);

  const handleLongPress = () => {
    if (!isOwnProfile || !onChangeVisual) return;
    setShowPicker(true);
  };

  const handleSelect = (key: ChestVisualKey) => {
    onChangeVisual?.(key);
    setShowPicker(false);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.chestButton}
        onPress={onPress}
        onLongPress={handleLongPress}
        delayLongPress={400}
        activeOpacity={0.7}
      >
        <Image
          source={CHEST_ASSETS[chestVisual]}
          style={styles.chestImage}
          resizeMode="contain"
        />
      </TouchableOpacity>

      {/* Chest visual picker modal */}
      <Modal
        visible={showPicker}
        transparent
        animationType="none"
        onRequestClose={() => setShowPicker(false)}
      >
        <TouchableOpacity
          style={styles.chestPickerOverlay}
          activeOpacity={1}
          onPress={() => setShowPicker(false)}
        >
          <View style={styles.chestPickerContainer}>
            <View style={styles.chestPickerGrid}>
              {CHEST_KEYS.map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.chestPickerOption,
                    chestVisual === key && styles.chestPickerOptionSelected,
                  ]}
                  onPress={() => handleSelect(key)}
                  activeOpacity={0.7}
                >
                  <Image
                    source={CHEST_ASSETS[key]}
                    style={styles.chestPickerImage}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

/**
 * Modal showing the full emoji collection on tiled shelves.
 * Must be rendered outside useMemo (owns state for edit mode).
 */
export const PixelArtShelfModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  emojis: string[];
  tableSizes?: number[];
  tableConfigs?: TableConfig[];
  isOwnProfile?: boolean;
  onReorder?: (tables: string[][], configs: TableConfig[]) => void;
  // Tapping an emoji fires this with its URI (Food Passport uses it to navigate
  // to the matching meal detail). Drag-to-reorder is a separate gesture.
  onEmojiPress?: (uri: string) => void;
}> = ({
  visible,
  onClose,
  emojis,
  tableSizes,
  tableConfigs: savedConfigs,
  isOwnProfile = false,
  onReorder,
  onEmojiPress,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTables, setEditTables] = useState<string[][]>([]);
  const [editConfigs, setEditConfigs] = useState<TableConfig[]>([]);

  const screenWidth = Dimensions.get('window').width;
  // Uniform cellSize based on largest column count (6)
  const cellSize = Math.floor((screenWidth - 2 * HORIZONTAL_PADDING) / DEFAULT_COLUMNS);

  // Build tables from saved sizes if available, otherwise chunk uniformly
  const tables = useMemo(() => {
    if (tableSizes && tableSizes.length > 0) {
      const result: string[][] = [];
      let idx = 0;
      for (const size of tableSizes) {
        result.push(emojis.slice(idx, idx + size));
        idx += size;
      }
      // Any remaining emojis (new meals added after last save)
      if (idx < emojis.length) {
        const remainder = emojis.slice(idx);
        const lastConfig = (savedConfigs && savedConfigs.length > 0)
          ? savedConfigs[savedConfigs.length - 1]
          : DEFAULT_CONFIG;
        const lastCap = lastConfig.columns * lastConfig.maxRows;
        if (result.length > 0 && result[result.length - 1].length < lastCap) {
          const lastTable = result[result.length - 1];
          const space = lastCap - lastTable.length;
          lastTable.push(...remainder.slice(0, space));
          const overflow = remainder.slice(space);
          const defaultCap = DEFAULT_CONFIG.columns * DEFAULT_CONFIG.maxRows;
          for (let i = 0; i < overflow.length; i += defaultCap) {
            result.push(overflow.slice(i, i + defaultCap));
          }
        } else {
          const defaultCap = DEFAULT_CONFIG.columns * DEFAULT_CONFIG.maxRows;
          for (let i = 0; i < remainder.length; i += defaultCap) {
            result.push(remainder.slice(i, i + defaultCap));
          }
        }
      }
      return result.filter(t => t.length > 0);
    }
    const defaultCap = DEFAULT_CONFIG.columns * DEFAULT_CONFIG.maxRows;
    const chunks: string[][] = [];
    for (let i = 0; i < emojis.length; i += defaultCap) {
      chunks.push(emojis.slice(i, i + defaultCap));
    }
    return chunks;
  }, [emojis, tableSizes, savedConfigs]);

  // Configs array matching tables (fill missing with default)
  const configs = useMemo(() => {
    if (savedConfigs && savedConfigs.length > 0) {
      const result = [...savedConfigs];
      // Fill any overflow tables with default config
      while (result.length < tables.length) {
        result.push({ ...DEFAULT_CONFIG });
      }
      return result.slice(0, tables.length);
    }
    return tables.map(() => ({ ...DEFAULT_CONFIG }));
  }, [savedConfigs, tables]);

  const handleEnterEdit = () => {
    setEditTables(tables.map(t => [...t]));
    setEditConfigs(configs.map(c => ({ ...c })));
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditTables([]);
    setEditConfigs([]);
  };

  const handleDoneEdit = () => {
    // Strip empty tables before saving
    const finalTables: string[][] = [];
    const finalConfigs: TableConfig[] = [];
    for (let i = 0; i < editTables.length; i++) {
      if (editTables[i].length > 0) {
        finalTables.push(editTables[i]);
        finalConfigs.push(editConfigs[i]);
      }
    }
    onReorder?.(finalTables, finalConfigs);
    setIsEditing(false);
    setEditTables([]);
    setEditConfigs([]);
  };

  const handleClose = () => {
    if (isEditing) {
      setIsEditing(false);
      setEditTables([]);
      setEditConfigs([]);
    }
    onClose();
  };

  const handleAddTable = () => {
    const options = ['Small Table (3×3)', 'Large Table (6×3)', 'Cancel'];
    const cancelButtonIndex = 2;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex, title: 'Choose Table Size' },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            setEditTables(prev => [...prev, []]);
            setEditConfigs(prev => [...prev, { ...TABLE_PRESETS.small }]);
          } else if (buttonIndex === 1) {
            setEditTables(prev => [...prev, []]);
            setEditConfigs(prev => [...prev, { ...TABLE_PRESETS.large }]);
          }
        },
      );
    } else {
      Alert.alert('Choose Table Size', undefined, [
        {
          text: 'Small Table (3×3)',
          onPress: () => {
            setEditTables(prev => [...prev, []]);
            setEditConfigs(prev => [...prev, { ...TABLE_PRESETS.small }]);
          },
        },
        {
          text: 'Large Table (6×3)',
          onPress: () => {
            setEditTables(prev => [...prev, []]);
            setEditConfigs(prev => [...prev, { ...TABLE_PRESETS.large }]);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const handleEditTablesChange = (newTables: string[][], newConfigs: TableConfig[]) => {
    setEditTables(newTables);
    setEditConfigs(newConfigs);
  };

  // Inline reorder (not edit mode): every drop auto-persists. Strip any
  // accidentally-emptied tables before saving, same as handleDoneEdit.
  const handleInlineReorder = (newTables: string[][], newConfigs: TableConfig[]) => {
    const finalTables: string[][] = [];
    const finalConfigs: TableConfig[] = [];
    for (let i = 0; i < newTables.length; i++) {
      if (newTables[i].length > 0) {
        finalTables.push(newTables[i]);
        finalConfigs.push(newConfigs[i]);
      }
    }
    onReorder?.(finalTables, finalConfigs);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={true}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          {isEditing ? (
            <>
              <TouchableOpacity onPress={handleCancelEdit} style={styles.modalCloseButton}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Editing</Text>
              <TouchableOpacity onPress={handleDoneEdit} style={styles.modalEditButton}>
                <Text style={styles.modalDoneText}>Done</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={handleClose} style={styles.modalCloseButton}>
                <Text style={styles.modalCloseText}>Done</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Meals Eaten</Text>
              {isOwnProfile ? (
                <TouchableOpacity onPress={handleEnterEdit} style={styles.modalEditButton}>
                  <Text style={styles.modalEditText}>Edit</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.modalEditButton} />
              )}
            </>
          )}
        </View>

        <Text style={styles.modalCount}>
          {emojis.length} {emojis.length === 1 ? 'meal' : 'meals'} collected
        </Text>

        {isEditing ? (
          <DraggableEmojiGrid
            tables={editTables}
            tableConfigs={editConfigs}
            onTablesChange={handleEditTablesChange}
            onAddTable={handleAddTable}
          />
        ) : (
          // Non-edit view: still draggable (if own profile) + tappable (tap
          // emoji → navigate to meal detail). Wooden-tile backdrop matches the
          // previous TableGrid look.
          <DraggableEmojiGrid
            tables={tables}
            tableConfigs={configs}
            onTablesChange={handleInlineReorder}
            onTilePress={onEmojiPress}
            dragEnabled={isOwnProfile}
            reserveLegRoom
            renderTableBackdrop={({ columns, rows, cellSize: cs, gridWidth, furniture }) => (
              <TableBackdrop
                columns={columns}
                rows={rows}
                cellSize={cs}
                gridWidth={gridWidth}
                furniture={furniture}
              />
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  // Chest trigger
  chestButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chestImage: {
    width: 52,
    height: 52,
  },

  // Chest visual picker
  chestPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chestPickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  chestPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    width: 160,
  },
  chestPickerOption: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 68,
    height: 68,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chestPickerOptionSelected: {
    borderColor: '#5B8A72',
    backgroundColor: '#F0F7F4',
  },
  chestPickerImage: {
    width: 52,
    height: 52,
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: colors.lightTan || '#F8F6F2',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.mediumGray || '#EBEBEB',
  },
  modalTitle: {
    fontFamily: 'Inter',
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary || '#1A1A1A',
  },
  modalCloseButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  modalCloseText: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '600',
    color: '#5B8A72',
  },
  modalEditButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    minWidth: 40,
    alignItems: 'flex-end',
  },
  modalEditText: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '500',
    color: '#5B8A72',
  },
  modalCancelText: {
    fontFamily: 'Inter',
    fontSize: 15,
    color: colors.textTertiary || '#858585',
  },
  modalDoneText: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '600',
    color: '#5B8A72',
  },
  modalCount: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: colors.textSecondary || '#858585',
    textAlign: 'center',
    paddingVertical: 12,
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    alignItems: 'center',
    gap: TABLE_GAP,
    paddingBottom: 30,
    paddingTop: 8,
  },

  // Table grid
  tableContainer: {
    position: 'relative',
  },
  tile: {
    position: 'absolute',
    opacity: 0.7,
  },
  emojiShadow: {
    position: 'absolute',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  emojiImage: {
    width: '100%',
    height: '100%',
  },
});

// Default export for backward compat
export default PixelArtShelfModal;
