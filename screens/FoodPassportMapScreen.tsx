import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Alert,
  Platform,
  Linking,
  Clipboard,
  Share
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { RootStackParamList, TabParamList } from '../App';
// Import Firebase from our central config
import { firebase, auth, firestore, storage } from '../firebaseConfig';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as ImagePicker from 'react-native-image-picker';
import Geolocation from '@react-native-community/geolocation';
// Re-enable EXIF for extracting location data from images
import Exif from 'react-native-exif';
// Import our new photoLibraryService for improved metadata extraction
import { getPhotoWithMetadata, prefetchSuggestionsFromPhoto } from '../services/photoLibraryService';
import StarRating from '../components/StarRating';
import SimpleFilterComponent from '../components/SimpleFilterComponent';
// Import components for tab view
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
// Import map component
import MapView, { Marker, Callout, Region } from 'react-native-maps';

// Create a composite navigation prop that combines tab and stack navigation
type FoodPassportScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'FoodPassport'>,
  StackNavigationProp<RootStackParamList>
>;

type Props = {
  navigation: FoodPassportScreenNavigationProp;
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
  // Add top-level city field
  city?: string;
  location: {
    latitude: number;
    longitude: number;
    source?: string;
    city?: string;
  } | null;
  createdAt: number;
  // Add any other fields that might be in your database
  mealType?: string;
  comments?: {
    liked: string;
    disliked: string;
  };
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
  distance?: number;
}

const { width } = Dimensions.get('window');
const itemWidth = (width - 40) / 2; // 2 items per row with 10px spacing

// Define tab routes
type Route = {
  key: string;
  title: string;
};

