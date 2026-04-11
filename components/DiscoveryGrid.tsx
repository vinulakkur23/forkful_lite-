/**
 * DiscoveryGrid — the "fill it out" UI for a single canonical taxonomy.
 *
 * Renders a header with an "X / Y" counter and a wrapped grid of pills.
 * Discovered values are bright and tappable (apply a filter). Undiscovered
 * values are dim and non-interactive.
 *
 * Used for flavors, cuisines, proteins, carbs, cooking methods, dietary,
 * textures. Each grid is collapsible so the profile stays scannable.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { colors, spacing, shadows } from '../themes';
import { humanizeVocab } from '../constants/canonicalVocab';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Props {
  title: string;
  /** All canonical values for this field (the denominator). */
  allValues: readonly string[] | string[];
  /** Values the user has logged at least once. */
  discoveredValues: string[];
  /** Called when a *discovered* pill is tapped. Undiscovered pills are inert. */
  onPillPress?: (value: string) => void;
  /** If true, show a single nudge for the first undiscovered value. */
  showNudge?: boolean;
  /** Default expanded state. */
  defaultExpanded?: boolean;
}

const DiscoveryGrid: React.FC<Props> = ({
  title,
  allValues,
  discoveredValues,
  onPillPress,
  showNudge = false,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const discoveredSet = new Set(discoveredValues.map((v) => v.toLowerCase()));
  const total = allValues.length;
  const count = allValues.filter((v) => discoveredSet.has(v.toLowerCase())).length;

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((e) => !e);
  };

  const firstUndiscovered = allValues.find((v) => !discoveredSet.has(v.toLowerCase()));

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.headerRow}
        activeOpacity={0.7}
        onPress={toggleExpanded}
      >
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerRight}>
          <Text style={styles.counter}>
            {count} <Text style={styles.counterTotal}>/ {total}</Text>
          </Text>
          <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.pillGrid}>
          {allValues.map((v) => {
            const discovered = discoveredSet.has(v.toLowerCase());
            const label = humanizeVocab(v);
            if (discovered) {
              return (
                <TouchableOpacity
                  key={v}
                  style={[styles.pill, styles.pillDiscovered]}
                  activeOpacity={0.7}
                  onPress={() => onPillPress?.(v)}
                >
                  <Text style={[styles.pillText, styles.pillTextDiscovered]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            }
            return (
              <View key={v} style={[styles.pill, styles.pillUndiscovered]}>
                <Text style={[styles.pillText, styles.pillTextUndiscovered]}>
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {expanded && showNudge && firstUndiscovered && (
        <Text style={styles.nudge}>
          You haven&apos;t logged anything {humanizeVocab(firstUndiscovered).toLowerCase()} yet.
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: 12,
    ...shadows.light,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    fontWeight: '600',
    color: colors.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  counter: {
    fontSize: 13,
    color: colors.warmTaupe,
    fontFamily: 'Inter-Regular',
    fontWeight: '600',
    marginRight: 6,
  },
  counterTotal: {
    color: colors.textTertiary,
    fontWeight: '400',
  },
  chevron: {
    fontSize: 14,
    color: colors.textTertiary,
    width: 14,
    textAlign: 'center',
  },
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 6,
    borderWidth: 1,
  },
  pillDiscovered: {
    backgroundColor: colors.lightTan,
    borderColor: colors.warmTaupe,
  },
  pillUndiscovered: {
    backgroundColor: 'transparent',
    borderColor: colors.mediumGray,
    borderStyle: 'dashed',
  },
  pillText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  pillTextDiscovered: {
    color: colors.warmTaupe,
    fontWeight: '600',
  },
  pillTextUndiscovered: {
    color: colors.textPlaceholder,
  },
  nudge: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    fontStyle: 'italic',
  },
});

export default DiscoveryGrid;
