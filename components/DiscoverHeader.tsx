import React from 'react';
import { View, StyleSheet } from 'react-native';
import NearYouCarousel, { NearYouCarouselRef } from './NearYouCarousel';
import IconicEatsRow, { IconicEatsRowRef } from './IconicEatsRow';
import { spacing } from '../themes';
import { IconicEat } from '../services/iconicEatsService';

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

interface DiscoverHeaderProps {
  nearYouMeals: MealEntry[];
  iconicEats: IconicEat[];
  onMealPress: (meal: MealEntry) => void;
  onIconicEatPress: (eat: IconicEat) => void;
  onFocusChange: (mealId: string | null) => void;
  onIconicEatFocusChange?: (eatId: string | null) => void;
  carouselRef: React.RefObject<NearYouCarouselRef>;
  iconicRowRef?: React.RefObject<IconicEatsRowRef>;
}

const DiscoverHeader: React.FC<DiscoverHeaderProps> = ({
  nearYouMeals,
  iconicEats,
  onMealPress,
  onIconicEatPress,
  onFocusChange,
  onIconicEatFocusChange,
  carouselRef,
  iconicRowRef,
}) => {
  return (
    <View style={styles.container}>
      <NearYouCarousel
        ref={carouselRef}
        meals={nearYouMeals}
        onMealPress={onMealPress}
        onFocusChange={onFocusChange}
      />
      <IconicEatsRow
        ref={iconicRowRef}
        iconicEats={iconicEats}
        onPress={onIconicEatPress}
        onFocusChange={onIconicEatFocusChange}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.sm,
  },
});

export default React.memo(DiscoverHeader);
