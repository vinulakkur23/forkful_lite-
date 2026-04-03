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
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { TableConfig, DEFAULT_CONFIG } from '../services/pixelArtOrderService';

interface DraggableEmojiGridProps {
  tables: string[][];
  tableConfigs: TableConfig[];
  onTablesChange: (newTables: string[][], newConfigs: TableConfig[]) => void;
  onAddTable?: () => void;
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
}) => {
  const screenWidth = Dimensions.get('window').width;
  const cellSize = Math.floor((screenWidth - 2 * HORIZONTAL_PADDING) / MAX_COLUMNS);
  const emojiSize = Math.floor(cellSize * 0.75);
  const emojiOffset = Math.floor((cellSize - emojiSize) / 2);

  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Compute layout for each table using per-table configs
  const tableLayouts = useMemo(() => {
    const layouts: TableLayout[] = [];
    let currentY = 0;
    tables.forEach((table, i) => {
      const config = tableConfigs[i] || DEFAULT_CONFIG;
      const cols = config.columns;
      const maxItems = config.columns * config.maxRows;
      currentY += TABLE_LABEL_HEIGHT;
      const rows = Math.max(1, Math.ceil(table.length / cols));
      const height = rows * cellSize;
      const gridWidth = cols * cellSize;
      layouts.push({ startY: currentY, height, count: table.length, columns: cols, maxItems, gridWidth });
      currentY += height + TABLE_GAP;
    });
    return layouts;
  }, [tables, tableConfigs, cellSize]);

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
          const col = Math.min(Math.floor(globalX / cellSize), layout.columns - 1);
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

  // Build flat cell data with global coordinates using per-table columns
  const cellData = useMemo(() => {
    return tables.flatMap((table, tableIdx) => {
      const layout = tableLayouts[tableIdx];
      return table.map((uri, localIdx) => ({
        uri,
        tableIdx,
        localIdx,
        globalX: (localIdx % layout.columns) * cellSize,
        globalY: layout.startY + Math.floor(localIdx / layout.columns) * cellSize,
      }));
    });
  }, [tables, tableLayouts, cellSize]);

  const fullGridWidth = MAX_COLUMNS * cellSize;

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.scrollContent, { minHeight: totalHeight }]}
      scrollEnabled={scrollEnabled}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ width: fullGridWidth, alignSelf: 'center' }}>
        {/* Table labels and cell outlines */}
        {tables.map((table, tableIdx) => {
          const layout = tableLayouts[tableIdx];
          const isFull = table.length >= layout.maxItems;
          const isSmall = layout.columns < MAX_COLUMNS;
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

        {/* Add Table button */}
        {onAddTable && (
          <TouchableOpacity
            style={styles.addTableButton}
            onPress={onAddTable}
            activeOpacity={0.7}
          >
            <Text style={styles.addTableText}>+ Add Table</Text>
          </TouchableOpacity>
        )}

        {/* Draggable emoji cells — globally positioned */}
        {cellData.map((cell) => (
          <DraggableCell
            key={cell.uri}
            uri={cell.uri}
            tableIdx={cell.tableIdx}
            localIdx={cell.localIdx}
            globalX={cell.globalX}
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
          />
        ))}
      </View>
    </ScrollView>
  );
};

// ─── Single Draggable Cell ───

interface DraggableCellProps {
  uri: string;
  tableIdx: number;
  localIdx: number;
  globalX: number;
  globalY: number;
  cellSize: number;
  emojiSize: number;
  emojiOffset: number;
  resolveDropTarget: (x: number, y: number) => { tableIdx: number; localIdx: number } | null;
  onDragStart: () => void;
  onDragEnd: (srcTable: number, srcLocal: number, tgtTable: number, tgtLocal: number) => void;
  triggerHaptic: () => void;
}

const DraggableCell: React.FC<DraggableCellProps> = ({
  uri,
  tableIdx,
  localIdx,
  globalX,
  globalY,
  cellSize,
  emojiSize,
  emojiOffset,
  resolveDropTarget,
  onDragStart,
  onDragEnd,
  triggerHaptic,
}) => {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const zIndexVal = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const lastTX = useRef(0);
  const lastTY = useRef(0);

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
    })
    .onEnd(() => {
      isDragging.value = false;
      translateX.value = withSpring(0, SPRING_CONFIG);
      translateY.value = withSpring(0, SPRING_CONFIG);
      scale.value = withSpring(1, SPRING_CONFIG);
      zIndexVal.value = 0;
      runOnJS(handleDragEnd)();
    })
    .onFinalize(() => {
      if (isDragging.value) {
        isDragging.value = false;
        translateX.value = withSpring(0, SPRING_CONFIG);
        translateY.value = withSpring(0, SPRING_CONFIG);
        scale.value = withSpring(1, SPRING_CONFIG);
        zIndexVal.value = 0;
        runOnJS(onDragEnd)(tableIdx, localIdx, tableIdx, localIdx);
      }
    });

  const composed = Gesture.Simultaneous(longPress, pan);
  const isIOS = Platform.OS === 'ios';

  const animatedStyle = useAnimatedStyle(() => {
    const base = {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
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
