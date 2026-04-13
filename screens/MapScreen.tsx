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
import MapView, { Marker, Callout, Region, PROVIDER_GOOGLE } from 'react-native-maps';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../App';
import Geolocation from '@react-native-community/geolocation';
import { FilterItem } from '../components/SimpleFilterComponent';
import EmojiDisplay from '../components/EmojiDisplay';
// Import theme
import { colors, typography, spacing, shadows } from '../themes';
import { mapStyle } from '../config/mapStyle';

// Custom button icons - replace these with actual assets when available
const MAP_ICONS = {
  myLocation: require('../assets/icons/map/my-location.png'),
  share: require('../assets/icons/map/share.png'),
  checkmark: { uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAsTAAALEwEAmpwYAAAA8klEQVR4nO2VMU7DQBBF3xaUBpooJQ2hpPYFkhtwAtLQpM0dcgFEGuqUdDkFdLkDcAJS0FBkCyOtbCsKGstJSvKkkUYz+1/P7swG/o0JKlzwSI4FNV44IseZZB94HMbPVaRQ0OJU0PziMiixJ1h9sxkdwRRHWLMtXIJdwfKH7l2CE8F8DdeRGQyxF1M4L8d0xZUbQbvDZRKCDTWzKAIHM4zjXuMkgaDBbkzhuAZX1DngELeJXZQz6AmqFRCPRNDinncFFS7/4OpLJHbRfYcgBXV8+vQTcT9SbfVcx39uqSBf8Kn5rmDYWNgJsZygCZYf+HfeAe9jVYQkXxGBAAAAAElFTkSuQmCC' }
};

// Map style imported from shared config (config/mapStyle.ts)

type MapScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, 'FoodPassport'>;
  activeFilters: FilterItem[] | null;
  activeRatingFilters?: number[] | null;
  isActive?: boolean; // Flag to indicate if this tab is currently active
  userId?: string; // Optional userId to view other users' maps
  onFilterChange?: (filters: FilterItem[] | null) => void;
};

