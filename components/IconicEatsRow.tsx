import React, {
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { colors, spacing } from '../themes';
import { IconicEat } from '../services/iconicEatsService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  iconicEats: IconicEat[];
  onPress: (eat: IconicEat) => void;
  onFocusChange?: (eatId: string | null) => void;
  loading?: boolean;
}

export interface IconicEatsRowRef {
  scrollToEat: (eatId: string) => void;
}

// ─── Layout (mirrors NearYouCarousel snap pattern) ────────────────────
const CARD_WIDTH = 128;
const CARD_SPACING = 10;
const TOTAL_CARD_WIDTH = CARD_WIDTH + CARD_SPACING;
const SIDE_PADDING = (SCREEN_WIDTH - CARD_WIDTH) / 2;
const EMOJI_SIZE = 44;

const triggerSelectionHaptic = () => {
  try {
    ReactNativeHapticFeedback.trigger('impactLight', {
      enableVibrateFallback: false,
      ignoreAndroidSystemSettings: false,
    });
  } catch {
    // Haptics are nice-to-have
  }
};

const IconicEatsRow = forwardRef<IconicEatsRowRef, Props>(
  ({ iconicEats, onPress, onFocusChange }, ref) => {
    const flatListRef = useRef<FlatList>(null);
    const lastCenteredIndex = useRef<number>(0);

    useImperativeHandle(
      ref,
      () => ({
        scrollToEat: (eatId: string) => {
          const idx = iconicEats.findIndex(e => e.id === eatId);
          if (idx >= 0 && flatListRef.current) {
            flatListRef.current.scrollToOffset({
              offset: idx * TOTAL_CARD_WIDTH,
              animated: true,
            });
          }
        },
      }),
      [iconicEats],
    );

    const handleScroll = useCallback(
      (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetX = e.nativeEvent.contentOffset.x;
        const index = Math.round(offsetX / TOTAL_CARD_WIDTH);
        const clamped = Math.max(0, Math.min(index, iconicEats.length - 1));
        if (clamped !== lastCenteredIndex.current) {
          lastCenteredIndex.current = clamped;
          triggerSelectionHaptic();
          if (iconicEats[clamped]) {
            onFocusChange?.(iconicEats[clamped].id);
          }
        }
      },
      [iconicEats, onFocusChange],
    );

    const handleMomentumEnd = useCallback(
      (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetX = e.nativeEvent.contentOffset.x;
        const index = Math.round(offsetX / TOTAL_CARD_WIDTH);
        const clamped = Math.max(0, Math.min(index, iconicEats.length - 1));
        if (iconicEats[clamped]) {
          onFocusChange?.(iconicEats[clamped].id);
        }
      },
      [iconicEats, onFocusChange],
    );

    const renderTile = useCallback(
      ({ item }: { item: IconicEat }) => {
        // Always show the full-color pixel art, whether or not the user
        // has unlocked the eat. shadow_emoji_url is no longer used as a
        // fallback — it was the silhouette/greyed-out variant.
        const uri = item.emoji_url || item.shadow_emoji_url;
        return (
          <TouchableOpacity
            style={styles.tile}
            onPress={() => onPress(item)}
            activeOpacity={0.8}
          >
            <View style={styles.emojiWrap}>
              {uri ? (
                <Image
                  source={{ uri }}
                  style={styles.emoji}
                  resizeMode="contain"
                />
              ) : (
                <View style={[styles.emoji, styles.emojiPlaceholder]} />
              )}
            </View>
            <Text
              style={styles.dishName}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {item.dish_name}
            </Text>
            <Text
              style={styles.restaurantName}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item.restaurant_name}
            </Text>
          </TouchableOpacity>
        );
      },
      [onPress],
    );

    if (iconicEats.length === 0) return null;

    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Iconic Eats</Text>
        <FlatList
          ref={flatListRef}
          data={iconicEats}
          keyExtractor={item => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={TOTAL_CARD_WIDTH}
          decelerationRate="fast"
          bounces={false}
          contentContainerStyle={{ paddingHorizontal: SIDE_PADDING }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={handleMomentumEnd}
          renderItem={renderTile}
          getItemLayout={(_, index) => ({
            length: TOTAL_CARD_WIDTH,
            offset: TOTAL_CARD_WIDTH * index,
            index,
          })}
          ItemSeparatorComponent={() => <View style={{ width: CARD_SPACING }} />}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  tile: {
    width: CARD_WIDTH,
    alignItems: 'center',
    paddingVertical: 6,
  },
  emojiWrap: {
    width: EMOJI_SIZE,
    height: EMOJI_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    width: EMOJI_SIZE,
    height: EMOJI_SIZE,
  },
  emojiPlaceholder: {
    backgroundColor: colors.lightTan,
    borderRadius: 8,
  },
  dishName: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '600',
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    textAlign: 'center',
    marginTop: 6,
    width: CARD_WIDTH - 8,
  },
  restaurantName: {
    fontSize: 11,
    lineHeight: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
    width: CARD_WIDTH - 8,
  },
});

export default React.memo(IconicEatsRow);
