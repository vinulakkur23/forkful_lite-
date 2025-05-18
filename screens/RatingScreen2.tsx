import React, { useState, useEffect } from 'react';
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
import { searchRestaurants, getMealSuggestionsForRestaurant, getMealSuggestions, Restaurant } from '../services/mealService';
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

const RatingScreen2: React.FC<Props> = ({ route, navigation }) => {
  const { photo, rating, likedComment, dislikedComment } = route.params;

  // Initialize location with priority information
  const initializeLocation = () => {
    if (!route.params.location) return null;

    // Add priority based on source
    const loc = {...route.params.location};

    // Set priority based on source (lower number = higher priority)
    if (loc.source === 'restaurant_selection') {
      loc.priority = 1; // Highest priority
    } else if (loc.source === 'exif') {
      loc.priority = 2; // Second priority
    } else {
      loc.priority = 3; // Lowest priority (device location)
    }

    console.log(`Initialized location with source ${loc.source}, priority ${loc.priority}`);
    return loc;
  };

  // Restaurant and meal state
  const [location, setLocation] = useState(initializeLocation());
  const [restaurant, setRestaurant] = useState("");
  const [mealName, setMealName] = useState("");
  const [suggestedRestaurants, setSuggestedRestaurants] = useState<Restaurant[]>([]);
  const [autocompleteRestaurants, setAutocompleteRestaurants] = useState<Restaurant[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [menuItems, setMenuItems] = useState<string[]>([]);
  const [showRestaurantModal, setShowRestaurantModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(true);
  const [isSearchingRestaurants, setIsSearchingRestaurants] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUserEditingRestaurant, setIsUserEditingRestaurant] = useState(false);
  const [isUserEditingMeal, setIsUserEditingMeal] = useState(false);

  // Limit number of results in the autocomplete dropdown
  const MAX_AUTOCOMPLETE_RESULTS = 3; // Show at most 3 restaurant options in the dropdown

  // Track device location for restaurant search
  const [deviceLocation, setDeviceLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [isLoadingDeviceLocation, setIsLoadingDeviceLocation] = useState(false);

  // Add meal type selector state - default to "Restaurant"
  const [mealType, setMealType] = useState<"Restaurant" | "Homemade">("Restaurant");
  
  // Get current device location
  const getCurrentLocation = async () => {
    setIsLoadingDeviceLocation(true);
    try {
      // Request location permission on Android
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Location Permission",
            message: "To find nearby restaurants, we need your current location.",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK"
          }
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          console.log("Location permission denied");
          setIsLoadingDeviceLocation(false);
          return;
        }
      }

      // Get current position using Geolocation API
      Geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          console.log("Got device location:", latitude, longitude);
          setDeviceLocation({ latitude, longitude });
          setIsLoadingDeviceLocation(false);
        },
        (error) => {
          console.error("Error getting location:", error);
          setIsLoadingDeviceLocation(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    } catch (error) {
      console.error("Error requesting location permission:", error);
      setIsLoadingDeviceLocation(false);
    }
  };

  // Add validation on component mount
  useEffect(() => {
    if (!photo || !photo.uri) {
      console.error("Invalid photo object in RatingScreen2:", photo);
      Alert.alert(
        "Error",
        "Invalid photo data received. Please try again.",
        [
          {
            text: "OK",
            onPress: () => navigation.goBack()
          }
        ]
      );
      return;
    }

    // Log location data for debugging
    console.log("Initial location data in RatingScreen2:", JSON.stringify(location));
    
    // Get current device location for restaurant searches
    // This will only be used if no EXIF location is available
    getCurrentLocation();

    // Check if we already have suggestion data from previous screen
    if (route.params.suggestionData) {
      console.log('Using suggestion data from route params');
      const suggestionData = route.params.suggestionData;
      
      // Log the entire suggestion data to see what we're working with
      console.log('DEBUGGING SUGGESTION DATA:', JSON.stringify(suggestionData, null, 2));
      
      // Check if there are actually restaurants in the suggestion data
      if (suggestionData.restaurants && suggestionData.restaurants.length > 0) {
        console.log(`Found ${suggestionData.restaurants.length} restaurants in suggestion data`);
        console.log('First restaurant is:', suggestionData.restaurants[0].name);
          
        // IMPORTANT: Save the restaurants to state immediately to ensure they're available
        // This prevents any race conditions that might cause us to miss them
        setSuggestedRestaurants(suggestionData.restaurants);
          
        // Auto-select first suggestion right away
        const firstRestaurant = suggestionData.restaurants[0];
        console.log(`Setting restaurant to first suggestion from route params: ${firstRestaurant.name}`);
        setRestaurant(firstRestaurant.name);
          
        // Check if restaurant has location (from Places API)
        if (firstRestaurant.geometry && firstRestaurant.geometry.location) {
          console.log("Auto-suggested restaurant has location data, extracting city");
            
          // Extract city from address if available
          let city = '';
          if (firstRestaurant.vicinity || firstRestaurant.formatted_address) {
            const address = firstRestaurant.vicinity || firstRestaurant.formatted_address;
            console.log("Got auto-suggested restaurant address:", address);
              
            // Try to extract city - typically the second component in a comma-separated address
            const addressParts = address.split(',').map(part => part.trim());
            console.log("Address parts for auto-suggested restaurant:", addressParts);
              
            if (addressParts.length > 1) {
              // If second part has spaces, take just the city name
              const secondPart = addressParts[1];
              if (secondPart.includes(' ')) {
                city = secondPart.split(' ')[0];
              } else {
                city = secondPart;
              }
                
              console.log("Extracted city from auto-suggested restaurant:", city);
            }
          }
            
          // Create and save location with city information
          const restaurantLocation = {
            latitude: firstRestaurant.geometry.location.lat,
            longitude: firstRestaurant.geometry.location.lng,
            source: 'restaurant_selection',
            priority: 1,
            city: city
          };
            
          console.log("Setting location from auto-suggested restaurant:", JSON.stringify(restaurantLocation));
          setLocation(restaurantLocation);
            
          // Update route params too
          if (route.params) {
            route.params.location = restaurantLocation;
          }
        }
          
        // Set menu items if available
        if (suggestionData.menu_items && suggestionData.menu_items.length > 0) {
          console.log(`Found ${suggestionData.menu_items.length} menu items in suggestion data`);
          setMenuItems(suggestionData.menu_items);
        } else {
          // Important: If we don't have menu items, get them for this restaurant
          console.log("No menu items in suggestion data, fetching menu for restaurant");
          updateMealSuggestionsForRestaurant(firstRestaurant.name);
        }
          
        // Set suggested meal if available
        if (suggestionData.suggested_meal) {
          console.log(`Setting meal to suggested meal: ${suggestionData.suggested_meal}`);
          setMealName(suggestionData.suggested_meal);
        } else if (suggestionData.menu_items && suggestionData.menu_items.length > 0) {
          // Use first menu item as meal name if no specific suggestion
          console.log(`No suggested meal, using first menu item: ${suggestionData.menu_items[0]}`);
          setMealName(suggestionData.menu_items[0]);
        }
      } else {
        console.log('No restaurants found in suggestion data');
          
        // Still set whatever data we have
        setSuggestedRestaurants([]);
        setMenuItems(suggestionData.menu_items || []);
          
        if (suggestionData.suggested_meal) {
          setMealName(suggestionData.suggested_meal);
        }
      }
      
      setIsLoadingSuggestions(false);
    } else {
      // Check if we have prefetched suggestions from global cache
      if ((global as any).prefetchedSuggestions) {
        console.log('Using prefetched suggestion data from global cache');
        const cachedData = (global as any).prefetchedSuggestions;
        
        // Log the entire cached suggestion data
        console.log('DEBUGGING CACHED SUGGESTION DATA:', JSON.stringify(cachedData, null, 2));
        
        // Check if there are actually restaurants in the cached data
        if (cachedData.restaurants && cachedData.restaurants.length > 0) {
          console.log(`Found ${cachedData.restaurants.length} restaurants in cached suggestion data`);
          console.log('First restaurant is:', cachedData.restaurants[0].name);
          
          // IMPORTANT: Save the restaurants to state immediately
          setSuggestedRestaurants(cachedData.restaurants);
          
          // Auto-select first suggestion right away
          const firstRestaurant = cachedData.restaurants[0];
          console.log(`Setting restaurant to first cached suggestion: ${firstRestaurant.name}`);
          setRestaurant(firstRestaurant.name);
          
          // Extract city information and set location if available
          if (firstRestaurant.geometry && firstRestaurant.geometry.location) {
            console.log("Auto-suggested restaurant (from cache) has location data, extracting city");
            
            // Extract city from address if available
            let city = '';
            if (firstRestaurant.vicinity || firstRestaurant.formatted_address) {
              const address = firstRestaurant.vicinity || firstRestaurant.formatted_address;
              console.log("Got cached restaurant address:", address);
              
              // Try to extract city - typically the second component in a comma-separated address
              const addressParts = address.split(',').map(part => part.trim());
              console.log("Address parts for cached restaurant:", addressParts);
              
              if (addressParts.length > 1) {
                // If second part has spaces, take just the city name
                const secondPart = addressParts[1];
                if (secondPart.includes(' ')) {
                  city = secondPart.split(' ')[0];
                } else {
                  city = secondPart;
                }
                
                console.log("Extracted city from cached restaurant:", city);
              }
            }
            
            // Create and save location with city information
            const restaurantLocation = {
              latitude: firstRestaurant.geometry.location.lat,
              longitude: firstRestaurant.geometry.location.lng,
              source: 'restaurant_selection',
              priority: 1,
              city: city
            };
            
            console.log("Setting location from cached restaurant:", JSON.stringify(restaurantLocation));
            setLocation(restaurantLocation);
            
            // Update route params too
            if (route.params) {
              route.params.location = restaurantLocation;
            }
          }
          
          // Set menu items if available
          if (cachedData.menu_items && cachedData.menu_items.length > 0) {
            console.log(`Found ${cachedData.menu_items.length} menu items in cached data`);
            setMenuItems(cachedData.menu_items);
          } else {
            // If no menu items, fetch them for this restaurant
            console.log("No menu items in cached data, fetching menu for restaurant");
            updateMealSuggestionsForRestaurant(firstRestaurant.name);
          }
          
          // Set suggested meal if available
          if (cachedData.suggested_meal) {
            console.log(`Setting meal to suggested meal from cache: ${cachedData.suggested_meal}`);
            setMealName(cachedData.suggested_meal);
          } else if (cachedData.menu_items && cachedData.menu_items.length > 0) {
            // Use first menu item as meal name if no specific suggestion
            console.log(`No suggested meal in cache, using first menu item: ${cachedData.menu_items[0]}`);
            setMealName(cachedData.menu_items[0]);
          }
        } else {
          console.log('No restaurants found in cached suggestion data');
          
          // Still use whatever data we have
          setSuggestedRestaurants([]);
          setMenuItems(cachedData.menu_items || []);
          
          if (cachedData.suggested_meal) {
            setMealName(cachedData.suggested_meal);
          }
        }
        
        setIsLoadingSuggestions(false);
      } else {
        console.log('No suggestion data available');
        setIsLoadingSuggestions(false);
      }
    }
  }, []);

  // Only fetch restaurant suggestions if we don't already have any
  // This provides a fallback while preventing override of correct suggestions
  useEffect(() => {
    console.log("Location updated in RatingScreen2:", JSON.stringify(location));
    
    // Check if we already have restaurants
    const hasRestaurants = suggestedRestaurants && suggestedRestaurants.length > 0;
    
    // If no restaurants and we have location, fetch suggestions as a fallback
    if (!hasRestaurants && location) {
      console.log("FALLBACK: No restaurant suggestions found but we have location - fetching suggestions");
      
      const fetchRestaurantSuggestions = async () => {
        try {
          setIsLoadingSuggestions(true);
          console.log("FALLBACK: Fetching restaurant suggestions using location");
          
          // Check global cache once more before fetching
          if ((global as any).prefetchedSuggestions?.restaurants?.length > 0) {
            console.log("FALLBACK: Found prefetched suggestions in global cache, using those");
            const cachedData = (global as any).prefetchedSuggestions;
            setSuggestedRestaurants(cachedData.restaurants || []);
            setMenuItems(cachedData.menu_items || []);
            
            if (cachedData.restaurants?.length > 0) {
              const firstRestaurant = cachedData.restaurants[0];
              console.log(`FALLBACK: Using first cached suggestion: ${firstRestaurant.name}`);
              setRestaurant(firstRestaurant.name);
              updateMealSuggestionsForRestaurant(firstRestaurant.name);
            }
            
            setIsLoadingSuggestions(false);
            return;
          }
          
          // Fetch using mealService directly
          console.log("FALLBACK: No cached suggestions, fetching from API");
          if (photo && photo.uri) {
            // Use photo location if available, otherwise device location
            // Make sure to preserve source and priority
            console.log("FALLBACK: Location source to use for API call:", location.source || "unknown");
            
            const result = await getMealSuggestions(photo.uri, location);
            console.log(`FALLBACK: Got ${result.restaurants?.length || 0} restaurant suggestions`);
            
            if (result.restaurants && result.restaurants.length > 0) {
              setSuggestedRestaurants(result.restaurants);
              setMenuItems(result.menu_items || []);
              
              // Auto-select the first restaurant
              const firstRestaurant = result.restaurants[0];
              console.log(`FALLBACK: Setting restaurant to first suggestion: ${firstRestaurant.name}`);
              setRestaurant(firstRestaurant.name);
              
              // Update menu suggestions for this restaurant
              updateMealSuggestionsForRestaurant(firstRestaurant.name);
              
              // Save to global cache for future use
              (global as any).prefetchedSuggestions = result;
            } else {
              console.log("FALLBACK: No restaurant suggestions found from API call");
            }
          } else {
            console.log("FALLBACK: Can't fetch suggestions - no photo URI available");
          }
        } catch (error) {
          console.error("FALLBACK: Error fetching restaurant suggestions:", error);
        } finally {
          setIsLoadingSuggestions(false);
        }
      };
      
      fetchRestaurantSuggestions();
    } else if (hasRestaurants) {
      console.log("Not fetching suggestions - already have", suggestedRestaurants.length, "restaurants");
      
      // Auto-select the first restaurant if it's not already selected
      if (suggestedRestaurants.length > 0 && !restaurant) {
        const firstRestaurant = suggestedRestaurants[0];
        console.log(`Auto-selecting first available restaurant: ${firstRestaurant.name}`);
        setRestaurant(firstRestaurant.name);
        
        // Also get menu suggestions for this restaurant
        updateMealSuggestionsForRestaurant(firstRestaurant.name);
      }
    } else {
      console.log("Not fetching suggestions - no location data available");
    }
  }, [location, suggestedRestaurants.length]);
  // Add effect to log when suggestedRestaurants changes and automatically select first restaurant
  useEffect(() => {
    console.log(`SuggestedRestaurants updated: found ${suggestedRestaurants.length} restaurants`);
    
    // Only auto-select if the user is not currently editing the restaurant field
    if (suggestedRestaurants.length > 0 && !isUserEditingRestaurant) {
      const firstRestaurant = suggestedRestaurants[0];
      console.log("First suggested restaurant:", firstRestaurant.name);
      
      // Auto-select the first restaurant only if the restaurant field is empty
      if (!restaurant && firstRestaurant.name) {
        console.log(`Auto-selecting first restaurant: ${firstRestaurant.name}`);
        setRestaurant(firstRestaurant.name);
        
        // Get menu suggestions for this restaurant
        updateMealSuggestionsForRestaurant(firstRestaurant.name);
      } else if (restaurant !== firstRestaurant.name && restaurant.trim() === '') {
        // Only override the current selection if the field is empty
        // This prevents overriding user input
        console.log(`Setting empty restaurant field to first suggestion: ${firstRestaurant.name}`);
        setRestaurant(firstRestaurant.name);
        
        // Get menu suggestions for this restaurant
        updateMealSuggestionsForRestaurant(firstRestaurant.name);
      } else {
        console.log(`Keeping current restaurant selection: "${restaurant}" (user input has priority)`);
      }
    }
  }, [suggestedRestaurants, restaurant, location, isUserEditingRestaurant]);

  // Function to update meal suggestions when restaurant changes

  const updateMealSuggestionsForRestaurant = async (restaurantName: string): Promise<void> => {
    if (!restaurantName) {
      console.log("No restaurant name provided for menu suggestions");
      return;
    }

    try {
      setIsLoadingSuggestions(true);

      console.log(`MENU LOOKUP: Fetching meal suggestions for restaurant: ${restaurantName}`);

      // Determine the best location to use based on priority and availability
      let searchLocation = null;
      
      // First priority: restaurant location (if available from a previous selection)
      if (location && location.source === 'restaurant_selection') {
        searchLocation = location;
        console.log('MENU LOOKUP: Using restaurant-specific location with highest priority');
      } 
      // Second priority: EXIF data from the photo
      else if (location && location.source === 'exif') {
        searchLocation = location;
        console.log('MENU LOOKUP: Using EXIF location data from photo with medium priority');
      } 
      // Third priority: Device location
      else if (deviceLocation) {
        searchLocation = deviceLocation;
        console.log('MENU LOOKUP: Using current device location with lowest priority');
      }
      // Fallback: Any location we have
      else if (location) {
        searchLocation = location;
        console.log('MENU LOOKUP: Using fallback location data');
      }

      if (searchLocation) {
        console.log('MENU LOOKUP: Using location:', {
          latitude: searchLocation.latitude,
          longitude: searchLocation.longitude,
          source: searchLocation.source || 'unknown',
          city: searchLocation.city || 'unknown'
        });
      } else {
        console.log('MENU LOOKUP: No location available for menu suggestion');
      }

      // Make the API call
      const result = await getMealSuggestionsForRestaurant(restaurantName, photo?.uri, searchLocation);
      console.log(`MENU LOOKUP: Retrieved ${result.menu_items?.length || 0} menu items for ${restaurantName}`);

      // Update only menu items and suggested meal, not restaurants
      setMenuItems(result.menu_items || []);

      // Only update the meal name if the user isn't currently editing it
      // This prevents overriding user input when they're typing
      if (!isUserEditingMeal) {
        // Update suggested meal if available
        if (result.suggested_meal) {
          console.log(`MENU LOOKUP: Using suggested meal: ${result.suggested_meal}`);
          setMealName(result.suggested_meal);
        } else if (result.menu_items && result.menu_items.length > 0 && !mealName.trim()) {
          // If no specific meal is suggested but we have menu items and meal field is empty,
          // select the first one
          console.log(`MENU LOOKUP: No suggested meal, using first menu item: ${result.menu_items[0]}`);
          setMealName(result.menu_items[0]);
        } else {
          console.log(`MENU LOOKUP: Keeping current meal name: "${mealName}" (user input has priority)`);
        }
      } else {
        console.log(`MENU LOOKUP: User is editing meal name, not auto-selecting a meal`);
      }

      // Log success
      console.log(`Got ${result.menu_items?.length || 0} menu items for ${restaurantName}`);
    } catch (error) {
      console.error(`Error getting meal suggestions for ${restaurantName}:`, error);

      // Show user-friendly error
      Alert.alert(
        "Menu Lookup Failed",
        `We couldn't find the menu for "${restaurantName}". Please try a different restaurant or enter the meal name manually.`,
        [{ text: "OK" }]
      );
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  // Handle return key press in text inputs
  const handleSubmitEditing = (): void => {
    // Dismiss keyboard/focus
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      const currentlyFocusedInput = TextInput.State?.currentlyFocusedInput?.();
      if (currentlyFocusedInput) {
        currentlyFocusedInput.blur();
      }
    }
  };

  const saveRating = async (): Promise<void> => {
    try {
      // Validate required inputs
      if (mealType === "Restaurant" && !restaurant.trim()) {
        Alert.alert("Missing Information", "Please enter a restaurant name.");
        return;
      }

      if (!mealName.trim()) {
        Alert.alert("Missing Information", "Please enter a meal name.");
        return;
      }

      // Show loading indication
      setIsProcessing(true);

      // Generate a unique session ID for this result flow
      const sessionId = route.params._uniqueKey || Math.random().toString(36).substring(2, 15);
      console.log(`Continuing session ${sessionId} to ResultScreen`);

      // Create a clean copy of the image without query parameters for passing to result screen
      const timestamp = new Date().getTime();
      const fileExt = 'jpg'; // Default to jpg

      // Create a path for the new clean image file
      const newFilename = `result_image_${timestamp}.${fileExt}`;

      // Determine the temp directory path based on platform
      const dirPath = Platform.OS === 'ios'
        ? `${RNFS.TemporaryDirectoryPath}/`
        : `${RNFS.CachesDirectoryPath}/`;

      const newFilePath = `${dirPath}${newFilename}`;
      console.log('Creating clean image for Result screen at:', newFilePath);

      // Copy the current image file to new location
      await RNFS.copyFile(photo.uri, newFilePath);
      console.log('File copied successfully for Result screen');

      // Create a fresh photo object to avoid any reference issues
      const freshPhoto = {
        uri: newFilePath,
        width: photo.width,
        height: photo.height,
        sessionId: sessionId // Add session ID for tracking
      };

      console.log(`Navigating to Result with fresh image: ${freshPhoto.uri}`);

      // Navigate to Result screen with all collected data
      navigation.navigate('Result', {
        photo: freshPhoto,
        location: location,
        rating: rating,
        restaurant: mealType === "Restaurant" ? restaurant : "", // Only include restaurant for Restaurant type
        meal: mealName,
        mealType: mealType, // Include the meal type in the data for Firebase
        likedComment: likedComment, // Pass along the liked comments from previous screen
        dislikedComment: dislikedComment, // Pass along the disliked comments from previous screen
        _uniqueKey: sessionId // This helps React Navigation identify this as a new navigation
      });
    } catch (error) {
      console.error('Error preparing image for Result screen:', error);
      Alert.alert('Error', 'Failed to save rating. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Handle image load error
  const handleImageError = () => {
    console.log('Image failed to load in RatingScreen2');
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
          {/* Meal Type Selector at the top */}
          <View style={styles.infoSection}>
            <View style={styles.mealTypeContainer}>
              <TouchableOpacity
                style={[styles.mealTypeButton, mealType === "Restaurant" && styles.mealTypeButtonActive]}
                onPress={() => setMealType("Restaurant")}
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
                    onChangeText={(text) => {
                      // Mark that the user is actively editing
                      setIsUserEditingRestaurant(true);
                      setRestaurant(text);

                      // Show autocomplete dropdown when typing
                      if (text.length >= 2) {
                        setShowAutocomplete(true);

                        // Delay the API call slightly to avoid too many requests while typing
                        clearTimeout((window as any).restaurantInputTimer);
                        (window as any).restaurantInputTimer = setTimeout(async () => {
                          setIsSearchingRestaurants(true);
                          try {
                            // Always use current device location for restaurant search
                            const searchLocation = deviceLocation || location;
                            console.log("Using location for restaurant search:",
                              searchLocation ? `${searchLocation.latitude}, ${searchLocation.longitude}` : "No location available");

                            // Search for restaurants matching the text
                            const results = await searchRestaurants(text, searchLocation);
                            // Limit to MAX_AUTOCOMPLETE_RESULTS
                            setAutocompleteRestaurants(results.slice(0, MAX_AUTOCOMPLETE_RESULTS));
                          } catch (error) {
                            console.error('Restaurant search error:', error);
                          } finally {
                            setIsSearchingRestaurants(false);
                          }
                        }, 500);
                      } else {
                        setShowAutocomplete(false);
                        setAutocompleteRestaurants([]);
                      }
                    }}
                    onFocus={() => {
                      // Mark that the user is actively editing
                      console.log("User focused on restaurant input - preventing auto-suggestions");
                      setIsUserEditingRestaurant(true);
                      
                      // Show autocomplete when input is focused if text length is sufficient
                      if (restaurant.length >= 2) {
                        setShowAutocomplete(true);
                      }
                    }}
                    onBlur={() => {
                      // After a delay, mark that the user is no longer editing
                      setTimeout(() => {
                        console.log("User blurred restaurant input");
                        setIsUserEditingRestaurant(false);
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
                              console.log(`Autocomplete restaurant selected: ${item.name}`);
                              // User has explicitly selected a restaurant from autocomplete
                              // Set the restaurant name and mark that we're no longer in editing mode
                              setRestaurant(item.name);
                              setIsUserEditingRestaurant(false);
                              setShowAutocomplete(false);

                              // If restaurant has location (from Places API), update the location data
                              // We always prefer restaurant location if available for better accuracy
                              if (item.geometry && item.geometry.location) {
                                // Extract city from address if available
                                let city = '';
                                if (item.vicinity || item.formatted_address) {
                                  const address = item.vicinity || item.formatted_address;
                                  console.log("Got restaurant address from autocomplete:", address);
                                  
                                  // Try to extract city - typically the second component in a comma-separated address
                                  const addressParts = address.split(',').map(part => part.trim());
                                  console.log("Address parts for autocomplete:", addressParts);
                                  
                                  if (addressParts.length > 1) {
                                    // The second part is usually the city + state (e.g., "Portland, OR")
                                    // If it has spaces, the city is likely before the first space
                                    const secondPart = addressParts[1];
                                    
                                    // Check if second part has a space (like "Portland OR")
                                    if (secondPart.includes(' ')) {
                                      city = secondPart.split(' ')[0]; // Take just the city name
                                    } else {
                                      city = secondPart; // Use the whole part if no spaces
                                    }
                                    
                                    // If we couldn't extract from second part, try third part if it exists
                                    if (!city && addressParts.length > 2) {
                                      city = addressParts[2].split(' ')[0];
                                    }
                                    
                                    console.log("Extracted city name from autocomplete:", city);
                                  }
                                }
                                
                                // For debugging
                                console.log("Final city value for location from autocomplete:", city);
                                
                                const restaurantLocation = {
                                  latitude: item.geometry.location.lat,
                                  longitude: item.geometry.location.lng,
                                  source: 'restaurant_selection', // Mark the source of this location data
                                  priority: 1, // Highest priority (1 = restaurant, 2 = exif, 3 = user location)
                                  city: city // Save extracted city
                                };

                                console.log(`Updating location from autocomplete restaurant selection: ${item.name}`);
                                console.log(`Location details: ${JSON.stringify(restaurantLocation)}`);

                                // Update both local state and route params
                                setLocation(restaurantLocation);

                                // Also update location in route params to make it available for the next screen
                                if (route.params) {
                                  route.params.location = restaurantLocation;
                                }
                              } else {
                                console.log(`Selected restaurant from autocomplete has no location data: ${item.name}`);
                              }

                              // Update meal suggestions for this restaurant
                              console.log(`Fetching meal suggestions for autocomplete restaurant: ${item.name}`);
                              updateMealSuggestionsForRestaurant(item.name);
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

                <TouchableOpacity
                  style={styles.suggestButton}
                  onPress={() => {
                    console.log("Restaurant button clicked, showing modal");
                    setShowRestaurantModal(true);
                  }}
                >
                  <MaterialIcon name="restaurant" size={16} color="white" />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Meal:</Text>
              <TextInput
                style={styles.infoInput}
                value={mealName}
                onChangeText={(text) => {
                  // Mark that user is actively editing the meal name
                  setIsUserEditingMeal(true);
                  setMealName(text);
                }}
                onFocus={() => {
                  console.log("User focused on meal input - preventing auto-suggestions");
                  setIsUserEditingMeal(true);
                }}
                onBlur={() => {
                  console.log("User blurred meal input");
                  // After a delay, mark that user is no longer editing
                  setTimeout(() => {
                    setIsUserEditingMeal(false);
                  }, 200);
                }}
                placeholder="Enter meal name"
              />
              {menuItems.length > 0 && (
                <TouchableOpacity
                  style={styles.suggestButton}
                  onPress={() => setShowMenuModal(true)}
                >
                  <MaterialIcon name="restaurant-menu" size={16} color="white" />
                </TouchableOpacity>
              )}
            </View>

            {/* Show loading indicator for API calls */}
            {isLoadingSuggestions && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#ff6b6b" />
                <Text style={styles.loadingText}>Getting suggestions...</Text>
              </View>
            )}
          </View>

          {/* Image Container - Show the meal photo */}
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

          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: mealName.trim() ? '#ff6b6b' : '#cccccc' }
            ]}
            onPress={saveRating}
            disabled={!mealName.trim() || isProcessing || (mealType === "Restaurant" && !restaurant.trim())}
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
        onRequestClose={() => {
          console.log("Restaurant modal closed via request close");
          setShowRestaurantModal(false);
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nearby Restaurants</Text>
            <View>
              <Text style={{marginBottom: 10}}>
                {`Found ${suggestedRestaurants.length} restaurants to suggest.`}
              </Text>
              
              {suggestedRestaurants.length > 0 ? (
                <FlatList
                  data={suggestedRestaurants}
                  keyExtractor={(item) => item.id || item.name || Math.random().toString()}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.restaurantItem}
                      onPress={() => {
                        // Log the selection
                        console.log(`Restaurant selected from modal: ${item.name}`);
                        
                        // Always select the restaurant that the user clicked on
                        // This is an explicit user selection, so we should not override it
                        setRestaurant(item.name);
                        
                        // User has explicitly selected a restaurant, so turn off editing mode
                        setIsUserEditingRestaurant(false);
  
                        // Update location if the restaurant has location data
                        if (item.geometry && item.geometry.location) {
                          // Extract city information for this restaurant selection
                          let city = '';
                          if (item.vicinity || item.formatted_address) {
                            const address = item.vicinity || item.formatted_address;
                            console.log("Got selected restaurant address:", address);
                            
                            // Try to extract city from address
                            const addressParts = address.split(',').map(part => part.trim());
                            console.log("Address parts for selected restaurant:", addressParts);
                            
                            if (addressParts.length > 1) {
                              // If second part has spaces, take just the city name
                              const secondPart = addressParts[1];
                              if (secondPart.includes(' ')) {
                                city = secondPart.split(' ')[0];
                              } else {
                                city = secondPart;
                              }
                              
                              console.log("Extracted city from selected restaurant:", city);
                            }
                          }
                          
                          const restaurantLocation = {
                            latitude: item.geometry.location.lat,
                            longitude: item.geometry.location.lng,
                            source: 'restaurant_selection',
                            priority: 1, // Restaurant location has highest priority
                            city: city
                          };

                          console.log(`Updating location from restaurant modal selection: ${item.name}`);

                          // Update location in state and route params
                          setLocation(restaurantLocation);
                          if (route.params) {
                            route.params.location = restaurantLocation;
                          }
                        }

                        // Always fetch menu suggestions for this restaurant
                        // This ensures we get the best menu recommendations for the selected restaurant
                        console.log(`Fetching meal suggestions for selected restaurant: ${item.name}`);
                        updateMealSuggestionsForRestaurant(item.name);
                        
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
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                console.log("Restaurant modal close button clicked");
                setShowRestaurantModal(false);
              }}
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
                      console.log(`Menu item selected: ${item}`);
                      setMealName(item);
                      // User has explicitly selected a menu item, mark as not editing
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
  // Restaurant autocomplete styles
  autocompleteContainer: {
    flex: 1,
    position: 'relative',
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
    marginTop: 15,
    marginBottom: 25,
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
  },
  suggestButton: {
    marginLeft: 10,
    padding: 10,
    backgroundColor: '#777',
    borderRadius: 5,
  },
  suggestButtonDisabled: {
    backgroundColor: '#ccc',
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
    marginBottom: 15,
    textAlign: 'center',
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
  }
});

export default RatingScreen2;