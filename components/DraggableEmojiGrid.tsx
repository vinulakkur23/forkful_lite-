import React, { useCallback, useRef, useMemo, useState } from 'react';
import {
  View,
  Image,
  Text,
  Dimensions,
  StyleSheet,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withSpring,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { TableConfig, DEFAULT_CONFIG, FurnitureType } from '../services/pixelArtOrderService';

interface DraggableEmojiGridProps {
  tables: string[][];
  tableConfigs: TableConfig[];
  onTablesChange: (newTables: string[][], newConfigs: TableConfig[]) => void;
  onAddTable?: () => void;

  // ─── Inline (read-only-chrome) mode ───
  // When any of the three below is set, the default edit-mode chrome (dashed
  // cell outlines, "Table N" labels, empty-table "Drag meals here" placeholder,
  // Add Table button) is hidden in favor of whatever renderTableBackdrop draws
  // — used by the Food Passport modal to show the wooden tabletop with
  // in-place drag + tap-to-navigate on each emoji.

  // Called on short-tap of an emoji. Presence also enables a Tap gesture on
  // each cell that races with the long-press-drag.
  onTilePress?: (uri: string) => void;

  // Caller-supplied backdrop per table (e.g., wooden tiles + legs). When set,
  // the default dashed chrome / labels / Add Table button are all suppressed.
  renderTableBackdrop?: (ctx: {
    tableIdx: number;
    columns: number;
    rows: number;
    cellSize: number;
    gridWidth: number;
    startY: number;
    furniture: FurnitureType;
  }) => React.ReactNode;

  // When true, each table reserves an extra `cellSize` of vertical space
  // below the last row — room for the backdrop's table legs so they don't
  // overlap the next table.
  reserveLegRoom?: boolean;

  // Set to false to show-but-not-drag (e.g., viewing another user's passport
  // in inline mode: tap to navigate, no reorder). Default true.
  dragEnabled?: boolean;

  // Override the internal MAX_COLUMNS used to derive cellSize. Default 6 — fine
  // for the multi-table tabletop layout, too small for the simple flat grid
  // modal which renders 4 per row. Pass 4 to size emojis appropriately.
  maxColumnsOverride?: number;

  // Fraction of cellSize that the emoji image should occupy. Default 0.75 (the
  // tabletop look — wooden tile visible around each emoji). Simple-modal mode
  // wants emojis to fill the cell more generously (~0.9), matching the old
  // non-draggable simple grid's item size.
  emojiScale?: number;

  // When true, during a drag the non-source cells animate to show where the
  // item will land (iOS-style drop preview). Single-table layouts only.
  previewReorder?: boolean;
}

const HORIZONTAL_PADDING = 16;
const TABLE_GAP = 16;
const TABLE_LABEL_HEIGHT = 24;
const MAX_COLUMNS = 6; // cellSize is always based on this for uniformity

const SPRING_CONFIG = {
  damping: 20,
  stiffness: 200,
  mass: 0.5,
};

interface TableLayout {
  startY: number;
  height: number;
  count: number;
  columns: number;
  maxItems: number;
  gridWidth: number;
}

const DraggableEmojiGrid: React.FC<DraggableEmojiGridProps> = ({
  tables,
  tableConfigs,
  onTablesChange,
  onAddTable,
  onTilePress,
  renderTableBackdrop,
  reserveLegRoom = false,
  dragEnabled = true,
  maxColumnsOverride,
  emojiScale = 0.75,
  previewReorder = false,
}) => {
  const screenWidth = Dimensions.get('window').width;
  const effectiveMaxCols = maxColumnsOverride ?? MAX_COLUMNS;
  const cellSize = Math.floor((screenWidth - 2 * HORIZONTAL_PADDING) / effectiveMaxCols);
  const emojiSize = Math.floor(cellSize * emojiScale);
  const emojiOffset = Math.floor((cellSize - emojiSize) / 2);

  // Presence of a backdrop renderer is the signal to hide the default edit
  // chrome (dashed outlines, labels, empty-table placeholder, Add Table).
  const hideEditChrome = !!renderTableBackdrop;

  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Compute layout for each table using per-table configs
  const tableLayouts = useMemo(() => {
    const layouts: TableLayout[] = [];
    let currentY = 0;
    tables.forEach((table, i) => {
      const config = tableConfigs[i] || DEFAULT_CONFIG;
      const cols = config.columns;
      const maxItems = config.columns * config.maxRows;
      if (!hideEditChrome) {
        currentY += TABLE_LABEL_HEIGHT;
      }
      const rows = Math.max(1, Math.ceil(table.length / cols));
      const height = rows * cellSize;
      const gridWidth = cols * cellSize;
      layouts.push({ startY: currentY, height, count: table.length, columns: cols, maxItems, gridWidth });
      // Inline mode: reserve a cell-height below the last row for backdrop legs,
      // so the next table's backdrop doesn't collide with them.
      const tailPad = reserveLegRoom ? cellSize : 0;
      currentY += height + tailPad + TABLE_GAP;
    });
    return layouts;
  }, [tables, tableConfigs, cellSize, hideEditChrome, reserveLegRoom]);

  const totalHeight = useMemo(() => {
    if (tableLayouts.length === 0) return 100;
    const last = tableLayouts[tableLayouts.length - 1];
    return last.startY + last.height + 80; // extra space for Add Table button
  }, [tableLayouts]);

  const tablesRef = useRef(tables);
  tablesRef.current = tables;
  const layoutsRef = useRef(tableLayouts);
  layoutsRef.current = tableLayouts;
  const configsRef = useRef(tableConfigs);
  configsRef.current = tableConfigs;

  const triggerHaptic = useCallback(() => {
    ReactNativeHapticFeedback.trigger('impactLight', {
      enableVibrateFallback: false,
      ignoreAndroidSystemSettings: false,
    });
  }, []);

  const resolveDropTarget = useCallback(
    (globalX: number, globalY: number): { tableIdx: number; localIdx: number } | null => {
      const layouts = layoutsRef.current;
      const currentTables = tablesRef.current;
      for (let t = 0; t < layouts.length; t++) {
        const layout = layouts[t];
        if (globalY >= layout.startY && globalY < layout.startY + layout.height) {
          const localY = globalY - layout.startY;
          const row = Math.floor(localY / cellSize);
          // In inline mode small tables are horizontally centered, so subtract
          // the table's left-inset before mapping x to a column.
          const leftInset = hideEditChrome
            ? Math.floor((effectiveMaxCols * cellSize - layout.gridWidth) / 2)
            : 0;
          const localX = globalX - leftInset;
          const col = Math.min(
            Math.max(0, Math.floor(localX / cellSize)),
            layout.columns - 1,
          );
          const localIdx = Math.min(row * layout.columns + col, currentTables[t].length);
          return { tableIdx: t, localIdx: Math.max(0, localIdx) };
        }
      }
      // If between tables or below, find closest table
      if (layouts.length > 0) {
        for (let t = 0; t < layouts.length; t++) {
          const layout = layouts[t];
          const tableBottom = layout.startY + layout.height;
          const nextTop = t < layouts.length - 1 ? layouts[t + 1].startY : Infinity;
          if (globalY >= tableBottom && globalY < nextTop) {
            const distToT = globalY - tableBottom;
            const distToNext = nextTop - globalY;
            const targetT = distToT <= distToNext ? t : Math.min(t + 1, layouts.length - 1);
            return { tableIdx: targetT, localIdx: currentTables[targetT].length };
          }
        }
        if (globalY < layouts[0].startY) {
          return { tableIdx: 0, localIdx: 0 };
        }
      }
      return null;
    },
    [cellSize],
  );

  const handleDrop = useCallback(
    (
      sourceTableIdx: number,
      sourceLocalIdx: number,
      targetTableIdx: number,
      targetLocalIdx: number,
    ) => {
      const newTables = tablesRef.current.map(t => [...t]);
      const newConfigs = [...configsRef.current];

      if (sourceTableIdx === targetTableIdx) {
        if (sourceLocalIdx === targetLocalIdx) return;
        const table = newTables[sourceTableIdx];
        const [moved] = table.splice(sourceLocalIdx, 1);
        table.splice(targetLocalIdx, 0, moved);
        onTablesChange(newTables, newConfigs);
      } else {
        // Cross-table: check per-table capacity
        const targetLayout = layoutsRef.current[targetTableIdx];
        if (newTables[targetTableIdx].length >= targetLayout.maxItems) return;
        const [moved] = newTables[sourceTableIdx].splice(sourceLocalIdx, 1);
        const clampedIdx = Math.min(targetLocalIdx, newTables[targetTableIdx].length);
        newTables[targetTableIdx].splice(clampedIdx, 0, moved);
        // Remove empty tables and their configs
        const cleanedTables: string[][] = [];
        const cleanedConfigs: TableConfig[] = [];
        for (let i = 0; i < newTables.length; i++) {
          if (newTables[i].length > 0) {
            cleanedTables.push(newTables[i]);
            cleanedConfigs.push(newConfigs[i]);
          }
        }
        onTablesChange(cleanedTables, cleanedConfigs);
      }
    },
    [onTablesChange],
  );

  // Build flat cell data with global coordinates using per-table columns.
  // `flatIdx` is the item's position across ALL tables concatenated — used by
  // the optional preview-reorder animation so non-source cells know whether
  // they're between source and drop target and should shift.
  const cellData = useMemo(() => {
    let runningFlat = 0;
    return tables.flatMap((table, tableIdx) => {
      const layout = tableLayouts[tableIdx];
      return table.map((uri, localIdx) => ({
        uri,
        tableIdx,
        localIdx,
        flatIdx: runningFlat++,
        globalX: (localIdx % layout.columns) * cellSize,
        globalY: layout.startY + Math.floor(localIdx / layout.columns) * cellSize,
      }));
    });
  }, [tables, tableLayouts, cellSize]);

  // Shared values driving the preview-reorder animation. -1 when no drag is
  // active. Source is the dragged item's flat index (set on drag start);
  // target is the flat index under the finger right now (updated each pan
  // frame on the UI thread). Only read when previewReorder=true.
  const dragSourceFlatIdx = useSharedValue<number>(-1);
  const dragTargetFlatIdx = useSharedValue<number>(-1);

  // Single-table geometry snapshot for the preview math (worklet-safe). Only
  // meaningful when previewReorder is on (caller guarantees single table).
  const previewCols = previewReorder && tableLayouts.length > 0 ? tableLayouts[0].columns : 0;
  const previewItemCount = previewReorder && tables.length > 0 ? tables[0].length : 0;

  const fullGridWidth = effectiveMaxCols * cellSize;

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.scrollContent, { minHeight: totalHeight }]}
      scrollEnabled={scrollEnabled}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ width: fullGridWidth, alignSelf: 'center' }}>
        {/* Inline mode: caller-supplied per-table backdrop (e.g., wooden
            tiles + legs). Positioned absolutely at each table's startY so the
            coordinates line up with the draggable cells below. */}
        {hideEditChrome && renderTableBackdrop && tables.map((table, tableIdx) => {
          const layout = tableLayouts[tableIdx];
          const config = tableConfigs[tableIdx] || DEFAULT_CONFIG;
          const contentRows = Math.max(1, Math.ceil(table.length / layout.columns));
          // Center the small tables within the full grid width.
          const leftInset = Math.floor((fullGridWidth - layout.gridWidth) / 2);
          return (
            <View
              key={`backdrop_${tableIdx}`}
              style={{
                position: 'absolute',
                left: leftInset,
                top: layout.startY,
              }}
              pointerEvents="none"
            >
              {renderTableBackdrop({
                tableIdx,
                columns: layout.columns,
                rows: contentRows,
                cellSize,
                gridWidth: layout.gridWidth,
                startY: layout.startY,
                furniture: config.furniture,
              })}
            </View>
          );
        })}

        {/* Edit-mode chrome (table labels + dashed cell outlines + empty-state
            placeholder). Hidden when a backdrop renderer is supplied. */}
        {!hideEditChrome && tables.map((table, tableIdx) => {
          const layout = tableLayouts[tableIdx];
          const isFull = table.length >= layout.maxItems;
          const isSmall = layout.columns < effectiveMaxCols;
          return (
            <View key={`table_bg_${tableIdx}`}>
              <Text
                style={[
                  styles.tableLabel,
                  { marginTop: tableIdx > 0 ? TABLE_GAP : 0 },
                ]}
              >
                {isSmall ? 'Small ' : ''}Table {tableIdx + 1}{isFull ? ' (full)' : ''}
              </Text>
              <View style={{ width: layout.gridWidth, height: layout.height, position: 'relative' }}>
                {table.map((_, localIdx) => {
                  const x = (localIdx % layout.columns) * cellSize;
                  const y = Math.floor(localIdx / layout.columns) * cellSize;
                  return (
                    <View
                      key={`cell_${tableIdx}_${localIdx}`}
                      style={[
                        styles.cellOutline,
                        { left: x, top: y, width: cellSize, height: cellSize },
                      ]}
                    />
                  );
                })}
                {/* Show empty cell placeholders for empty tables */}
                {table.length === 0 && (
                  <View style={[styles.emptyTablePlaceholder, { width: layout.gridWidth, height: cellSize }]}>
                    <Text style={styles.emptyTableText}>Drag meals here</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}

        {/* Add Table button (edit-mode only) */}
        {!hideEditChrome && onAddTable && (
          <TouchableOpacity
            style={styles.addTableButton}
            onPress={onAddTable}
            activeOpacity={0.7}
          >
            <Text style={styles.addTableText}>+ Add Table</Text>
          </TouchableOpacity>
        )}

        {/* Draggable emoji cells — globally positioned. In inline mode small
            tables are centered horizontally, so each cell's globalX is offset
            by that table's left-inset (computed from its own columns). */}
        {cellData.map((cell) => {
          const layout = tableLayouts[cell.tableIdx];
          const leftInset = hideEditChrome
            ? Math.floor((fullGridWidth - layout.gridWidth) / 2)
            : 0;
          return (
            <DraggableCell
              key={cell.uri}
              uri={cell.uri}
              tableIdx={cell.tableIdx}
              localIdx={cell.localIdx}
              flatIdx={cell.flatIdx}
              globalX={cell.globalX + leftInset}
              globalY={cell.globalY}
              cellSize={cellSize}
              emojiSize={emojiSize}
              emojiOffset={emojiOffset}
              resolveDropTarget={resolveDropTarget}
              onDragStart={() => setScrollEnabled(false)}
              onDragEnd={(srcT, srcL, tgtT, tgtL) => {
                setScrollEnabled(true);
                handleDrop(srcT, srcL, tgtT, tgtL);
              }}
              triggerHaptic={triggerHaptic}
              onTilePress={onTilePress}
              dragEnabled={dragEnabled}
              previewReorder={previewReorder}
              dragSourceFlatIdx={dragSourceFlatIdx}
              dragTargetFlatIdx={dragTargetFlatIdx}
              previewCols={previewCols}
              previewItemCount={previewItemCount}
            />
          );
        })}
      </View>
    </ScrollView>
  );
};

// ─── Single Draggable Cell ───

interface DraggableCellProps {
  uri: string;
  tableIdx: number;
  localIdx: number;
  flatIdx: number;
  globalX: number;
  globalY: number;
  cellSize: number;
  emojiSize: number;
  emojiOffset: number;
  resolveDropTarget: (x: number, y: number) => { tableIdx: number; localIdx: number } | null;
  onDragStart: () => void;
  onDragEnd: (srcTable: number, srcLocal: number, tgtTable: number, tgtLocal: number) => void;
  triggerHaptic: () => void;
  onTilePress?: (uri: string) => void;
  dragEnabled?: boolean;

  // Preview-reorder shared state + single-table geometry. When previewReorder
  // is true and a drag is active, each non-source cell's useAnimatedReaction
  // reads these shared indices and springs to its shifted position.
  previewReorder?: boolean;
  dragSourceFlatIdx?: SharedValue<number>;
  dragTargetFlatIdx?: SharedValue<number>;
  previewCols?: number;
  previewItemCount?: number;
}

const DraggableCell: React.FC<DraggableCellProps> = ({
  uri,
  tableIdx,
  localIdx,
  flatIdx,
  globalX,
  globalY,
  cellSize,
  emojiSize,
  emojiOffset,
  resolveDropTarget,
  onDragStart,
  onDragEnd,
  triggerHaptic,
  onTilePress,
  dragEnabled = true,
  previewReorder = false,
  dragSourceFlatIdx,
  dragTargetFlatIdx,
  previewCols = 0,
  previewItemCount = 0,
}) => {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const zIndexVal = useSharedValue(0);
  const isDragging = useSharedValue(false);

  // Preview translation: drives how far this cell should shift to make room
  // for the dragged item. Spring-animated off dragSourceFlatIdx/dragTargetFlatIdx
  // via the useAnimatedReaction below.
  const previewTX = useSharedValue(0);
  const previewTY = useSharedValue(0);

  const lastTX = useRef(0);
  const lastTY = useRef(0);

  // React to source/target index changes on the UI thread → spring this cell
  // to its shifted slot (or back to rest). Skipped if previewReorder is off
  // or if the shared values aren't supplied. The source cell itself never
  // gets a preview shift — it's following the finger via translateX/Y.
  useAnimatedReaction(
    () => {
      if (!previewReorder || !dragSourceFlatIdx || !dragTargetFlatIdx) {
        return { src: -1, tgt: -1 };
      }
      return { src: dragSourceFlatIdx.value, tgt: dragTargetFlatIdx.value };
    },
    (curr) => {
      const { src, tgt } = curr;
      // No active drag, or this cell is the one being dragged → rest at 0.
      if (src < 0 || tgt < 0 || flatIdx === src || previewCols <= 0) {
        previewTX.value = withSpring(0, SPRING_CONFIG);
        previewTY.value = withSpring(0, SPRING_CONFIG);
        return;
      }
      // Determine shift direction: items strictly between source and target
      // (inclusive of target on the far side) slide one slot toward source.
      let shift = 0;
      if (src < tgt && flatIdx > src && flatIdx <= tgt) shift = -1;
      else if (tgt < src && flatIdx >= tgt && flatIdx < src) shift = 1;

      if (shift === 0) {
        previewTX.value = withSpring(0, SPRING_CONFIG);
        previewTY.value = withSpring(0, SPRING_CONFIG);
        return;
      }
      const oldCol = flatIdx % previewCols;
      const oldRow = Math.floor(flatIdx / previewCols);
      const newIdx = flatIdx + shift;
      const newCol = newIdx % previewCols;
      const newRow = Math.floor(newIdx / previewCols);
      previewTX.value = withSpring((newCol - oldCol) * cellSize, SPRING_CONFIG);
      previewTY.value = withSpring((newRow - oldRow) * cellSize, SPRING_CONFIG);
    },
    [previewReorder, flatIdx, previewCols, cellSize],
  );

  const handleDragEnd = useCallback(() => {
    const centerX = globalX + cellSize / 2 + lastTX.current;
    const centerY = globalY + cellSize / 2 + lastTY.current;
    const target = resolveDropTarget(centerX, centerY);
    if (target) {
      onDragEnd(tableIdx, localIdx, target.tableIdx, target.localIdx);
    } else {
      onDragEnd(tableIdx, localIdx, tableIdx, localIdx);
    }
  }, [globalX, globalY, cellSize, resolveDropTarget, onDragEnd, tableIdx, localIdx]);

  const saveTranslation = useCallback((tx: number, ty: number) => {
    lastTX.current = tx;
    lastTY.current = ty;
  }, []);

  const longPress = Gesture.LongPress()
    .minDuration(200)
    .onStart(() => {
      isDragging.value = true;
      scale.value = withSpring(1.1, SPRING_CONFIG);
      zIndexVal.value = 100;
      // Broadcast source + initial target for preview animation.
      if (previewReorder && dragSourceFlatIdx && dragTargetFlatIdx) {
        dragSourceFlatIdx.value = flatIdx;
        dragTargetFlatIdx.value = flatIdx;
      }
      runOnJS(triggerHaptic)();
      runOnJS(onDragStart)();
    });

  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_e, state) => {
      if (isDragging.value) {
        state.activate();
      } else {
        state.fail();
      }
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
      runOnJS(saveTranslation)(e.translationX, e.translationY);

      // Publish the flat target index under the finger so peers can shift.
      // Single-table assumption: the table starts at y=0 (no labels/leg room
      // in simple-modal mode). globalX/Y already reflect this cell's starting
      // origin, so finger center = globalX/Y + cellSize/2 + translation.
      if (
        previewReorder &&
        dragTargetFlatIdx &&
        previewCols > 0 &&
        previewItemCount > 0
      ) {
        const fingerX = globalX + cellSize / 2 + e.translationX;
        const fingerY = globalY + cellSize / 2 + e.translationY;
        const col = Math.min(
          Math.max(0, Math.floor(fingerX / cellSize)),
          previewCols - 1,
        );
        const row = Math.max(0, Math.floor(fingerY / cellSize));
        const candidate = row * previewCols + col;
        const clamped = Math.min(Math.max(0, candidate), previewItemCount - 1);
        dragTargetFlatIdx.value = clamped;
      }
    })
    .onEnd(() => {
      isDragging.value = false;
      translateX.value = withSpring(0, SPRING_CONFIG);
      translateY.value = withSpring(0, SPRING_CONFIG);
      scale.value = withSpring(1, SPRING_CONFIG);
      zIndexVal.value = 0;
      if (previewReorder && dragSourceFlatIdx && dragTargetFlatIdx) {
        dragSourceFlatIdx.value = -1;
        dragTargetFlatIdx.value = -1;
      }
      runOnJS(handleDragEnd)();
    })
    .onFinalize(() => {
      if (isDragging.value) {
        isDragging.value = false;
        translateX.value = withSpring(0, SPRING_CONFIG);
        translateY.value = withSpring(0, SPRING_CONFIG);
        scale.value = withSpring(1, SPRING_CONFIG);
        zIndexVal.value = 0;
        if (previewReorder && dragSourceFlatIdx && dragTargetFlatIdx) {
          dragSourceFlatIdx.value = -1;
          dragTargetFlatIdx.value = -1;
        }
        runOnJS(onDragEnd)(tableIdx, localIdx, tableIdx, localIdx);
      }
    });

  // Gesture composition:
  //   - Both drag + tap enabled → Race(Tap, Simultaneous(LongPress, Pan))
  //     A quick tap wins; a held finger triggers the long-press → drag.
  //   - Drag only → Simultaneous(LongPress, Pan) (original behavior)
  //   - Tap only (no drag)  → Tap
  //   - Neither → a no-op long-press so the GestureDetector always has one
  const dragComposed = Gesture.Simultaneous(longPress, pan);
  const tap = Gesture.Tap()
    .maxDuration(250)
    .onEnd((_e, success) => {
      if (success && onTilePress) {
        runOnJS(onTilePress)(uri);
      }
    });

  let composed;
  if (dragEnabled && onTilePress) {
    composed = Gesture.Race(tap, dragComposed);
  } else if (dragEnabled) {
    composed = dragComposed;
  } else if (onTilePress) {
    composed = tap;
  } else {
    composed = Gesture.LongPress().minDuration(99999); // inert fallback
  }
  const isIOS = Platform.OS === 'ios';

  const animatedStyle = useAnimatedStyle(() => {
    const base = {
      transform: [
        // Finger-follow translation + preview-shift summed so the source cell
        // tracks the finger while peers slide to their preview positions.
        { translateX: translateX.value + previewTX.value },
        { translateY: translateY.value + previewTY.value },
        { scale: scale.value },
      ],
      zIndex: zIndexVal.value,
    };
    if (isIOS) {
      return {
        ...base,
        shadowOpacity: isDragging.value ? 0.4 : 0.2,
        shadowRadius: isDragging.value ? 8 : 3,
      };
    }
    return {
      ...base,
      elevation: isDragging.value ? 8 : 2,
    };
  });

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          styles.emojiContainer,
          {
            left: globalX + emojiOffset,
            top: globalY + emojiOffset,
            width: emojiSize,
            height: emojiSize,
          },
          animatedStyle,
        ]}
      >
        <Image
          source={{ uri }}
          style={styles.emojiImage}
          resizeMode="contain"
        />
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 8,
    paddingBottom: 30,
  },
  tableLabel: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '500',
    color: '#999',
    textAlign: 'center',
    height: TABLE_LABEL_HEIGHT,
    lineHeight: TABLE_LABEL_HEIGHT,
  },
  cellOutline: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    borderStyle: 'dashed',
    borderRadius: 8,
  },
  emptyTablePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderStyle: 'dashed',
    borderRadius: 12,
  },
  emptyTableText: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: '#BBB',
  },
  addTableButton: {
    marginTop: TABLE_GAP,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(91, 138, 114, 0.3)',
    borderStyle: 'dashed',
    borderRadius: 12,
  },
  addTableText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
    color: '#5B8A72',
  },
  emojiContainer: {
    position: 'absolute',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  emojiImage: {
    width: '100%',
    height: '100%',
  },
});

export default DraggableEmojiGrid;
