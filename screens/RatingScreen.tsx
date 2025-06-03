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
  Platform,
  PermissionsAndroid
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import { CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, TabParamList } from '../App';
import RNFS from 'react-native-fs';
import { getMealSuggestions, getMealSuggestionsForRestaurant, searchRestaurants, Restaurant } from '../services/mealService';
import EmojiDisplay from '../components/EmojiDisplay';
import Geolocation from '@react-native-community/geolocation';

// Extend the TabParamList to include suggestionData in the Rating screen params
declare module '../App' {
  interface TabParamList {
    Rating: {
      photo: {
        uri: string;
        width?: number;
        height?: number;
      };
      location?: {
        latitude: number;
        longitude: number;
        source: string;
        priority?: number;
      } | null;
      suggestionData?: any;
      _navigationKey: string;
    };
  }
}

// Update the navigation prop type to use composite navigation
type RatingScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Rating'>,
  StackNavigationProp<RootStackParamList>
>;

type RatingScreenRouteProp = RouteProp<TabParamList, 'Rating'>;

type Props = {
  navigation: RatingScreenNavigationProp;
  route: RatingScreenRouteProp;
};

// Restaurant type definition
interface Restaurant {
  id: string;
  name: string;
  vicinity: string;
  rating?: number;
  user_ratings_total?: number;
}

