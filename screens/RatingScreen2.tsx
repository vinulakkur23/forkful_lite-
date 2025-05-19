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
// Import our direct Places API service instead of going through the backend
import { searchNearbyRestaurants, searchRestaurantsByText, Restaurant } from '../services/placesService';
import { getMenuSuggestionsForRestaurant } from '../services/menuSuggestionService';
import Geolocation from '@react-native-community/geolocation';

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
      likedComment?: string;
      dislikedComment?: string;
      suggestionData?: any;
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
  const { photo, rating, likedComment, dislikedComment } = route.params;
  
  // Create a session ID to track this specific photo instance
  const photoSessionRef = useRef<string>(`photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
  const photoUriRef = useRef<string>(photo.uri);
  // Track the last photo URI that we fetched restaurants for
  const trackedPhotoUri = useRef<string>('');
  
  // Restaurant and meal state
  const [location, setLocation] = useState<LocationData | null>(null);
  const [restaurant, setRestaurant] = useState("");
  const [mealName, setMealName] = useState("");
  // Add meal type selector state - default to "Restaurant"
  const [mealType, setMealType] = useState<"Restaurant" | "Homemade">("Restaurant");
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
      let prefetchedMenuItems: string[] = [];
      let prefetchedMealSuggestions: string[] = [];
      
      if (hasPrefetchedSuggestions) {
        logWithSession("Using prefetched restaurant suggestions from CropScreen");
        restaurants = (global as any).prefetchedSuggestions.restaurants || [];
        prefetchedMenuItems = (global as any).prefetchedSuggestions.menu_items || [];
        prefetchedMealSuggestions = (global as any).prefetchedSuggestions.suggested_meals || [];
        
        if (prefetchedMealSuggestions.length === 0 && (global as any).prefetchedSuggestions.suggested_meal) {
          // For backward compatibility with older prefetched data
          prefetchedMealSuggestions = [(global as any).prefetchedSuggestions.suggested_meal];
        }
        
        logWithSession(`Found ${restaurants.length} prefetched restaurants, ${prefetchedMenuItems.length} menu items, and ${prefetchedMealSuggestions.length} meal suggestions`);
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
        
        // Only update restaurant field if user isn't currently editing
        if (!isUserEditingRestaurant) {
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
          
          // Set prefetched menu items if available
          if (prefetchedMenuItems.length > 0) {
            logWithSession(`Setting ${prefetchedMenuItems.length} prefetched menu items`);
            setMenuItems(prefetchedMenuItems);
          }
          
          // Set prefetched meal suggestions if available
          if (prefetchedMealSuggestions.length > 0) {
            logWithSession(`Setting ${prefetchedMealSuggestions.length} prefetched meal suggestions`);
            setSuggestedMeals(prefetchedMealSuggestions);
            setIsLoadingMealSuggestions(false);
          } else {
            // If we don't have prefetched meal suggestions but we do have a restaurant, 
            // fetch them now (as a fallback)
            logWithSession("No prefetched meal suggestions, will try to fetch them now");
            updateMealSuggestionsForRestaurant(restaurants[0].name);
          }
          
          // Don't auto-populate the meal field anymore
          // Instead we'll just rely on the suggestions button to show options
          logWithSession("Not auto-filling meal field - user will select from suggestions");
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
  
  // Extract city from restaurant data
  const extractCityFromRestaurant = (restaurantData: Restaurant): string => {
    if (!restaurantData) return '';
    
    const address = restaurantData.vicinity || restaurantData.formatted_address;
    if (!address) return '';
    
    // Try to extract city from address
    const addressParts = address.split(',').map(part => part.trim());
    logWithSession(`Address parts for restaurant: ${JSON.stringify(addressParts)}`);
    
    // City is typically the second component in a comma-separated address
    if (addressParts.length > 1) {
      const secondPart = addressParts[1];
      
      // If second part has spaces (like "Portland OR"), take just the city name
      if (secondPart.includes(' ')) {
        return secondPart.split(' ')[0];
      }
      return secondPart;
    }
    
    return '';
  };
  
  // Function for when restaurant changes - fetches menu items and meal suggestions
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
  const handleRestaurantSelection = (restaurant: Restaurant) => {
    logWithSession(`Restaurant selected: ${restaurant.name}`);
    
    // Update restaurant name
    setRestaurant(restaurant.name);
    
    // Turn off editing mode since this was an explicit selection
    setIsUserEditingRestaurant(false);
    
    // Update location if restaurant has location data
    if (restaurant.geometry && restaurant.geometry.location) {
      const city = extractCityFromRestaurant(restaurant);
      
      // Create location object with restaurant data
      const restaurantLocation: LocationData = {
        latitude: restaurant.geometry.location.lat,
        longitude: restaurant.geometry.location.lng,
        source: 'restaurant_selection',
        priority: 1, // Highest priority
        city: city
      };
      
      logWithSession(`Updated location from restaurant selection: ${JSON.stringify(restaurantLocation)}`);
      setLocation(restaurantLocation);
    }
    
    // Always fetch menu items and meal suggestions for the selected restaurant
    // Clear existing meal suggestions to avoid confusion
    setSuggestedMeals([]);
    setMenuItems([]);
    setIsLoadingMealSuggestions(true);
    
    // Fetch menu items for this restaurant
    updateMealSuggestionsForRestaurant(restaurant.name);
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
      (global as any).prefetchedPhotoUri === photo.uri || 
      (global as any).currentPhotoUri === photo.uri;
    
    // We're NO LONGER clearing prefetched suggestions here
    // They should already be cleared in CropScreen when a new photo is detected
    // and we want to preserve the original phasset location data from CropScreen
    if (isSamePhotoAsPrefetched) {
      console.log(`Using existing prefetched suggestions for photo: ${photo.uri}`);
      if ((global as any).prefetchedLocation) {
        console.log(`Preserved original location data: ${(global as any).prefetchedLocation.latitude}, ${(global as any).prefetchedLocation.longitude} (source: ${(global as any).prefetchedLocation.source})`);
      }
    } else {
      console.log(`No matching prefetched data for photo: ${photo.uri}`);
      console.log(`Expected: ${(global as any).prefetchedPhotoUri || 'none'}, Current: ${photo.uri}`);
    }
    
    // Always update the currentPhotoUri to track the current photo being processed
    (global as any).currentPhotoUri = photo.uri;
    
    // Update session references
    photoSessionRef.current = newSessionId;
    photoUriRef.current = photo.uri;
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
        (global as any).prefetchedPhotoUri === photo.uri) {
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
    
    console.log(`========= RESET COMPLETE for photo: ${photo.uri} with session: ${newSessionId} =========`);
    logWithSession(`State reset complete for photo: ${photo.uri}`);
  };
  
  // Track if this is the first render
  const isFirstRender = useRef(true);
  
  // Initialize on component mount or when route params change
  useEffect(() => {
    // Check for valid photo
    if (!photo || !photo.uri) {
      console.error("Invalid photo object in RatingScreen2:", photo);
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
      console.log(`Initial photo URI: ${photo.uri}`);
      isFirstRender.current = false;
    } else {
      console.log(`============= ROUTE PARAMS CHANGED =============`);
      console.log(`New _uniqueKey: ${route.params._uniqueKey}`);
      console.log(`New photo URI: ${photo.uri}`);
    }
    
    // Force a complete reset of state for this photo
    resetState();
    
    // Clean up on unmount
    return () => {
      console.log(`============= CLEANING UP RATING SCREEN =============`);
      logWithSession("Component unmounting, cleaning up");
    };
  }, [route.params]); // Re-run when ANY route parameter changes
  
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
    
    if (bestLocation) {
      logWithSession(`Using location for restaurant suggestions: ${bestLocation.source} (priority: ${bestLocation.priority})`);
      logWithSession(`Photo URI: ${photo.uri}, coordinates: ${bestLocation.latitude}, ${bestLocation.longitude}`);
      
      // Check once more that we're using location data that belongs to this photo
      // by comparing with the global trackers
      if ((global as any).currentPhotoUri !== currentPhotoUri) {
        logWithSession(`WARNING: Photo URI mismatch detected - current: ${currentPhotoUri}, global: ${(global as any).currentPhotoUri}`);
        // If there's a mismatch, we should consider refreshing location data
        // but we'll proceed since we've already validated in initializeLocationFromParams
      }
      
      // Always fetch new restaurant suggestions for every photo
      // This ensures we're getting fresh data based on the current photo's location
      fetchRestaurantSuggestions(bestLocation);
      // Note: fetchRestaurantSuggestions now has its own check to prevent duplicate fetches within the same session
    }
    
    // Cleanup function to cancel any pending operations if the session changes
    return () => {
      // Check if the session has changed since this effect was triggered
      if (currentSession !== photoSessionRef.current) {
        logWithSession(`Session changed from ${currentSession} to ${photoSessionRef.current}, discarding pending operations`);
      }
    };
  }, [location, deviceLocation, suggestedRestaurants.length]); // Re-run when location changes or restaurant count changes
  
  // Handle autocomplete search for restaurants using DIRECT Places API
  const handleRestaurantSearch = async (text: string) => {
    setRestaurant(text);
    
    // Flag that user is actively editing
    setIsUserEditingRestaurant(true);
    
    // Only show autocomplete when there's enough text
    if (text.length >= 2) {
      setShowAutocomplete(true);
      
      // Debounce the API call
      clearTimeout((window as any).restaurantInputTimer);
      (window as any).restaurantInputTimer = setTimeout(async () => {
        const currentSession = photoSessionRef.current;
        
        setIsSearchingRestaurants(true);
        try {
          // Use best available location for search
          const searchLocation = getBestAvailableLocation();
          
          if (searchLocation) {
            logWithSession(`Searching restaurants with query "${text}" using Places API with location: ${searchLocation.source}`);
            
            // Use direct Places API for text search
            const results = await searchRestaurantsByText(text, searchLocation);
            
            // Verify we're still in the same photo session before updating state
            if (currentSession === photoSessionRef.current) {
              logWithSession(`Got ${results.length} autocomplete results from Places API for "${text}"`);
              setAutocompleteRestaurants(results.slice(0, MAX_AUTOCOMPLETE_RESULTS));
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
  
  // Function to save rating and navigate to result screen
  const saveRating = async () => {
    try {
      // Show loading indication
      setIsProcessing(true);
      
      // Generate a unique session ID for this result flow
      const sessionId = route.params._uniqueKey || Math.random().toString(36).substring(2, 15);
      logWithSession(`Continuing session ${sessionId} to ResultScreen`);
      
      // Create a clean copy of the image
      const timestamp = new Date().getTime();
      const fileExt = 'jpg';
      const newFilename = `result_image_${timestamp}.${fileExt}`;
      
      // Determine the temp directory path based on platform
      const dirPath = Platform.OS === 'ios'
        ? `${RNFS.TemporaryDirectoryPath}/`
        : `${RNFS.CachesDirectoryPath}/`;
      
      const newFilePath = `${dirPath}${newFilename}`;
      logWithSession(`Creating clean image for Result screen at: ${newFilePath}`);
      
      // Copy the current image file to new location
      await RNFS.copyFile(photo.uri, newFilePath);
      logWithSession('File copied successfully for Result screen');
      
      // Create a fresh photo object
      const freshPhoto = {
        uri: newFilePath,
        width: photo.width,
        height: photo.height,
        sessionId: sessionId
      };
      
      // Navigate to Result screen with all collected data
      navigation.navigate('Result', {
        photo: freshPhoto,
        location: location,
        rating: rating,
        restaurant: mealType === "Restaurant" ? restaurant : "", // Only include restaurant for Restaurant type
        meal: mealName,
        mealType: mealType, // Include the meal type for saving to Firebase
        likedComment: likedComment,
        dislikedComment: dislikedComment,
        _uniqueKey: sessionId
      });
    } catch (error) {
      logWithSession(`Error preparing image for Result screen: ${error}`);
      Alert.alert('Error', 'Failed to save rating. Please try again.');
    } finally {
      setIsProcessing(false);
    }
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
            {/* Meal Type Selector */}
            <View style={styles.mealTypeContainer}>
              <TouchableOpacity
                style={[styles.mealTypeButton, mealType === "Restaurant" && styles.mealTypeButtonActive]}
                onPress={() => {
                  if (mealType !== "Restaurant") {
                    setMealType("Restaurant");
                  }
                }}
              >
                <Text style={[styles.mealTypeText, mealType === "Restaurant" && styles.mealTypeTextActive]}>Restaurant</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mealTypeButton, mealType === "Homemade" && styles.mealTypeButtonActive]}
                onPress={() => setMealType("Homemade")}
              >
                <Text style={[styles.mealTypeText, mealType === "Homemade" && styles.mealTypeTextActive]}>Homemade</Text>
              </TouchableOpacity>
            </View>
            {/* Restaurant Input - Only shown for Restaurant meal type */}
            {mealType === "Restaurant" && (
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
                      <ActivityIndicator size="small" color="#ff6b6b" style={styles.autocompleteLoading} />
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
                          <MaterialIcon name="restaurant" size={16} color="#666" style={styles.autocompleteIcon} />
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
                <MaterialIcon name="restaurant" size={16} color="white" />
              </TouchableOpacity>
            </View>
            )}
            
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
                    updateMealSuggestionsForRestaurant(restaurant);
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
                    <MaterialIcon name="fastfood" size={16} color="white" />
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
                <ActivityIndicator size="small" color="#ff6b6b" />
                <Text style={styles.loadingText}>Getting suggestions...</Text>
              </View>
            )}
          </View>
          
          {/* Image Container */}
          <View style={styles.imageContainer}>
            {!imageError && photo && photo.uri ? (
              <Image
                source={{ uri: photo.uri }}
                style={styles.image}
                resizeMode="contain"
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
              { backgroundColor: mealName.trim() ? '#ff6b6b' : '#cccccc' }
            ]}
            onPress={saveRating}
            disabled={!mealName.trim() || isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.saveButtonText}>Save Rating</Text>
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
                        updateMealSuggestionsForRestaurant(restaurant);
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
  // Meal Type Selector Styles
  mealTypeContainer: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 15,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  mealTypeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
  },
  mealTypeButtonActive: {
    backgroundColor: '#ff6b6b',
  },
  mealTypeText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
  },
  mealTypeTextActive: {
    color: 'white',
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  contentContainer: {
    padding: 15,
    alignItems: 'center',
  },
  imageContainer: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#eee',
    marginVertical: 15,
    position: 'relative',
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
  },
  suggestButton: {
    width: 36,
    height: 36,
    borderRadius: 5,
    backgroundColor: '#777',
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
    backgroundColor: '#ff6b6b',
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
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  // Autocomplete styles
  autocompleteContainer: {
    flex: 1,
    position: 'relative',
    marginRight: 8,
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
    zIndex: 1000,
    elevation: 8,
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
    backgroundColor: '#ff6b6b',
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
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
    textAlign: 'center',
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
  },
  restaurantAddress: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  menuItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  menuItemText: {
    fontSize: 16,
  },
  closeButton: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#ff6b6b',
    borderRadius: 5,
    alignItems: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  noResultsText: {
    textAlign: 'center',
    padding: 20,
    color: '#666',
  },
  topSuggestion: {
    backgroundColor: '#fff8f8',
    borderLeftWidth: 3,
    borderLeftColor: '#ff6b6b',
  },
  topBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff6b6b',
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
  reloadButton: {
    backgroundColor: '#777',
    padding: 10,
    borderRadius: 5,
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
  }
});

export default RatingScreen2;