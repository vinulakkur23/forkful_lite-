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
// Import our direct Places API service instead of going through the backend
import { searchNearbyRestaurants, searchRestaurantsByText, getPlaceDetails, extractCityFromRestaurant, Restaurant } from '../services/placesService';
// import { getMenuSuggestionsForRestaurant } from '../services/menuSuggestionService'; // TEMPORARILY DISABLED FOR PERFORMANCE
// import { extractCombinedMetadataAndCriteria, CombinedResponse } from '../services/combinedMetadataCriteriaService'; // COMMENTED OUT - using new quick criteria service
import { extractQuickCriteria, QuickCriteriaData } from '../services/quickCriteriaService';
import { extractEnhancedMetadata, EnhancedMetadata } from '../services/enhancedMetadataService';
import { extractEnhancedMetadataFacts, EnhancedFactsData } from '../services/enhancedMetadataFactsService';
import Geolocation from '@react-native-community/geolocation';
// Import Firebase for saving meal data
import { firebase, auth, firestore, storage } from '../firebaseConfig';

// Extend the TabParamList to include all necessary parameters for RatingScreen2
declare module '../App' {
  interface TabParamList {
    RatingScreen2: {
      photo: {
        uri: string;
        width?: number;
        height?: number;
        sessionId?: string;
        assetId?: string;
      };
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
  const photo = route.params.photo; // Always get fresh photo from route params
  
  // Create a session ID to track this specific photo instance
  const photoSessionRef = useRef<string>(`photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
  const photoUriRef = useRef<string>(route.params.photo.uri);
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
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(true);
  const [isSearchingRestaurants, setIsSearchingRestaurants] = useState(false);
  const [isLoadingMealSuggestions, setIsLoadingMealSuggestions] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Track user editing state
  const [isUserEditingRestaurant, setIsUserEditingRestaurant] = useState(false);
  const [isUserEditingMeal, setIsUserEditingMeal] = useState(false);
  
  // Track if user has made an explicit restaurant selection (prevent auto-override)
  const [hasExplicitRestaurantSelection, setHasExplicitRestaurantSelection] = useState(false);
  
  // Device location state
  const [deviceLocation, setDeviceLocation] = useState<LocationData | null>(null);
  const [isLoadingDeviceLocation, setIsLoadingDeviceLocation] = useState(false);
  
  // Limit number of results in the autocomplete dropdown
  const MAX_AUTOCOMPLETE_RESULTS = 3;
  
  // Function to log with session tracking
  const logWithSession = (message: string) => {
    console.log(`[${photoSessionRef.current}] ${message}`);
  };
  
  // Initialize location from prefetched data (preferred) or route params
  const initializeLocationFromParams = (): LocationData | null => {
    // FIRST TRY: Use the prefetched location data from CropScreen if available
    // This should be the original PHAsset location data that was preserved
    if ((global as any).prefetchedLocation && (global as any).prefetchedPhotoUri) {
      // Verify this is for the current photo by checking URI correspondence
      const isPrefetchForCurrentPhoto = (
        (global as any).prefetchedPhotoUri === photo.uri || 
        (global as any).currentPhotoUri === photo.uri
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
        logWithSession(`Current photo: ${photo.uri}, prefetched photo: ${(global as any).prefetchedPhotoUri}`);
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
      Alert.alert(
        "Location Not Available", 
        "Your device location could not be determined. You may need to manually search for restaurants."
      );
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
    console.log(`========= COMPLETE RESET for new photo session: ${newSessionId} =========`);
    logWithSession(`Resetting state for new photo session: ${newSessionId}`);
    
    // Check if the current photo URI matches the prefetched photo URI
    // This helps detect when we're handling a completely new photo vs the same photo
    const isSamePhotoAsPrefetched = 
      (global as any).prefetchedPhotoUri === route.params.photo.uri || 
      (global as any).currentPhotoUri === route.params.photo.uri;
    
    // We're NO LONGER clearing prefetched suggestions here
    // They should already be cleared in CropScreen when a new photo is detected
    // and we want to preserve the original phasset location data from CropScreen
    if (isSamePhotoAsPrefetched) {
      console.log(`Using existing prefetched suggestions for photo: ${route.params.photo.uri}`);
      if ((global as any).prefetchedLocation) {
        console.log(`Preserved original location data: ${(global as any).prefetchedLocation.latitude}, ${(global as any).prefetchedLocation.longitude} (source: ${(global as any).prefetchedLocation.source})`);
      }
    } else {
      console.log(`No matching prefetched data for photo: ${route.params.photo.uri}`);
      console.log(`Expected: ${(global as any).prefetchedPhotoUri || 'none'}, Current: ${route.params.photo.uri}`);
    }
    
    // Always update the currentPhotoUri to track the current photo being processed
    (global as any).currentPhotoUri = route.params.photo.uri;
    
    // Update session references
    photoSessionRef.current = newSessionId;
    photoUriRef.current = route.params.photo.uri;
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
    setIsLoadingSuggestions(false);
    setIsSearchingRestaurants(false);
    setIsLoadingMealSuggestions(false);
    
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
    if ((global as any).prefetchedSuggestions && 
        (global as any).prefetchedPhotoUri === route.params.photo.uri) {
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
    
    console.log(`========= RESET COMPLETE for photo: ${route.params.photo.uri} with session: ${newSessionId} =========`);
    logWithSession(`State reset complete for photo: ${route.params.photo.uri}`);
  };
  
  // Track if this is the first render
  const isFirstRender = useRef(true);
  
  // Initialize on component mount or when route params change
  useEffect(() => {
    // Check for valid photo
    if (!route.params.photo || !route.params.photo.uri) {
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
      console.log(`============= INITIALIZING RATING SCREEN =============`);
      console.log(`Initial _uniqueKey: ${route.params._uniqueKey}`);
      console.log(`Initial photo URI: ${route.params.photo.uri}`);
      isFirstRender.current = false;
    } else {
      console.log(`============= ROUTE PARAMS CHANGED =============`);
      console.log(`New _uniqueKey: ${route.params._uniqueKey}`);
      console.log(`New photo URI: ${route.params.photo.uri}`);
    }
    
    // Force a complete reset of state for this photo
    resetState();
    
    // Clean up on unmount
    return () => {
      console.log(`============= CLEANING UP RATING SCREEN =============`);
      logWithSession("Component unmounting, cleaning up");
      
      // Clear any in-progress API calls to prevent them from affecting next session
      if ((global as any).quickCriteriaExtractionPromise) {
        console.log("Clearing in-progress quick criteria extraction promise");
        (global as any).quickCriteriaExtractionPromise = null;
        (global as any).quickCriteriaStartTime = null;
      }
    };
  }, [route.params._uniqueKey, route.params.photo.uri]); // Re-run when unique key or photo URI changes
  
  // Effect to fetch restaurant suggestions when location is available
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
    
    if (bestLocation && suggestedRestaurants.length === 0 && !isLoadingSuggestions) {
      logWithSession(`Using location for restaurant suggestions: ${bestLocation.source} (priority: ${bestLocation.priority})`);
      logWithSession(`Photo URI: ${route.params.photo.uri}, coordinates: ${bestLocation.latitude}, ${bestLocation.longitude}`);
      
      // Check once more that we're using location data that belongs to this photo
      // by comparing with the global trackers
      if ((global as any).currentPhotoUri !== currentPhotoUri) {
        logWithSession(`WARNING: Photo URI mismatch detected - current: ${currentPhotoUri}, global: ${(global as any).currentPhotoUri}`);
        // If there's a mismatch, we should consider refreshing location data
        // but we'll proceed since we've already validated in initializeLocationFromParams
      }
      
      // Only fetch if we don't already have suggestions and aren't loading
      fetchRestaurantSuggestions(bestLocation);
      // Note: fetchRestaurantSuggestions now has its own check to prevent duplicate fetches within the same session
    } else if (suggestedRestaurants.length > 0) {
      logWithSession(`Already have ${suggestedRestaurants.length} restaurant suggestions, skipping fetch`);
    } else if (isLoadingSuggestions) {
      logWithSession(`Already loading suggestions, skipping duplicate fetch`);
    }
    
    // Cleanup function to cancel any pending operations if the session changes
    return () => {
      // Check if the session has changed since this effect was triggered
      if (currentSession !== photoSessionRef.current) {
        logWithSession(`Session changed from ${currentSession} to ${photoSessionRef.current}, discarding pending operations`);
      }
    };
  }, [location, suggestedRestaurants.length]); // Re-run when location changes or restaurant count changes - removed deviceLocation to prevent re-fetch
  
  // Handle autocomplete search for restaurants using DIRECT Places API
  const handleRestaurantSearch = async (text: string) => {
    console.log(`🔍 handleRestaurantSearch called with: "${text}" (length: ${text.length})`);
    setRestaurant(text);
    
    // Flag that user is actively editing
    setIsUserEditingRestaurant(true);
    
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
      console.log('✅ File uploaded successfully');
      
      // Get download URL
      const downloadURL = await reference.getDownloadURL();
      console.log('✅ Image uploaded to Firebase Storage:', downloadURL);
      
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
      const originalWidth = route.params.photo.width || 1000;
      const originalHeight = route.params.photo.height || 1000;
      const isPortrait = originalHeight > originalWidth;
      
      // Set 800 on the shortest side, scale the other proportionally
      const targetWidth = isPortrait ? 800 : Math.round(800 * (originalWidth / originalHeight));
      const targetHeight = isPortrait ? Math.round(800 * (originalHeight / originalWidth)) : 800;
      
      console.log(`Resizing image from ${originalWidth}x${originalHeight} to ${targetWidth}x${targetHeight} for API calls...`);
      const resizedImage = await ImageResizer.createResizedImage(
        route.params.photo.uri,
        targetWidth,  // Proportional width
        targetHeight, // Proportional height
        'JPEG',
        85,   // Quality - matches CropScreen compression
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
      const freshPhoto = {
        uri: newFilePath,
        width: resizedImage.width,
        height: resizedImage.height,
        sessionId: sessionId
      };
      
      // ASYNC (NON-BLOCKING) but SEQUENTIAL: Start dish criteria API and let it run in background
      logWithSession('Starting dish criteria API asynchronously...');
      let quickCriteriaResult: QuickCriteriaData | null = null;
      
      // CLEAN APPROACH: Create basic meal entry first, then update with criteria
      console.log('🧹 Creating basic meal entry first...');
      
      // Get current user
      const user = auth().currentUser;
      if (!user) {
        Alert.alert('Error', 'Please log in to save your meal');
        setIsProcessing(false);
        return;
      }
      
      console.log('User authenticated:', user.uid);
      
      // Use city from location data (extracted via Google Places API) or fallback to restaurant parsing
      let cityInfo = '';
      if (location && location.city) {
        // Use properly extracted city from Google Places API
        cityInfo = location.city;
        console.log('Using city from location data:', cityInfo);
      } else if (restaurant) {
        // Fallback to parsing restaurant string
        const restaurantParts = restaurant.split(',');
        if (restaurantParts.length > 1) {
          cityInfo = restaurantParts[1].trim();
        }
        console.log('Using city from restaurant parsing fallback:', cityInfo);
      }
      
      // IMPORTANT: Don't upload image yet - wait until after editing
      console.log('Skipping image upload - will upload after editing');
      
      // Create basic meal data (without image URL yet)
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
        quick_criteria_result: null,
        dish_criteria: null
      };
      
      // Save basic meal data and get the document ID
      const docRef = await firestore().collection('mealEntries').add(basicMealData);
      const mealId = docRef.id;
      console.log('✅ Basic meal saved with ID:', mealId);
      logWithSession(`Basic meal saved: ${mealId}`);
      
      // Start with quick criteria first, then enhanced metadata sequentially
      console.log('🔄 Starting quick criteria extraction...');
      logWithSession('Starting sequential API calls - quick criteria first');
      
      extractQuickCriteria(
        freshPhoto.uri,
        mealName,
        restaurant
      ).then(async (result) => {
        if (result) {
          console.log('✅ Quick criteria completed:', result.dish_criteria?.length || 0, 'criteria');
          console.log('📊 Full criteria result:', JSON.stringify(result, null, 2));
          logWithSession(`Quick criteria completed with ${result.dish_criteria?.length || 0} criteria`);
          
          // Log if this looks like fallback data
          if (result.dish_criteria && result.dish_criteria[0]?.name === 'Visual Appeal') {
            console.warn('⚠️ WARNING: This looks like fallback/default criteria!');
          }
          
          // Update the meal document with criteria
          try {
            const criteriaUpdate = {
              quick_criteria_result: result,
              dish_criteria: result.dish_criteria ? {
                criteria: result.dish_criteria.map(criterion => ({
                  title: criterion.name || criterion.title || 'Quality Aspect',
                  description: `${criterion.what_to_look_for || ''} ${criterion.insight || ''}`.trim()
                }))
              } : null,
              criteria_updated_at: firestore.FieldValue.serverTimestamp()
            };
            
            await firestore().collection('mealEntries').doc(mealId).update(criteriaUpdate);
            console.log('🎉 Meal updated with criteria, starting enhanced metadata...');
            logWithSession(`Criteria saved, starting enhanced metadata extraction`);
            
            // NOW start enhanced metadata extraction
            return extractEnhancedMetadata(freshPhoto.uri, mealName, restaurant);
            
          } catch (firestoreError) {
            console.error('❌ Error saving criteria to Firestore:', firestoreError);
            logWithSession(`Criteria save error: ${firestoreError}`);
            throw firestoreError;
          }
        } else {
          console.warn('⚠️ Quick criteria returned null');
          logWithSession('Quick criteria failed - skipping enhanced metadata');
          return null;
        }
      }).then(async (metadata) => {
        if (metadata) {
          console.log('✅ Enhanced metadata completed:', metadata.dish_specific);
          logWithSession(`Enhanced metadata completed: ${metadata.dish_specific}`);
          
          // Update the meal document with enhanced metadata
          try {
            const metadataUpdate = {
              metadata_enriched: metadata,
              metadata_updated_at: firestore.FieldValue.serverTimestamp()
            };
            
            await firestore().collection('mealEntries').doc(mealId).update(metadataUpdate);
            console.log('🎉 Enhanced metadata saved, starting facts extraction...');
            logWithSession(`Enhanced metadata saved: ${metadata.dish_specific}`);
            
            // NOW start enhanced metadata facts extraction using enhanced metadata dish info
            return extractEnhancedMetadataFacts(
              freshPhoto.uri,
              metadata.dish_specific,
              metadata.dish_general, 
              metadata.cuisine_type,
              mealName,
              restaurant,
              location?.city // Pass the city from location data
            );
            
          } catch (firestoreError) {
            console.error('❌ Error saving enhanced metadata:', firestoreError);
            logWithSession(`Enhanced metadata save error: ${firestoreError}`);
            throw firestoreError;
          }
        } else {
          console.warn('⚠️ Enhanced metadata returned null');
          logWithSession('Enhanced metadata failed - skipping facts extraction');
          return null;
        }
      }).then(async (factsData) => {
        if (factsData) {
          console.log('✅ Enhanced metadata facts completed');
          logWithSession(`Enhanced metadata facts completed`);
          
          // Update the meal document with facts data
          try {
            const factsUpdate = {
              enhanced_facts: factsData,
              facts_updated_at: firestore.FieldValue.serverTimestamp()
            };
            
            await firestore().collection('mealEntries').doc(mealId).update(factsUpdate);
            console.log('🎉 All sequential API calls completed successfully');
            logWithSession(`All metadata and facts extraction completed`);
            
          } catch (firestoreError) {
            console.error('❌ Error saving enhanced facts:', firestoreError);
            logWithSession(`Enhanced facts save error: ${firestoreError}`);
          }
        }
      }).catch(error => {
        console.error('❌ Sequential API call failed:', error);
        logWithSession(`Sequential API error: ${error}`);
      });
      
      console.log('DEBUG: Dish criteria API running asynchronously');
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
      
      // API call completed synchronously above - no need for background call
      
      // CLEAN APPROACH: Navigate with meal ID instead of all meal data
      const cropNavParams = {
        photo: freshPhoto,
        location: location ? {
          latitude: location.latitude,
          longitude: location.longitude,
          source: location.source
        } : null,
        photoSource: route.params.photoSource || 'unknown',
        // CLEAN: Pass meal ID instead of meal data - screens will load from Firestore
        mealId: mealId,
        _uniqueKey: sessionId
      };
      
      console.log('RatingScreen2 navigating to Crop with cleaned params');
      navigation.navigate('Crop', cropNavParams);
    } catch (error) {
      logWithSession(`Error preparing image for Result screen: ${error}`);
      Alert.alert('Error', 'Failed to save rating. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Function to start quick criteria extraction in background
  const startQuickCriteriaExtraction = (photo: any, restaurant: string, mealName: string) => {
    const currentSessionId = photoSessionRef.current;
    
    // Clear any existing promise first to prevent stale data
    if ((global as any).quickCriteriaExtractionPromise) {
      logWithSession('Clearing previous quick criteria extraction promise before starting new one');
      (global as any).quickCriteriaExtractionPromise = null;
      (global as any).quickCriteriaStartTime = null;
      (global as any).quickCriteriaSessionId = null;
    }
    
    // Use setTimeout to ensure this runs completely asynchronously and doesn't block navigation
    setTimeout(() => {
      try {
        logWithSession(`Starting background quick criteria extraction for: ${mealName} at ${restaurant} (session: ${currentSessionId})`);
        
        // Store the request in global scope so other screens can access it
        // This allows Results screen to wait for completion
        const extractionPromise = extractQuickCriteria(
          photo.uri, 
          { mealName, restaurant }
        );
        
        // Store in global for later retrieval WITH SESSION TRACKING
        (global as any).quickCriteriaExtractionPromise = extractionPromise;
        (global as any).quickCriteriaStartTime = Date.now();
        (global as any).quickCriteriaSessionId = currentSessionId; // Track which session this belongs to
        (global as any).quickCriteriaPhotoUri = photo.uri; // Track which photo this is for
        (global as any).quickCriteriaMealData = { mealName, restaurant }; // Track meal data
        
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
          {/* Restaurant and Meal Input Section */}
          <View style={styles.infoSection}>
            {/* Restaurant Input */}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Restaurant:</Text>
              <View style={styles.autocompleteContainer}>
              <TextInput
                style={styles.infoInput}
                value={restaurant}
                onChangeText={handleRestaurantSearch}
                onFocus={() => {
                  logWithSession("User focused on restaurant input");
                  setIsUserEditingRestaurant(true);
                  
                  // Immediately show autocomplete with nearby restaurants when user focuses
                  setShowAutocomplete(true);
                  
                  // If we already have suggestions from prefetch, display them
                  if (suggestedRestaurants.length > 0) {
                    logWithSession(`Showing ${suggestedRestaurants.length} prefetched restaurant suggestions as autocomplete`);
                    setAutocompleteRestaurants(suggestedRestaurants);
                  } 
                  // Otherwise try to fetch nearby restaurants at a small radius
                  else {
                    const bestLocation = getBestAvailableLocation();
                    if (bestLocation) {
                      logWithSession(`Fetching nearby restaurants on field focus with location: ${bestLocation.source}`);
                      setIsSearchingRestaurants(true);
                      
                      // Use a small radius (30 meters) to get very nearby restaurants
                      searchNearbyRestaurants(bestLocation, 30)
                        .then(restaurants => {
                          logWithSession(`Found ${restaurants.length} nearby restaurants on field focus`);
                          setAutocompleteRestaurants(restaurants);
                          setSuggestedRestaurants(restaurants); // Also save for later use
                        })
                        .catch(error => {
                          logWithSession(`Error fetching nearby restaurants on focus: ${error}`);
                        })
                        .finally(() => {
                          setIsSearchingRestaurants(false);
                        });
                    }
                  }
                }}
                onBlur={() => {
                  logWithSession("User blurred restaurant input");
                  setTimeout(() => {
                    setShowAutocomplete(false);
                  }, 200);
                }}
                placeholder="Enter restaurant name"
              />
              
              {/* Autocomplete dropdown */}
              {showAutocomplete && autocompleteRestaurants.length > 0 && (
                <View style={styles.autocompleteDropdown}>
                  {isSearchingRestaurants && (
                    <ActivityIndicator size="small" color="#ffc008" style={styles.autocompleteLoading} />
                  )}
                  <FlatList
                    data={autocompleteRestaurants}
                    keyExtractor={(item) => item.id || item.name}
                    keyboardShouldPersistTaps="handled"
                    style={styles.autocompleteList}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.autocompleteItem}
                        onPress={() => {
                          handleRestaurantSelection(item);
                          setShowAutocomplete(false);
                        }}
                      >
                        <View style={styles.autocompleteTextContainer}>
                          <Text style={styles.autocompleteItemName}>{item.name}</Text>
                          <Text style={styles.autocompleteItemAddress}>{item.vicinity || item.formatted_address}</Text>
                          
                          {/* Show location badge if available */}
                          {item.geometry && item.geometry.location && (
                            <View style={styles.locationBadgeSmall}>
                              <MaterialIcon name="place" size={10} color="#fff" />
                              <Text style={styles.locationBadgeTextSmall}>Location available</Text>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              )}
            </View>

            {/* Suggestions button for restaurant */}
            <TouchableOpacity
              style={styles.suggestButton}
              onPress={() => {
                // If we already have suggestions, show them
                if (suggestedRestaurants.length > 0) {
                  setShowRestaurantModal(true);
                } 
                // Otherwise try to fetch nearby restaurants
                else {
                  const bestLocation = getBestAvailableLocation();
                  if (bestLocation) {
                    logWithSession(`Fetching nearby restaurants on button press with location: ${bestLocation.source}`);
                    setIsLoadingSuggestions(true);
                    
                    // Use a 100-meter radius to find more restaurants on button press
                    searchNearbyRestaurants(bestLocation, 100)
                      .then(restaurants => {
                        logWithSession(`Found ${restaurants.length} nearby restaurants on button press`);
                        setSuggestedRestaurants(restaurants);
                        if (restaurants.length > 0) {
                          setShowRestaurantModal(true);
                        } else {
                          Alert.alert('No Restaurants Found', 'No restaurants found nearby. Try searching by name instead.');
                        }
                      })
                      .catch(error => {
                        logWithSession(`Error fetching nearby restaurants on button press: ${error}`);
                        Alert.alert('Error', 'Failed to fetch nearby restaurants. Try searching by name instead.');
                      })
                      .finally(() => {
                        setIsLoadingSuggestions(false);
                      });
                  } else {
                    Alert.alert('Location Unavailable', 'Cannot find nearby restaurants without location data. Try searching by name instead.');
                  }
                }
              }}
            >
              <Text style={styles.buttonPlusText}>+</Text>
            </TouchableOpacity>
          </View>
            
            {/* Meal Input with Button Container */}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Meal:</Text>
              <TextInput
                style={styles.infoInput}
                value={mealName}
                onChangeText={(text) => {
                  setIsUserEditingMeal(true);
                  setMealName(text);
                }}
                onFocus={() => {
                  logWithSession("User focused on meal input");
                  setIsUserEditingMeal(true);
                }}
                onBlur={() => {
                  logWithSession("User blurred meal input");
                  setTimeout(() => {
                    setIsUserEditingMeal(false);
                  }, 200);
                }}
                placeholder="Enter meal name"
                autoCapitalize="words"
              />
              
              {/* Single button that changes state based on meal suggestions */}
              <TouchableOpacity
                style={[
                  styles.suggestButton, 
                  suggestedMeals.length > 0 ? styles.suggestButtonActive : styles.suggestButtonDisabled
                ]}
                onPress={() => {
                  if (suggestedMeals.length > 0) {
                    // If we have meal suggestions, show them
                    setShowMealSuggestionsModal(true);
                  } else if (restaurant) {
                    // If no suggestions but we have a restaurant, try to fetch them
                    // Menu suggestions removed for performance
                    // Show a loading toast to indicate we're fetching suggestions
                    Alert.alert('Fetching Suggestions', 'Getting meal suggestions for ' + restaurant);
                  } else {
                    // If no restaurant selected yet
                    Alert.alert('No Restaurant Selected', 'Please select a restaurant first to get meal suggestions.');
                  }
                }}
                disabled={!restaurant}
              >
                {isLoadingMealSuggestions ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Text style={styles.buttonPlusText}>+</Text>
                    {suggestedMeals.length > 0 && (
                      <View style={styles.badgeContainer}>
                        <Text style={styles.badgeText}>{suggestedMeals.length}</Text>
                      </View>
                    )}
                  </>
                )}
              </TouchableOpacity>
            </View>
            
            {/* Loading indicator */}
            {isLoadingSuggestions && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#ffc008" />
                <Text style={styles.loadingText}>Getting suggestions...</Text>
              </View>
            )}
          </View>
          
          {/* Image Container */}
          <View style={styles.imageContainer}>
            {!imageError && route.params.photo && route.params.photo.uri ? (
              <Image
                source={{ uri: route.params.photo.uri }}
                style={styles.image}
                resizeMode="cover"
                onError={handleImageError}
              />
            ) : (
              <View style={styles.errorImageContainer}>
                <MaterialIcon name="broken-image" size={64} color="#ccc" />
                <Text style={styles.errorImageText}>Failed to load image</Text>
              </View>
            )}
            
            {/* Processing overlay */}
            {isProcessing && (
              <View style={styles.processingOverlay}>
                <ActivityIndicator size="large" color="white" />
                <Text style={styles.processingText}>Processing...</Text>
              </View>
            )}
          </View>
          
          {/* Save Button */}
          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: mealName.trim() ? '#1a2b49' : '#cccccc' }
            ]}
            onPress={saveRating}
            disabled={!mealName.trim() || isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.saveButtonText}>Crop and Edit</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
      
      {/* Restaurant Selection Modal */}
      <Modal
        visible={showRestaurantModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowRestaurantModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nearby Restaurants</Text>
            {suggestedRestaurants.length > 0 ? (
              <FlatList
                data={suggestedRestaurants}
                keyExtractor={(item) => item.id || item.name || Math.random().toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.restaurantItem}
                    onPress={() => {
                      handleRestaurantSelection(item);
                      setShowRestaurantModal(false);
                    }}
                  >
                    <Text style={styles.restaurantName}>{item.name || 'Unnamed Restaurant'}</Text>
                    <Text style={styles.restaurantAddress}>{item.vicinity || 'No address available'}</Text>
                  </TouchableOpacity>
                )}
              />
            ) : (
              <Text style={styles.noResultsText}>No restaurants found nearby. Try entering a restaurant name manually.</Text>
            )}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowRestaurantModal(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {/* Menu Items Modal */}
      <Modal
        visible={showMenuModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowMenuModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Menu Items</Text>
            {menuItems.length > 0 ? (
              <FlatList
                data={menuItems}
                keyExtractor={(item, index) => `menu-${index}`}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      setMealName(item);
                      setIsUserEditingMeal(false);
                      setShowMenuModal(false);
                    }}
                  >
                    <Text style={styles.menuItemText}>{item}</Text>
                  </TouchableOpacity>
                )}
              />
            ) : (
              <Text style={styles.noResultsText}>No menu items available</Text>
            )}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowMenuModal(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
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
    backgroundColor: '#FAF9F6', // Light off-white color matching HomeScreen
  },
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 40,
    backgroundColor: '#FAF9F6', // Light off-white background
  },
  contentContainer: {
    padding: 15,
    alignItems: 'center',
    backgroundColor: '#FAF9F6', // Light off-white background
    overflow: 'visible', // Allow dropdowns to extend outside
  },
  imageContainer: {
    width: '100%',
    height: 450, // Increased height from 400 to 450 for bigger image
    borderRadius: 12, // Matching card radius from HomeScreen
    overflow: 'hidden',
    backgroundColor: '#FAF3E0', // Card background color from HomeScreen
    marginVertical: 15,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
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
    marginTop: 10,
    color: '#999',
    fontSize: 16,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
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
    color: 'white',
    marginTop: 10,
    fontSize: 16,
  },
  // Restaurant and meal info styles
  infoSection: {
    width: '100%',
    marginBottom: 10,
    backgroundColor: '#FFFFFF', // White background
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'visible', // Allow dropdown to extend outside
    zIndex: 10, // Ensure this section is above the image
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoLabel: {
    width: 100,
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    color: '#1a2b49',
  },
  infoInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    paddingHorizontal: 10,
    backgroundColor: 'white',
    marginRight: 8, // Add margin to separate from the button
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  suggestButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#ffc008',
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
    backgroundColor: '#ffc008',
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
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
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
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    zIndex: 9999, // Very high z-index to ensure it's above everything
    elevation: 999, // Very high elevation for Android
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    maxHeight: 300,
  },
  autocompleteList: {
    maxHeight: 300,
  },
  autocompleteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  autocompleteIcon: {
    marginRight: 10,
  },
  autocompleteTextContainer: {
    flex: 1,
  },
  autocompleteItemName: {
    fontSize: 14,
    fontWeight: '500',
  },
  autocompleteItemAddress: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  locationBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffc008',
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
    width: '80%',
    maxHeight: '70%',
    backgroundColor: '#FFFFFF', // White background for consistency
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
    textAlign: 'center',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    color: '#1a2b49',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  restaurantItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  restaurantName: {
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    color: '#1a2b49',
  },
  restaurantAddress: {
    fontSize: 14,
    color: '#1a2b49',
    marginTop: 5,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  menuItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  menuItemText: {
    fontSize: 16,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    color: '#1a2b49',
  },
  closeButton: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#ffc008',
    borderRadius: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#1a2b49',
    fontWeight: '600',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  noResultsText: {
    textAlign: 'center',
    padding: 20,
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  topSuggestion: {
    backgroundColor: '#FAF3E0',
    borderLeftWidth: 3,
    borderLeftColor: '#ffc008',
  },
  topBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffc008',
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
    backgroundColor: '#ffc008',
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
    color: 'white',
    fontWeight: '500',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  }
});

export default RatingScreen2;