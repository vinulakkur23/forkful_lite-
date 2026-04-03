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
} from 'react-native';
import { colors, spacing } from '../themes';
import DraggableEmojiGrid from './DraggableEmojiGrid';

// Tile assets for wooden table
const tiles = {
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

// Placeholder for future pixel art chest/fridge/door asset
// Replace with: const chestIcon = require('../assets/icons/chest.png');

type TileKey = keyof typeof tiles;

const HORIZONTAL_PADDING = 16;
const TABLE_GAP = 12;
const DEFAULT_COLUMNS = 6;
const DEFAULT_MAX_ROWS = 3;

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
}> = ({ emojis, columns, cellSize, gridWidth }) => {
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
          source={tiles[key]}
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
        source={tiles.leg_l}
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
        source={tiles.leg_r}
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

/**
 * Chest icon trigger — stateless, safe to render inside useMemo.
 */
export const PixelArtChest: React.FC<{
  count: number;
  onPress: () => void;
}> = ({ count, onPress }) => (
  <TouchableOpacity
    style={styles.chestButton}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={styles.chestIconContainer}>
      {/* Placeholder — replace with pixel art asset:
          <Image source={require('../assets/icons/chest.png')} style={styles.chestImage} resizeMode="contain" /> */}
      <Text style={{ fontSize: 32 }}>🍱</Text>
    </View>
    <View style={styles.chestBadge}>
      <Text style={styles.chestBadgeText}>{count}</Text>
    </View>
    <Text style={styles.chestLabel}>Meals Eaten</Text>
  </TouchableOpacity>
);

/**
 * Modal showing the full emoji collection on tiled shelves.
 * Must be rendered outside useMemo (owns state for edit mode).
 */
export const PixelArtShelfModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  emojis: string[];
  tableSizes?: number[];
  isOwnProfile?: boolean;
  onReorder?: (tables: string[][]) => void;
  columns?: number;
  maxRowsPerTable?: number;
}> = ({
  visible,
  onClose,
  emojis,
  tableSizes,
  isOwnProfile = false,
  onReorder,
  columns = DEFAULT_COLUMNS,
  maxRowsPerTable = DEFAULT_MAX_ROWS,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTables, setEditTables] = useState<string[][]>([]);

  const screenWidth = Dimensions.get('window').width;
  const cellSize = Math.floor((screenWidth - 2 * HORIZONTAL_PADDING) / columns);
  const gridWidth = columns * cellSize;
  const emojisPerTable = maxRowsPerTable * columns;

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
        if (result.length > 0 && result[result.length - 1].length < emojisPerTable) {
          const lastTable = result[result.length - 1];
          const space = emojisPerTable - lastTable.length;
          lastTable.push(...remainder.slice(0, space));
          const overflow = remainder.slice(space);
          for (let i = 0; i < overflow.length; i += emojisPerTable) {
            result.push(overflow.slice(i, i + emojisPerTable));
          }
        } else {
          for (let i = 0; i < remainder.length; i += emojisPerTable) {
            result.push(remainder.slice(i, i + emojisPerTable));
          }
        }
      }
      return result.filter(t => t.length > 0);
    }
    const chunks: string[][] = [];
    for (let i = 0; i < emojis.length; i += emojisPerTable) {
      chunks.push(emojis.slice(i, i + emojisPerTable));
    }
    return chunks;
  }, [emojis, tableSizes, emojisPerTable]);

  const handleEnterEdit = () => {
    setEditTables(tables.map(t => [...t]));
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditTables([]);
  };

  const handleDoneEdit = () => {
    onReorder?.(editTables);
    setIsEditing(false);
    setEditTables([]);
  };

  const handleClose = () => {
    if (isEditing) {
      setIsEditing(false);
      setEditTables([]);
    }
    onClose();
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
            columns={columns}
            maxPerTable={maxRowsPerTable * columns}
            onTablesChange={setEditTables}
          />
        ) : (
          <ScrollView
            style={styles.modalScrollView}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {tables.map((tableEmojis, tableIndex) => (
              <TableGrid
                key={`table_${tableIndex}`}
                emojis={tableEmojis}
                columns={columns}
                cellSize={cellSize}
                gridWidth={gridWidth}
              />
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  // Chest trigger
  chestButton: {
    alignItems: 'center',
    alignSelf: 'center',
    paddingVertical: 8,
  },
  chestIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#F5EDE0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#D4C4A8',
    ...Platform.select({
      ios: {
        shadowColor: '#8B6F47',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  chestImage: {
    width: 44,
    height: 44,
  },
  chestBadge: {
    position: 'absolute',
    top: 2,
    right: -8,
    backgroundColor: '#5B8A72',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  chestBadgeText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  chestLabel: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary || '#858585',
    marginTop: 6,
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
