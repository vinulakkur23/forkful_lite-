import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Alert,
  Linking,
  Clipboard,
  Share,
  Platform,
  PermissionsAndroid,
  ImageSourcePropType,
  ScrollView,
  Modal,
} from 'react-native';
import { firebase, auth, firestore } from '../firebaseConfig';
import MapView, { Marker, Callout, Region } from 'react-native-maps';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../App';
import Geolocation from '@react-native-community/geolocation';
import { FilterItem } from '../components/SimpleFilterComponent';
import EmojiDisplay from '../components/EmojiDisplay';

// Custom button icons - replace these with actual assets when available
const MAP_ICONS = {
  myLocation: require('../assets/icons/map/my-location.png'),
  share: require('../assets/icons/map/share.png'),
  checkmark: { uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAsTAAALEwEAmpwYAAAA8klEQVR4nO2VMU7DQBBF3xaUBpooJQ2hpPYFkhtwAtLQpM0dcgFEGuqUdDkFdLkDcAJS0FBkCyOtbCsKGstJSvKkkUYz+1/P7swG/o0JKlzwSI4FNV44IseZZB94HMbPVaRQ0OJU0PziMiixJ1h9sxkdwRRHWLMtXIJdwfKH7l2CE8F8DdeRGQyxF1M4L8d0xZUbQbvDZRKCDTWzKAIHM4zjXuMkgaDBbkzhuAZX1DngELeJXZQz6AmqFRCPRNDinncFFS7/4OpLJHbRfYcgBXV8+vQTcT9SbfVcx39uqSBf8Kn5rmDYWNgJsZygCZYf+HfeAe9jVYQkXxGBAAAAAElFTkSuQmCC' }
};

type MapScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, 'FoodPassport'>;
  activeFilters: FilterItem[] | null;
  activeRatingFilters?: number[] | null;
  isActive?: boolean; // Flag to indicate if this tab is currently active
  userId?: string; // Optional userId to view other users' maps
};

interface MealEntry {
  id: string;
  photoUrl: string;
  rating: number;
  restaurant: string;
  meal: string;
  userId?: string;
  userName?: string;
  userPhoto?: string;
  location: {
    latitude: number;
    longitude: number;
    source?: string;
  } | null;
  createdAt: number;
  aiMetadata?: {
    cuisineType: string;
    foodType: string[];
    mealType: string;
    primaryProtein: string;
    dietType: string;
    eatingMethod: string;
    setting: string;
    platingStyle: string;
    beverageType: string;
  };
}

const { width } = Dimensions.get('window');