const FoodPassportMapScreen: React.FC<Props> = ({ navigation }) => {
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<{[key: string]: boolean}>({});
  
  // Simple filter state
  const [activeFilter, setActiveFilter] = useState<{
    type: string,
    value: string
  } | null>(null);
  const [filteredMeals, setFilteredMeals] = useState<MealEntry[]>([]);
  
  // State for profile stats
  const [profileStats, setProfileStats] = useState({
    totalMeals: 0,
    averageRating: 0
  });
  
  // Tab view state
  const [index, setIndex] = useState(0);
  const [routes] = useState<Route[]>([
    { key: 'list', title: 'Passport' },
    { key: 'map', title: 'Map' },
  ]);
  
  // Map view reference
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    // Initialize GoogleSignin
    GoogleSignin.configure({
      webClientId: '476812977799-7dmlpm8g3plslrsftesst7op6ipm71a4.apps.googleusercontent.com',
      iosClientId: '476812977799-vutvsmj3dit2ov9ko1sgp4p2p0u57kh4.apps.googleusercontent.com',
      offlineAccess: true,
    });

    // Get current user
    try {
      const user = auth().currentUser;

      if (user) {
        setUserInfo({
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
          uid: user.uid
        });
        fetchMealEntries();
      } else {
        // If no user, redirect to login
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      }
    } catch (err: any) {
      console.error('Error in useEffect:', err);
      setError(`Failed to initialize: ${err.message}`);
      setLoading(false);
    }
  }, []);
  
  const fetchMealEntries = async () => {
    try {
      setLoading(true);
      const userId = auth().currentUser?.uid;
      
      if (!userId) {
        setError('User not authenticated');
        setLoading(false);
        return;
      }
      
      const querySnapshot = await firestore()
        .collection('mealEntries')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .get();
      
      const fetchedMeals: MealEntry[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        console.log(`Processing meal entry: ${doc.id}`, data.aiMetadata ? "HAS aiMetadata" : "NO aiMetadata");
        
        // Ensure aiMetadata is properly structured 
        let processedAiMetadata = undefined;
        
        if (data.aiMetadata && typeof data.aiMetadata === 'object') {
          processedAiMetadata = {
            cuisineType: data.aiMetadata.cuisineType || '',
            foodType: data.aiMetadata.foodType || '',
            mealType: data.aiMetadata.mealType || '',
            primaryProtein: data.aiMetadata.primaryProtein || '',
            dietType: data.aiMetadata.dietType || '',
            eatingMethod: data.aiMetadata.eatingMethod || '',
            setting: data.aiMetadata.setting || '',
            platingStyle: data.aiMetadata.platingStyle || '',
            beverageType: data.aiMetadata.beverageType || ''
          };
          console.log(`Meal ${doc.id} processed aiMetadata:`, JSON.stringify(processedAiMetadata));
        }
        
        fetchedMeals.push({
          id: doc.id,
          photoUrl: data.photoUrl,
          rating: data.rating,
          restaurant: data.restaurant || '',
          meal: data.meal || '',
          userId: data.userId,
          location: data.location,
          createdAt: data.createdAt?.toDate?.() || Date.now(),
          mealType: data.mealType || 'Restaurant',
          comments: data.comments || { liked: '', disliked: '' },
          aiMetadata: processedAiMetadata
        });
      });

      setMeals(fetchedMeals);
      // Initial state for filtered meals will be the same as all meals
      setFilteredMeals(fetchedMeals);

      // Calculate profile stats
      const totalMeals = fetchedMeals.length;
      let averageRating = 0;

      if (totalMeals > 0) {
        const totalRating = fetchedMeals.reduce((sum, meal) => sum + (meal.rating || 0), 0);
        averageRating = totalRating / totalMeals;
      }

      setProfileStats({
        totalMeals,
        averageRating
      });

      // Reset image errors when fetching new data
      setImageErrors({});
    } catch (err: any) {
      console.error('Error fetching meal entries:', err);
      setError(`Failed to load meals: ${err.message}`);
      Alert.alert('Error', 'Failed to load your food passport entries');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  
  const handleRefresh = () => {
    setRefreshing(true);
    fetchMealEntries();
  };
  
  // Apply filter to meals
  const applyFilter = () => {
    if (!meals.length) {
      console.log("No meals to filter");
      setFilteredMeals([]);
      return;
    }
    
    // If no filter is active, show all meals
    if (!activeFilter) {
      console.log("No active filter, showing all meals:", meals.length);
      setFilteredMeals(meals);
      return;
    }
    
    console.log(`Applying filter: ${activeFilter.type}=${activeFilter.value}`);
    
    // Deep inspection of meal data structure
    console.log("First meal data sample:", JSON.stringify(meals[0], null, 2));
    
    // Check for aiMetadata presence and structure
    const mealsWithMetadata = meals.filter(meal => 
      meal.aiMetadata && typeof meal.aiMetadata === 'object'
    );
    console.log("Meals with aiMetadata objects:", mealsWithMetadata.length);
    
    if (mealsWithMetadata.length === 0) {
      console.warn("No meals have proper aiMetadata objects!");
      // Show all meals when there's no metadata
      setFilteredMeals(meals);
      return;
    }
    
    // Sample aiMetadata structures to debug
    if (mealsWithMetadata.length > 0) {
      console.log("Sample aiMetadata structures:");
      mealsWithMetadata.slice(0, 3).forEach((meal, i) => {
        console.log(`Sample ${i+1}:`, JSON.stringify(meal.aiMetadata, null, 2));
      });
    }
    
    // Apply the active filter
    let result = [...meals];
    
    if (activeFilter.type === 'cuisineType') {
      console.log("Filtering by cuisineType:", activeFilter.value);
      // Debug - show available cuisine types
      const availableCuisines = new Set();
      meals.forEach(meal => {
        if (meal.aiMetadata && meal.aiMetadata.cuisineType) {
          availableCuisines.add(meal.aiMetadata.cuisineType);
        }
      });
      console.log("Available cuisineTypes:", Array.from(availableCuisines));
      
      result = result.filter(meal => {
        // More verbose debugging for each meal
        const hasMeta = Boolean(meal.aiMetadata);
        const hasCuisine = hasMeta && Boolean(meal.aiMetadata.cuisineType);
        const cuisineType = hasCuisine ? meal.aiMetadata.cuisineType : 'none';
        
        // Case-insensitive and trim comparison
        const mealCuisineNormalized = hasCuisine ? meal.aiMetadata.cuisineType.trim().toLowerCase() : '';
        const filterValueNormalized = activeFilter.value.trim().toLowerCase();
        const matches = hasCuisine && mealCuisineNormalized === filterValueNormalized;
        
        // Log details for a sample of meals
        if (Math.random() < 0.1) { // Only log ~10% of meals to avoid console spam
          console.log(`Meal ${meal.id}: hasMeta=${hasMeta}, hasCuisine=${hasCuisine}, cuisineType="${cuisineType}", normalized="${mealCuisineNormalized}", filter="${filterValueNormalized}", matches=${matches}`);
        }
        
        return matches;
      });
    } else if (activeFilter.type === 'foodType') {
      console.log("Filtering by foodType:", activeFilter.value);
      // Debug - show available food types
      const availableFoodTypes = new Set();
      meals.forEach(meal => {
        if (meal.aiMetadata && meal.aiMetadata.foodType) {
          availableFoodTypes.add(meal.aiMetadata.foodType);
        }
      });
      console.log("Available foodTypes:", Array.from(availableFoodTypes));
      
      result = result.filter(meal => {
        // More verbose debugging for each meal
        const hasMeta = Boolean(meal.aiMetadata);
        const hasFoodType = hasMeta && Boolean(meal.aiMetadata.foodType);
        const foodType = hasFoodType ? meal.aiMetadata.foodType : 'none';
        
        // Case-insensitive and trim comparison
        const mealFoodTypeNormalized = hasFoodType ? meal.aiMetadata.foodType.trim().toLowerCase() : '';
        const filterValueNormalized = activeFilter.value.trim().toLowerCase();
        const matches = hasFoodType && mealFoodTypeNormalized === filterValueNormalized;
        
        // Log details for a sample of meals
        if (Math.random() < 0.1) { // Only log ~10% of meals to avoid console spam
          console.log(`Meal ${meal.id}: hasMeta=${hasMeta}, hasFoodType=${hasFoodType}, foodType="${foodType}", normalized="${mealFoodTypeNormalized}", filter="${filterValueNormalized}", matches=${matches}`);
        }
        
        return matches;
      });
    } else if (activeFilter.type === 'city') {
      console.log("Filtering by city:", activeFilter.value);
      
      // Debug - show available cities
      const availableCities = new Set<string>();
      meals.forEach(meal => {
        // Check all possible city sources
        if (meal.city) {
          availableCities.add(meal.city);
        } else if (meal.location && meal.location.city) {
          availableCities.add(meal.location.city);
        } else if (meal.restaurant && meal.restaurant.includes(',')) {
          const restaurantParts = meal.restaurant.split(',');
          if (restaurantParts.length > 1) {
            const secondPart = restaurantParts[1].trim();
            const cityPart = secondPart.includes(' ') ? secondPart.split(' ')[0] : secondPart;
            availableCities.add(cityPart);
          }
        }
      });
      console.log("Available cities:", Array.from(availableCities));
      
      result = result.filter(meal => {
        const filterValueNormalized = activeFilter.value.trim().toLowerCase();
        
        // First check if city is stored as top-level city property
        if (meal.city) {
          const cityNormalized = meal.city.trim().toLowerCase();
          if (cityNormalized === filterValueNormalized) {
            return true;
          }
        }
        
        // Next check if city is stored in location.city
        if (meal.location && meal.location.city) {
          const locationCityNormalized = meal.location.city.trim().toLowerCase();
          if (locationCityNormalized === filterValueNormalized) {
            return true;
          }
        }
        
        // Fallback: Try to match city in restaurant field
        if (meal.restaurant && meal.restaurant.includes(',')) {
          const restaurantParts = meal.restaurant.split(',');
          if (restaurantParts.length > 1) {
            // Handle cases where city might be "Portland OR" format
            const secondPart = restaurantParts[1].trim();
            const cityPart = secondPart.includes(' ') ? secondPart.split(' ')[0] : secondPart;
            
            const extractedCityNormalized = cityPart.toLowerCase();
            if (extractedCityNormalized === filterValueNormalized) {
              return true;
            }
          }
        }
        
        return false;
      });
    }
    
    console.log(`Filtered meals: ${result.length} of ${meals.length}`);
    setFilteredMeals(result);
  };
  
  // Handle filter changes from SimpleFilterComponent
  const handleFilterChange = (filter: { type: string, value: string } | null) => {
    setActiveFilter(filter);
    // applyFilter will be called via useEffect
  };
  
  // Apply filter whenever meals or active filter changes
  useEffect(() => {
    applyFilter();
  }, [meals, activeFilter]);
  
  const viewMealDetails = (meal: MealEntry) => {
    console.log("Navigating to meal detail with ID:", meal.id);
    navigation.navigate('MealDetail', { mealId: meal.id, previousScreen: 'FoodPassport' });
  };
  
  const handleImageError = (mealId: string) => {
    console.log(`Image load error for meal: ${mealId}`);
    setImageErrors(prev => ({...prev, [mealId]: true}));
  };

  // Updated Image Picker function using photoLibraryService for full metadata access
  const openImagePicker = async () => {
    console.log('Opening enhanced image picker with PHAsset metadata extraction');

    try {
      // Use our new getPhotoWithMetadata function to access full metadata including location
      const photoAsset = await getPhotoWithMetadata();

      if (!photoAsset) {
        console.log('No photo selected or permission denied');
        return;
      }

      console.log(`Selected photo with URI: ${photoAsset.uri}`);
      console.log(`Photo has location data: ${!!photoAsset.location}`);
      
      if (photoAsset.location) {
        console.log(`Location data: ${JSON.stringify(photoAsset.location)}`);
      }

      // Prefetch restaurant suggestions based on the photo location
      if (photoAsset.location) {
        console.log("Prefetching suggestions based on photo location");
        
        // Store the prefetched suggestions in a global variable for the Rating screen to use
        try {
          const suggestions = await prefetchSuggestionsFromPhoto(photoAsset);
          if (suggestions) {
            // Save suggestions to global for RatingScreen to access
            (global as any).prefetchedSuggestions = suggestions;
            console.log("Stored prefetched suggestions in global:", 
              suggestions.restaurants ? `${suggestions.restaurants.length} restaurants` : "No restaurants",
              suggestions.suggested_meal ? `Meal: ${suggestions.suggested_meal}` : "No meal suggestion"
            );
          }
        } catch (suggestionError) {
          console.log("Error prefetching suggestions:", suggestionError);
        }
      }

      // Create a photo object for the Crop screen
      const photoObject = {
        uri: photoAsset.uri,
        width: photoAsset.width,
        height: photoAsset.height,
        originalUri: photoAsset.originalUri || photoAsset.uri, // Preserve original URI for EXIF
        fromGallery: true, // Mark that this is an uploaded image
        assetId: photoAsset.assetId // Include the asset ID for potential future use
      };

      // Make sure location has a source property before navigating
      let locationWithSource = null;
      if (photoAsset.location) {
        locationWithSource = {
          ...photoAsset.location,
          // Ensure source is set - default to 'exif' if missing
          source: photoAsset.location.source || 'exif'
        };
        console.log('Using location with source:', locationWithSource);
      }

      // Navigate with photo and location data if available
      navigation.navigate('Crop', {
        photo: photoObject,
        location: locationWithSource,
        exifData: photoAsset.exifData || null, // Pass any extracted EXIF data
        _navigationKey: `image_${Date.now()}`
      });
    } catch (error) {
      console.error('Unexpected error in enhanced image picker:', error);
      Alert.alert('Error', 'An unexpected error occurred while selecting an image.');
      
      // Fall back to device location if the enhanced picker fails
      console.log('Falling back to device location');
      Geolocation.getCurrentPosition(
        position => {
          // Create basic photo object with device location
          Alert.alert(
            'Limited Photo Access', 
            'We were unable to access full photo metadata. Location information will be based on your current location instead.',
            [
              { 
                text: 'Select a Different Photo', 
                style: 'cancel' 
              },
              {
                text: 'Continue',
                onPress: () => {
                  // Launch standard image picker as fallback
                  const fallbackOptions = {
                    mediaType: 'photo' as const,
                    includeBase64: false,
                    maxHeight: 2000,
                    maxWidth: 2000,
                    quality: 0.8,
                  };
                  
                  ImagePicker.launchImageLibrary(fallbackOptions, (result) => {
                    if (result.didCancel || !result.assets || result.assets.length === 0) {
                      return;
                    }
                    
                    const selectedImage = result.assets[0];
                    if (!selectedImage.uri) {
                      return;
                    }
                    
                    const photoObject = {
                      uri: selectedImage.uri,
                      width: selectedImage.width || 1000,
                      height: selectedImage.height || 1000,
                      originalUri: selectedImage.uri,
                      fromGallery: true
                    };
                    
                    // Make sure to include source in the location object
                    const location = {
                      latitude: position.coords.latitude,
                      longitude: position.coords.longitude,
                      source: 'device' // Explicitly mark as device location for proper handling
                    };
                    
                    console.log('Using device location as fallback:', location);
                    
                    navigation.navigate('Crop', {
                      photo: photoObject,
                      location: location,
                      _navigationKey: `image_${Date.now()}`
                    });
                  });
                }
              }
            ]
          );
        },
        error => {
          console.log('Location error:', error);
          Alert.alert('Error', 'Unable to access photo metadata or location. Please try again or use the camera.');
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    }
  };
  
  const signOut = async () => {
    try {
      console.log("Starting sign out process");

      // Debug authentication state
      console.log("Auth state before sign out:", {
        currentUser: auth().currentUser ? {
          uid: auth().currentUser.uid,
          email: auth().currentUser.email
        } : null
      });

      // Sign out of Google first
      await GoogleSignin.signOut();

      // Then sign out of Firebase
      await auth().signOut();

      console.log("Sign out successful");

      // Navigate to login screen
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    } catch (error) {
      console.error('Error signing out:', error);
      Alert.alert('Error', `Failed to sign out: ${error.message || 'Unknown error'}`);
    }
  };
  
  // Function to render each meal item
  const renderMealItem = ({ item }: { item: MealEntry }) => (
    <TouchableOpacity 
      style={styles.mealCard}
      onPress={() => viewMealDetails(item)}
    >
      {item.photoUrl && !imageErrors[item.id] ? (
        <Image 
          source={{ uri: item.photoUrl }} 
          style={styles.mealImage}
          onError={() => handleImageError(item.id)}
        />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Icon name="image" size={24} color="#ddd" />
        </View>
      )}
      <View style={styles.mealCardContent}>
        <Text style={styles.mealName} numberOfLines={1}>{item.meal || 'Untitled meal'}</Text>
        <View style={styles.ratingContainer}>
          <StarRating rating={item.rating} starSize={16} spacing={2} />
        </View>
        {item.restaurant && (
          <Text style={styles.restaurantName} numberOfLines={1}>{item.restaurant}</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  // PassportTabView component
  const PassportTabView = () => {
    if (loading && !refreshing) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff6b6b" />
          <Text style={styles.loadingText}>Loading your food passport...</Text>
        </View>
      );
    }
    
    return (
      <FlatList
        data={filteredMeals}
        renderItem={renderMealItem}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#ff6b6b']}
          />
        }
        ListHeaderComponent={
          /* Profile Card as Header - Will scroll with the content */
          userInfo ? (
            <View style={styles.profileCard}>
              <View style={styles.profileHeader}>
                {userInfo.photoURL ? (
                  <Image
                    source={{ uri: userInfo.photoURL }}
                    style={styles.profilePhoto}
                    onError={() => console.log("Failed to load profile image")}
                  />
                ) : (
                  <View style={styles.profilePhotoPlaceholder}>
                    <Icon name="person" size={30} color="#fff" />
                  </View>
                )}
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName}>
                    {userInfo.displayName || "Food Enthusiast"}
                  </Text>
                  <Text style={styles.profileEmail} numberOfLines={1}>
                    {userInfo.email || ""}
                  </Text>
                </View>
              </View>
              <View style={styles.profileStats}>
                <View style={styles.statItem}>
                  <Icon name="file-upload" size={18} color="#666" />
                  <Text style={styles.statValue}>{profileStats.totalMeals}</Text>
                  <Text style={styles.statLabel}>Uploads</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Image
                    source={require('../assets/stars/star-filled.png')}
                    style={styles.starIcon}
                  />
                  <Text style={styles.statValue}>
                    {profileStats.averageRating.toFixed(1)}
                  </Text>
                  <Text style={styles.statLabel}>Avg. Rating</Text>
                </View>
                <View style={styles.statDivider} />
                <TouchableOpacity 
                  style={styles.statItemButton}
                  onPress={openImagePicker}
                >
                  <Icon name="add-circle" size={18} color="#ff6b6b" />
                  <Text style={styles.statValue}>
                    +
                  </Text>
                  <Text style={styles.statLabel}>New Entry</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {meals.length === 0 ? (
              // No meals at all
              <>
                <Icon name="book" size={64} color="#ddd" />
                <Text style={styles.emptyText}>No meals in your passport yet</Text>
                <Text style={styles.emptySubtext}>
                  Tap "New Entry" to add your first meal!
                </Text>
              </>
            ) : (
              // We have meals but none match the current filter
              <>
                <Icon name="filter-alt" size={64} color="#ddd" />
                <Text style={styles.emptyText}>No matches found</Text>
                <Text style={styles.emptySubtext}>
                  {activeFilter ? `No meals match the filter "${activeFilter.value}"` : 'No meals match your filter'}
                </Text>
                <TouchableOpacity
                  style={styles.clearFilterButton}
                  onPress={() => setActiveFilter(null)}
                >
                  <Text style={styles.clearFilterText}>Clear Filter</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        }
      />
    );
  };

  // MapView Component for the second tab - simplified for stability
  const MapViewComponent = () => {
    // Filter meals that have location data
    const mealsWithLocation = filteredMeals.filter(meal => meal.location !== null);
    
    // Group meals by location and offset overlapping markers
    const processedMealMarkers = useMemo(() => {
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
      
      // Process each group to offset markers if multiple meals at same location
      const processedMarkers: Array<{meal: MealEntry, coordinate: {latitude: number, longitude: number}, isGrouped: boolean, groupSize: number}> = [];
      
      Object.values(locationGroups).forEach(mealsAtLocation => {
        if (mealsAtLocation.length === 1) {
          // Single meal at this location, no offset needed
          processedMarkers.push({
            meal: mealsAtLocation[0],
            coordinate: {
              latitude: mealsAtLocation[0].location!.latitude,
              longitude: mealsAtLocation[0].location!.longitude
            },
            isGrouped: false,
            groupSize: 1
          });
        } else {
          // Multiple meals at same location, arrange in a circle
          const centerLat = mealsAtLocation[0].location!.latitude;
          const centerLng = mealsAtLocation[0].location!.longitude;
          const count = mealsAtLocation.length;
          
          // Calculate offset distance based on number of meals (roughly 20-50 meters)
          const offsetDistance = 0.0003 + (count > 5 ? 0.0002 : 0); // Increase offset for larger groups
          
          mealsAtLocation.forEach((meal, index) => {
            // Calculate angle for even distribution in a circle
            const angle = (2 * Math.PI * index) / count;
            
            // Calculate offset coordinates
            const offsetLat = centerLat + (offsetDistance * Math.cos(angle));
            const offsetLng = centerLng + (offsetDistance * Math.sin(angle));
            
            processedMarkers.push({
              meal: meal,
              coordinate: {
                latitude: offsetLat,
                longitude: offsetLng
              },
              isGrouped: true,
              groupSize: count
            });
          });
        }
      });
      
      return processedMarkers;
    }, [mealsWithLocation]);
    
    // Calculate initial region based on meals only - no user location yet
    const initialRegion = useMemo<Region>(() => {
      // Default fallback if no meals with location
      if (mealsWithLocation.length === 0) {
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
      
      mealsWithLocation.forEach(meal => {
        if (meal.location) {
          minLat = Math.min(minLat, meal.location.latitude);
          maxLat = Math.max(maxLat, meal.location.latitude);
          minLng = Math.min(minLng, meal.location.longitude);
          maxLng = Math.max(maxLng, meal.location.longitude);
        }
      });
      
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
    }, [mealsWithLocation]);
    
    if (loading && !refreshing) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff6b6b" />
          <Text style={styles.loadingText}>Loading your food passport...</Text>
        </View>
      );
    }
    
    if (mealsWithLocation.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Icon name="place" size={64} color="#ddd" />
          <Text style={styles.emptyText}>{filteredMeals.length > 0 ? 'No matching meals with location data' : 'No meals with location data'}</Text>
          <Text style={styles.emptySubtext}>
            {filteredMeals.length > 0 ? 'Try changing your filters to see more locations' : 'Add meals with location information to see them on the map'}
          </Text>
        </View>
      );
    }
    
    // Function to share map locations via Google Maps
  const shareMapToGoogleMaps = async () => {
    try {
      if (mealsWithLocation.length === 0) {
        Alert.alert("Nothing to Share", "Add meals with location to share your food map.");
        return;
      }

      // Build a Google Maps URL with multiple markers
      // Format: https://www.google.com/maps/dir/?api=1&destination=lat,lng&waypoints=lat,lng|lat,lng

      // Use first meal as destination
      const firstMeal = mealsWithLocation[0];
      let mapUrl = `https://www.google.com/maps/search/?api=1&query=${firstMeal.location?.latitude},${firstMeal.location?.longitude}`;

      // If there are multiple meals, create a custom map link instead
      if (mealsWithLocation.length > 1) {
        // Start a custom map link - this opens Google Maps with pins for all locations
        mapUrl = 'https://www.google.com/maps/dir/?api=1';

        // Add destination (first meal)
        mapUrl += `&destination=${firstMeal.location?.latitude},${firstMeal.location?.longitude}`;

        // Add waypoints (other meals) - limited to 10 due to URL length limits
        const waypoints = mealsWithLocation.slice(1, 10).map(meal =>
          `${meal.location?.latitude},${meal.location?.longitude}`
        ).join('|');

        if (waypoints) {
          mapUrl += `&waypoints=${waypoints}`;
        }
      }

      // Create a shareable text with location names
      const shareText = `Check out my Food Passport with ${mealsWithLocation.length} dining experiences! 🍽️\n\n`;
      const locationNames = mealsWithLocation.slice(0, 5).map(meal =>
        meal.restaurant || meal.meal || 'Untitled meal'
      ).join(', ');

      const shareMessage = `${shareText}Featuring: ${locationNames}${mealsWithLocation.length > 5 ? ' and more...' : ''}`;

      try {
        // Use React Native's Share API
        await Share.share({
          message: shareMessage + '\n\n' + mapUrl,
          url: mapUrl // Note: this may only work on iOS
        }, {
          // Set dialog title (Android only)
          dialogTitle: 'Share Your Food Passport Map'
        });
      } catch (error) {
        console.log('Error sharing:', error);
        // Fallback - copy to clipboard and offer to open maps directly
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
  };

  return (
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={initialRegion}
          showsUserLocation={true}
        >
          {processedMealMarkers.map(({ meal, coordinate, isGrouped, groupSize }) => (
            <Marker
              key={meal.id}
              coordinate={coordinate}
              title={meal.meal || 'Untitled meal'}
              description={meal.restaurant || ''}
            >
              {/* Custom marker view for grouped meals */}
              {isGrouped && (
                <View style={styles.customMarker}>
                  <View style={[styles.markerDot, { backgroundColor: '#ff4444' }]} />
                  {groupSize > 2 && (
                    <View style={styles.markerBadge}>
                      <Text style={styles.markerBadgeText}>{groupSize}</Text>
                    </View>
                  )}
                </View>
              )}
              <Callout
                tooltip
                onPress={() => viewMealDetails(meal)}
                style={styles.callout}
              >
                <View style={styles.calloutContent}>
                  {meal.photoUrl && !imageErrors[meal.id] ? (
                    <Image
                      source={{ uri: meal.photoUrl }}
                      style={styles.calloutImage}
                      onError={() => handleImageError(meal.id)}
                    />
                  ) : (
                    <View style={styles.calloutImagePlaceholder}>
                      <Icon name="image" size={24} color="#ddd" />
                    </View>
                  )}
                  <Text style={styles.calloutTitle}>{meal.meal || 'Untitled meal'}</Text>
                  {meal.restaurant && (
                    <Text style={styles.calloutSubtitle}>{meal.restaurant}</Text>
                  )}
                  <View style={styles.calloutRating}>
                    <StarRating rating={meal.rating} starSize={12} spacing={1} />
                  </View>
                  {isGrouped && groupSize > 1 && (
                    <Text style={styles.calloutGroupText}>
                      {groupSize - 1} more meal{groupSize > 2 ? 's' : ''} at this location
                    </Text>
                  )}
                  <Text style={styles.calloutTapText}>Tap to view details</Text>
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>

        {/* Floating share button */}
        <TouchableOpacity
          style={styles.shareButton}
          onPress={shareMapToGoogleMaps}
        >
          <Icon name="share" size={20} color="#fff" />
          <Text style={styles.shareText}>Share</Text>
        </TouchableOpacity>
      </View>
    );
  };
  
  // Custom tab bar
  const renderTabBar = (props: any) => (
    <TabBar
      {...props}
      indicatorStyle={{ backgroundColor: '#ff6b6b' }}
      style={{ backgroundColor: 'white', elevation: 0, shadowOpacity: 0 }}
      labelStyle={{ color: '#333', fontWeight: 'bold' }}
      activeColor="#ff6b6b"
      inactiveColor="#999"
    />
  );
  
  // Render the main screen
  return (
    <View style={styles.container}>
      {/* Simple Filter Component */}
      <View style={styles.filterArea}>
        <SimpleFilterComponent 
          key="passport-map-filter"
          onFilterChange={handleFilterChange}
          initialFilter={activeFilter}
        />
      </View>
      
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff6b6b" />
          <Text style={styles.loadingText}>Loading your food passport...</Text>
        </View>
      ) : (
        <TabView
          navigationState={{ index, routes }}
          renderScene={SceneMap({
            list: PassportTabView,
            map: MapViewComponent
          })}
          onIndexChange={setIndex}
          initialLayout={{ width }}
          renderTabBar={renderTabBar}
          style={styles.tabView}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: '#ff6b6b',
    zIndex: 10,
  },
  filterArea: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    zIndex: 100,
    position: 'relative',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    marginTop: 5,
    marginBottom: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  signOutButton: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 5,
  },
  signOutText: {
    color: '#fff',
    fontWeight: '500',
    fontSize: 14,
  },
  shareButton: {
    position: 'absolute',
    right: 16,
    bottom: 30,
    backgroundColor: '#ff6b6b',
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  shareText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
  // Profile Card Styles
  profileCard: {
    backgroundColor: 'white',
    margin: 10,
    marginTop: 15,
    borderRadius: 10,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  profilePhoto: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 15,
  },
  profilePhotoPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: '#666',
  },
  profileStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 15,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statItemButton: {
    flex: 1,
    alignItems: 'center',
  },
  starIcon: {
    width: 18,
    height: 18,
    marginBottom: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 10,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginVertical: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  // Styles for the standalone button removed and integrated into profile stats
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  list: {
    padding: 10,
    paddingBottom: 30,
    paddingTop: 5, // Reduced top padding since we have the profile card
  },
  row: {
    justifyContent: 'space-between',
  },
  mealCard: {
    width: itemWidth,
    marginBottom: 20,
    backgroundColor: '#fff',
    borderRadius: 10,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  mealImage: {
    width: '100%',
    height: itemWidth,
    backgroundColor: '#f0f0f0',
  },
  imagePlaceholder: {
    width: '100%',
    height: itemWidth,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mealCardContent: {
    padding: 10,
  },
  mealName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  ratingContainer: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  restaurantName: {
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 50,
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
  clearFilterButton: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#ff6b6b',
    borderRadius: 8,
  },
  clearFilterText: {
    color: 'white',
    fontWeight: '500',
  },
  // Tab View Styles
  tabView: {
    flex: 1,
    zIndex: 1, // Lower z-index than the filter
  },
  // Map Styles
  mapContainer: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  callout: {
    width: 200,
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
    height: 100,
    borderRadius: 5,
    marginBottom: 5,
  },
  calloutImagePlaceholder: {
    width: '100%',
    height: 100,
    borderRadius: 5,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  calloutTitle: {
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 3,
  },
  calloutSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 3,
  },
  calloutRating: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  calloutTapText: {
    fontSize: 10,
    color: '#ff6b6b',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 5,
  },
  calloutGroupText: {
    fontSize: 11,
    color: '#ff4444',
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '500',
  },
  // Custom marker styles
  customMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: 'white',
    backgroundColor: '#ff6b6b',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  markerBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#ff4444',
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
});

export default FoodPassportMapScreen;