/**
 * RatingScreen2.tsx
 * 
 * This screen allows users to rate meals and add restaurant information.
 * 
 * IMPORTANT IMPLEMENTATION NOTES:
 * - This screen now uses direct Google Places API calls for restaurant suggestions
 * - Each photo upload creates a unique session ID to prevent state persistence
 * - Location data uses a priority system: restaurant selection > photo location > device location
 * - User editing state is tracked to prevent auto-suggestions from overriding user input
 * - The meal suggestion functionality has been temporarily disabled
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  TextInput,
  FlatList,
  Modal,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Platform
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import { CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, TabParamList } from '../App';
import RNFS from 'react-native-fs';
import ImageResizer from 'react-native-image-resizer';
import * as ImagePicker from 'react-native-image-picker';
import Exif from 'react-native-exif';
import { getPhotoWithMetadata } from '../services/photoLibraryService';
// Import our direct Places API service instead of going through the backend
import { searchNearbyRestaurants, searchRestaurantsByText, getPlaceDetails, extractCityFromRestaurant, Restaurant } from '../services/placesService';
// import { getMenuSuggestionsForRestaurant } from '../services/menuSuggestionService'; // DISABLED FOR PERFORMANCE
// import { extractCombinedMetadataAndCriteria, CombinedResponse } from '../services/combinedMetadataCriteriaService'; // COMMENTED OUT - using new quick criteria service
// import { extractQuickCriteria, QuickCriteriaData } from '../services/quickCriteriaService'; // REPLACED with rating statements service
import { extractDishRatingCriteria, DishRatingCriteriaData } from '../services/dishRatingCriteriaService';
import { identifyDishFromPhoto } from '../services/dishIdentificationService';
import { ensureServerAwake } from '../config/api';
import Carousel3D, { CarouselItem } from '../components/Carousel3D';
// getDrinkPairings and getDishHistory removed — redundant with extractDishInsights
import { generatePixelArtIcon, PixelArtData, createImageDataUri } from '../services/geminiPixelArtService';
// Monument service removed — no longer used
// Enhanced metadata service removed - now handled by Cloud Functions
// REMOVED: Facts service no longer used
// import { extractEnhancedMetadataFacts, EnhancedFactsData } from '../services/enhancedMetadataFactsService';
import Geolocation from '@react-native-community/geolocation';
// Import Firebase for saving meal data
import { firebase, auth, firestore, storage } from '../firebaseConfig';
// Import theme
import { colors, typography, spacing, shadows } from '../themes';

// Extend the TabParamList to include all necessary parameters for RatingScreen2
declare module '../App' {
  interface TabParamList {
    RatingScreen2: {
      photo?: {
        uri: string;
        width?: number;
        height?: number;
        sessionId?: string;
        assetId?: string;
      } | null;
      location?: {
        latitude: number;
        longitude: number;
        source?: string;
        priority?: number;
      } | null;
      rating: number;
      thoughts?: string;
      // Keep for backward compatibility
      likedComment?: string;
      dislikedComment?: string;
      suggestionData?: any;
      meal?: string;
      restaurant?: string;
      mealType?: string;
      isEditingExisting?: boolean;
      existingMealId?: string;
      _uniqueKey: string;
    };
  }
}

// Update the navigation prop type to use composite navigation
type RatingScreen2NavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'RatingScreen2'>,
  StackNavigationProp<RootStackParamList>
>;

type RatingScreen2RouteProp = RouteProp<TabParamList, 'RatingScreen2'>;

type Props = {
  navigation: RatingScreen2NavigationProp;
  route: RatingScreen2RouteProp;
};

// Define interface for location data
interface LocationData {
  latitude: number;
  longitude: number;
  source: string;
  priority: number;
  city?: string;
}

const RatingScreen2: React.FC<Props> = ({ route, navigation }) => {
  // Don't destructure photo to avoid stale closures
  const { rating, thoughts, likedComment, dislikedComment } = route.params;
  const photo = route.params.photo; // Photo might be null now
  
  // Create a session ID to track this specific photo instance
  const photoSessionRef = useRef<string>(`photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
  const photoUriRef = useRef<string>(route.params.photo?.uri || '');
  // Track the last photo URI that we fetched restaurants for
  const trackedPhotoUri = useRef<string>('');
  
  // Restaurant and meal state - only initialize with existing data if editing an existing meal
  const [location, setLocation] = useState<LocationData | null>(null);
  const [restaurant, setRestaurant] = useState(route.params.isEditingExisting ? (route.params.restaurant || "") : "");
  const [mealName, setMealName] = useState(route.params.isEditingExisting ? (route.params.meal || "") : "");
  // Meal type is always "Restaurant" - toggle removed
  const mealType = "Restaurant";
  const [suggestedRestaurants, setSuggestedRestaurants] = useState<Restaurant[]>([]);
  const [autocompleteRestaurants, setAutocompleteRestaurants] = useState<Restaurant[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [menuItems, setMenuItems] = useState<string[]>([]);
  const [suggestedMeals, setSuggestedMeals] = useState<string[]>([]);
  const [showRestaurantModal, setShowRestaurantModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showMealSuggestionsModal, setShowMealSuggestionsModal] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isSearchingRestaurants, setIsSearchingRestaurants] = useState(false);
  const [isLoadingMealSuggestions, setIsLoadingMealSuggestions] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Track user editing state
  const [isUserEditingRestaurant, setIsUserEditingRestaurant] = useState(false);
  const [isUserEditingMeal, setIsUserEditingMeal] = useState(false);
  
  // Local photo state to handle adding photo to existing session
  const [localPhoto, setLocalPhoto] = useState<any>(null);
  
  // Photo source modal state
  const [showPhotoSourceModal, setShowPhotoSourceModal] = useState(false);
  
  // Track if user has made an explicit restaurant selection (prevent auto-override)
  const [hasExplicitRestaurantSelection, setHasExplicitRestaurantSelection] = useState(false);

  // Carousel state
  // showWriteInRestaurant / showWriteInDish removed — now handled inline by Carousel3D
  const [dishAlternatives, setDishAlternatives] = useState<string[]>([]);
  const [isIdentifyingDish, setIsIdentifyingDish] = useState(false);
  // The original AI-predicted dish name — never changes after identification
  const [primaryDishName, setPrimaryDishName] = useState<string>('');
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>('');
  
  // Device location state
  const [deviceLocation, setDeviceLocation] = useState<LocationData | null>(null);
  const [isLoadingDeviceLocation, setIsLoadingDeviceLocation] = useState(false);
  
  // Limit number of results in the autocomplete dropdown
  const MAX_AUTOCOMPLETE_RESULTS = 3;
  
  // Function to log with session tracking
  const logWithSession = (message: string) => {
    console.log(`[${photoSessionRef.current}] ${message}`);
  };

  // Get the effective photo (either from route params or locally added)
  const getEffectivePhoto = () => {
    return localPhoto || route.params.photo;
  };
  
  // Initialize location from prefetched data (preferred) or route params
  const initializeLocationFromParams = (): LocationData | null => {
    // FIRST TRY: Use the prefetched location data from CropScreen if available
    // This should be the original PHAsset location data that was preserved
    if ((global as any).prefetchedLocation && (global as any).prefetchedPhotoUri) {
      // Verify this is for the current photo by checking URI correspondence (if photo exists)
      const effectivePhoto = getEffectivePhoto();
      const isPrefetchForCurrentPhoto = effectivePhoto && (
        (global as any).prefetchedPhotoUri === effectivePhoto.uri || 
        (global as any).currentPhotoUri === effectivePhoto.uri
      );
      
      if (isPrefetchForCurrentPhoto) {
        const prefetchedLocation = (global as any).prefetchedLocation;
        logWithSession(`Using prefetched location data from CropScreen: ${prefetchedLocation.latitude}, ${prefetchedLocation.longitude} (source: ${prefetchedLocation.source})`);
        
        // Create proper LocationData object with priority
        const locationData: LocationData = {
          latitude: prefetchedLocation.latitude,
          longitude: prefetchedLocation.longitude,
          source: prefetchedLocation.source || 'phasset',
          priority: prefetchedLocation.source === 'phasset' ? 2 : 3,
          city: prefetchedLocation.city
        };
        
        logWithSession(`Initialized location from prefetched data with source ${locationData.source}, priority ${locationData.priority}`);
        return locationData;
      } else {
        logWithSession(`WARNING: Prefetched location exists but for a different photo`);
        logWithSession(`Current photo: ${getEffectivePhoto()?.uri || 'none'}, prefetched photo: ${(global as any).prefetchedPhotoUri}`);
      }
    }
    
    // FALLBACK: Use the location from route params if prefetched location is not available
    if (!route.params.location) {
      logWithSession("No location data in route params or prefetch");
      return null;
    }
    
    const params = route.params.location;
    
    // Create a clean location object
    const locationData: LocationData = {
      latitude: params.latitude,
      longitude: params.longitude,
      source: params.source || 'unknown',
      priority: 3, // Default to medium priority
      city: params.city
    };
    
    // Set priority based on source
    if (locationData.source === 'restaurant_selection') {
      locationData.priority = 1; // Highest priority
    } else if (locationData.source === 'phasset') {
      locationData.priority = 2; // Second priority for phasset data
    } else if (locationData.source === 'exif') {
      locationData.priority = 3; // Third priority for exif data
    } else if (locationData.source === 'device') {
      locationData.priority = 4; // Lowest priority for device location
    }
    
    logWithSession(`Initialized location from route params with source ${locationData.source}, priority ${locationData.priority}`);
    return locationData;
  };
  
  // Get current device location with better timeout handling
  const getCurrentLocation = async () => {
    if (isLoadingDeviceLocation) return;
    
    setIsLoadingDeviceLocation(true);
    logWithSession("Getting current device location with improved handling");
    
    try {
      // Use Promise-based approach with explicit timeout
      const locationPromise = new Promise<any>((resolve, reject) => {
        // Explicit timeout to ensure we don't get stuck
        const timeoutId = setTimeout(() => {
          reject(new Error('Device location request timed out'));
        }, 5000); // 5-second timeout
        
        Geolocation.getCurrentPosition(
          (position) => {
            clearTimeout(timeoutId);
            resolve(position);
          },
          (error) => {
            clearTimeout(timeoutId);
            reject(error);
          },
          { 
            enableHighAccuracy: true, 
            timeout: 4000,      // Slightly less than our outer timeout 
            maximumAge: 15000   // Accept results up to 15 seconds old
          }
        );
      });
      
      const position = await locationPromise;
      
      const deviceLocationData: LocationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        source: 'device',
        priority: 4 // Lowest priority
      };
      
      logWithSession(`Got device location: ${deviceLocationData.latitude}, ${deviceLocationData.longitude}`);
      setDeviceLocation(deviceLocationData);
      
      // If we have no other location data, use device location immediately
      if (!location) {
        logWithSession("No other location data available, using device location as primary source");
        setLocation(deviceLocationData);
      }
    } catch (error) {
      logWithSession(`Error getting device location: ${error}`);
      // Silently fail — the user can still manually search for restaurants.
      // An Alert here blocks the UI and interrupts rating flow.
    } finally {
      setIsLoadingDeviceLocation(false);
    }
  };
  
  // Function to fetch restaurant suggestions based on location using DIRECT Places API
  const fetchRestaurantSuggestions = async (locationData: LocationData | null) => {
    const currentSession = photoSessionRef.current;
    const currentPhotoUri = photoUriRef.current;
    
    // Only skip if we've already fetched for this specific photo URI
    // This prevents duplicate fetches for the same photo while ensuring each new photo gets a fetch
    if (suggestedRestaurants.length > 0 && trackedPhotoUri.current === currentPhotoUri) {
      logWithSession(`Already fetched restaurants for this specific photo URI: ${currentPhotoUri}`);
      return;
    }
    
    // Prevent concurrent fetches
    if (isLoadingSuggestions) {
      logWithSession(`Already loading suggestions, skipping duplicate fetch`);
      return;
    }
    
    if (!locationData) {
      logWithSession("Cannot fetch restaurant suggestions: No location data");
      return;
    }
    
    // Update the tracked photo URI - we're now fetching for this photo
    trackedPhotoUri.current = currentPhotoUri;
    
    try {
      setIsLoadingSuggestions(true);
      logWithSession(`Fetching restaurant suggestions using location source: ${locationData.source}`);
      
      // First check if we have prefetched data from CropScreen
      const hasPrefetchedSuggestions = (global as any).prefetchedSuggestions && 
                                      (global as any).prefetchedPhotoUri === currentPhotoUri;
      
      let restaurants: Restaurant[] = [];
      // MENU SUGGESTIONS DISABLED FOR PERFORMANCE - removing menu-related variables
      // let prefetchedMenuItems: string[] = [];
      // let prefetchedMealSuggestions: string[] = [];
      
      if (hasPrefetchedSuggestions) {
        logWithSession("Using prefetched restaurant suggestions from CropScreen");
        restaurants = (global as any).prefetchedSuggestions.restaurants || [];
        // MENU SUGGESTIONS DISABLED - not loading menu items or meal suggestions
        // prefetchedMenuItems = (global as any).prefetchedSuggestions.menu_items || [];
        // prefetchedMealSuggestions = (global as any).prefetchedSuggestions.suggested_meals || [];
        
        logWithSession(`Found ${restaurants.length} prefetched restaurants (menu suggestions disabled for performance)`);
      } else {
        // If no prefetched data, make a direct API call
        logWithSession("No prefetched data, calling Places API directly");
        restaurants = await searchNearbyRestaurants(locationData);
      }
      
      // Verify we're still in the same photo session before updating state
      if (currentSession !== photoSessionRef.current) {
        logWithSession("Session changed, discarding restaurant suggestions");
        return;
      }
      
      if (restaurants.length > 0) {
        logWithSession(`Got ${restaurants.length} restaurant suggestions ${hasPrefetchedSuggestions ? 'from prefetch' : 'from Places API'}`);
        logWithSession(`First restaurant: ${restaurants[0].name}`);
        
        setSuggestedRestaurants(restaurants);
        
        // Only update restaurant field if user isn't currently editing AND hasn't made an explicit selection
        if (!isUserEditingRestaurant && !hasExplicitRestaurantSelection) {
          logWithSession(`Auto-selecting first restaurant: ${restaurants[0].name}`);
          setRestaurant(restaurants[0].name);
          setSelectedRestaurantId(restaurants[0].id || restaurants[0].name);
          
          // If restaurant has location data, update our location
          if (restaurants[0].geometry && restaurants[0].geometry.location) {
            const restaurantLocation: LocationData = {
              latitude: restaurants[0].geometry.location.lat,
              longitude: restaurants[0].geometry.location.lng,
              source: 'restaurant_selection',
              priority: 1, // Highest priority
              city: extractCityFromRestaurant(restaurants[0])
            };
            
            logWithSession(`Updated location from selected restaurant: ${JSON.stringify(restaurantLocation)}`);
            setLocation(restaurantLocation);
          }
          
          // MENU SUGGESTIONS DISABLED FOR PERFORMANCE
          // Set prefetched menu items if available
          // if (prefetchedMenuItems.length > 0) {
          //   logWithSession(`Setting ${prefetchedMenuItems.length} prefetched menu items`);
          //   setMenuItems(prefetchedMenuItems);
          // }
          
          // Set prefetched meal suggestions if available
          // if (prefetchedMealSuggestions.length > 0) {
          //   logWithSession(`Setting ${prefetchedMealSuggestions.length} prefetched meal suggestions`);
          //   setSuggestedMeals(prefetchedMealSuggestions);
          //   setIsLoadingMealSuggestions(false);
          // } else {
          //   // If we don't have prefetched meal suggestions but we do have a restaurant, 
          //   // fetch them now (as a fallback)
          //   logWithSession("No prefetched meal suggestions, will try to fetch them now");
          //   // Menu suggestions removed for performance
          // }
          
          logWithSession("Menu and meal suggestions disabled for performance - user will enter meal name manually");
          
          // Don't auto-populate the meal field anymore
          // Instead we'll just rely on the suggestions button to show options
          logWithSession("Not auto-filling meal field - user will select from suggestions");
        } else {
          logWithSession(`Skipping auto-selection - isUserEditingRestaurant: ${isUserEditingRestaurant}, hasExplicitRestaurantSelection: ${hasExplicitRestaurantSelection}`);
        }
      } else {
        logWithSession("No restaurant suggestions found");
      }
    } catch (error) {
      logWithSession(`Error fetching restaurant suggestions: ${error}`);
    } finally {
      // Verify we're still in the same photo session before updating loading state
      if (currentSession === photoSessionRef.current) {
        setIsLoadingSuggestions(false);
      }
    }
  };
  
  // Note: We're using the imported extractCityFromRestaurant from placesService
  // which properly handles multi-word city names like "New Brunswick"
  
  // Function for when restaurant changes - fetches menu items and meal suggestions
  // TEMPORARILY DISABLED FOR PERFORMANCE - Uncomment to re-enable menu suggestions
  /*
  const updateMealSuggestionsForRestaurant = async (restaurantName: string) => {
    if (!restaurantName) {
      logWithSession("No restaurant name provided");
      return;
    }
    
    const currentSession = photoSessionRef.current;
    
    try {
      setIsLoadingSuggestions(true);
      setIsLoadingMealSuggestions(true);
      logWithSession(`Restaurant selected: ${restaurantName}, fetching menu items and meal suggestions`);
      
      // Get the best available location for context
      const bestLocation = getBestAvailableLocation();
      
      // Get the current photo URI for context
      const currentPhotoUri = photoUriRef.current;
      
      // Make an API call to get menu items and meal suggestions
      const suggestions = await getMenuSuggestionsForRestaurant(
        restaurantName,
        currentPhotoUri,  // Pass the current photo URI
        bestLocation      // Pass location context
      );
      
      // Verify we're still in the same photo session
      if (currentSession !== photoSessionRef.current) {
        logWithSession('Session changed, discarding menu item results');
        return;
      }
      
      // Update menu items state
      if (suggestions.menu_items && suggestions.menu_items.length > 0) {
        logWithSession(`Got ${suggestions.menu_items.length} menu items for ${restaurantName}`);
        setMenuItems(suggestions.menu_items);
      } else {
        logWithSession(`No menu items found for ${restaurantName}`);
        setMenuItems([]);
      }
      
      // Update suggested meals
      if (suggestions.suggested_meals && suggestions.suggested_meals.length > 0) {
        logWithSession(`Got ${suggestions.suggested_meals.length} meal suggestions for ${restaurantName}`);
        setSuggestedMeals(suggestions.suggested_meals);
      } else {
        logWithSession(`No meal suggestions found for ${restaurantName}`);
        setSuggestedMeals([]);
      }
      
      // Unlike before, do NOT auto-set the meal name - let user select from suggestions instead
      // Only show the button to select from suggested meals
      
    } catch (error) {
      logWithSession(`Error getting menu items for ${restaurantName}: ${error}`);
      // Clear suggestions on error
      setMenuItems([]);
      setSuggestedMeals([]);
    } finally {
      // Verify we're still in the same photo session before updating loading state
      if (currentSession === photoSessionRef.current) {
        setIsLoadingSuggestions(false);
        setIsLoadingMealSuggestions(false);
      }
    }
  };
  */
  
  // Return the best available location based on priority
  const getBestAvailableLocation = (): LocationData | null => {
    // Check if we have restaurant-selected location (priority 1)
    if (location && location.source === 'restaurant_selection') {
      return location;
    }
    
    // Check if we have photo location (priority 2)
    if (location && (location.source === 'exif' || location.source === 'PHAsset')) {
      return location;
    }
    
    // Check if we have any location set
    if (location) {
      return location;
    }
    
    // Fallback to device location
    if (deviceLocation) {
      return deviceLocation;
    }
    
    return null;
  };
  
  // Function to handle restaurant selection from autocomplete or modal
  const handleRestaurantSelection = async (restaurant: Restaurant) => {
    logWithSession(`Restaurant selected: ${restaurant.name}`);
    
    // IMPORTANT: Clear any pending search timers to prevent race conditions
    clearTimeout((window as any).restaurantInputTimer);
    
    // Update restaurant name
    setRestaurant(restaurant.name);
    
    // Turn off editing mode since this was an explicit selection
    setIsUserEditingRestaurant(false);
    
    // Mark that user has made an explicit restaurant selection
    setHasExplicitRestaurantSelection(true);
    
    // Hide autocomplete immediately after selection
    setShowAutocomplete(false);
    setAutocompleteRestaurants([]);
    
    // Check if we need to fetch detailed place information
    let fullRestaurantData = restaurant;
    
    // If restaurant doesn't have geometry data (from autocomplete), fetch place details
    if (!restaurant.geometry || !restaurant.geometry.location) {
      logWithSession(`Fetching place details for selected restaurant: ${restaurant.name}`);
      try {
        const detailedRestaurant = await getPlaceDetails(restaurant.id);
        if (detailedRestaurant) {
          fullRestaurantData = detailedRestaurant;
          logWithSession(`Successfully fetched place details with geometry data`);
        } else {
          logWithSession(`Failed to fetch place details, using basic restaurant data`);
        }
      } catch (error) {
        logWithSession(`Error fetching place details: ${error}`);
      }
    }
    
    // Update location if restaurant has location data
    if (fullRestaurantData.geometry && fullRestaurantData.geometry.location) {
      const city = extractCityFromRestaurant(fullRestaurantData);
      
      // Create location object with restaurant data
      const restaurantLocation: LocationData = {
        latitude: fullRestaurantData.geometry.location.lat,
        longitude: fullRestaurantData.geometry.location.lng,
        source: 'restaurant_selection',
        priority: 1, // Highest priority
        city: city
      };
      
      logWithSession(`Updated location from restaurant selection: ${JSON.stringify(restaurantLocation)}`);
      setLocation(restaurantLocation);
    } else {
      logWithSession(`No location data available for selected restaurant`);
    }
    
    // Menu suggestions removed for performance - users can type their own meal names
  };
  
  // Clear all state for a new photo session
  const resetState = () => {
    // Generate a completely new session ID with high entropy
    const newSessionId = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${Math.random().toString(36).substring(2, 8)}`;
    // Complete reset for new photo session
    logWithSession(`Resetting state for new photo session: ${newSessionId}`);
    
    // Check if the current photo URI matches the prefetched photo URI
    // This helps detect when we're handling a completely new photo vs the same photo
    const effectivePhoto = getEffectivePhoto();
    const isSamePhotoAsPrefetched = effectivePhoto && (
      (global as any).prefetchedPhotoUri === effectivePhoto.uri || 
      (global as any).currentPhotoUri === effectivePhoto.uri
    );
    
    // We're NO LONGER clearing prefetched suggestions here
    // They should already be cleared in CropScreen when a new photo is detected
    // and we want to preserve the original phasset location data from CropScreen
    if (isSamePhotoAsPrefetched) {
      // Using existing prefetched suggestions
      if ((global as any).prefetchedLocation) {
        // Preserved original location data
      }
    } else {
      // No matching prefetched data
    }
    
    // Always update the currentPhotoUri to track the current photo being processed
    (global as any).currentPhotoUri = effectivePhoto?.uri || null;
    
    // Update session references
    photoSessionRef.current = newSessionId;
    photoUriRef.current = effectivePhoto?.uri || '';
    // Reset the tracked photo URI so we'll fetch again for this new photo
    trackedPhotoUri.current = '';
    
    // Reset ALL state variables to their initial values
    setRestaurant("");
    setMealName("");
    setSuggestedRestaurants([]);
    setMenuItems([]);
    setSuggestedMeals([]);
    setAutocompleteRestaurants([]);
    setShowAutocomplete(false);
    setIsUserEditingRestaurant(false);
    setIsUserEditingMeal(false);
    setHasExplicitRestaurantSelection(false); // Reset for new photo
    setLocalPhoto(null); // Clear any cached photo from previous session
    setIsLoadingSuggestions(false);
    setIsSearchingRestaurants(false);
    setIsLoadingMealSuggestions(false);
    // Reset carousel-specific state
    setDishAlternatives([]);
    setPrimaryDishName('');
    setSelectedRestaurantId('');
    setIsIdentifyingDish(false);
    setImageError(false);
    dishIdRanRef.current = false;
    
    // Clear any global variables or timers that might be used
    if ((window as any).restaurantInputTimer) {
      clearTimeout((window as any).restaurantInputTimer);
      (window as any).restaurantInputTimer = null;
    }
    
    // Initialize location from route params - if photo URI doesn't match cached URI,
    // the initializeLocationFromParams function will reject potentially stale location data
    const initialLocation = initializeLocationFromParams();
    setLocation(initialLocation);
    
    // Check for any prefetched meal suggestions
    if ((global as any).prefetchedSuggestions && effectivePhoto &&
        (global as any).prefetchedPhotoUri === effectivePhoto.uri) {
      // We have prefetched suggestions for this photo
      const prefetchedSuggestions = (global as any).prefetchedSuggestions;
      logWithSession("Found prefetched suggestion data during reset:");
      
      // Log prefetched data for debugging
      logWithSession(`- Restaurants: ${prefetchedSuggestions.restaurants?.length || 0}`);
      logWithSession(`- Menu items: ${prefetchedSuggestions.menu_items?.length || 0}`);
      logWithSession(`- Meal suggestions: ${prefetchedSuggestions.suggested_meals?.length || 0}`);
      
      // Don't set anything yet - we'll handle this in fetchRestaurantSuggestions function
    } else {
      logWithSession("No prefetched suggestion data found during reset");
    }
    
    // Always fetch device location as fallback
    getCurrentLocation();
    
    // Reset complete for new photo session
    logWithSession(`State reset complete for photo: ${effectivePhoto?.uri || 'none'}`);
  };
  
  // Track if this is the first render
  const isFirstRender = useRef(true);
  
  // Initialize on component mount or when route params change
  useEffect(() => {
    // Photo is now optional - only validate if provided
    const effectivePhoto = getEffectivePhoto();
    if (effectivePhoto && (!effectivePhoto.uri)) {
      console.error("Invalid photo object in RatingScreen2:", route.params.photo);
      Alert.alert(
        "Error",
        "Invalid photo data received. Please try again.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
      return;
    }
    
    // On first render, log the details
    if (isFirstRender.current) {
      // Initializing rating screen
      isFirstRender.current = false;
    } else {
      // Route params changed
    }
    
    // Force a complete reset of state for this photo
    resetState();
    
    // Clean up on unmount
    return () => {
      // Cleaning up rating screen
      logWithSession("Component unmounting, cleaning up");
      
      // Clear any in-progress API calls to prevent them from affecting next session
      if ((global as any).quickCriteriaExtractionPromise || (global as any).ratingStatementsExtractionPromise) {
        // Clear old quick criteria globals
        (global as any).quickCriteriaExtractionPromise = null;
        (global as any).quickCriteriaStartTime = null;
        (global as any).quickCriteriaSessionId = null;
        // Clear new rating statements globals
        (global as any).ratingStatementsExtractionPromise = null;
        (global as any).ratingStatementsStartTime = null;
        (global as any).ratingStatementsSessionId = null;
        (global as any).ratingStatementsPhotoUri = null;
        (global as any).ratingStatementsMealData = null;
      }
    };
  }, [route.params._uniqueKey, route.params.photo?.uri]); // Re-run when unique key or photo URI changes

  // Reset dish + image state on each new photo session to prevent stale data from previous uploads
  useEffect(() => {
    if (!route.params.isEditingExisting) {
      setMealName('');
      setPrimaryDishName('');
      setDishAlternatives([]);
      setIsIdentifyingDish(true);
      setImageError(false);
      dishIdRanRef.current = false;
    }
  }, [route.params._uniqueKey]);

  // Effect to identify dish from photo (for gallery uploads and unrated meals).
  // Populates mealName and dishAlternatives for the dish carousel.
  const dishIdRanRef = useRef(false);
  useEffect(() => {
    const effectivePhoto = getEffectivePhoto();
    console.log('🔎 DishID effect running:', {
      hasPhoto: !!effectivePhoto?.uri,
      photoUri: effectivePhoto?.uri?.substring(effectivePhoto?.uri?.length - 30),
      isEditingExisting: route.params.isEditingExisting,
      dishIdRan: dishIdRanRef.current,
      existingMealId: route.params.existingMealId,
      hasPrefetch: !!(global as any).prefetchedDishIdentification,
      uniqueKey: route.params._uniqueKey,
    });

    // Also skip if editing existing meal (name already set)
    if (route.params.isEditingExisting) { console.log('🔎 DishID: skipping (isEditingExisting)'); return; }
    if (dishIdRanRef.current) { console.log('🔎 DishID: skipping (already ran)'); return; }

    // Check if we already have identification data in Firestore (unrated flow).
    // Always run this even if mealName is pre-filled — we need the alternatives for the carousel.
    if (route.params.existingMealId) {
      dishIdRanRef.current = true;
      firestore()
        .collection('mealEntries')
        .doc(route.params.existingMealId)
        .get()
        .then((doc) => {
          const data = doc.data();
          const idResult = data?.dish_identification_result;
          if (idResult?.dish_name) {
            setMealName(idResult.dish_name);
            setPrimaryDishName(idResult.dish_name);
            setDishAlternatives(idResult.alternative_names || []);
          }
        })
        .catch((err) => console.error('Error reading dish ID from Firestore:', err))
        .finally(() => setIsIdentifyingDish(false));
      return;
    }

    // Gallery upload flow — check for prefetched data first, then fall back to API call
    if (!effectivePhoto?.uri) { console.log('🔎 DishID: skipping (no photo URI)'); return; }
    console.log('🔎 DishID: proceeding with gallery flow');
    dishIdRanRef.current = true;

    // Check if CameraScreen already prefetched the identification
    const prefetched = (global as any).prefetchedDishIdentification;
    const prefetchedUri = (global as any).prefetchedDishPhotoUri;

    // URI match removed — CropScreen changes the photo URI (crop + filter),
    // so it will never match the original gallery URI that CameraScreen stored.
    // Stale data isn't a concern because CameraScreen clears globals on each new pick.
    if (prefetched?.dish_name) {
      console.log('Using prefetched dish identification:', prefetched.dish_name);
      setMealName(prefetched.dish_name);
      setPrimaryDishName(prefetched.dish_name);
      setDishAlternatives(prefetched.alternative_names || []);
      setIsIdentifyingDish(false);
      delete (global as any).prefetchedDishIdentification;
      delete (global as any).prefetchedDishPhotoUri;
      return;
    }

    // No prefetch available — call API directly
    setIsIdentifyingDish(true);

    (async () => {
      try {
        await ensureServerAwake();
        const result = await identifyDishFromPhoto(effectivePhoto.uri);
        if (result?.dish_name && result.dish_name !== 'unidentified dish') {
          setMealName(result.dish_name);
          setPrimaryDishName(result.dish_name);
          setDishAlternatives(result.alternative_names || []);
        }
      } catch (err) {
        console.error('Dish identification failed on gallery upload:', err);
      } finally {
        setIsIdentifyingDish(false);
      }
    })();
  }, [route.params._uniqueKey]);

  // Effect to fetch restaurant suggestions when location becomes available.
  // Only depends on location and deviceLocation — NOT suggestedRestaurants.length,
  // which caused cascading re-runs when restaurants arrived and updated location.
  useEffect(() => {
    // Capture the current session ID to prevent stale updates
    const currentSession = photoSessionRef.current;
    const currentPhotoUri = photoUriRef.current;

    if (!location && !deviceLocation) {
      logWithSession("No location available yet for restaurant suggestions");
      return;
    }

    // Use the best available location
    const bestLocation = getBestAvailableLocation();

    if (bestLocation) {
      logWithSession(`Using location for restaurant suggestions: ${bestLocation.source} (priority: ${bestLocation.priority})`);
      logWithSession(`Photo URI: ${route.params.photo?.uri || 'none'}, coordinates: ${bestLocation.latitude}, ${bestLocation.longitude}`);

      // Check once more that we're using location data that belongs to this photo
      if ((global as any).currentPhotoUri !== currentPhotoUri) {
        logWithSession(`WARNING: Photo URI mismatch detected - current: ${currentPhotoUri}, global: ${(global as any).currentPhotoUri}`);
      }

      // fetchRestaurantSuggestions has its own guards for duplicate/concurrent fetches
      fetchRestaurantSuggestions(bestLocation);
    }

    // Cleanup function to cancel any pending operations if the session changes
    return () => {
      if (currentSession !== photoSessionRef.current) {
        logWithSession(`Session changed from ${currentSession} to ${photoSessionRef.current}, discarding pending operations`);
      }
    };
  }, [location, deviceLocation]); // Only re-run when location data changes
  
  // Handle autocomplete search for restaurants using DIRECT Places API
  const handleRestaurantSearch = async (text: string) => {
    console.log(`🔍 handleRestaurantSearch called with: "${text}" (length: ${text.length})`);
    setRestaurant(text);

    // Flag that user is actively editing (skip if already true to avoid extra re-render)
    if (!isUserEditingRestaurant) setIsUserEditingRestaurant(true);
    
    // Only show autocomplete when there's enough text
    if (text.length >= 2) {
      console.log(`✅ Text length >= 2, setting up autocomplete for: "${text}"`);
      setShowAutocomplete(true);
      
      // Debounce the API call
      clearTimeout((window as any).restaurantInputTimer);
      (window as any).restaurantInputTimer = setTimeout(async () => {
        const currentSession = photoSessionRef.current;
        const searchText = text; // Capture the text at the time of search
        
        logWithSession(`Starting autocomplete search for: "${searchText}"`);
        
        setIsSearchingRestaurants(true);
        try {
          // Use best available location for search
          const searchLocation = getBestAvailableLocation();
          
          if (searchLocation) {
            logWithSession(`Searching restaurants with query "${searchText}" using Places API with location: ${searchLocation.source}`);
            
            // Use direct Places API for text search
            const results = await searchRestaurantsByText(searchText, searchLocation);
            
            logWithSession(`Raw search results: ${results.length} restaurants found`);
            if (results.length > 0) {
              logWithSession(`First result: ${results[0].name} - ${results[0].vicinity}`);
            }
            
            // Verify we're still in the same session (remove restaurant check as it causes race conditions)
            if (currentSession === photoSessionRef.current) {
              logWithSession(`✅ Setting ${results.length} autocomplete results for "${searchText}"`);
              setAutocompleteRestaurants(results.slice(0, MAX_AUTOCOMPLETE_RESULTS));
              
              // Force show autocomplete if we have results
              if (results.length > 0) {
                setShowAutocomplete(true);
              }
            } else {
              logWithSession(`❌ Discarding search results for "${searchText}" - session changed`);
            }
          } else {
            logWithSession(`No location available for restaurant search`);
          }
        } catch (error) {
          logWithSession(`Error searching restaurants via Places API: ${error}`);
        } finally {
          // Verify we're still in the same photo session before updating loading state
          if (currentSession === photoSessionRef.current) {
            setIsSearchingRestaurants(false);
          }
        }
      }, 500);
    } else {
      setShowAutocomplete(false);
      setAutocompleteRestaurants([]);
    }
  };
  
  // Upload image to Firebase Storage
  const uploadImageToFirebase = async (imageUri: string, userId: string): Promise<string> => {
    try {
      console.log('📤 Uploading image to Firebase Storage...');
      
      // Check authentication first
      const currentUser = auth().currentUser;
      if (!currentUser) {
        throw new Error('User not authenticated');
      }
      
      // Refresh auth token to ensure we have valid credentials
      try {
        await currentUser.reload();
        await currentUser.getIdToken(true); // Force refresh
        console.log('✅ Auth token refreshed successfully');
      } catch (authError) {
        console.error('❌ Auth token refresh failed:', authError);
        throw new Error('Authentication failed - please log in again');
      }
      
      const timestamp = new Date().getTime();
      const filename = `meal_${timestamp}.jpg`;
      const storagePath = `meals/${userId}/${filename}`;
      const reference = storage().ref(storagePath);
      
      console.log('Uploading to path:', storagePath);
      
      // Upload the file with metadata
      const metadata = {
        customMetadata: {
          userId: userId,
          timestamp: timestamp.toString(),
          uploadSource: 'RatingScreen2'
        }
      };
      
      await reference.putFile(imageUri, metadata);
      // File uploaded successfully
      
      // Get download URL
      const downloadURL = await reference.getDownloadURL();
      
      return downloadURL;
    } catch (error) {
      console.error('❌ Error uploading image to Firebase:', error);
      
      // Provide more specific error messages
      if (error.code === 'storage/unauthorized') {
        throw new Error('Not authorized to upload images. Please check your login status.');
      } else if (error.code === 'storage/canceled') {
        throw new Error('Upload was cancelled');
      } else if (error.code === 'storage/unknown') {
        throw new Error('An unknown error occurred during upload');
      }
      
      throw error;
    }
  };

  // Function to save rating and navigate to result screen
  const saveRating = async () => {
    try {
      // Show loading indication
      setIsProcessing(true);
      
      // Generate a unique session ID for this result flow
      const sessionId = route.params._uniqueKey || Math.random().toString(36).substring(2, 15);
      logWithSession(`Continuing session ${sessionId} to ResultScreen`);
      
      // CRITICAL: Resize image BEFORE API calls to prevent memory overload
      // Calculate dimensions to maintain aspect ratio with 800 minimum on shortest side
      const effectivePhoto = getEffectivePhoto();
      const originalWidth = effectivePhoto?.width || 1000;
      const originalHeight = effectivePhoto?.height || 1000;
      const isPortrait = originalHeight > originalWidth;
      
      // Set 1200 on the shortest side, scale the other proportionally - increased for better quality
      const targetWidth = isPortrait ? 1200 : Math.round(1200 * (originalWidth / originalHeight));
      const targetHeight = isPortrait ? Math.round(1200 * (originalHeight / originalWidth)) : 1200;
      
      // Only resize if we have a photo
      let freshPhoto = effectivePhoto; // Default to the effective photo
      
      if (effectivePhoto?.uri) {
        console.log(`Resizing image from ${originalWidth}x${originalHeight} to ${targetWidth}x${targetHeight} for API calls...`);
        const resizedImage = await ImageResizer.createResizedImage(
          effectivePhoto.uri,
        targetWidth,  // Proportional width
        targetHeight, // Proportional height
        'JPEG',
        92,   // Quality - increased from 85 to 92 for better quality
        0,    // Rotation
        undefined,  // Output path (let it generate)
        false,  // Keep metadata
        {
          mode: 'cover',  // Changed to 'cover' to maintain aspect ratio without letterboxing
          onlyScaleDown: true,
        }
      );
        logWithSession(`Image resized maintaining aspect ratio for subsequent cropping`);
        
        // Create a clean copy of the RESIZED image
        const timestamp = new Date().getTime();
        const fileExt = 'jpg';
        const newFilename = `result_image_${timestamp}.${fileExt}`;
        
        // Determine the temp directory path based on platform
        const dirPath = Platform.OS === 'ios'
          ? `${RNFS.TemporaryDirectoryPath}/`
          : `${RNFS.CachesDirectoryPath}/`;
        
        const newFilePath = `${dirPath}${newFilename}`;
        logWithSession(`Creating clean resized image for Result screen at: ${newFilePath}`);
        
        // Copy the RESIZED image file to new location
        await RNFS.copyFile(resizedImage.uri, newFilePath);
        logWithSession('Resized file copied successfully for Result screen');
        
        // Create a fresh photo object with RESIZED dimensions
        freshPhoto = {
          uri: newFilePath,
          width: resizedImage.width,
          height: resizedImage.height,
          sessionId: sessionId
        };
      } else {
        // No photo provided - freshPhoto remains null/undefined
        logWithSession('No photo provided, skipping image processing');
      }
      
      // ASYNC (NON-BLOCKING) but SEQUENTIAL: Start dish criteria API and let it run in background
      logWithSession('Starting dish criteria API asynchronously...');
      let ratingStatementsResult: RatingStatementsData | null = null;
      
      // CLEAN APPROACH: Create basic meal entry first, then update with criteria
      // Creating basic meal entry first
      
      // Get current user
      const user = auth().currentUser;
      if (!user) {
        Alert.alert('Error', 'Please log in to save your meal');
        setIsProcessing(false);
        return;
      }
      
      // User authenticated
      
      // Use city from location data (extracted via Google Places API) or fallback to restaurant parsing
      let cityInfo = '';
      if (location && location.city) {
        // Use properly extracted city from Google Places API
        cityInfo = location.city;
        // Using city from location data
      } else if (restaurant) {
        // Fallback to parsing restaurant string
        const restaurantParts = restaurant.split(',');
        if (restaurantParts.length > 1) {
          cityInfo = restaurantParts[1].trim();
        }
        // Using city from restaurant parsing fallback
      }
      
      // Determine if this is an unrated meal being updated or a new meal
      const isUnratedMeal = route.params.isUnratedMeal === true;
      const existingMealId = route.params.existingMealId;

      let mealId: string;

      if (isUnratedMeal && existingMealId) {
        // Path 1: Update existing unrated meal
        logWithSession('Updating existing unrated meal:', existingMealId);
        mealId = existingMealId;

        // Update meal with user-entered details
        await firestore().collection('mealEntries').doc(mealId).update({
          meal: mealName || '',
          restaurant: restaurant || '',
          city: cityInfo,
          isUnrated: false, // Mark as no longer unrated
          updatedAt: firestore.FieldValue.serverTimestamp(),
          sessionId: sessionId,
        });

        logWithSession('Unrated meal updated with details');
      } else {
        // Normal flow: Create new meal document
        logWithSession('Creating new meal entry');

        const basicMealData = {
          userId: user.uid,
          userName: user.displayName || 'Anonymous User',
          userPhoto: user.photoURL || null,
          photoUrl: null, // Will be updated after editing
          rating: rating,
          restaurant: restaurant || '',
          meal: mealName || '',
          mealType: mealType || 'Restaurant',
          city: cityInfo,
          comments: thoughts ? { thoughts: thoughts } : {},
          location: location ? {
            latitude: location.latitude,
            longitude: location.longitude,
            source: location.source || 'unknown',
            city: cityInfo
          } : null,
          createdAt: firestore.FieldValue.serverTimestamp(),
          sessionId: sessionId,
          platform: Platform.OS,
          appVersion: '1.0.0',
          // Initially null - will be updated by background API call
          rating_statements_result: null
        };

        // Save basic meal data and get the document ID
        const docRef = await firestore().collection('mealEntries').add(basicMealData);
        mealId = docRef.id;
        logWithSession(`Basic meal saved: ${mealId}`);
      }

      // Challenge completion check disabled for now
      // const checkChallengeCompletion = async () => {
      //   try {
      //     console.log('🎯 RatingScreen2: Checking if meal completes any challenges...');
      //     const { checkIfMealCompletesAnyChallenge } = await import('../services/userChallengesService');
      //     const completedChallenge = await checkIfMealCompletesAnyChallenge(
      //       mealId,
      //       mealName,
      //       undefined
      //     );
      //     if (completedChallenge) {
      //       console.log('🎉 RatingScreen2: Challenge completed!', completedChallenge.recommended_dish_name);
      //     }
      //   } catch (error) {
      //     console.error('RatingScreen2: Error checking challenge completion:', error);
      //   }
      // };
      // checkChallengeCompletion();

      // Upload image to Firebase Storage (skip for unrated meals - already uploaded)
      let imageUrl = null;
      if (!isUnratedMeal && freshPhoto?.uri) {
        // Upload image to Firebase Storage (only for new meals)
        imageUrl = await uploadImageToFirebase(freshPhoto.uri, user.uid);

        // Update the document with the image URL
        await firestore().collection('mealEntries').doc(mealId).update({
          imageUrl: imageUrl,
          photoUrl: imageUrl // Keep backward compatibility with photoUrl field
        });
        logWithSession('Document updated with image URL');
      } else if (isUnratedMeal) {
        logWithSession('Unrated meal - photo already uploaded, skipping upload');
      } else {
        logWithSession('No photo to upload, continuing without image');
      }

      // ========================================
      // NAVIGATE IMMEDIATELY - API calls continue in background
      // ========================================
      const photoSource = route.params.photoSource;
      const resultParams = {
        photo: freshPhoto, // Pass original unprocessed photo
        location: location ? {
          latitude: location.latitude,
          longitude: location.longitude,
          source: location.source
        } : null,
        // CLEAN: Pass meal ID - ResultScreen will load data from Firestore
        mealId: mealId,
        _uniqueKey: sessionId
      };

      if (isUnratedMeal) {
        // Path 1: Unrated camera meal → Navigate to CropScreen for photo editing
        logWithSession('Navigating to CropScreen for unrated camera meal');
        navigation.navigate('Crop', {
          photo: freshPhoto || route.params.photo,
          mealId: mealId,
          pendingMealData: {
            dishName: mealName,
            restaurant: restaurant,
            location: location,
          },
          _uniqueKey: sessionId,
        });
      } else if (photoSource === 'gallery') {
        // Gallery flow: photo already cropped in CropScreen before RatingScreen2.
        // Navigate to EditMeal for full rating (emoji + criteria) then Result.
        logWithSession('Gallery flow: navigating to EditMeal for rating');
        navigation.navigate('EditMeal', {
          mealId: mealId,
          meal: {
            id: mealId,
            meal: mealName,
            restaurant: restaurant,
            photoUrl: imageUrl,
            rating: 0,
          },
        });
      } else {
        // Default flow: Navigate to Result screen
        logWithSession('Navigating to ResultScreen (default flow)');
        navigation.navigate('Result', resultParams);
      }

      // ========================================
      // BACKGROUND API CALLS - Continue after navigation
      // ========================================
      logWithSession('Starting BACKGROUND API calls after navigation - all non-blocking');

      // BACKGROUND: Extract 5 rating criteria based on dish name and 3 rating statements
      logWithSession('Extracting rating criteria in background...');
      (async () => {
        try {
          // Get the rating statements from Firestore (saved during camera capture)
          const mealDoc = await firestore().collection('mealEntries').doc(mealId).get();
          const mealData = mealDoc.data();
          const ratingStatements = mealData?.rating_statements_result?.rating_statements;

          console.log('📊 Rating statements for criteria generation:', ratingStatements);

          // Call API with dish name and rating statements
          const criteriaData = await extractDishRatingCriteria(mealName || '', ratingStatements);

          if (criteriaData) {
            console.log('✅ Rating criteria extracted with rating statements context');
            await firestore().collection('mealEntries').doc(mealId).update({
              dish_rating_criteria: criteriaData
            });
          }
        } catch (err) {
          console.error('❌ Rating criteria error:', err);
        }
      })();

      // BACKGROUND: Extract 3 dish insights (history, restaurant fact, cultural insight)
      logWithSession('Extracting dish insights in background...');
      (async () => {
        try {
          const { extractDishInsights } = await import('../services/dishInsightsService');

          const insightsData = await extractDishInsights(
            mealName || '',
            restaurant || undefined,
            cityInfo || undefined
          );

          if (insightsData) {
            console.log('✅ Dish insights extracted:', {
              has_history: !!insightsData.dish_history,
              has_restaurant_fact: !!insightsData.restaurant_fact,
              has_cultural_insight: !!insightsData.cultural_insight
            });
            await firestore().collection('mealEntries').doc(mealId).update({
              dish_insights: insightsData
            });
          }
        } catch (err) {
          console.error('❌ Dish insights error:', err);
        }
      })();

      // STAGGERED API calls to avoid overwhelming the backend service
      // First, wake up the Render server if it's cold
      ensureServerAwake();

      // Step 1: Start rating criteria extraction first (0ms)
      console.log('📝 Starting rating criteria extraction first...');
      extractDishRatingCriteria(
        mealName
      ).then(async (result) => {
        // Rating criteria API call completed
        if (result) {
          // Rating criteria completed successfully
          // Full result logged for debugging if needed
          logWithSession(`Rating criteria completed with ${result.rating_criteria?.length || 0} criteria`);

          // Update the meal document with rating criteria
          try {
            const criteriaUpdate = {
              dish_rating_criteria: result,
              criteria_updated_at: firestore.FieldValue.serverTimestamp()
            };

            await firestore().collection('mealEntries').doc(mealId).update(criteriaUpdate);
            logWithSession(`Rating criteria saved successfully`);

          } catch (firestoreError) {
            console.error('❌ Error saving rating criteria to Firestore:', firestoreError);
            logWithSession(`Rating criteria save error: ${firestoreError}`);
          }
        } else {
          console.warn('⚠️ Rating criteria extraction failed');
          logWithSession('Rating criteria extraction failed');
        }
      }).catch(error => {
        console.error('❌ Error with rating criteria:', error);
        logWithSession(`Rating criteria error: ${error}`);
      });
      
      // getDrinkPairings and getDishHistory removed — dish history is already
      // covered by extractDishInsights, and drink pairings are not needed.

      // Step 2: Start pixel art with 1.5 second delay (staggered processing)
      // SKIP pixel art for unrated meals (already generated in CameraScreen)
      // ONLY generate for gallery uploads (which don't go through CameraScreen)
      if (photoSource === 'gallery') {
        setTimeout(() => {
          console.log('🎨 Starting pixel art generation for gallery upload after 1.5s delay...');
          console.log('🎨 Photo URI available:', !!photoUriRef.current);
          const pixelArtPromise = generatePixelArtIcon(mealName, photoUriRef.current);

        // Handle pixel art result (3 options)
        pixelArtPromise.then(async (pixelArtResult) => {
          if (pixelArtResult && pixelArtResult.image_data) {
            console.log('✅ Pixel art generation completed');
            logWithSession('Pixel art completed successfully');
            const options = pixelArtResult.image_options || [pixelArtResult.image_data];

            try {
              const currentUser = auth().currentUser;
              if (!currentUser) {
                console.error('❌ No authenticated user for pixel art upload');
                return;
              }

              // Upload all options to Firebase Storage
              const optionUrls: string[] = [];
              for (let i = 0; i < options.length; i++) {
                const fileName = `pixel_art_${mealId}_option${i + 1}_${Date.now()}.png`;
                const storagePath = `pixel_art/${currentUser.uid}/${fileName}`;
                const dataUri = `data:image/png;base64,${options[i]}`;

                console.log(`📤 Uploading pixel art option ${i + 1}...`);
                const storageRef = storage().ref(storagePath);
                await storageRef.putString(dataUri, 'data_url');
                const downloadUrl = await storageRef.getDownloadURL();
                optionUrls.push(downloadUrl);
              }
              console.log(`✅ Uploaded ${optionUrls.length} pixel art options`);

              await firestore()
                .collection('mealEntries')
                .doc(mealId)
                .update({
                  pixel_art_options: optionUrls,
                  pixel_art_url: optionUrls[0], // Default to first option until user picks
                  pixel_art_prompt: pixelArtResult.prompt_used,
                  pixel_art_updated_at: firestore.FieldValue.serverTimestamp()
                });

              console.log('✅ Pixel art options saved to Firestore');
              logWithSession('Pixel art options saved successfully');
            } catch (firestoreError) {
              console.error('❌ Error saving pixel art:', firestoreError);
              logWithSession(`Pixel art save error: ${firestoreError}`);
            }
          } else {
            console.warn('⚠️ Pixel art generation failed');
            logWithSession('Pixel art generation failed');
          }
        }).catch(error => {
          console.error('❌ Pixel art generation error:', error);
          logWithSession(`Pixel art error: ${error}`);
        });
        }, 1500); // 1.5 second delay for pixel art generation
      } else {
        console.log('📸 Skipping pixel art generation - already generated in CameraScreen for camera captures');
        logWithSession('Skipping pixel art - already generated in camera flow');
      }

      // Monument generation removed — feature no longer active

      // The rating statements are already handled above - this duplicate call has been removed

      // Pixel art is now handled in staggered approach above

      // Dish criteria API running asynchronously
      logWithSession('Dish criteria API started - continuing with navigation');
      
      /* COMMENTED OUT - Using new quick criteria service instead
      // Extract combined metadata and criteria using single service call
      logWithSession('Extracting combined metadata and criteria...');
      let combinedResult: CombinedResponse | null = null;
      try {
        combinedResult = await extractCombinedMetadataAndCriteria(
          freshPhoto.uri,
          mealName,
          mealType === "Restaurant" ? restaurant : undefined,
          undefined // cuisineContext - will be inferred by the service
        );
        logWithSession('✅ Combined extraction completed successfully');
        console.log('Combined result preview:', {
          dish_specific: combinedResult?.metadata?.dish_specific,
          criteria_count: combinedResult?.dish_criteria?.criteria?.length,
          metadata_confidence: combinedResult?.metadata?.confidence_score
        });
      } catch (combinedError) {
        logWithSession(`❌ Error in combined extraction: ${combinedError}`);
        // Continue without combined result - the meal can still be saved with basic info
      }
      */
      
      // Navigation has already happened above - all API calls below are background tasks
    } catch (error) {
      logWithSession(`Error preparing image for Result screen: ${error}`);
      Alert.alert('Error', 'Failed to save rating. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Function to start rating statements extraction in background
  const startQuickCriteriaExtraction = (photo: any, restaurant: string, mealName: string) => {
    const currentSessionId = photoSessionRef.current;
    
    // Clear any existing promise first to prevent stale data - BOTH old and new
    if ((global as any).quickCriteriaExtractionPromise || (global as any).ratingStatementsExtractionPromise) {
      logWithSession('Clearing previous extraction promises before starting new one');
      // Clear old quick criteria globals
      (global as any).quickCriteriaExtractionPromise = null;
      (global as any).quickCriteriaStartTime = null;
      (global as any).quickCriteriaSessionId = null;
      // Clear new rating statements globals
      (global as any).ratingStatementsExtractionPromise = null;
      (global as any).ratingStatementsStartTime = null;
      (global as any).ratingStatementsSessionId = null;
      (global as any).ratingStatementsPhotoUri = null;
      (global as any).ratingStatementsMealData = null;
    }
    
    // Use setTimeout to ensure this runs completely asynchronously and doesn't block navigation
    setTimeout(async () => {
      try {
        // Wake up Render if cold (shares in-flight ping with other warmup calls)
        await ensureServerAwake();

        logWithSession(`Starting background quick criteria extraction for: ${mealName} at ${restaurant} (session: ${currentSessionId})`);

        // Store the request in global scope so other screens can access it
        // This allows Results screen to wait for completion
        const extractionPromise = extractDishRatingCriteria(
          mealName
        );

        // Store in global for later retrieval WITH SESSION TRACKING
        (global as any).ratingStatementsExtractionPromise = extractionPromise;
        (global as any).ratingStatementsStartTime = Date.now();
        (global as any).ratingStatementsSessionId = currentSessionId; // Track which session this belongs to
        (global as any).ratingStatementsPhotoUri = getEffectivePhoto()?.uri || null; // Track which photo this is for
        (global as any).ratingStatementsMealData = { mealName }; // Track meal data
        
        logWithSession(`Quick criteria extraction started in background for session: ${currentSessionId}`);
      } catch (error) {
        logWithSession(`Error starting quick criteria extraction: ${error}`);
        // Don't throw - this is a background operation
      }
    }, 0); // Run on next tick to ensure navigation happens first
  };
  
  // Handle image load error
  const handleImageError = () => {
    logWithSession('Image failed to load in RatingScreen2');
    setImageError(true);
  };

  // Handle adding photo to existing rating screen
  const handleAddPhoto = () => {
    Alert.alert(
      'Add Photo',
      'Choose photo source',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Camera', 
          onPress: handleCameraSelection
        },
        { 
          text: 'Gallery', 
          onPress: handleGallerySelection
        }
      ]
    );
  };
  
  // Handle camera selection
  const handleCameraSelection = () => {
    const options: ImagePicker.MediaType = 'photo';
    ImagePicker.launchCamera({ mediaType: options, quality: 0.8 }, handleCameraPhoto);
  };
  
  // Handle gallery selection
  const handleGallerySelection = async () => {
    // Use the native photo picker with metadata extraction for gallery photos
    const photoAsset = await getPhotoWithMetadata();
    if (photoAsset) {
      handleGalleryPhoto(photoAsset);
    }
  };

  // Handle gallery photo (with PHAsset location data)
  const handleGalleryPhoto = (photoAsset: any) => {
    logWithSession('Gallery photo selected with metadata');
    
    // Create new photo object from gallery
    const newPhoto = {
      uri: photoAsset.uri,
      width: photoAsset.width || 800,
      height: photoAsset.height || 600,
    };
    
    // Update local photo state
    setLocalPhoto(newPhoto);
    
    // Update the photo URI ref
    photoUriRef.current = photoAsset.uri;
    
    // Reset image error state
    setImageError(false);
    
    // Clear any existing restaurant suggestions
    setSuggestedRestaurants([]);
    setIsLoadingSuggestions(true);
    
    // Check if photo has location from PHAsset
    if (photoAsset.location) {
      logWithSession('PHAsset location found: ' + JSON.stringify(photoAsset.location));
      
      // Create location object from PHAsset data (highest priority)
      const photoLocation: LocationData = {
        latitude: photoAsset.location.latitude,
        longitude: photoAsset.location.longitude,
        source: photoAsset.location.source || 'phasset',
        priority: 2, // PHAsset has priority 2
        city: undefined
      };
      
      // Update location state
      setLocation(photoLocation);
      logWithSession('Location updated with PHAsset data from photo');
      
      // Fetch restaurant suggestions based on photo location
      fetchRestaurantSuggestions(photoLocation);
    } else {
      logWithSession('No PHAsset location found, using device location');
      // Fall back to device location
      const bestLocation = getBestAvailableLocation();
      if (bestLocation) {
        fetchRestaurantSuggestions(bestLocation);
      }
    }
  };
  
  // Handle camera photo (with EXIF extraction)
  const handleCameraPhoto = async (response: any) => {
    if (response.didCancel || response.errorCode || !response.assets?.[0]) {
      return;
    }

    const asset = response.assets[0];
    if (!asset.uri) {
      Alert.alert('Error', 'Failed to get image data');
      return;
    }

    logWithSession('Photo added to existing rating screen, updating state');

    // Create new photo object
    const newPhoto = {
      uri: asset.uri,
      width: asset.width || 800,
      height: asset.height || 600,
    };

    // Update local photo state
    setLocalPhoto(newPhoto);
    
    // Update the photo URI ref
    photoUriRef.current = asset.uri;
    
    // Reset image error state
    setImageError(false);
    
    // Clear any existing restaurant suggestions since we now have a photo
    setSuggestedRestaurants([]);
    setIsLoadingSuggestions(true);
    
    // Try to extract EXIF location data from the photo
    let photoLocation: LocationData | null = null;
    try {
      logWithSession('Attempting to extract EXIF data from selected photo');
      const exifData = await Exif.getExif(asset.uri);
      logWithSession('EXIF data retrieved: ' + JSON.stringify(exifData));
      
      // Check if GPS data is available in the EXIF
      if (exifData && exifData.GPSLatitude && exifData.GPSLongitude) {
        logWithSession('EXIF GPS data found in photo: ' + JSON.stringify({
          lat: exifData.GPSLatitude,
          lng: exifData.GPSLongitude
        }));
        
        // Create a location object from EXIF data
        photoLocation = {
          latitude: parseFloat(exifData.GPSLatitude),
          longitude: parseFloat(exifData.GPSLongitude),
          source: 'exif',
          priority: 3, // EXIF has priority 3
          city: undefined
        };
        
        // Update the location state with photo location
        setLocation(photoLocation);
        logWithSession('Location updated with EXIF data from photo');
        
        // Fetch restaurant suggestions based on photo location
        fetchRestaurantSuggestions(photoLocation);
      } else {
        logWithSession('No EXIF GPS data found in the selected photo');
        // If no EXIF location, use device location for suggestions
        const bestLocation = getBestAvailableLocation();
        if (bestLocation) {
          fetchRestaurantSuggestions(bestLocation);
        }
      }
    } catch (exifError) {
      logWithSession('Error extracting EXIF data from photo: ' + exifError);
      // Fall back to device location
      const bestLocation = getBestAvailableLocation();
      if (bestLocation) {
        fetchRestaurantSuggestions(bestLocation);
      }
    }
    
    logWithSession('Photo state updated, restaurant suggestions being fetched');
  };
  
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        extraScrollHeight={100}
        extraHeight={120}
      >
        <View style={styles.contentContainer}>
          {/* Image Container */}
          <View style={styles.imageContainer}>
            {!imageError && getEffectivePhoto()?.uri ? (
              <Image
                source={{ uri: getEffectivePhoto().uri }}
                style={styles.image}
                resizeMode="cover"
                onError={handleImageError}
              />
            ) : getEffectivePhoto() ? (
              // Photo exists but has error or no URI
              <View style={styles.imagePlaceholder}>
                <MaterialIcon name="image" size={50} color="#ccc" />
                <Text style={styles.placeholderText}>Image error</Text>
              </View>
            ) : (
              // No photo provided - show "Add Photo" button
              <TouchableOpacity 
                style={styles.addPhotoContainer}
                onPress={handleAddPhoto}
              >
                <Text style={styles.plusIcon}>+</Text>
                <Text style={styles.addPhotoText}>Optional: Add Photo Now</Text>
                <Text style={styles.addPhotoSubtext}>(You can add it later if you haven't taken it yet)</Text>
              </TouchableOpacity>
            )}
            
            {/* Processing overlay */}
            {isProcessing && (
              <View style={styles.processingOverlay}>
                <ActivityIndicator size="large" color="white" />
                <Text style={styles.processingText}>Processing...</Text>
              </View>
            )}
          </View>

          {/* Restaurant and Meal Input Section */}
          <View style={styles.infoSection}>
            {/* ── Restaurant Carousel with inline Write-In ── */}
            <Text style={styles.infoLabel}>Restaurant:</Text>
            <Carousel3D
              key={`restaurant_${route.params._uniqueKey}`}
              items={suggestedRestaurants.slice(0, 10).map((r) => ({
                id: r.id || r.name,
                label: r.name,
                sublabel: r.vicinity || r.formatted_address,
              }))}
              initialSelectedId={selectedRestaurantId}
              onSelect={(item) => {
                const matched = suggestedRestaurants.find(
                  (r) => (r.id || r.name) === item.id
                );
                if (matched) {
                  handleRestaurantSelection(matched);
                  setSelectedRestaurantId(item.id);
                }
              }}
              onWriteInSubmit={(text) => {
                setRestaurant(text);
                setIsUserEditingRestaurant(true);
                setHasExplicitRestaurantSelection(true);
              }}
              onWriteInTextChange={(text) => {
                handleRestaurantSearch(text);
              }}
              autocompleteResults={autocompleteRestaurants.map((r) => ({
                id: r.id || r.name,
                label: r.name,
                sublabel: r.vicinity || r.formatted_address,
              }))}
              isSearchingAutocomplete={isSearchingRestaurants}
              onAutocompleteSelect={(item) => {
                const matched = autocompleteRestaurants.find(
                  (r) => (r.id || r.name) === item.id
                );
                if (matched) {
                  handleRestaurantSelection(matched);
                  setSelectedRestaurantId(item.id);
                }
              }}
              isLoading={isLoadingSuggestions}
              loadingText="Finding nearby restaurants..."
              writeInPlaceholder="Type restaurant name..."
              writeInTitle="Enter restaurant name"
              emptyStateText="No nearby restaurants found"
            />

            {/* ── Dish Name Carousel with inline Write-In ── */}
            <Text style={[styles.infoLabel, { marginTop: 16 }]}>Meal:</Text>
            <Carousel3D
              key={`dish_${route.params._uniqueKey}`}
              items={[
                ...(primaryDishName ? [{ id: 'primary', label: primaryDishName }] : []),
                ...dishAlternatives
                  .filter((name) => name !== primaryDishName) // don't duplicate primary
                  .map((name, i) => ({
                    id: `alt_${i}`,
                    label: name,
                  })),
              ]}
              initialSelectedId="primary"
              onSelect={(item) => {
                setMealName(item.label);
                setIsUserEditingMeal(false);
              }}
              onWriteInSubmit={(text) => {
                setMealName(text);
                setIsUserEditingMeal(true);
              }}
              isLoading={isIdentifyingDish}
              loadingText="Identifying dish..."
              writeInPlaceholder="Enter meal name..."
              writeInTitle="Enter meal name"
              emptyStateText="Tap to enter your meal"
            />
          </View>
          
          {/* Save Button */}
          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: mealName.trim() && restaurant.trim() ? '#5B8A72' : '#cccccc' }
            ]}
            onPress={saveRating}
            disabled={!mealName.trim() || !restaurant.trim() || isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.saveButtonText}>Save Meal</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
      
      {/* Old restaurant/menu modals removed — replaced by Carousel3D */}
      
      {/* Photo Source Modal - COMMENTED OUT FOR TESTING */}
      {/*
      <Modal
        visible={showPhotoSourceModal}
        transparent={true}
        animationType="none"
        onRequestClose={() => setShowPhotoSourceModal(false)}
      >
        <TouchableOpacity 
          style={styles.photoSourceModalContainer}
          activeOpacity={1}
          onPress={() => setShowPhotoSourceModal(false)}
        >
          <View style={styles.photoSourceModalContent}>
            <TouchableOpacity
              style={styles.photoSourceOption}
              onPress={handleCameraSelection}
            >
              <Image
                source={require('../assets/icons/camera-active.png')}
                style={styles.photoSourceOptionImage}
                resizeMode="contain"
              />
              <Text style={styles.photoSourceOptionText}>Camera</Text>
            </TouchableOpacity>
            
            <View style={styles.modalSeparator} />
            
            <TouchableOpacity
              style={styles.photoSourceOption}
              onPress={handleGallerySelection}
            >
              <Image
                source={require('../assets/icons/upload-active.png')}
                style={styles.photoSourceOptionImage}
                resizeMode="contain"
              />
              <Text style={styles.photoSourceOptionText}>Upload</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      */}
      
      {/* Meal Suggestions Modal */}
      <Modal
        visible={showMealSuggestionsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowMealSuggestionsModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Top Meal Suggestions</Text>
            <Text style={styles.modalSubtitle}>Based on the restaurant menu and your image</Text>
            {suggestedMeals.length > 0 ? (
              <FlatList
                data={suggestedMeals}
                keyExtractor={(item, index) => `suggestion-${index}`}
                renderItem={({ item, index }) => (
                  <TouchableOpacity
                    style={[styles.menuItem, index === 0 ? styles.topSuggestion : {}]}
                    onPress={() => {
                      setMealName(item);
                      setIsUserEditingMeal(false);
                      setShowMealSuggestionsModal(false);
                    }}
                  >
                    {index === 0 && (
                      <View style={styles.topBadge}>
                        <MaterialIcon name="star" size={12} color="#fff" />
                        <Text style={styles.topBadgeText}>Best Match</Text>
                      </View>
                    )}
                    <Text style={styles.menuItemText}>{item}</Text>
                  </TouchableOpacity>
                )}
              />
            ) : (
              <View>
                <Text style={styles.noResultsText}>No meal suggestions available</Text>
                {restaurant ? (
                  <TouchableOpacity 
                    style={[styles.reloadButton, isLoadingMealSuggestions ? styles.reloadButtonDisabled : {}]}
                    onPress={() => {
                      if (!isLoadingMealSuggestions) {
                        // Menu suggestions removed for performance
                      }
                    }}
                    disabled={isLoadingMealSuggestions}
                  >
                    {isLoadingMealSuggestions ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text style={styles.reloadButtonText}>Refresh Suggestions</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowMealSuggestionsModal(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.lightTan,
  },
  backToCarouselLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 8,
    paddingVertical: 4,
  },
  backToCarouselText: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: '#5B8A72',
    marginLeft: 4,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 40,
    backgroundColor: colors.lightTan,
  },
  contentContainer: {
    padding: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.lightTan,
    overflow: 'visible', // Allow dropdowns to extend outside
  },
  headerContainer: {
    width: '100%',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  headerText: {
    ...typography.h3,
    fontFamily: 'Inter',
    fontWeight: 'normal',
    color: colors.textPrimary,
  },
  imageContainer: {
    width: '100%',
    height: 450,
    borderRadius: spacing.borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.white,
    marginVertical: spacing.md,
    position: 'relative',
    ...shadows.light,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  errorImageContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  errorImageText: {
    marginTop: spacing.sm,
    color: colors.textTertiary,
    ...typography.bodyMedium,
  },
  addPhotoContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.lightGray,
    borderRadius: spacing.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.mediumGray,
    borderStyle: 'dashed',
  },
  plusIcon: {
    fontSize: 120,
    fontWeight: '300',
    color: colors.textPrimary,
    lineHeight: 120,
  },
  addPhotoText: {
    ...typography.bodyLarge,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  addPhotoSubtext: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
    paddingHorizontal: spacing.screenPadding,
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: {
    color: colors.white,
    marginTop: spacing.sm,
    ...typography.bodyMedium,
  },
  // Restaurant and meal info styles
  infoSection: {
    width: '100%',
    marginBottom: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: spacing.borderRadius.md,
    padding: spacing.md,
    ...shadows.light,
    overflow: 'visible', // Allow dropdown to extend outside
    zIndex: 10, // Ensure this section is above the image
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  infoLabel: {
    width: 100,
    ...typography.bodyMedium,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  infoInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: colors.mediumGray,
    borderRadius: spacing.borderRadius.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.white,
    marginRight: spacing.xs,
    color: colors.textPrimary,
    ...typography.bodyMedium,
  },
  suggestButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#5B8A72',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  suggestButtonDisabled: {
    backgroundColor: '#ccc',
  },
  suggestButtonLoading: {
    backgroundColor: '#777',
    opacity: 0.8,
  },
  suggestButtonActive: {
    backgroundColor: '#5B8A72',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  badgeContainer: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#4caf50',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    zIndex: 2, // Ensure badge appears above button
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  saveButton: {
    width: '100%',
    paddingHorizontal: 40,
    paddingVertical: spacing.md,
    borderRadius: spacing.borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  saveButtonText: {
    color: colors.white,
    ...typography.bodyLarge,
    fontWeight: '600',
  },
  // Autocomplete styles
  autocompleteContainer: {
    flex: 1,
    position: 'relative',
    marginRight: 8,
    zIndex: 999, // Ensure container is also high in z-order
  },
  autocompleteDropdown: {
    position: 'absolute',
    top: 45,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderRadius: spacing.borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.mediumGray,
    zIndex: 9999,
    elevation: 999,
    ...shadows.medium,
    maxHeight: 300,
  },
  autocompleteList: {
    maxHeight: 300,
  },
  autocompleteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
  },
  autocompleteIcon: {
    marginRight: spacing.sm,
  },
  autocompleteTextContainer: {
    flex: 1,
  },
  autocompleteItemName: {
    ...typography.bodyMedium,
    fontWeight: '500',
  },
  autocompleteItemAddress: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  locationBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5B8A72',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  locationBadgeTextSmall: {
    color: 'white',
    fontSize: 10,
    marginLeft: 2,
    fontWeight: '500',
  },
  autocompleteLoading: {
    position: 'absolute',
    top: 5,
    right: 10,
    zIndex: 1001,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    width: '95%',
    height: '85%',
    backgroundColor: colors.white,
    borderRadius: spacing.borderRadius.md,
    padding: spacing.screenPadding,
    ...shadows.medium,
  },
  modalTitle: {
    ...typography.h3,
    fontFamily: 'Inter',
    fontWeight: 'bold',
    marginBottom: spacing.xs,
    textAlign: 'center',
    color: colors.textPrimary,
  },
  modalSubtitle: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  restaurantItem: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
  },
  restaurantName: {
    ...typography.bodyMedium,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  restaurantAddress: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  menuItem: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
  },
  menuItemText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  closeButton: {
    marginTop: spacing.screenPadding,
    padding: spacing.sm,
    backgroundColor: colors.warmTaupe,
    borderRadius: spacing.borderRadius.md,
    alignItems: 'center',
  },
  closeButtonText: {
    color: colors.white,
    fontWeight: '600',
    ...typography.bodyMedium,
  },
  noResultsText: {
    textAlign: 'center',
    padding: spacing.screenPadding,
    color: colors.textPrimary,
    ...typography.bodyMedium,
  },
  topSuggestion: {
    backgroundColor: '#FAF3E0',
    borderLeftWidth: 3,
    borderLeftColor: '#5B8A72',
  },
  topBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5B8A72',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  topBadgeText: {
    color: 'white',
    fontSize: 10,
    marginLeft: 2,
    fontWeight: '500',
  },
  buttonPlusText: {
    color: 'white',
    fontSize: 32,
    fontWeight: 'bold',
    lineHeight: 32,
    textAlign: 'center',
    includeFontPadding: false,
  },
  reloadButton: {
    backgroundColor: '#5B8A72',
    padding: 10,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    marginHorizontal: 20,
  },
  reloadButtonDisabled: {
    backgroundColor: '#ccc',
  },
  reloadButtonText: {
    color: colors.white,
    fontWeight: '500',
    ...typography.bodyMedium,
  },
  photoSourceModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoSourceModalContent: {
    backgroundColor: colors.white,
    borderRadius: spacing.borderRadius.md,
    padding: spacing.xs,
    paddingHorizontal: spacing.screenPadding,
    flexDirection: 'row',
    alignItems: 'center',
    width: 240,
    ...shadows.medium,
  },
  photoSourceOption: {
    alignItems: 'center',
    padding: spacing.sm,
    flex: 1,
  },
  photoSourceOptionImage: {
    width: 40,
    height: 40,
    tintColor: colors.textPrimary,
  },
  photoSourceOptionText: {
    marginTop: spacing.xs,
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  modalSeparator: {
    width: 1,
    height: 50,
    backgroundColor: colors.textPrimary,
    marginHorizontal: spacing.xs,
  },
});

export default RatingScreen2;