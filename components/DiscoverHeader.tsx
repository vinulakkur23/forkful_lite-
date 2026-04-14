import React, { useMemo, useState, useRef, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import NearYouCarousel, { NearYouCarouselRef } from './NearYouCarousel';
import { spacing } from '../themes';

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
  onMealPress: (meal: MealEntry) => void;
  onFocusChange: (mealId: string | null) => void;
  carouselRef: React.RefObject<NearYouCarouselRef>;
}

const DiscoverHeader: React.FC<DiscoverHeaderProps> = ({
  nearYouMeals,
  onMealPress,
  onFocusChange,
  carouselRef,
}) => {
  return (
    <View style={styles.container}>
      <NearYouCarousel
        ref={carouselRef}
        meals={nearYouMeals}
        onMealPress={onMealPress}
        onFocusChange={onFocusChange}
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
