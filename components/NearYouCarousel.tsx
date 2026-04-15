import React, { useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
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
import Icon from 'react-native-vector-icons/MaterialIcons';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { colors, spacing, shadows } from '../themes';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface MealEntry {
  id: string;
  photoUrl: string;
  photos?: { url: string; isFlagship: boolean; order: number }[];
  meal: string;
  restaurant: string;
  distance?: number;
  location: {
    latitude: number;
    longitude: number;
    [key: string]: any;
  } | null;
  [key: string]: any;
}

interface NearYouCarouselProps {
  meals: MealEntry[];
  onMealPress: (meal: MealEntry) => void;
  onFocusChange: (mealId: string | null) => void;
  // Optional section title override. Discover home uses the default
  // "Near You"; FullMap passes e.g. "In view" so the copy matches the
  // different selection model (region-bounded instead of proximity-based).
  title?: string;
}

export interface NearYouCarouselRef {
  scrollToMeal: (mealId: string) => void;
}

// ─── Layout constants (mirrors Carousel3D pattern) ───────────────────
const CARD_WIDTH = 160;
const CARD_SPACING = 12;
const TOTAL_CARD_WIDTH = CARD_WIDTH + CARD_SPACING; // 172px snap interval
const SIDE_PADDING = (SCREEN_WIDTH - CARD_WIDTH) / 2;

const triggerSelectionHaptic = () => {
  try {
    ReactNativeHapticFeedback.trigger('impactLight', {
      enableVibrateFallback: false,
      ignoreAndroidSystemSettings: false,
    });
  } catch {
    // Silently fail — haptics are nice-to-have
  }
};

function formatDistance(distanceKm: number | undefined): string {
  if (distanceKm === undefined || distanceKm === null) return '';
  const miles = distanceKm * 0.621371;
  if (miles < 0.1) return '< 0.1 mi';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

function getMealPhoto(meal: MealEntry): string | null {
  if (meal.photos && meal.photos.length > 0) {
    const flagship = meal.photos.find(p => p.isFlagship);
    return (flagship || meal.photos[0]).url;
  }
  return meal.photoUrl || null;
}

const NearYouCarousel = forwardRef<NearYouCarouselRef, NearYouCarouselProps>(
  ({ meals, onMealPress, onFocusChange, title = 'Near You' }, ref) => {
    const flatListRef = useRef<FlatList>(null);
    const lastCenteredIndex = useRef<number>(0);

    // Expose scrollToMeal to parent via ref
    useImperativeHandle(ref, () => ({
      scrollToMeal: (mealId: string) => {
        const idx = meals.findIndex(m => m.id === mealId);
        if (idx >= 0 && flatListRef.current) {
          flatListRef.current.scrollToOffset({
            offset: idx * TOTAL_CARD_WIDTH,
            animated: true,
          });
        }
      },
    }), [meals]);

    // Live scroll — detect centered card + haptic
    const handleScroll = useCallback(
      (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetX = e.nativeEvent.contentOffset.x;
        const index = Math.round(offsetX / TOTAL_CARD_WIDTH);
        const clamped = Math.max(0, Math.min(index, meals.length - 1));

        if (clamped !== lastCenteredIndex.current) {
          lastCenteredIndex.current = clamped;
          triggerSelectionHaptic();
          if (meals[clamped]) {
            onFocusChange(meals[clamped].id);
          }
        }
      },
      [meals, onFocusChange],
    );

    // Final selection after momentum
    const handleMomentumEnd = useCallback(
      (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetX = e.nativeEvent.contentOffset.x;
        const index = Math.round(offsetX / TOTAL_CARD_WIDTH);
        const clamped = Math.max(0, Math.min(index, meals.length - 1));
        if (meals[clamped]) {
          onFocusChange(meals[clamped].id);
        }
      },
      [meals, onFocusChange],
    );

    const renderCard = useCallback(({ item: meal }: { item: MealEntry }) => {
      const photoUrl = getMealPhoto(meal);
      const dist = formatDistance(meal.distance);

      return (
        <TouchableOpacity
          style={styles.card}
          onPress={() => onMealPress(meal)}
          activeOpacity={0.8}
        >
          {photoUrl ? (
            <Image
              source={{ uri: photoUrl }}
              style={styles.photo}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Icon name="restaurant" size={28} color={colors.mediumGray} />
            </View>
          )}
          <View style={styles.cardContent}>
            <Text style={styles.dishName} numberOfLines={1}>
              {meal.meal || 'Untitled'}
            </Text>
            <Text style={styles.restaurantName} numberOfLines={1}>
              {meal.restaurant || ''}
            </Text>
            {dist ? (
              <Text style={styles.distance}>{dist}</Text>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    }, [onMealPress]);

    if (meals.length === 0) return null;

    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <FlatList
          ref={flatListRef}
          data={meals}
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
          renderItem={renderCard}
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
  card: {
    width: CARD_WIDTH,
    backgroundColor: colors.white,
    borderRadius: 10,
    overflow: 'hidden',
    ...shadows.light,
  },
  photo: {
    width: '100%',
    height: 120,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  photoPlaceholder: {
    backgroundColor: colors.lightTan,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  dishName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  restaurantName: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  distance: {
    fontSize: 11,
    color: colors.warmTaupe,
    marginTop: 3,
    fontWeight: '500',
  },
});

export default React.memo(NearYouCarousel);
