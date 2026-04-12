/**
 * TasteProfileStrip — the "Your taste" section on the Food Passport.
 *
 * Renders progressively richer content as the user logs more meals:
 *
 *   locked   (0–4):   "Log N more meals…" + progress bar
 *   basic    (5–9):   Top flavor chips + one-liner + progress bar
 *   enhanced (10–14): Flavors & Textures word cloud + one-liner + progress bar
 *   full     (15–19): Archetype + 1 AI insight (bold) + full word cloud + progress bar
 *   refined  (20+):   Archetype + 3 AI insights (bold) + full word cloud + progress bar to next 5-meal refresh
 *
 * Updates live via onSnapshot.
 */
import React, {useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import {colors, spacing, shadows} from '../themes';
import {buildTasteOneLiner, buildTasteSubtitle} from '../utils/tasteOneLiner';
import {useTasteProfile} from '../utils/useTasteProfile';
import type {TasteProfile} from '../utils/tasteMatch';
import {
  getLastSeenTier,
  setLastSeenTier,
  getUnlockMessage,
  type TasteTier,
} from '../utils/tierTransition';
import WordCloud from './WordCloud';
import FlavorMap from './FlavorMap';
import {
  buildWordCloudItems,
  WORD_CLOUD_CATEGORIES,
} from '../utils/wordCloudData';

// Toggle between visualizations — flip to 'wordcloud' to revert instantly
const FLAVOR_VIZ: 'tags' | 'wordcloud' = 'tags';

// ---------------------------------------------------------------------------
// Bold text helper — splits "some **bold** text" into mixed-weight spans
// ---------------------------------------------------------------------------

function renderBoldText(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  if (parts.length === 1) return text; // no bold markers
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <Text key={i} style={{fontWeight: '700'}}>
        {part}
      </Text>
    ) : (
      part
    ),
  );
}

// ---------------------------------------------------------------------------
// Segmented progress bar — 5 segments with 4 divots
// ---------------------------------------------------------------------------

