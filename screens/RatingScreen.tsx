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
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import { CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, TabParamList } from '../App';
import RNFS from 'react-native-fs';
import { getMealSuggestions, getMealSuggestionsForRestaurant, searchRestaurants, Restaurant } from '../services/mealService';
import StarRating from '../components/StarRating';

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
  // Use state to manage location so we can update it when restaurant is selected
  const [location, setLocation] = useState(route.params.location);
  const [rating, setRating] = useState<number>(0);

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

  // Add meal type selector state - default to "Restaurant"
  const [mealType, setMealType] = useState<"Restaurant" | "Homemade">("Restaurant");
  
  // API configuration - hardcoded for testing
  const HARDCODED_URL = 'https://dishitout-imageinhancer.onrender.com';
  
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
    console.log("Initial location data in RatingScreen:", location);

    // Get suggestions when the screen loads if photo is valid
    getSuggestions();
  }, []);

  // Add effect to log when location changes
  useEffect(() => {
    console.log("Location updated in RatingScreen:", location);
  }, [location]);
  
  const handleRating = (selectedRating: number): void => {
    setRating(selectedRating);
  };

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

      // Make the API call
      const result = await getMealSuggestionsForRestaurant(restaurantName, photo?.uri, location);

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
    if (!location || !photo || !photo.uri) {
      setIsLoadingSuggestions(false);
      return;
    }

    setIsLoadingSuggestions(true);

    try {
      // Check if we have prefetched suggestion data from the previous screen
      if (route.params.suggestionData) {
        console.log('Using prefetched suggestion data from route params');

        const prefetchedData = route.params.suggestionData;

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

        // Clear the global cache to avoid stale data
        (global as any).prefetchedSuggestions = null;

        setIsLoadingSuggestions(false);
        return;
      }

      console.log('No prefetched data available, fetching suggestions now');

      // Fetch new suggestions using our service
      const result = await getMealSuggestions(photo.uri, location);
      console.log('Received suggestion response');

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
      navigation.navigate('Result', {
        photo: freshPhoto,
        location: location,
        rating: rating,
        restaurant: mealType === "Restaurant" ? restaurant : "", // Only include restaurant for Restaurant type
        meal: mealName,
        mealType: mealType, // Include the meal type in the data for Firebase
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
      <View style={styles.contentContainer}>
        {/* Increased image size */}
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
        
        {/* Meal Type Selector */}
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
                          // Search for restaurants matching the text
                          const results = await searchRestaurants(text, location);
                          setAutocompleteRestaurants(results);
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
                                source: 'restaurant_selection' // Mark the source of this location data
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
    marginBottom: 20,
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
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ddd',
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    maxHeight: 200,
  },
  autocompleteList: {
    maxHeight: 200,
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
  contentContainer: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 40,
  },
  imageContainer: {
    width: '100%',
    height: '35%', // Increased height
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#eee',
    marginBottom: 20,
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
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
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
    marginBottom: 30,
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
    marginVertical: 15,
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
    marginVertical: 10,
  },
  saveButton: {
    width: '100%',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 'auto', // Push to the bottom of the container
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
  },
});

export default RatingScreen;
