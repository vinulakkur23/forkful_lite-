/**
 * TasteProfileStrip — the "Your taste" header on the Food Passport profile.
 *
 * Reads `users/{uid}/taste_profile/summary` (written by the Cloud Function in
 * functions/tasteProfile.js) and renders one of three states:
 *
 *   locked  (0–4 meals):  "Log N more meals to unlock your taste profile." + progress pill
 *   basic   (5–14):       Top flavor chips + basic one-liner + "Log X more to refine."
 *   full    (15+):        Top flavor chips + signature dish card + richer one-liner
 *
 * The strip updates live via onSnapshot, so logging a new meal refreshes it
 * without a refetch.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import { colors, spacing, shadows } from '../themes';
import { buildTasteOneLiner, buildTasteSubtitle } from '../utils/tasteOneLiner';
import { useTasteProfile } from '../utils/useTasteProfile';
import type { TasteProfile } from '../utils/tasteMatch';
import {
  getLastSeenTier,
  setLastSeenTier,
  getUnlockMessage,
  type TasteTier,
} from '../utils/tierTransition';

interface Props {
  /** Either pass a userId to subscribe internally, or pass a `profile` to
   *  render data fetched elsewhere (preferred when the parent also uses the
   *  profile, to avoid duplicate subscriptions). */
  userId?: string;
  profile?: TasteProfile | null;
  loading?: boolean;
  error?: boolean;
  /** Called when the signature dish card is tapped. */
  onSignatureDishPress?: (mealId: string) => void;
  /** Called when a top-flavor chip is tapped (optional — enables filter apply). */
  onFlavorChipPress?: (flavor: string) => void;
}

const TasteProfileStrip: React.FC<Props> = ({
  userId,
  profile: profileProp,
  loading: loadingProp,
  error: errorProp,
  onSignatureDishPress,
  onFlavorChipPress,
}) => {
  // If a profile wasn't passed in, subscribe to it ourselves.
  const internal = useTasteProfile(profileProp === undefined ? userId : null);
  const profile = profileProp !== undefined ? profileProp : internal.profile;
  const loading = loadingProp !== undefined ? loadingProp : internal.loading;
  const error = errorProp !== undefined ? errorProp : internal.error;

  // Tier unlock detection. Compares new tier against AsyncStorage-cached
  // last-seen tier. If the user just leveled up, show a dismissible banner.
  const [unlockMessage, setUnlockMessage] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!profile || !profile.tier) return;
      const uid = auth().currentUser?.uid;
      if (!uid) return;
      const last = await getLastSeenTier(uid);
      const msg = getUnlockMessage(last, profile.tier as TasteTier);
      if (msg && !cancelled) {
        setUnlockMessage(msg);
      }
      // Always sync the cache so we don't keep firing.
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

  // Hide on error — don't block the profile from rendering.
  if (error || !profile) return null;

  const tier = profile.tier || 'locked';
  const oneLiner = buildTasteOneLiner(profile);
  const subtitle = buildTasteSubtitle(profile);
  const topFlavors = (profile.top_flavors || []).slice(0, 3);

  // --- Locked state ---
  if (tier === 'locked') {
    const meals = profile.meal_count || 0;
    return (
      <View style={[styles.container, styles.lockedContainer]}>
        <Text style={styles.lockedTitle}>Your taste profile</Text>
        <Text style={styles.lockedBody}>{oneLiner}</Text>
        <View style={styles.progressPill}>
          <Text style={styles.progressPillText}>{meals} / 5</Text>
        </View>
      </View>
    );
  }

  // --- Basic / Full state ---
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
        <Text style={styles.title}>Your taste</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>

      <Text style={styles.oneLiner}>{oneLiner}</Text>

      {topFlavors.length > 0 && (
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
      )}

      {tier === 'full' && profile.signature_dish && (
        <TouchableOpacity
          style={styles.signatureCard}
          activeOpacity={0.85}
          onPress={() =>
            profile.signature_dish?.mealId &&
            onSignatureDishPress?.(profile.signature_dish.mealId)
          }
        >
          {profile.signature_dish.photoUrl ? (
            <Image
              source={{ uri: profile.signature_dish.photoUrl }}
              style={styles.signatureImage}
            />
          ) : (
            <View style={[styles.signatureImage, styles.signatureImagePlaceholder]} />
          )}
          <View style={styles.signatureTextBlock}>
            <Text style={styles.signatureLabel}>YOUR SIGNATURE DISH</Text>
            <Text style={styles.signatureName} numberOfLines={1}>
              {profile.signature_dish.mealName || 'Unnamed'}
            </Text>
            {profile.signature_dish.repeat_count > 1 && (
              <Text style={styles.signatureMeta}>
                Logged {profile.signature_dish.repeat_count}×
              </Text>
            )}
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
};

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
  progressPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.lightTan,
    borderRadius: 10,
  },
  progressPillText: {
    fontSize: 12,
    color: colors.warmTaupe,
    fontFamily: 'Inter-Regular',
    fontWeight: '600',
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
  oneLiner: {
    fontSize: 15,
    color: colors.textPrimary,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
    marginBottom: 8,
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
  signatureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    padding: 8,
    backgroundColor: colors.lightGray,
    borderRadius: 8,
  },
  signatureImage: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: colors.mediumGray,
  },
  signatureImagePlaceholder: {
    backgroundColor: colors.mediumGray,
  },
  signatureTextBlock: {
    flex: 1,
    marginLeft: 10,
  },
  signatureLabel: {
    fontSize: 10,
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  signatureName: {
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: 'Inter-Regular',
    fontWeight: '600',
  },
  signatureMeta: {
    fontSize: 11,
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    marginTop: 1,
  },
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