function SegmentedProgressBar({progress}: {progress: ProgressInfo}) {
  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {width: `${Math.min(100, progress.fraction * 100)}%`},
          ]}
        />
        {/* 4 divots at 20%, 40%, 60%, 80% */}
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              styles.progressDivot,
              {left: `${i * 20}%`},
            ]}
          />
        ))}
      </View>
      <Text style={styles.progressLabel}>{progress.label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Progress bar config per tier
// ---------------------------------------------------------------------------

interface ProgressInfo {
  current: number;
  target: number;
  label: string;
  fraction: number;
}

function getProgressInfo(
  tier: string,
  mealCount: number,
): ProgressInfo | null {
  // Every tier uses the same 0–5 progress toward the next 5-meal milestone.
  const nextMilestone = Math.ceil((mealCount + 1) / 5) * 5;
  const prevMilestone = nextMilestone - 5;
  const withinBucket = mealCount - prevMilestone; // 0–4
  const remaining = nextMilestone - mealCount;
  const fraction = withinBucket / 5;

  switch (tier) {
    case 'locked':
      return {
        current: withinBucket,
        target: 5,
        label: `Capture ${remaining} more meal${remaining === 1 ? '' : 's'} to unlock your taste profile`,
        fraction,
      };
    case 'basic':
    case 'enhanced':
    case 'full':
      return {
        current: withinBucket,
        target: 5,
        label: `Capture ${remaining} more meal${remaining === 1 ? '' : 's'} to evolve your taste profile`,
        fraction,
      };
    case 'refined':
      return {
        current: withinBucket,
        target: 5,
        label: `Capture ${remaining} more meal${remaining === 1 ? '' : 's'} to refresh your taste profile`,
        fraction,
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  userId?: string;
  profile?: TasteProfile | null;
  loading?: boolean;
  error?: boolean;
  /** Called when a word cloud word or flavor chip is tapped. */
  onFlavorChipPress?: (flavor: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TasteProfileStrip: React.FC<Props> = ({
  userId,
  profile: profileProp,
  loading: loadingProp,
  error: errorProp,
  onFlavorChipPress,
}) => {
  const internal = useTasteProfile(profileProp === undefined ? userId : null);
  const profile = profileProp !== undefined ? profileProp : internal.profile;
  const loading = loadingProp !== undefined ? loadingProp : internal.loading;
  const error = errorProp !== undefined ? errorProp : internal.error;

  // Tier unlock detection
  const [unlockMessage, setUnlockMessage] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!profile || !profile.tier) return;
      const uid = auth().currentUser?.uid;
      if (!uid) return;
      const last = await getLastSeenTier(uid);
      const msg = getUnlockMessage(last, profile.tier as TasteTier);
      if (msg && !cancelled) setUnlockMessage(msg);
      await setLastSeenTier(uid, profile.tier as TasteTier);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [profile?.tier]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.warmTaupe} />
          <Text style={styles.loadingText}>Reading your taste…</Text>
        </View>
      </View>
    );
  }

  if (error || !profile) return null;

  const tier = profile.tier || 'locked';
  const mealCount = profile.meal_count || 0;

  // AI story data
  const hasStory =
    (tier === 'full' || tier === 'refined') &&
    typeof profile.taste_story === 'string' &&
    profile.taste_story.trim().length > 0;
  const archetype = hasStory
    ? (profile.taste_story_archetype || '').trim()
    : '';
  const allInsights = hasStory
    ? (profile.taste_story_insights || []).filter(
        (s) => typeof s === 'string' && s.trim().length > 0,
      )
    : [];
  // full tier: show 1 insight; refined: show all 3
  const insights = tier === 'full' ? allInsights.slice(0, 1) : allInsights;

  // Deterministic one-liner for basic/enhanced
  const oneLiner = buildTasteOneLiner(profile);
  const subtitle = buildTasteSubtitle(profile);
  const topFlavors = (profile.top_flavors || []).slice(0, 3);

  // Word cloud — enhanced: only Flavors & Textures; full/refined: one merged cloud
  const showWordCloud =
    tier === 'enhanced' || tier === 'full' || tier === 'refined';
  const wordCloudSections = useMemo(() => {
    if (!showWordCloud || !profile) return [];
    if (tier === 'enhanced') {
      // Enhanced: only flavors & textures
      const cat = WORD_CLOUD_CATEGORIES.find((c) => c.key === 'flavors');
      if (!cat) return [];
      const items = buildWordCloudItems(profile, cat.fields);
      return items.length >= 2 ? [{...cat, items}] : [];
    }
    // Full / Refined: one big cloud with all fields merged.
    // Per-field normalization is handled inside buildWordCloudItems.
    const allFields = WORD_CLOUD_CATEGORIES.flatMap((c) => c.fields);
    const items = buildWordCloudItems(profile, allFields);
    return items.length >= 2
      ? [{key: 'all', label: 'Flavor Map', fields: allFields, items}]
      : [];
  }, [showWordCloud, profile?.tag_counts, profile?.tag_scores, tier]);
  const [cloudWidth, setCloudWidth] = useState(0);

  // Progress bar
  const progress = getProgressInfo(tier, mealCount);

  // -----------------------------------------------------------------------
  // Locked state
  // -----------------------------------------------------------------------
  if (tier === 'locked') {
    return (
      <View style={[styles.container, styles.lockedContainer]}>
        <Text style={styles.lockedTitle}>Your taste profile</Text>
        <Text style={styles.lockedBody}>{oneLiner}</Text>
        {progress && <SegmentedProgressBar progress={progress} />}
      </View>
    );
  }

  // -----------------------------------------------------------------------
  // Basic / Enhanced / Full / Refined
  // -----------------------------------------------------------------------
  return (
    <View style={styles.container}>
      {unlockMessage && (
        <TouchableOpacity
          style={styles.unlockBanner}
          activeOpacity={0.8}
          onPress={() => setUnlockMessage(null)}
        >
          <Text style={styles.unlockEmoji}>✨</Text>
          <Text style={styles.unlockText} numberOfLines={2}>
            {unlockMessage}
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.headerRow}>
        <Text style={styles.title}>Taste Profile</Text>
        {subtitle && !archetype && (
          <Text style={styles.subtitle}>{subtitle}</Text>
        )}
      </View>

      {/* Archetype — larger, descriptive header (full/refined only) */}
      {archetype ? (
        <Text style={styles.archetypeText}>{archetype}</Text>
      ) : null}

      {/* AI insights with bold formatting (full: 1, refined: 3) */}
      {insights.length >= 1 ? (
        <View style={styles.insightsList}>
          {insights.map((ins, idx) => (
            <View
              key={idx}
              style={[
                styles.insightBlock,
                idx < insights.length - 1 && styles.insightBlockDivider,
              ]}
            >
              <Text style={styles.insightText}>{renderBoldText(ins)}</Text>
            </View>
          ))}
        </View>
      ) : tier !== 'full' && tier !== 'refined' ? (
        <Text style={styles.oneLiner}>{oneLiner}</Text>
      ) : null}

      {/* Flavor visualization — toggle via FLAVOR_VIZ constant */}
      {showWordCloud && wordCloudSections.length > 0 ? (
        <View
          style={styles.wordCloudContainer}
          onLayout={(e) => setCloudWidth(e.nativeEvent.layout.width)}
        >
          {wordCloudSections.map((sec) => (
            <View key={sec.key} style={styles.wordCloudSection}>
              <Text style={styles.wordCloudLabel}>{sec.label}</Text>
              {FLAVOR_VIZ === 'tags' ? (
                <FlavorMap
                  items={sec.items}
                  onWordPress={
                    onFlavorChipPress
                      ? (item) => onFlavorChipPress(item.label)
                      : undefined
                  }
                />
              ) : cloudWidth > 0 ? (
                (() => {
                  const isMerged = sec.key === 'all';
                  const h = isMerged
                    ? Math.max(140, Math.min(260, sec.items.length * 18))
                    : Math.max(80, Math.min(160, sec.items.length * 22));
                  return (
                    <WordCloud
                      items={sec.items}
                      width={cloudWidth}
                      height={h}
                      minFontSize={sec.items.length <= 4 ? 13 : 10}
                      maxFontSize={isMerged ? 26 : (sec.items.length <= 4 ? 22 : 28)}
                      onWordPress={
                        onFlavorChipPress
                          ? (item) => onFlavorChipPress(item.label)
                          : undefined
                      }
                    />
                  );
                })()
              ) : null}
            </View>
          ))}
        </View>
      ) : topFlavors.length > 0 ? (
        <View style={styles.flavorRow}>
          {topFlavors.map((f) => (
            <TouchableOpacity
              key={f}
              style={styles.flavorChip}
              activeOpacity={0.7}
              onPress={() => onFlavorChipPress?.(f)}
            >
              <Text style={styles.flavorChipText}>{f.replace(/-/g, ' ')}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {/* Progress bar */}
      {progress && <SegmentedProgressBar progress={progress} />}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: 12,
    ...shadows.light,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 12,
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
  },
  lockedContainer: {
    alignItems: 'flex-start',
  },
  lockedTitle: {
    fontSize: 13,
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  lockedBody: {
    fontSize: 15,
    color: colors.textPrimary,
    fontFamily: 'Inter-Regular',
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: 13,
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 11,
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    fontStyle: 'italic',
  },
  archetypeText: {
    fontSize: 17,
    color: colors.warmTaupe,
    fontFamily: 'Inter-Regular',
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 10,
    marginTop: 2,
  },
  oneLiner: {
    fontSize: 15,
    color: colors.textPrimary,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
    marginBottom: 8,
  },
  insightsList: {
    marginTop: 4,
    marginBottom: 12,
  },
  insightBlock: {
    paddingVertical: 10,
  },
  insightBlockDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.warmTaupe || '#d9cfc2',
  },
  insightText: {
    fontSize: 14.5,
    color: colors.textPrimary,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  wordCloudContainer: {
    marginTop: 8,
    marginBottom: 4,
  },
  wordCloudSection: {
    marginBottom: 12,
  },
  wordCloudLabel: {
    fontSize: 11,
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  flavorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 2,
  },
  flavorChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.lightTan,
    borderRadius: 10,
    marginRight: 6,
    marginBottom: 4,
  },
  flavorChipText: {
    fontSize: 12,
    color: colors.warmTaupe,
    fontFamily: 'Inter-Regular',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  // Progress bar
  progressContainer: {
    marginTop: 12,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.lightTan,
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: {
    height: 6,
    backgroundColor: colors.tasteGreen,
    borderRadius: 3,
  },
  progressDivot: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: 6,
    backgroundColor: colors.white,
    marginLeft: -1, // center on the percentage mark
  },
  progressLabel: {
    fontSize: 11,
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
  },
  // Unlock banner
  unlockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.lightTan,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.warmTaupe,
  },
  unlockEmoji: {
    fontSize: 16,
    marginRight: 8,
  },
  unlockText: {
    flex: 1,
    fontSize: 12,
    color: colors.textPrimary,
    fontFamily: 'Inter-Regular',
    fontWeight: '600',
    lineHeight: 16,
  },
});

export default TasteProfileStrip;