const RatingScreen: React.FC<Props> = ({ route, navigation }) => {
  const { photo } = route.params;

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

  // Use state to manage location so we can update it when restaurant is selected
  const [location, setLocation] = useState(initializeLocation());
  const [rating, setRating] = useState<number>(0);
  // Reset key to force the suggestion process to run when a new photo is uploaded
  const [suggestionResetKey, setSuggestionResetKey] = useState(Date.now());

  // Restaurant and meal state
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

  // Limit number of results in the autocomplete dropdown
  const MAX_AUTOCOMPLETE_RESULTS = 3; // Show at most 3 restaurant options in the dropdown

  // Track device location for restaurant search
  const [deviceLocation, setDeviceLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [isLoadingDeviceLocation, setIsLoadingDeviceLocation] = useState(false);

  // Comment sections with multiple text fields per section
  const [likedComment1, setLikedComment1] = useState<string>('');
  const [likedComment2, setLikedComment2] = useState<string>('');
  const [dislikedComment1, setDislikedComment1] = useState<string>('');
  const [dislikedComment2, setDislikedComment2] = useState<string>('');

  // Add meal type selector state - default to "Restaurant"
  const [mealType, setMealType] = useState<"Restaurant" | "Homemade">("Restaurant");
  
  // API configuration - hardcoded for testing
  const HARDCODED_URL = 'https://dishitout-imageinhancer.onrender.com';
  
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
      console.error("Invalid photo object in RatingScreen:", photo);
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
    console.log("Initial location data in RatingScreen:", JSON.stringify(location));
    console.log("Suggestion reset key:", suggestionResetKey);

    // Get current device location for restaurant searches
    // This will only be used if no EXIF location is available
    getCurrentLocation();

    // Check if we already have fields populated
    const hasDataAlready = restaurant && mealName;
    
    // Log prefetched data status
    console.log('Global prefetched suggestions:', (global as any).prefetchedSuggestions ? 'Present' : 'Not present');
    console.log('Route params suggestion data:', route.params.suggestionData ? 'Present' : 'Not present');
    console.log('Current restaurant/meal data:', hasDataAlready ? 'Populated' : 'Empty');
    
    // Only get new suggestions if we don't already have data
    // This prevents duplicate API calls
    if (!hasDataAlready) {
      // Get suggestions when the screen loads if photo is valid
      getSuggestions();
    } else {
      console.log('Restaurant and meal already populated, skipping duplicate suggestion fetch');
    }

    // This effect should run whenever photo changes
    // This ensures we get new suggestions when a new photo is uploaded
  }, [photo.uri, suggestionResetKey]);

  // Add effect to log when location changes
  useEffect(() => {
    console.log("Location updated in RatingScreen:", JSON.stringify(location));
  }, [location]);
  
  // Add effect to detect navigation focus events and new photos
  // This will help us reset the form when the user returns to this screen with new images
  useEffect(() => {
    const resetOnFocus = () => {
      console.log("RatingScreen gained focus, checking for new photo data");
      console.log("Current restaurant value:", restaurant);
      console.log("Current meal value:", mealName);
      console.log("Current photo URI:", photo?.uri);
      
      // Check if we have prefetched suggestions
      const hasPrefetchedData = Boolean((global as any).prefetchedSuggestions || route.params.suggestionData);
      
      // If we have a valid photo and either no restaurant/meal data set 
      // or we have prefetched data, then get suggestions
      if (photo?.uri && ((!restaurant && !mealName) || hasPrefetchedData)) {
        console.log("Need to load suggestion data for photo:", photo.uri);
        
        // Force suggestions to run by updating the key
        setSuggestionResetKey(Date.now());
      } else {
        console.log("Keeping existing field values:", {restaurant, meal: mealName});
      }
    };
    
    // Listen for when the screen comes into focus
    const unsubscribeFocus = navigation.addListener('focus', resetOnFocus);
    
    // Cleanup the listener when component unmounts
    return () => {
      unsubscribeFocus();
    };
  }, [navigation, photo?.uri, restaurant, mealName]); // Added more dependencies to better detect changes
  
  const handleRating = (selectedRating: number): void => {
    setRating(selectedRating);
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

  // Helper function to maintain bullet points in comments and capitalize sentences
  // Function removed to allow free typing

  // Function to update meal suggestions when restaurant changes
  const updateMealSuggestionsForRestaurant = async (restaurantName: string): Promise<void> => {
    if (!restaurantName) return;

    try {
      setIsLoadingSuggestions(true);

      // Show visual indicator in UI
      const loadingIndicator = (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#ff6b6b" />
          <Text style={styles.loadingText}>Finding menu for {restaurantName}...</Text>
        </View>
      );

      console.log(`Fetching meal suggestions for restaurant: ${restaurantName}`);

      // Determine the best location to use based on priority and availability
      let searchLocation = null;
      
      // First priority: restaurant location (if available from a previous selection)
      if (location && location.source === 'restaurant_selection') {
        searchLocation = location;
        console.log('Using restaurant-specific location with highest priority for menu lookup');
      } 
      // Second priority: EXIF data from the photo
      else if (location && location.source === 'exif') {
        searchLocation = location;
        console.log('Using EXIF location data from photo with medium priority for menu lookup');
      } 
      // Third priority: Device location
      else if (deviceLocation) {
        searchLocation = deviceLocation;
        console.log('Using current device location with lowest priority for menu lookup');
      }
      // Fallback: Any location we have
      else if (location) {
        searchLocation = location;
        console.log('Using fallback location data for menu lookup');
      }

      console.log('Location for menu suggestion:',
        searchLocation ? `${searchLocation.latitude}, ${searchLocation.longitude} (source: ${searchLocation.source || 'unknown'})` : 'No location available');

      // Make the API call
      const result = await getMealSuggestionsForRestaurant(restaurantName, photo?.uri, searchLocation);

      // Update only menu items and suggested meal, not restaurants
      setMenuItems(result.menu_items || []);

      // Update suggested meal if available
      if (result.suggested_meal) {
        setMealName(result.suggested_meal);
      } else if (result.menu_items && result.menu_items.length > 0) {
        // If no specific meal is suggested but we have menu items, select the first one
        setMealName(result.menu_items[0]);
      }

      // Log success (only in console, not to user)
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
  
  // Function to get restaurant and meal suggestions
  const getSuggestions = async () => {
    if (!photo || !photo.uri) {
      console.error("Invalid photo in getSuggestions");
      setIsLoadingSuggestions(false);
      return;
    }

    setIsLoadingSuggestions(true);

    try {
      // First check if we have fields already populated from a previous run
      // This helps ensure we don't overwrite existing data
      const fieldsAlreadyPopulated = restaurant && mealName;
      
      if (fieldsAlreadyPopulated) {
        console.log('Fields already populated, preserving existing data');
        setIsLoadingSuggestions(false);
        return;
      }
      
      // Check if we have prefetched suggestion data from the previous screen
      if (route.params.suggestionData) {
        console.log('Using prefetched suggestion data from route params');

        const prefetchedData = route.params.suggestionData;

        // Log the data we're using
        console.log('Route params data:', {
          hasRestaurants: prefetchedData.restaurants?.length > 0,
          restaurantCount: prefetchedData.restaurants?.length || 0,
          hasSuggestedMeal: Boolean(prefetchedData.suggested_meal),
          hasMenuItems: prefetchedData.menu_items?.length > 0
        });

        // Update restaurant and meal suggestions from prefetched data
        setSuggestedRestaurants(prefetchedData.restaurants || []);
        setMenuItems(prefetchedData.menu_items || []);

        // Auto-select first suggestion if available
        if (prefetchedData.restaurants?.length > 0) {
          setRestaurant(prefetchedData.restaurants[0].name);
        }
        if (prefetchedData.suggested_meal) {
          setMealName(prefetchedData.suggested_meal);
        }

        setIsLoadingSuggestions(false);
        return;
      }

      // Then check if we have suggestions from global cache (early fetch from camera)
      if ((global as any).prefetchedSuggestions) {
        console.log('Using prefetched suggestion data from global cache');

        const cachedData = (global as any).prefetchedSuggestions;

        // Log the data we're using
        console.log('Global cache data:', {
          hasRestaurants: cachedData.restaurants?.length > 0,
          restaurantCount: cachedData.restaurants?.length || 0,
          hasSuggestedMeal: Boolean(cachedData.suggested_meal),
          hasMenuItems: cachedData.menu_items?.length > 0
        });

        // Update restaurant and meal suggestions from prefetched data
        setSuggestedRestaurants(cachedData.restaurants || []);
        setMenuItems(cachedData.menu_items || []);

        // Auto-select first suggestion if available
        if (cachedData.restaurants?.length > 0) {
          setRestaurant(cachedData.restaurants[0].name);
        }
        if (cachedData.suggested_meal) {
          setMealName(cachedData.suggested_meal);
        }

        // DON'T clear the global cache to avoid losing data when navigating back
        // (global as any).prefetchedSuggestions = null;

        setIsLoadingSuggestions(false);
        return;
      }

      console.log('No prefetched data available, fetching suggestions now (last resort)');

      // Determine the best location to use based on priority and availability
      let searchLocation = null;
      
      // First priority: restaurant location (if available from a previous selection)
      if (location && location.source === 'restaurant_selection') {
        searchLocation = location;
        console.log('Using restaurant-specific location with highest priority');
      } 
      // Second priority: EXIF data from the photo
      else if (location && location.source === 'exif') {
        searchLocation = location;
        console.log('Using EXIF location data from photo with medium priority');
      } 
      // Third priority: Device location
      else if (deviceLocation) {
        searchLocation = deviceLocation;
        console.log('Using current device location with lowest priority');
      }
      // Fallback: Any location we have
      else if (location) {
        searchLocation = location;
        console.log('Using fallback location data');
      }

      console.log('Location for restaurant suggestions:',
        searchLocation ? `${searchLocation.latitude}, ${searchLocation.longitude} (source: ${searchLocation.source || 'unknown'})` : 'No location available');

      // Fetch new suggestions using our service
      const result = await getMealSuggestions(photo.uri, searchLocation);
      console.log('Received fresh suggestion response from API');

      // Log the API response data
      console.log('API response data:', {
        hasRestaurants: result.restaurants?.length > 0,
        restaurantCount: result.restaurants?.length || 0,
        hasSuggestedMeal: Boolean(result.suggested_meal),
        hasMenuItems: result.menu_items?.length > 0
      });

      // Update restaurant and meal suggestions
      setSuggestedRestaurants(result.restaurants || []);
      setMenuItems(result.menu_items || []);

      // Auto-select first suggestion if available
      if (result.restaurants?.length > 0) {
        setRestaurant(result.restaurants[0].name);
      }
      if (result.suggested_meal) {
        setMealName(result.suggested_meal);
      }

      // Store the suggestion data in global scope for future use
      (global as any).prefetchedSuggestions = result;

    } catch (error) {
      console.error('Error getting suggestions:', error);
      // Don't show an alert, just silently fail and let user enter data manually
    } finally {
      setIsLoadingSuggestions(false);
    }
  };
  
  const saveRating = async (): Promise<void> => {
    try {
      // Show loading indication
      setIsProcessing(true);

      // Generate a unique session ID for this result flow
      const sessionId = route.params._uniqueKey || Math.random().toString(36).substring(2, 15);
      console.log(`Continuing session ${sessionId} to ResultScreen`);

      // Create a clean copy of the image without query parameters for passing to next screen
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

      // Navigate to Result screen with the fresh photo and session ID
      // Combine and format comments from the separate fields
      const formatComments = (comment1: string, comment2: string): string => {
        let result = '';

        // Add first comment if it's not empty
        if (comment1.trim()) {
          result += '• ' + comment1.trim();
        }

        // Add second comment if it's not empty
        if (comment2.trim()) {
          // Add a line break if we already have content
          if (result) result += '\n';
          result += '• ' + comment2.trim();
        }

        return result;
      };

      // Format and combine the comments from each section
      const formattedLikedComment = formatComments(likedComment1, likedComment2);
      const formattedDislikedComment = formatComments(dislikedComment1, dislikedComment2);

      navigation.navigate('Result', {
        photo: freshPhoto,
        location: location,
        rating: rating,
        restaurant: mealType === "Restaurant" ? restaurant : "", // Only include restaurant for Restaurant type
        meal: mealName,
        mealType: mealType, // Include the meal type in the data for Firebase
        likedComment: formattedLikedComment, // Include what the user liked
        dislikedComment: formattedDislikedComment, // Include what the user didn't like
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
    console.log('Image failed to load in RatingScreen');
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
          {/* Moved meal type selector to the top */}
          <View style={styles.infoSection}>
            <View style={styles.mealTypeContainer}>
              <TouchableOpacity
                style={[styles.mealTypeButton, mealType === "Restaurant" && styles.mealTypeButtonActive]}
                onPress={() => {
                  if (mealType !== "Restaurant") {
                    setMealType("Restaurant");
                    // Re-fetch restaurant suggestions if switching back to Restaurant type
                    getSuggestions();
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
                    onChangeText={(text) => {
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
                            // Limit to MAX_AUTOCOMPLETE_RESULTS (top 3)
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
                      // Show autocomplete when input is focused if text length is sufficient
                      if (restaurant.length >= 2) {
                        setShowAutocomplete(true);
                      }
                    }}
                    onBlur={() => {
                      // Delay hiding autocomplete to allow for selection
                      setTimeout(() => setShowAutocomplete(false), 200);
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
                              setRestaurant(item.name);
                              setShowAutocomplete(false);

                              // If restaurant has location (from Places API), update the location data
                              // We always prefer restaurant location if available for better accuracy
                              if (item.geometry && item.geometry.location) {
                                const restaurantLocation = {
                                  latitude: item.geometry.location.lat,
                                  longitude: item.geometry.location.lng,
                                  source: 'restaurant_selection', // Mark the source of this location data
                                  priority: 1 // Highest priority (1 = restaurant, 2 = exif, 3 = user location)
                                };

                                console.log(`Updating location from restaurant selection: ${JSON.stringify(restaurantLocation)}`);

                                // Update both local state and route params
                                setLocation(restaurantLocation);

                                // Also update location in route params to make it available for the next screen
                                if (route.params) {
                                  route.params.location = restaurantLocation;
                                }
                              }

                              // Update meal suggestions for this restaurant
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
                  style={[
                    styles.suggestButton,
                    suggestedRestaurants.length === 0 ? styles.suggestButtonDisabled : {}
                  ]}
                  onPress={() => setShowRestaurantModal(true)}
                  disabled={suggestedRestaurants.length === 0}
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
                onChangeText={setMealName}
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

            {isLoadingSuggestions && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#ff6b6b" />
                <Text style={styles.loadingText}>Getting suggestions...</Text>
              </View>
            )}
          </View>

          {/* Rating Section - Moved above comment section */}
          <View style={styles.ratingSection}>
            <View style={styles.ratingContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => handleRating(star)}
                  style={styles.starTouchable}
                >
                  <Image
                    source={star <= rating
                      ? require('../assets/stars/star-filled.png')
                      : require('../assets/stars/star-empty.png')}
                    style={styles.star}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Comments Section */}
          <View style={styles.commentsContainer}>
            {/* Liked Comments Section */}
            <View style={styles.commentSection}>
              <Text style={styles.commentTitle}>What did you like about this dish?</Text>
              <Text style={styles.commentSubtitle}>(This will help us give you better meal recommendations)</Text>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <TextInput
                  style={styles.bulletInput}
                  placeholder="First thing you liked..."
                  placeholderTextColor="#999"
                  multiline={true}
                  blurOnSubmit={true}
                  returnKeyType="done"
                  autoCapitalize="sentences"
                  onSubmitEditing={handleSubmitEditing}
                  onChangeText={setLikedComment1}
                  value={likedComment1}
                  maxLength={150}
                />
              </View>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <TextInput
                  style={styles.bulletInput}
                  placeholder="Second thing you liked..."
                  placeholderTextColor="#999"
                  multiline={true}
                  blurOnSubmit={true}
                  returnKeyType="done"
                  autoCapitalize="sentences"
                  onSubmitEditing={handleSubmitEditing}
                  onChangeText={setLikedComment2}
                  value={likedComment2}
                  maxLength={150}
                />
              </View>
            </View>

            {/* Disliked Comments Section */}
            <View style={styles.commentSection}>
              <Text style={styles.commentTitle}>What did you not like?</Text>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <TextInput
                  style={styles.bulletInput}
                  placeholder="First thing you didn't like..."
                  placeholderTextColor="#999"
                  multiline={true}
                  blurOnSubmit={true}
                  returnKeyType="done"
                  autoCapitalize="sentences"
                  onSubmitEditing={handleSubmitEditing}
                  onChangeText={setDislikedComment1}
                  value={dislikedComment1}
                  maxLength={150}
                />
              </View>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <TextInput
                  style={styles.bulletInput}
                  placeholder="Second thing you didn't like..."
                  placeholderTextColor="#999"
                  multiline={true}
                  blurOnSubmit={true}
                  returnKeyType="done"
                  autoCapitalize="sentences"
                  onSubmitEditing={handleSubmitEditing}
                  onChangeText={setDislikedComment2}
                  value={dislikedComment2}
                  maxLength={150}
                />
              </View>
            </View>
          </View>

          {/* Image Container - Now at the bottom */}
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
                <Text style={styles.processingText}>Preparing image...</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: rating > 0 ? '#ff6b6b' : '#cccccc' }
            ]}
            onPress={saveRating}
            disabled={rating === 0 || isProcessing}
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
                keyExtractor={(item) => item.id || item.name}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.restaurantItem}
                    onPress={() => {
                      // If this is a different restaurant than currently selected
                      if (restaurant !== item.name) {
                        setRestaurant(item.name);

                        // Update location if the restaurant has location data
                        if (item.geometry && item.geometry.location) {
                          const restaurantLocation = {
                            latitude: item.geometry.location.lat,
                            longitude: item.geometry.location.lng,
                            source: 'restaurant_selection',
                            priority: 1 // Restaurant location has highest priority
                          };

                          console.log(`Updating location from restaurant modal selection: ${item.name}`);

                          // Update location in state and route params
                          setLocation(restaurantLocation);
                          if (route.params) {
                            route.params.location = restaurantLocation;
                          }
                        }

                        // Fetch meal suggestions for this restaurant
                        updateMealSuggestionsForRestaurant(item.name);
                      }
                      setShowRestaurantModal(false);
                    }}
                  >
                    <Text style={styles.restaurantName}>{item.name}</Text>
                    <Text style={styles.restaurantAddress}>{item.vicinity}</Text>
                  </TouchableOpacity>
                )}
              />
            ) : (
              <Text style={styles.noResultsText}>No restaurants found nearby</Text>
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
    marginBottom: 15, // Reduced margin
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
    maxHeight: 300, // More height for the dropdown
  },
  autocompleteList: {
    maxHeight: 300, // Increased to match dropdown
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
    flexGrow: 1, // Important for ensuring scroll works properly
    paddingBottom: 40, // Add padding at bottom for better scrolling
  },
  contentContainer: {
    padding: 15, // Slightly reduced padding
    alignItems: 'center',
  },
  imageContainer: {
    width: '100%',
    height: 180, // Fixed height instead of percentage
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#eee',
    marginVertical: 10, // Reduced margin
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
    marginBottom: 10, // Reduced margin
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10, // Reduced margin
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
  ratingSection: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 5, // Reduced margin
  },
  // Comment section styles
  commentsContainer: {
    width: '100%',
    marginVertical: 5, // Less margin
  },
  commentSection: {
    width: '100%',
    marginBottom: 15, // Reduced margin
  },
  commentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  commentSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
    fontStyle: 'italic',
  },
  bulletContainer: {
    flexDirection: 'row',
    marginBottom: 5, // Reduced spacing between bullet points
    alignItems: 'flex-start',
  },
  bullet: {
    fontSize: 18,
    marginRight: 8,
    color: '#666',
    lineHeight: 35, // Increased to align with input
    width: 15, // Fixed width
  },
  bulletInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 8,
    minHeight: 40,
    fontSize: 14,
    backgroundColor: 'white',
    color: '#333',
    textAlignVertical: 'top', // Better position for cursor in Android
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 8,
    minHeight: 80, // Increased for two bullet points
    fontSize: 14,
    backgroundColor: 'white',
    color: '#333',
    textAlignVertical: 'top', // Better position for cursor in Android
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  ratingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 10, // Reduced margin
  },
  starTouchable: {
    padding: 5,
    marginHorizontal: 5,
  },
  star: {
    width: 40,
    height: 40,
  },
  ratingText: {
    fontSize: 18,
    color: '#666',
    marginVertical: 5, // Reduced margin
  },
  saveButton: {
    width: '100%',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20, // Fixed margin instead of auto
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

export default RatingScreen;