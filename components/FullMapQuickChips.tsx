/**
 * FullMapQuickChips — horizontal chip strip for the Discover Full Map.
 *
 * Three chip groups, left to right:
 *   1. "Following"   — filter to meals posted by users the current user
 *                      follows. Uses followingService.getFollowing().
 *   2. "Food Critics"— filter to meals by users flagged isCritic on their
 *                      user doc. (No critics exist yet; this chip will
 *                      simply show no results until docs are flagged —
 *                      no code changes needed then.)
 *   3. Taste-profile chips — personalized from the user's taste_profile
 *                            via buildDynamicChips (same pipeline the
 *                            Food Passport List tab already uses).
 *
 * Chip activation is modelled as a regular FilterItem added to
 * activeFilters, so the existing applyHomeFilters pipeline handles
 * intersection with the search-bar filters automatically.
 *
 * Data plumbing note: this component takes followingIds / criticIds as
 * *props* rather than fetching them internally. The fetch + subscription
 * lives on FullMapScreen so that (a) the same sets can be passed into
 * applyHomeFilters, and (b) unmounting the screen tears everything down
 * atomically.
 */
import React, { useMemo } from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../themes';
import type { FilterItem } from './SimpleFilterComponent';
import { buildDynamicChips, type Chip } from '../utils/chipResolver';
import type { TasteProfile } from '../utils/tasteMatch';

interface Props {
  activeFilters: FilterItem[] | null;
  onToggleFilter: (filter: FilterItem) => void;
  // Passed from FullMapScreen so the chip strip knows whether to render
  // Following / Critic chips disabled (empty set) and so chip labels can
  // hint counts if we ever want them. Ignored when showSocialChips=false.
  followingCount?: number;
  criticCount?: number;
  tasteProfile: TasteProfile | null;
  // FullMap wants the social chips (Following, Food Critics); HomeScreen
  // doesn't — it renders the same strip with only the personalized taste
  // chips. Defaults to true so FullMap's existing callsite is unchanged.
  showSocialChips?: boolean;
}

type ChipDef =
  | { key: string; label: string; filter: FilterItem; disabled?: boolean };

const FullMapQuickChips: React.FC<Props> = ({
  activeFilters,
  onToggleFilter,
  followingCount = 0,
  criticCount = 0,
  tasteProfile,
  showSocialChips = true,
}) => {
  const chips: ChipDef[] = useMemo(() => {
    const list: ChipDef[] = [];

    if (showSocialChips) {
      // 1. Following — disabled (but still visible) if the user doesn't
      //    follow anyone yet, so the affordance is still discoverable.
      list.push({
        key: 'following',
        label: 'Following',
        filter: { type: 'following', value: 'following' },
        disabled: followingCount === 0,
      });

      // 2. Food Critics — same treatment.
      list.push({
        key: 'critic',
        label: 'Food Critics',
        filter: { type: 'critic', value: 'critic' },
        disabled: criticCount === 0,
      });
    }

    // 3. Personalized taste chips — buildDynamicChips falls back to
    //    DEFAULT_CHIPS when the taste profile is locked/missing, so we
    //    always render at least some suggestions.
    const taste: Chip[] = buildDynamicChips(tasteProfile, 8);
    for (const c of taste) {
      list.push({
        key: `${c.type}::${c.value}`,
        label: c.label,
        filter: { type: c.type, value: c.value },
      });
    }

    return list;
  }, [showSocialChips, followingCount, criticCount, tasteProfile]);

  const isActive = (f: FilterItem) =>
    !!activeFilters?.some(x => x.type === f.type && x.value === f.value);

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {chips.map(chip => {
          const active = isActive(chip.filter);
          return (
            <TouchableOpacity
              key={chip.key}
              style={[
                styles.chip,
                active && styles.chipActive,
                chip.disabled && !active && styles.chipDisabled,
              ]}
              onPress={() => !chip.disabled && onToggleFilter(chip.filter)}
              activeOpacity={chip.disabled ? 1 : 0.7}
              disabled={chip.disabled}
            >
              <Text
                style={[
                  styles.chipText,
                  active && styles.chipTextActive,
                  chip.disabled && !active && styles.chipTextDisabled,
                ]}
              >
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    // Transparent — the strip floats over the map on FullMap.
    backgroundColor: 'transparent',
  },
  row: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.mediumGray,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: '#1a2b49',
    borderColor: '#1a2b49',
  },
  chipDisabled: {
    opacity: 0.45,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a2b49',
  },
  chipTextActive: {
    color: colors.white,
  },
  chipTextDisabled: {
    color: colors.textSecondary,
  },
});

export default React.memo(FullMapQuickChips);
