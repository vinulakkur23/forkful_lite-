import React, { useState, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
  StatusBar,
} from 'react-native';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialIcons';
import HomeMapComponent from '../components/HomeMapComponent';
import { colors } from '../themes';

// Match the MealEntry interface from HomeScreen
interface MealEntry {
  id: string;
  photoUrl: string;
  photos?: { url: string; isFlagship: boolean; order: number; uploadedAt?: any }[];
  rating: number;
  restaurant: string;
  meal: string;
  userId: string;
  userName?: string;
  userPhoto?: string;
  city?: string;
  mealType?: string;
  location: {
    latitude: number;
    longitude: number;
    source?: string;
    city?: string;
  } | null;
  createdAt: any;
  distance?: number;
  score?: number;
  tier?: string;
  aiMetadata?: any;
  metadata_enriched?: any;
  enhanced_facts?: any;
  quick_criteria_result?: any;
}

// Simple params — receive data from HomeScreen
export type FullMapParams = {
  nearbyMeals?: MealEntry[];
  userLocation?: { latitude: number; longitude: number } | null;
  activeFilters?: any[] | null;
  centerOnLocation?: {
    latitude: number;
    longitude: number;
    mealId?: string;
  };
};

type Props = {
  navigation: any;
  route: RouteProp<{ FullMap: FullMapParams }, 'FullMap'>;
};

const MAX_MEALS_TO_DISPLAY = 50;

const FullMapScreen: React.FC<Props> = ({ navigation, route }) => {
  const {
    nearbyMeals = [],
    userLocation = null,
    activeFilters = null,
    centerOnLocation,
  } = route.params || {};

  // Manage image errors locally
  const [imageErrors, setImageErrors] = useState<{ [key: string]: boolean }>({});

  const handleImageError = useCallback((mealId: string) => {
    setImageErrors(prev => ({ ...prev, [mealId]: true }));
  }, []);

  const viewMealDetails = useCallback((meal: MealEntry) => {
    navigation.navigate('MealDetail', {
      mealId: meal.id,
      previousScreen: 'FullMap',
    });
  }, [navigation]);

  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <HomeMapComponent
        navigation={navigation}
        nearbyMeals={nearbyMeals}
        loading={false}
        refreshing={false}
        activeFilters={activeFilters}
        showingLimitedResults={false}
        userLocation={userLocation}
        imageErrors={imageErrors}
        onImageError={handleImageError}
        onViewMealDetails={viewMealDetails}
        centerOnLocation={centerOnLocation}
        tabIndex={1}
        MAX_MEALS_TO_DISPLAY={MAX_MEALS_TO_DISPLAY}
      />

      {/* Close button */}
      <TouchableOpacity
        style={styles.closeButton}
        onPress={handleClose}
        activeOpacity={0.8}
      >
        <Icon name="close" size={24} color="#1a2b49" />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.lightTan,
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 16,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
});

export default FullMapScreen;
