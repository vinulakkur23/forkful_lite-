import React, { useCallback, useRef, useMemo, useState } from 'react';
import {
  View,
  Image,
  Text,
  Dimensions,
  StyleSheet,
  Platform,
  ScrollView,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

interface DraggableEmojiGridProps {
  tables: string[][];
  columns?: number;
  maxPerTable: number;
  onTablesChange: (newTables: string[][]) => void;
}

const HORIZONTAL_PADDING = 16;
const TABLE_GAP = 16;
const TABLE_LABEL_HEIGHT = 24;

const SPRING_CONFIG = {
  damping: 20,
  stiffness: 200,
  mass: 0.5,
};

interface TableLayout {
  startY: number;
  height: number;
  count: number;
}

const DraggableEmojiGrid: React.FC<DraggableEmojiGridProps> = ({
  tables,
  columns = 6,
  maxPerTable,
  onTablesChange,
}) => {
  const screenWidth = Dimensions.get('window').width;
  const cellSize = Math.floor((screenWidth - 2 * HORIZONTAL_PADDING) / columns);
  const gridWidth = columns * cellSize;
  const emojiSize = Math.floor(cellSize * 0.75);
  const emojiOffset = Math.floor((cellSize - emojiSize) / 2);

  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Compute layout for each table
  const tableLayouts = useMemo(() => {
    const layouts: TableLayout[] = [];
    let currentY = 0;
    tables.forEach((table) => {
      currentY += TABLE_LABEL_HEIGHT;
      const rows = Math.max(1, Math.ceil(table.length / columns));
      const height = rows * cellSize;
      layouts.push({ startY: currentY, height, count: table.length });
      currentY += height + TABLE_GAP;
    });
    return layouts;
  }, [tables, columns, cellSize]);

  const totalHeight = useMemo(() => {
    if (tableLayouts.length === 0) return 0;
    const last = tableLayouts[tableLayouts.length - 1];
    return last.startY + last.height + 30;
  }, [tableLayouts]);

  const tablesRef = useRef(tables);
  tablesRef.current = tables;
  const layoutsRef = useRef(tableLayouts);
  layoutsRef.current = tableLayouts;

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
          const col = Math.min(Math.floor(globalX / cellSize), columns - 1);
          const localIdx = Math.min(row * columns + col, currentTables[t].length);
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
            // Between table t and t+1, prefer whichever is closer
            const distToT = globalY - tableBottom;
            const distToNext = nextTop - globalY;
            const targetT = distToT <= distToNext ? t : Math.min(t + 1, layouts.length - 1);
            return { tableIdx: targetT, localIdx: currentTables[targetT].length };
          }
        }
        // Above first table
        if (globalY < layouts[0].startY) {
          return { tableIdx: 0, localIdx: 0 };
        }
      }
      return null;
    },
    [cellSize, columns],
  );

  const handleDrop = useCallback(
    (
      sourceTableIdx: number,
      sourceLocalIdx: number,
      targetTableIdx: number,
      targetLocalIdx: number,
    ) => {
      const newTables = tablesRef.current.map(t => [...t]);

      if (sourceTableIdx === targetTableIdx) {
        // Reorder within same table
        if (sourceLocalIdx === targetLocalIdx) return;
        const table = newTables[sourceTableIdx];
        const [moved] = table.splice(sourceLocalIdx, 1);
        table.splice(targetLocalIdx, 0, moved);
        onTablesChange(newTables);
      } else {
        // Cross-table move: check if target has room
        if (newTables[targetTableIdx].length >= maxPerTable) return;
        const [moved] = newTables[sourceTableIdx].splice(sourceLocalIdx, 1);
        const clampedIdx = Math.min(targetLocalIdx, newTables[targetTableIdx].length);
        newTables[targetTableIdx].splice(clampedIdx, 0, moved);
        // Remove empty tables
        const cleaned = newTables.filter(t => t.length > 0);
        onTablesChange(cleaned);
      }
    },
    [onTablesChange, maxPerTable],
  );

  // Build flat cell data with global coordinates
  const cellData = useMemo(() => {
    return tables.flatMap((table, tableIdx) => {
      const layout = tableLayouts[tableIdx];
      return table.map((uri, localIdx) => ({
        uri,
        tableIdx,
        localIdx,
        globalX: (localIdx % columns) * cellSize,
        globalY: layout.startY + Math.floor(localIdx / columns) * cellSize,
      }));
    });
  }, [tables, tableLayouts, columns, cellSize]);

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.scrollContent, { minHeight: totalHeight }]}
      scrollEnabled={scrollEnabled}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ width: gridWidth, alignSelf: 'center' }}>
        {/* Table labels and cell outlines */}
        {tables.map((table, tableIdx) => {
          const layout = tableLayouts[tableIdx];
          const isFull = table.length >= maxPerTable;
          return (
            <View key={`table_bg_${tableIdx}`}>
              <Text
                style={[
                  styles.tableLabel,
                  { marginTop: tableIdx > 0 ? TABLE_GAP : 0 },
                ]}
              >
                Table {tableIdx + 1}{isFull ? ' (full)' : ''}
              </Text>
              <View style={{ width: gridWidth, height: layout.height, position: 'relative' }}>
                {table.map((_, localIdx) => {
                  const x = (localIdx % columns) * cellSize;
                  const y = Math.floor(localIdx / columns) * cellSize;
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
              </View>
            </View>
          );
        })}

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