interface MealEntry {
  id: string;
  photoUrl: string;
  pixel_art_url?: string;
  rating: number;
  restaurant: string;
  meal: string;
  userId?: string;
  userName?: string;
  userPhoto?: string;
  city?: string;
  location: {
    latitude: number;
    longitude: number;
    city?: string;
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

// Calculate zoom level from region
const calculateZoomLevel = (region: Region): number => {
  const longitudeDelta = region.longitudeDelta;
  // Approximate zoom level calculation
  return Math.round(Math.log(360 / longitudeDelta) / Math.LN2);
};

const MapScreen: React.FC<MapScreenProps> = ({ navigation, activeFilters, activeRatingFilters, isActive, userId, onFilterChange }) => {
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
  const [currentZoom, setCurrentZoom] = useState<number>(10); // Track current zoom level
  
  // Map view reference
  const mapRef = useRef<MapView | null>(null);
  
  // Group meals by location for carousel display
  // Zoom-aware clustering: at low zoom, nearby restaurants merge into dots.
  // As you zoom in, clusters break apart into individual pixel art markers.
  const locationGroupedMarkers = useMemo(() => {
    const mealsWithLocation = filteredMeals.filter(meal => meal.location?.latitude && meal.location?.longitude);

    // Grid precision based on zoom level:
    // Lower zoom → coarser grid → more merging
    // Higher zoom → finer grid → individual markers
    // Caps at 1 decimal (~11km) so cities/regions never merge into one blob
    let decimals: number;
    if (currentZoom >= 15) {
      decimals = 4;      // ~11m — exact locations, no clustering
    } else if (currentZoom >= 13) {
      decimals = 3;      // ~110m — very close restaurants merge
    } else if (currentZoom >= 11) {
      decimals = 2;      // ~1.1km — neighborhood-level clusters
    } else {
      decimals = 1;      // ~11km — area-level clusters (cap here)
    }

    const locationGroups: { [key: string]: MealEntry[] } = {};

    mealsWithLocation.forEach(meal => {
      if (!meal.location) return;

      const lat = meal.location.latitude.toFixed(decimals);
      const lng = meal.location.longitude.toFixed(decimals);
      const locationKey = `${lat},${lng}`;

      if (!locationGroups[locationKey]) {
        locationGroups[locationKey] = [];
      }
      locationGroups[locationKey].push(meal);
    });

    // Create one marker per cluster — coordinate is the average of all meals in the cluster
    const groupedMarkers: Array<{
      locationKey: string,
      coordinate: {latitude: number, longitude: number},
      meals: MealEntry[],
      restaurant?: string,
      uniqueRestaurants: number,
    }> = [];

    Object.entries(locationGroups).forEach(([locationKey, meals]) => {
      const avgLat = meals.reduce((sum, m) => sum + m.location!.latitude, 0) / meals.length;
      const avgLng = meals.reduce((sum, m) => sum + m.location!.longitude, 0) / meals.length;
      const restaurant = meals[0].restaurant || meals.find(m => m.restaurant)?.restaurant;
      const uniqueRestaurants = new Set(meals.map(m => m.restaurant || m.id)).size;

      groupedMarkers.push({
        locationKey,
        coordinate: { latitude: avgLat, longitude: avgLng },
        meals,
        restaurant,
        uniqueRestaurants,
      });
    });

    return groupedMarkers;
  }, [filteredMeals, currentZoom]);

  // Force meals view (not wishlist) when in passport context
  useEffect(() => {
    if (userId && showWishlist) {
      setShowWishlist(false);
    }
  }, [userId]);

  useEffect(() => {
    if (showWishlist && !userId) { // Only allow wishlist when not in passport context
      fetchSavedMeals();
    } else {
      fetchMealEntries();
    }
  }, [showWishlist, userId]); // Re-fetch when toggling between modes or userId changes

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
      const result = applyFilter(fetchedMeals, activeFilters, activeRatingFilters);
      setLoading(false);

      // Trigger map fitting with freshly computed meals
      if (result && result.length > 0 && mapRef.current) {
        setTimeout(() => fitMapToMarkers(result), 300);
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
            pixel_art_url: data.pixel_art_url || '',
            rating: data.rating,
            restaurant: data.restaurant || '',
            meal: data.meal || '',
            city: data.city || data.location?.city || '',
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
      const result = applyFilter(fetchedMeals, activeFilters, activeRatingFilters);
      setLoading(false);

      // Trigger map fitting with freshly computed meals
      if (result && result.length > 0 && mapRef.current) {
        setTimeout(() => fitMapToMarkers(result), 300);
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
    // Always open carousel — even for single meals
    setSelectedLocationMeals(meals);
    setShowMealsModal(true);
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
    return result; // Return so callers can use the result immediately
  };

  // Update the filter whenever activeFilters changes or when switching between modes
  useEffect(() => {
    console.log('MapScreen: activeFilters or activeRatingFilters changed or showWishlist toggled');
    const result = applyFilter(allMeals, activeFilters, activeRatingFilters);

    // Fit map to the freshly computed meals (not stale state)
    if (result && result.length > 0 && mapRef.current && !loading) {
      setTimeout(() => fitMapToMarkers(result), 300);
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
  const fitMapToMarkers = (mealsOverride?: MealEntry[]) => {
    if (!mapRef.current) return;

    const meals = mealsOverride || filteredMeals;
    if (meals.length === 0) return;

    // Create an array of coordinates from meals
    const points = meals
      .filter(meal => meal.location && meal.location.latitude && meal.location.longitude)
      .map(meal => ({
        latitude: meal.location!.latitude,
        longitude: meal.location!.longitude
      }));

    if (points.length === 0) return;

    // If there's only one point, center on it at street level
    if (points.length === 1) {
      mapRef.current.animateToRegion({
        latitude: points[0].latitude,
        longitude: points[0].longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 1000);
      return;
    }

    // For multiple points, fit all markers on screen with tight padding
    mapRef.current.fitToCoordinates(points, {
      edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
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

  // City chips — derived from all meals (must be above early returns)
  const cityChips = useMemo(() => {
    const counts: Record<string, number> = {};
    allMeals.forEach((m) => {
      const city = m.city || m.location?.city || '';
      if (city.trim()) {
        const name = city.trim();
        counts[name] = (counts[name] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name]) => ({label: name, type: 'city', value: name.toLowerCase()}));
  }, [allMeals]);

  const isCityChipActive = (chip: {type: string; value: string}) =>
    !!activeFilters?.some((f) => f.type === chip.type && f.value === chip.value);

  const handleCityChipPress = (chip: {label: string; type: string; value: string}) => {
    if (!onFilterChange) return;
    const current = activeFilters || [];
    const active = isCityChipActive(chip);
    if (active) {
      const next = current.filter((f) => !(f.type === chip.type && f.value === chip.value));
      onFilterChange(next.length > 0 ? next : null);
    } else {
      onFilterChange([...current, chip]);
    }
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
        {activeFilters && activeFilters.length > 0 ? (
          <>
            <Icon name="place" size={64} color="#ddd" />
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
                <Text style={styles.emptyText}>Add meals to see your automatically generated, sharable map!</Text>
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
        provider={PROVIDER_GOOGLE}
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={true}
        customMapStyle={mapStyle}
        onMapReady={fitMapToMarkers}
        onRegionChangeComplete={(region) => {
          const zoomLevel = calculateZoomLevel(region);
          setCurrentZoom(zoomLevel);
        }}
      >
        {locationGroupedMarkers.map(({ locationKey, coordinate, meals, restaurant, uniqueRestaurants }) => {
          // Pick the best meal to represent this cluster:
          // highest rated, tiebreak by earliest photo (oldest first)
          const bestMeal = [...meals].sort((a, b) => {
            if (b.rating !== a.rating) return b.rating - a.rating;
            return (a.createdAt || 0) - (b.createdAt || 0);
          })[0];

          // Show dot when cluster has 2+ unique restaurants, pixel art when just 1
          const showDot = uniqueRestaurants >= 2;
          const markerType = showDot ? 'dot' : 'emoji';

          return (
            <Marker
              key={`${locationKey}-${markerType}`}
              coordinate={coordinate}
              tracksViewChanges={false}
              onPress={() => handleMarkerPress(locationKey, meals)}
            >
              {showDot ? (
                // Scaled dot — sized by unique restaurant count
                (() => {
                  const baseSize = 14;
                  const dotSize = Math.min(baseSize + Math.sqrt(uniqueRestaurants - 1) * 8, 36);
                  return (
                    <View style={[
                      styles.scaledDot,
                      {
                        width: dotSize,
                        height: dotSize,
                        borderRadius: dotSize / 2,
                      },
                    ]} />
                  );
                })()
              ) : (
                // Single restaurant — show pixel art
                <View style={styles.customPhotoMarker}>
                  {bestMeal.pixel_art_url ? (
                    <Image
                      source={{ uri: bestMeal.pixel_art_url }}
                      style={styles.markerPixelArt}
                      resizeMode="contain"
                    />
                  ) : bestMeal.photoUrl && !imageErrors[bestMeal.id] ? (
                    <Image
                      source={{ uri: bestMeal.photoUrl }}
                      style={styles.markerPhoto}
                      onError={() => handleImageError(bestMeal.id)}
                    />
                  ) : (
                    <View style={[styles.markerPhoto, styles.markerPhotoPlaceholder]}>
                      <Icon name="image" size={20} color="#ddd" />
                    </View>
                  )}
                </View>
              )}
            </Marker>
          );
        })}
      </MapView>

      {/* City chips — rendered AFTER MapView so they sit on top of the native map */}
      {cityChips.length > 1 && onFilterChange && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.cityChipsContainer}
          contentContainerStyle={styles.cityChipsRow}
        >
          {cityChips.map((chip) => {
            const active = isCityChipActive(chip);
            return (
              <TouchableOpacity
                key={chip.value}
                style={[styles.cityChip, active && styles.cityChipActive]}
                onPress={() => handleCityChipPress(chip)}
                activeOpacity={0.7}
              >
                <Text style={[styles.cityChipText, active && styles.cityChipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Wishlist Toggle Button - Only show in standalone map, not in passport context */}
      {!userId && (
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
      )}
      
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
                  {/* Photo with pixel art overlay */}
                  <View style={styles.modalImageContainer}>
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
                    {meal.pixel_art_url ? (
                      <Image
                        source={{ uri: meal.pixel_art_url }}
                        style={styles.modalPixelArtOverlay}
                        resizeMode="contain"
                      />
                    ) : null}
                  </View>
                  <View style={styles.modalMealInfo}>
                    <Text style={styles.modalMealName} numberOfLines={2}>
                      {meal.meal || 'Untitled meal'}
                    </Text>
                    <EmojiDisplay rating={meal.rating} size={22} />
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
    paddingTop: 0,
    paddingBottom: 50,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'normal',
    color: '#555',
    marginTop: 15,
    textAlign: 'center',
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
  cityChipsContainer: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    zIndex: 10,
    elevation: 10,
  },
  cityChipsRow: {
    paddingHorizontal: 12,
    gap: 6,
  },
  cityChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.mediumGray,
  },
  cityChipActive: {
    backgroundColor: '#5B8A72',
    borderColor: '#5B8A72',
  },
  cityChipText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    fontWeight: '500',
    color: colors.textSecondary,
  },
  cityChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  map: {
    flex: 1,
    width: '100%',
    minHeight: 400, // Minimum height to ensure map is visible
  },
  buttonContainer: {
    position: 'absolute',
    right: 16,
    bottom: 120,
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  floatingButton: {
    backgroundColor: 'rgba(26, 43, 73, 0.8)', // Navy blue with 0.8 opacity
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
    backgroundColor: '#1a2b49', // Changed to navy blue for "My Meals" mode
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
    backgroundColor: colors.white,
    borderTopLeftRadius: spacing.borderRadius.lg,
    borderTopRightRadius: spacing.borderRadius.lg,
    paddingBottom: spacing.screenPadding,
    maxHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.screenPadding,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
  },
  modalTitle: {
    ...typography.bodyLarge,
    fontWeight: 'bold',
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  modalCloseButton: {
    padding: spacing.xs,
  },
  modalScrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.md,
  },
  modalMealCard: {
    width: 150,
    marginRight: 15,
  },
  modalImageContainer: {
    position: 'relative',
    width: 150,
    height: 150,
    marginBottom: 8,
  },
  modalMealImage: {
    width: 150,
    height: 150,
    borderRadius: 12,
  },
  modalMealImagePlaceholder: {
    width: 150,
    height: 150,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalPixelArtOverlay: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 36,
    height: 36,
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
  markerPixelArt: {
    width: 30,
    height: 30,
  },
  markerCountBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#E63946',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'white',
  },
  markerCountBadgeText: {
    color: 'white',
    fontSize: 9,
    fontWeight: '700',
  },
  // Multi-meal emoji cluster
  emojiClusterMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  emojiClusterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 60,
    justifyContent: 'center',
  },
  emojiClusterCell: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 1,
  },
  emojiClusterIcon: {
    width: 26,
    height: 26,
  },
  emojiClusterPhoto: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  emojiClusterDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E63946',
  },
  emojiClusterOverflow: {
    backgroundColor: '#E63946',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 2,
  },
  emojiClusterOverflowText: {
    color: 'white',
    fontSize: 9,
    fontWeight: '700',
  },
  markerPhoto: {
    width: 60,
    height: 60,
    borderRadius: 8,
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
  // Zoomed-out marker — single dot that scales with meal count
  scaledDot: {
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
});

export default MapScreen;