const MapScreen: React.FC<MapScreenProps> = ({ navigation, activeFilters, activeRatingFilters, isActive, userId }) => {
  const [allMeals, setAllMeals] = useState<MealEntry[]>([]);
  const [filteredMeals, setFilteredMeals] = useState<MealEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<{[key: string]: boolean}>({});
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [showWishlist, setShowWishlist] = useState<boolean>(false); // Toggle between user's meals and saved meals
  const [selectedLocationMeals, setSelectedLocationMeals] = useState<MealEntry[] | null>(null);
  const [showMealsModal, setShowMealsModal] = useState(false);
  const [selectedMarkerIndex, setSelectedMarkerIndex] = useState<{ [key: string]: number }>({});
  
  // Map view reference
  const mapRef = useRef<MapView | null>(null);
  
  // Group meals by location for carousel display
  const locationGroupedMarkers = useMemo(() => {
    const mealsWithLocation = filteredMeals.filter(meal => meal.location?.latitude && meal.location?.longitude);
    
    // Group meals by location (rounded to 4 decimal places to catch very close locations)
    const locationGroups: { [key: string]: MealEntry[] } = {};
    
    mealsWithLocation.forEach(meal => {
      if (!meal.location) return;
      
      const lat = meal.location.latitude.toFixed(4);
      const lng = meal.location.longitude.toFixed(4);
      const locationKey = `${lat},${lng}`;
      
      if (!locationGroups[locationKey]) {
        locationGroups[locationKey] = [];
      }
      locationGroups[locationKey].push(meal);
    });
    
    // Create one marker per location with all meals
    const groupedMarkers: Array<{
      locationKey: string,
      coordinate: {latitude: number, longitude: number},
      meals: MealEntry[],
      restaurant?: string
    }> = [];
    
    Object.entries(locationGroups).forEach(([locationKey, meals]) => {
      const firstMeal = meals[0];
      const restaurant = firstMeal.restaurant || meals.find(m => m.restaurant)?.restaurant;
      
      groupedMarkers.push({
        locationKey,
        coordinate: {
          latitude: firstMeal.location!.latitude,
          longitude: firstMeal.location!.longitude
        },
        meals: meals,
        restaurant: restaurant
      });
    });
    
    return groupedMarkers;
  }, [filteredMeals]);

  useEffect(() => {
    if (showWishlist) {
      fetchSavedMeals();
    } else {
      fetchMealEntries();
    }
  }, [showWishlist]); // Re-fetch when toggling between modes

  const fetchSavedMeals = async () => {
    try {
      setLoading(true);
      const targetUserId = userId || auth().currentUser?.uid;
      
      if (!targetUserId) {
        setError('User not authenticated');
        setLoading(false);
        return;
      }
      
      // Only show saved meals for own profile
      if (userId && userId !== auth().currentUser?.uid) {
        setAllMeals([]);
        setFilteredMeals([]);
        setLoading(false);
        return;
      }
      
      // Get list of saved meal IDs first
      const savedMealsRef = firestore()
        .collection('users')
        .doc(targetUserId)
        .collection('savedMeals');
      
      const savedMealsSnapshot = await savedMealsRef.get();
      const savedMealIds = savedMealsSnapshot.docs.map(doc => doc.data().mealId);
      
      if (savedMealIds.length === 0) {
        // No saved meals
        setAllMeals([]);
        setFilteredMeals([]);
        setLoading(false);
        return;
      }
      
      // Fetch full meal details for each saved meal ID
      const fetchedMeals: MealEntry[] = [];
      
      // Process in batches to avoid potential issues with large arrays
      const batchSize = 10;
      for (let i = 0; i < savedMealIds.length; i += batchSize) {
        const batch = savedMealIds.slice(i, i + batchSize);
        
        // For each batch, get the actual meal data
        for (const mealId of batch) {
          try {
            const mealDoc = await firestore().collection('mealEntries').doc(mealId).get();
            
            if (mealDoc.exists) {
              const data = mealDoc.data();
              
              // Only include meals that have location data
              if (data.location) {
                // Make sure aiMetadata has the expected properties
                const aiMetadata = data.aiMetadata || {};
                
                fetchedMeals.push({
                  id: mealDoc.id,
                  photoUrl: data.photoUrl,
                  rating: data.rating,
                  restaurant: data.restaurant || '',
                  meal: data.meal || '',
                  userId: data.userId,
                  location: data.location,
                  createdAt: data.createdAt?.toDate?.() || Date.now(),
                  aiMetadata: {
                    cuisineType: aiMetadata.cuisineType || 'Unknown',
                    foodType: aiMetadata.foodType || 'Unknown',
                    mealType: aiMetadata.mealType || 'Unknown',
                    primaryProtein: aiMetadata.primaryProtein || 'Unknown',
                    dietType: aiMetadata.dietType || 'Unknown',
                    eatingMethod: aiMetadata.eatingMethod || 'Unknown',
                    setting: aiMetadata.setting || 'Unknown',
                    platingStyle: aiMetadata.platingStyle || 'Unknown',
                    beverageType: aiMetadata.beverageType || 'Unknown'
                  }
                });
              }
            }
          } catch (err) {
            console.error(`Error fetching meal ${mealId}:`, err);
          }
        }
      }
      
      setAllMeals(fetchedMeals);
      applyFilter(fetchedMeals, activeFilters, activeRatingFilters);
      setLoading(false);
      
      // Trigger map fitting after data is loaded
      if (fetchedMeals.length > 0 && mapRef.current) {
        setTimeout(() => fitMapToMarkers(), 500);
      }
    } catch (err: any) {
      console.error('Error fetching saved meals:', err);
      setError(`Failed to load saved meals: ${err.message}`);
      setLoading(false);
    }
  };
  
  const fetchMealEntries = async () => {
    try {
      setLoading(true);
      const targetUserId = userId || auth().currentUser?.uid;
      
      if (!targetUserId) {
        setError('User not authenticated');
        setLoading(false);
        return;
      }
      
      const querySnapshot = await firestore()
        .collection('mealEntries')
        .where('userId', '==', targetUserId)
        .orderBy('createdAt', 'desc')
        .get();
      
      const fetchedMeals: MealEntry[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Only include meals that have location data
        if (data.location) {
          // Make sure aiMetadata has the expected properties
          const aiMetadata = data.aiMetadata || {};
          
          fetchedMeals.push({
            id: doc.id,
            photoUrl: data.photoUrl,
            rating: data.rating,
            restaurant: data.restaurant || '',
            meal: data.meal || '',
            userId: data.userId,
            location: data.location,
            createdAt: data.createdAt?.toDate?.() || Date.now(),
            aiMetadata: {
              cuisineType: aiMetadata.cuisineType || 'Unknown',
              foodType: aiMetadata.foodType || ['Unknown'],
              mealType: aiMetadata.mealType || 'Unknown',
              primaryProtein: aiMetadata.primaryProtein || 'Unknown',
              dietType: aiMetadata.dietType || 'Unknown',
              eatingMethod: aiMetadata.eatingMethod || 'Unknown',
              setting: aiMetadata.setting || 'Unknown',
              platingStyle: aiMetadata.platingStyle || 'Unknown',
              beverageType: aiMetadata.beverageType || 'Unknown'
            }
          });
        }
      });

      setAllMeals(fetchedMeals);
      applyFilter(fetchedMeals, activeFilters, activeRatingFilters);
      setLoading(false);
      
      // Trigger map fitting after data is loaded
      if (fetchedMeals.length > 0 && mapRef.current) {
        setTimeout(() => fitMapToMarkers(), 500);
      }
    } catch (err: any) {
      console.error('Error fetching meal entries:', err);
      setError(`Failed to load meals: ${err.message}`);
      setLoading(false);
    }
  };

  const viewMealDetails = (meal: MealEntry) => {
    // Close modal if open
    setShowMealsModal(false);
    setSelectedLocationMeals(null);
    navigation.navigate('MealDetail', { 
      mealId: meal.id,
      previousScreen: 'FoodPassport',
      previousTabIndex: 2 // Map tab is at index 2
    });
  };
  
  const handleLocationPress = (meals: MealEntry[]) => {
    // Always use pager dot view behavior now
    // For both single and multiple meals, don't navigate directly
    // Let the callout handle navigation
    return;
  };
  
  const handleMarkerPress = (locationKey: string, meals: MealEntry[]) => {
    if (meals.length > 1) {
      // Cycle through meals
      const currentIndex = selectedMarkerIndex[locationKey] || 0;
      const nextIndex = (currentIndex + 1) % meals.length;
      setSelectedMarkerIndex(prev => ({ ...prev, [locationKey]: nextIndex }));
    } else {
      handleLocationPress(meals);
    }
  };

  const handleImageError = (mealId: string) => {
    console.log(`Image load error for meal: ${mealId}`);
    setImageErrors(prev => ({ ...prev, [mealId]: true }));
  };

  // Add function to apply multiple filters
  const applyFilter = (mealsToFilter: MealEntry[], filters: FilterItem[] | null, ratingFilters?: number[] | null) => {
    console.log(`MapScreen: Applying filters to ${mealsToFilter.length} meals`);
    
    if ((!filters || filters.length === 0) && (!ratingFilters || ratingFilters.length === 0)) {
      console.log('MapScreen: No filters active, showing all meals');
      setFilteredMeals(mealsToFilter);
      return;
    }
    
    console.log(`MapScreen: ${filters?.length || 0} filters active, ${ratingFilters?.length || 0} rating filters active`);
    
    // Check if we have meals with metadata
    const mealsWithMetadata = mealsToFilter.filter(meal => meal.aiMetadata);
    console.log(`MapScreen: Found ${mealsWithMetadata.length} meals with aiMetadata`);
    
    // Start with all meals
    let result = [...mealsToFilter];
    
    // Apply each filter sequentially
    if (filters && filters.length > 0) {
      filters.forEach(filter => {
      console.log(`MapScreen: Applying filter: ${filter.type} = ${filter.value}`);
      
      if (filter.type === 'cuisineType') {
        result = result.filter(meal => 
          meal.aiMetadata && 
          meal.aiMetadata.cuisineType && 
          meal.aiMetadata.cuisineType === filter.value
        );
      } else if (filter.type === 'foodType') {
        result = result.filter(meal => {
          if (!meal.aiMetadata || !meal.aiMetadata.foodType) return false;
          
          // foodType is now an array
          if (Array.isArray(meal.aiMetadata.foodType)) {
            return meal.aiMetadata.foodType.includes(filter.value);
          } else {
            // Handle old data that might still be a string
            return meal.aiMetadata.foodType === filter.value;
          }
        });
      } else if (filter.type === 'city') {
        result = result.filter(meal => {
          // First check if city is stored in location.city
          if (meal.location && meal.location.city) {
            return meal.location.city.toLowerCase() === filter.value.toLowerCase();
          }
          
          // Fallback: Try to match city in restaurant field
          if (meal.restaurant) {
            const restaurantParts = meal.restaurant.split(',');
            if (restaurantParts.length > 1) {
              const city = restaurantParts[1].trim();
              return city.toLowerCase() === filter.value.toLowerCase();
            }
          }
          return false;
        });
      }
      
      console.log(`MapScreen: After filter ${filter.type}=${filter.value}, ${result.length} meals remain`);
      });
    }
    
    console.log(`MapScreen: Final filter results: ${result.length} meals match all filter criteria`);
    
    // Apply rating filters if any are active
    if (ratingFilters && ratingFilters.length > 0) {
      console.log(`MapScreen: Applying rating filters:`, ratingFilters);
      const beforeRatingFilter = result.length;
      result = result.filter(meal => ratingFilters.includes(meal.rating));
      console.log(`MapScreen: After rating filter: ${beforeRatingFilter} meals -> ${result.length} meals remain`);
    }
    
    setFilteredMeals(result);
  };
  
  // Update the filter whenever activeFilters changes or when switching between modes
  useEffect(() => {
    console.log('MapScreen: activeFilters or activeRatingFilters changed or showWishlist toggled');
    applyFilter(allMeals, activeFilters, activeRatingFilters);
    
    // When filter changes and we have meals, fit the map to show them
    if (filteredMeals.length > 0 && mapRef.current && !loading) {
      setTimeout(() => fitMapToMarkers(), 500); // Small delay to ensure filteredMeals is updated
    }
  }, [activeFilters, activeRatingFilters, allMeals, showWishlist]);
  
  // Request location permission and get current position
  const requestLocationPermission = async () => {
    if (Platform.OS === 'ios') {
      Geolocation.requestAuthorization();
      getCurrentPosition();
    } else {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Location Permission",
            message: "This app needs access to your location to center the map",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK"
          }
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          getCurrentPosition();
        }
      } catch (err) {
        console.warn(err);
      }
    }
  };
  
  // Get current position and center map on it
  const getCurrentPosition = () => {
    Geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ latitude, longitude });
        
        // Always center on user location when this function is called directly
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude,
            longitude,
            latitudeDelta: 0.02, // Very close zoom level
            longitudeDelta: 0.02,
          }, 1000); // Animation duration in ms
        }
      },
      error => {
        console.log('Error getting location:', error);
        Alert.alert('Location Error', 'Could not get your current location. Please check your location settings.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };
  
  // Effect to handle tab activation or switching between My Meals and Wishlist
  useEffect(() => {
    if (isActive && mapRef.current) {
      // If we have filtered meals, fit map to those pins
      if (filteredMeals.length > 0) {
        fitMapToMarkers();
      } else {
        // If no filtered meals, try to center on user location
        requestLocationPermission();
      }
    }
  }, [isActive, filteredMeals.length, showWishlist]);
  
  // Function to fit map to all markers
  const fitMapToMarkers = () => {
    if (!mapRef.current || filteredMeals.length === 0) return;
    
    // Create an array of coordinates from filtered meals
    const points = filteredMeals
      .filter(meal => meal.location && meal.location.latitude && meal.location.longitude)
      .map(meal => ({
        latitude: meal.location!.latitude,
        longitude: meal.location!.longitude
      }));
    
    if (points.length === 0) return;
    
    // If there's only one point, center on it with a closer zoom
    if (points.length === 1) {
      mapRef.current.animateToRegion({
        latitude: points[0].latitude,
        longitude: points[0].longitude,
        latitudeDelta: 0.01,  // Closer zoom for single point
        longitudeDelta: 0.01,
      }, 1000);
      return;
    }
    
    // For multiple points, fit all markers on screen with padding
    mapRef.current.fitToCoordinates(points, {
      edgePadding: { top: 80, right: 80, bottom: 80, left: 80 },
      animated: true
    });
  };

  // Calculate initial region based on filtered meals
  const initialRegion = useMemo<Region>(() => {
    const mealsToUse = filteredMeals;
    
    // Default fallback if no meals with location
    if (mealsToUse.length === 0) {
      return {
        latitude: 37.78825,
        longitude: -122.4324,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };
    }
    
    // Calculate bounds for all meal locations
    let minLat = Number.MAX_VALUE;
    let maxLat = Number.MIN_VALUE;
    let minLng = Number.MAX_VALUE;
    let maxLng = Number.MIN_VALUE;
    
    mealsToUse.forEach(meal => {
      if (meal.location) {
        minLat = Math.min(minLat, meal.location.latitude);
        maxLat = Math.max(maxLat, meal.location.latitude);
        minLng = Math.min(minLng, meal.location.longitude);
        maxLng = Math.max(maxLng, meal.location.longitude);
      }
    });
    
    // Check if we have valid bounds
    if (minLat === Number.MAX_VALUE) {
      return {
        latitude: 37.78825,
        longitude: -122.4324,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };
    }
    
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    
    // Calculate appropriate deltas to include all points with padding
    const latDelta = (maxLat - minLat) * 1.2; 
    const lngDelta = (maxLng - minLng) * 1.2;
    
    return {
      latitude: centerLat,
      longitude: centerLng,
      latitudeDelta: Math.max(0.01, latDelta), // Minimum zoom level
      longitudeDelta: Math.max(0.01, lngDelta),
    };
  }, [filteredMeals]);

  // Function to share map locations - currently showing a coming soon message
  const shareMapToGoogleMaps = async () => {
    // Show an overlay message about the upcoming share feature
    Alert.alert(
      "Coming Soon",
      "Once the app is released, you will be able to share a Google Map with saved pins and meal cards with friends, so they can see your favorite meals in Paris, or your favorite burritos in Santa Fe. It will also prompt them to download the app via the App Store so they can explore your passport on their own.",
      [
        {
          text: "OK",
          style: "default"
        }
      ]
    );

    /* Original implementation commented out for future reference
    try {
      // Use filtered meals for sharing
      const mealsToShare = filteredMeals;
      
      if (mealsToShare.length === 0) {
        Alert.alert("Nothing to Share", "Add meals with location to share your food map.");
        return;
      }

      // Build a Google Maps URL with multiple markers
      // Format: https://www.google.com/maps/dir/?api=1&destination=lat,lng&waypoints=lat,lng|lat,lng

      // Use first meal as destination
      const firstMeal = mealsToShare[0];
      let mapUrl = `https://www.google.com/maps/search/?api=1&query=${firstMeal.location?.latitude},${firstMeal.location?.longitude}`;

      // If there are multiple meals, create a custom map link instead
      if (mealsToShare.length > 1) {
        // Start a custom map link
        mapUrl = 'https://www.google.com/maps/dir/?api=1';

        // Add destination (first meal)
        mapUrl += `&destination=${firstMeal.location?.latitude},${firstMeal.location?.longitude}`;

        // Add waypoints (other meals) - limited to 10 due to URL length limits
        const waypoints = mealsToShare.slice(1, 10).map(meal =>
          `${meal.location?.latitude},${meal.location?.longitude}`
        ).join('|');

        if (waypoints) {
          mapUrl += `&waypoints=${waypoints}`;
        }
      }

      // Create a shareable text
      const shareText = `Check out my Food Passport with ${mealsToShare.length} dining experiences! 🍽️\n\n`;
      const locationNames = mealsToShare.slice(0, 5).map(meal =>
        meal.restaurant || meal.meal || 'Untitled meal'
      ).join(', ');

      const shareMessage = `${shareText}Featuring: ${locationNames}${mealsToShare.length > 5 ? ' and more...' : ''}`;

      try {
        // Use React Native's Share API
        await Share.share({
          message: shareMessage + '\n\n' + mapUrl,
          url: mapUrl // Note: this may only work on iOS
        });
      } catch (error) {
        console.log('Error sharing:', error);
        // Fallback - copy to clipboard
        Clipboard.setString(shareMessage + '\n\n' + mapUrl);
        Alert.alert(
          'Link Copied',
          'Map link copied to clipboard. Would you like to open the map?',
          [
            {
              text: 'Cancel',
              style: 'cancel'
            },
            {
              text: 'Open Map',
              onPress: () => Linking.openURL(mapUrl)
            }
          ]
        );
      }
    } catch (error) {
      console.error('Error creating share link:', error);
      Alert.alert('Error', 'Could not create share link');
    }
    */
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff6b6b" />
        <Text style={styles.loadingText}>Loading your food map...</Text>
      </View>
    );
  }
  
  if (filteredMeals.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        {!showWishlist && <Icon name="place" size={64} color="#ddd" />}
        {activeFilters && activeFilters.length > 0 ? (
          <>
            <Text style={styles.emptyText}>No meals match your filters</Text>
            <Text style={styles.emptySubtext}>
              Try different filters or clear your search
            </Text>
          </>
        ) : (
          <>
            {showWishlist ? (
              <>
                <Text style={styles.emptyText}>No saved meals yet</Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyText}>No meals with location data</Text>
                <Text style={styles.emptySubtext}>
                  Add meals with location information to see them on the map
                </Text>
              </>
            )}
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.mapContainer}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={true}
        onMapReady={fitMapToMarkers}
      >
        {locationGroupedMarkers.map(({ locationKey, coordinate, meals, restaurant }) => {
          const currentIndex = selectedMarkerIndex[locationKey] || 0;
          const currentMeal = meals[currentIndex];
          
          return (
            <Marker
              key={locationKey}
              coordinate={coordinate}
              onPress={() => handleMarkerPress(locationKey, meals)}
            >
              {/* Custom marker view - show photo preview for all pins */}
              <View style={styles.customPhotoMarker}>
                {currentMeal.photoUrl && !imageErrors[currentMeal.id] ? (
                  <Image
                    source={{ uri: currentMeal.photoUrl }}
                    style={styles.markerPhoto}
                    onError={() => handleImageError(currentMeal.id)}
                  />
                ) : (
                  <View style={[styles.markerPhoto, styles.markerPhotoPlaceholder]}>
                    <Icon name="image" size={20} color="#ddd" />
                  </View>
                )}
                {/* Pager dots for multiple meals */}
                {meals.length > 1 && (
                  <View style={styles.pagerDots}>
                    {meals.map((_, index) => (
                      <View
                        key={index}
                        style={[
                          styles.pagerDot,
                          index === currentIndex && styles.pagerDotActive,
                          { backgroundColor: index === currentIndex ? (showWishlist ? '#FFC008' : '#E63946') : '#ddd' }
                        ]}
                      />
                    ))}
                  </View>
                )}
              </View>
              <Callout
                tooltip
                onPress={() => {
                  // Always navigate to details in the current view
                  viewMealDetails(currentMeal);
                }}
                style={[styles.callout, styles.photoCallout]}
              >
                <View style={styles.calloutContent}>
                  {/* Enhanced callout with bigger image preview */}
                  <>
                    {currentMeal.photoUrl && !imageErrors[currentMeal.id] ? (
                      <Image
                        source={{ uri: currentMeal.photoUrl }}
                        style={styles.calloutImageLarge}
                        onError={() => handleImageError(currentMeal.id)}
                      />
                    ) : (
                      <View style={styles.calloutImageLargePlaceholder}>
                        <Icon name="image" size={30} color="#ddd" />
                      </View>
                    )}
                    <View style={styles.calloutTitleRow}>
                      <Text style={styles.calloutTitle} numberOfLines={1}>
                        {currentMeal.meal || 'Untitled meal'}
                      </Text>
                      <EmojiDisplay rating={currentMeal.rating} size={16} />
                    </View>
                    {currentMeal.restaurant && (
                      <Text style={styles.calloutSubtitle} numberOfLines={1}>{currentMeal.restaurant}</Text>
                    )}
                    {meals.length > 1 && (
                      <>
                        {/* Pager dots in callout */}
                        <View style={styles.calloutPagerDots}>
                          {meals.map((_, index) => (
                            <View
                              key={index}
                              style={[
                                styles.calloutPagerDot,
                                index === currentIndex && styles.calloutPagerDotActive,
                                { backgroundColor: index === currentIndex ? (showWishlist ? '#FFC008' : '#E63946') : '#ddd' }
                              ]}
                            />
                          ))}
                        </View>
                        <Text style={styles.calloutInstruction}>
                          Tap marker to cycle • Tap here for details
                        </Text>
                      </>
                    )}
                  </>
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapView>

      {/* Wishlist Toggle Button */}
      <View style={styles.wishlistToggleContainer}>
        <TouchableOpacity
          style={[styles.wishlistToggleButton, showWishlist && styles.wishlistActive]}
          onPress={() => setShowWishlist(!showWishlist)}
        >
          {showWishlist && (
            <Image
              source={require('../assets/icons/wishlist-active.png')}
              style={styles.wishlistButtonIcon}
              resizeMode="contain"
            />
          )}
          <Text style={styles.wishlistToggleText}>
            {showWishlist ? `Showing: Wishlist (${filteredMeals.length})` : `Showing: Meals (${filteredMeals.length})`}
          </Text>
        </TouchableOpacity>
      </View>
      
      {/* Floating buttons */}
      <View style={styles.buttonContainer}>
        {/* My Location button - to center on user's current location */}
        <TouchableOpacity
          style={[
            styles.floatingButton, 
            styles.locationButton, 
            showWishlist && { backgroundColor: 'rgba(255, 192, 8, 0.5)' }
          ]}
          onPress={requestLocationPermission}
        >
          <Image source={MAP_ICONS.myLocation} style={styles.buttonIcon} />
        </TouchableOpacity>
        
        {/* Share button */}
        <TouchableOpacity
          style={[
            styles.floatingButton, 
            styles.locationButton, 
            showWishlist && { backgroundColor: 'rgba(255, 192, 8, 0.5)' }
          ]}
          onPress={shareMapToGoogleMaps}
        >
          <Image source={MAP_ICONS.share} style={styles.buttonIcon} />
        </TouchableOpacity>
      </View>
      
      {/* Modal for multiple meals at one location */}
      <Modal
        visible={showMealsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowMealsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedLocationMeals?.[0]?.restaurant || 'Meals at this location'}
              </Text>
              <TouchableOpacity 
                onPress={() => setShowMealsModal(false)}
                style={styles.modalCloseButton}
              >
                <Icon name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              {selectedLocationMeals?.map((meal, index) => (
                <TouchableOpacity
                  key={meal.id}
                  style={[
                    styles.modalMealCard,
                    index === selectedLocationMeals.length - 1 && { marginRight: 0 }
                  ]}
                  activeOpacity={0.9}
                  onPress={() => viewMealDetails(meal)}
                >
                  {meal.photoUrl && !imageErrors[meal.id] ? (
                    <Image
                      source={{ uri: meal.photoUrl }}
                      style={styles.modalMealImage}
                      onError={() => handleImageError(meal.id)}
                    />
                  ) : (
                    <View style={styles.modalMealImagePlaceholder}>
                      <Icon name="image" size={30} color="#ddd" />
                    </View>
                  )}
                  <View style={styles.modalMealInfo}>
                    <Text style={styles.modalMealName} numberOfLines={2}>
                      {meal.meal || 'Untitled meal'}
                    </Text>
                    <View style={styles.modalRating}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Image
                          key={star}
                          source={star <= meal.rating 
                            ? require('../assets/stars/star-filled.png')
                            : require('../assets/stars/star-empty.png')
                          }
                          style={styles.modalStar}
                        />
                      ))}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#555',
    marginTop: 15,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 5,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  buttonContainer: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  floatingButton: {
    backgroundColor: 'rgba(230, 57, 70, 0.8)', // Increased opacity to 0.8
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    marginBottom: 10,
  },
  locationButton: {
    width: 48,
  },
  buttonIcon: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
    tintColor: '#fff', // White tint for the icons
  },
  callout: {
    width: 160,
    borderRadius: 10,
    padding: 0,
    backgroundColor: 'transparent',
  },
  calloutContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  calloutImage: {
    width: '100%',
    height: 80,
    borderRadius: 5,
    marginBottom: 5,
  },
  calloutImagePlaceholder: {
    width: '100%',
    height: 80,
    borderRadius: 5,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  calloutTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  calloutTitle: {
    fontWeight: 'bold',
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  calloutSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 3,
  },
  calloutTapText: {
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 5,
  },
  calloutGroupText: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
  },
  // Custom marker styles
  customMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  markerBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  markerBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  // Carousel callout styles
  carouselCallout: {
    width: 280,
    minHeight: 200,
    borderRadius: 10,
    padding: 0,
    backgroundColor: 'transparent',
  },
  carouselCalloutContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  carouselTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  carouselScrollView: {
    maxHeight: 140,
    marginBottom: 5,
  },
  carouselItem: {
    width: 100,
    marginRight: 10,
    alignItems: 'center',
  },
  carouselImage: {
    width: 90,
    height: 90,
    borderRadius: 8,
    marginBottom: 5,
  },
  carouselImagePlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  carouselMealName: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
    marginBottom: 3,
  },
  carouselRating: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  carouselTapText: {
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 5,
  },
  wishlistToggleContainer: {
    position: 'absolute',
    top: 10, // Reduced from 16 to 10 for less space at the top
    left: 16,
    zIndex: 1,
  },
  wishlistToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E63946', // Changed to Lobster red color for "My Meals" mode
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  wishlistActive: {
    backgroundColor: '#FFC008', // Orange color for "Wishlist" mode
  },
  wishlistToggleText: {
    color: 'white',
    fontWeight: 'bold',
    marginLeft: 5,
    fontSize: 12,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  calloutSavedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffc008',
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  calloutSavedText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 3,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  wishlistButtonIcon: {
    width: 18,
    height: 18,
    tintColor: 'white',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
    maxHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    marginRight: 10,
  },
  modalCloseButton: {
    padding: 5,
  },
  modalScrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  modalMealCard: {
    width: 150,
    marginRight: 15,
  },
  modalMealImage: {
    width: 150,
    height: 150,
    borderRadius: 12,
    marginBottom: 8,
  },
  modalMealImagePlaceholder: {
    width: 150,
    height: 150,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalMealInfo: {
    alignItems: 'center',
  },
  modalMealName: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
    marginBottom: 5,
    fontWeight: '500',
  },
  modalRating: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  calloutStar: {
    width: 14,
    height: 14,
    marginHorizontal: 1,
  },
  modalStar: {
    width: 14,
    height: 14,
    marginHorizontal: 1,
  },
  // Custom photo marker styles for pager dot view
  customPhotoMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerPhoto: {
    width: 60, // Increased for better visibility like HomeMapComponent
    height: 60, // Increased for better visibility like HomeMapComponent
    borderRadius: 8, // Square with slight rounding like HomeMapComponent
    borderWidth: 3,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  markerPhotoPlaceholder: {
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pagerDots: {
    flexDirection: 'row',
    position: 'absolute',
    bottom: -10,
    backgroundColor: 'white',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  pagerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 2,
  },
  pagerDotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  photoCallout: {
    width: 220,
  },
  calloutRatingRow: {
    flexDirection: 'row',
    marginVertical: 3,
    justifyContent: 'center',
  },
  calloutInstruction: {
    fontSize: 9,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 3,
    textAlign: 'center',
  },
  calloutImageLarge: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    marginBottom: 8,
  },
  calloutImageLargePlaceholder: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  calloutPagerDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 5,
  },
  calloutPagerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 3,
  },
  calloutPagerDotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

export default MapScreen;