import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Alert,
  SafeAreaView,
  Platform,
  PermissionsAndroid,
  Linking,
  Clipboard,
  Share,
  PanResponder,
  Animated,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
// Import our custom StarRating component instead of FontAwesome
import StarRating from '../components/StarRating';
import SimpleFilterComponent, { FilterItem } from '../components/SimpleFilterComponent';
import HomeMapComponent from '../components/HomeMapComponent';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import Geolocation from '@react-native-community/geolocation';
import { fonts } from '../src/theme/fonts';
import { RootStackParamList } from '../App';

// Map toggle icons
const MAP_HOME_ICONS = {
  mapActive: require('../assets/icons/maphome-active.png'),
  mapInactive: require('../assets/icons/maphome-inactive.png'),
};

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;
type HomeScreenRouteProp = RouteProp<RootStackParamList, 'Home'>;

type Props = {
  navigation: HomeScreenNavigationProp;
  route: HomeScreenRouteProp;
};

interface MealEntry {
  id: string;
  photoUrl: string;
  rating: number;
  restaurant: string;
  meal: string;
  userId: string;
  userName?: string;
  userPhoto?: string;
  city?: string; // Add city field for filtering
  location: {
    latitude: number;
    longitude: number;
    source?: string; // 'device', 'exif', etc.
    city?: string; // City can also be stored in location
  } | null;
  createdAt: any;
  distance?: number; // Distance in meters from user's current location
  aiMetadata?: {
    cuisineType: string;
    foodType: string[];  // Changed to array
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

// Constants
const MAX_MEALS_TO_DISPLAY = 50; // Limit the number of meals shown on map to prevent performance issues

const HomeScreen: React.FC<Props> = ({ navigation, route }) => {
  const [user, setUser] = useState<any>(null);
  const [allNearbyMeals, setAllNearbyMeals] = useState<MealEntry[]>([]);
  const [nearbyMeals, setNearbyMeals] = useState<MealEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<{[key: string]: boolean}>({});
  
  // Multi-filter state
  const [activeFilters, setActiveFilters] = useState<FilterItem[] | null>(null);
  
  // Track if we're showing limited results
  const [showingLimitedResults, setShowingLimitedResults] = useState(false);
  
  // Tab view state - initialize with route param if provided
  const initialTabIndex = route.params?.tabIndex || 0;
  
  // Wishlist/saved meals state using ref to prevent re-renders
  const savedMealsRef = useRef<Set<string>>(new Set());
  const cardRefs = useRef<{ [key: string]: any }>({});
  
  // FlatList ref to maintain scroll position
  const flatListRef = useRef<FlatList>(null);
  const scrollPosition = useRef(0);
  const [index, setIndex] = useState(initialTabIndex);
  const [routes] = useState([
    { key: 'list', title: 'Feed' },
    { key: 'map', title: 'Map' },
  ]);

  // Handle route parameter changes (like returning from meal detail with tab index)
  useEffect(() => {
    if (route.params?.tabIndex !== undefined && route.params.tabIndex !== index) {
      console.log('HomeScreen: Setting tab index from route params:', route.params.tabIndex);
      setIndex(route.params.tabIndex);
    }
  }, [route.params?.tabIndex]);

  // Get user's current location
  useEffect(() => {
    Geolocation.getCurrentPosition(
      position => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationError(null);
      },
      error => {
        console.log('Location error:', error);
        setLocationError(error.message);
        Alert.alert('Location Error', 'Could not get your location. Showing all meals instead.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  }, []);

  // Check if user is logged in
  useEffect(() => {
    const currentUser = auth().currentUser;
    setUser(currentUser);
    
    // Load saved meals when user is set
    if (currentUser) {
      loadSavedMeals();
    }
  }, []);

  // Fetch nearby meals whenever userLocation changes
  useEffect(() => {
    if (userLocation) {
      fetchNearbyMeals();
    }
  }, [userLocation]);
  
  // Apply filter whenever meals or active filters change
  useEffect(() => {
    console.log('HomeScreen: activeFilters changed:', activeFilters);
    applyFilter();
  }, [allNearbyMeals, activeFilters]);

  // Restore scroll position when returning to this screen
  useFocusEffect(
    React.useCallback(() => {
      // Restore scroll position after a short delay to ensure FlatList is ready
      if (flatListRef.current && scrollPosition.current > 0) {
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({
            offset: scrollPosition.current,
            animated: false, // No animation for instant restoration
          });
        }, 100);
      }
    }, [])
  );

  // Calculate distance between two coordinates in kilometers
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distance in km
    return distance;
  };
  
  const deg2rad = (deg: number): number => {
    return deg * (Math.PI/180);
  };

  const fetchNearbyMeals = async () => {
    try {
      setLoading(true);
      
      // Get the current user's ID
      const currentUserId = auth().currentUser?.uid;
      console.log('Current user ID:', currentUserId);
      
      // Get all meals from all users
      const querySnapshot = await firestore()
        .collection('mealEntries')
        .orderBy('createdAt', 'desc')
        .limit(100) // Limit to prevent excessive data usage
        .get();

      const meals: MealEntry[] = [];
      
      // Process meals and calculate distance
      for (const doc of querySnapshot.docs) {
        const data = doc.data() as MealEntry;
        
        // Skip entries without location
        if (!data.location) continue;
        
        // Skip entries that belong to the current user for the HomeScreen
        if (currentUserId && data.userId === currentUserId) {
          console.log(`Skipping own meal: ${data.meal} (${doc.id})`);
          continue;
        }
        
        // Calculate distance if user location is available
        let distance = null;
        if (userLocation) {
          distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            data.location.latitude,
            data.location.longitude
          );
        }
        
        // Get user data for each meal
        let userName = '';
        let userPhoto = '';
        
        if (data.userId) {
          try {
            const userDoc = await firestore().collection('users').doc(data.userId).get();
            if (userDoc.exists) {
              const userData = userDoc.data();
              userName = userData?.displayName || '';
              userPhoto = userData?.photoURL || '';
            }
          } catch (error) {
            console.log('Error fetching user data:', error);
          }
        }
        
        // Make sure aiMetadata has the expected properties
        const aiMetadata = data.aiMetadata || {};
        
        meals.push({
          id: doc.id,
          photoUrl: data.photoUrl,
          rating: data.rating,
          restaurant: data.restaurant || '',
          meal: data.meal || '',
          userId: data.userId,
          userName,
          userPhoto,
          city: data.city || '', // Include city for filtering
          location: data.location,
          distance: distance,
          createdAt: data.createdAt?.toDate?.() || new Date(),
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
      
      // Sort by distance if location is available, otherwise by date
      let sortedMeals = userLocation
        ? meals.sort((a, b) => (a.distance || 9999) - (b.distance || 9999))
        : meals;
      
      // Limit to the closest MAX_MEALS_TO_DISPLAY meals to prevent performance issues
      const limitedMeals = sortedMeals.slice(0, MAX_MEALS_TO_DISPLAY);
      
      console.log(`Found ${sortedMeals.length} meals from other users, showing closest ${limitedMeals.length}`);
      
      // Show info to user if we're limiting results
      const isLimited = sortedMeals.length > MAX_MEALS_TO_DISPLAY;
      setShowingLimitedResults(isLimited);
      
      if (isLimited) {
        console.log(`Limiting display to closest ${MAX_MEALS_TO_DISPLAY} meals for performance`);
      }
      
      setAllNearbyMeals(limitedMeals);
      // Filtered meals will be updated via the useEffect
    } catch (error) {
      console.error('Error fetching nearby meals:', error);
      Alert.alert('Error', 'Failed to load nearby meals');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setImageErrors({}); // Reset image errors on refresh
    fetchNearbyMeals();
  };
  
  // Apply multiple filters to all nearby meals
  const applyFilter = () => {
    if (!allNearbyMeals.length) {
      console.log('HomeScreen: No meals to filter');
      setNearbyMeals([]);
      return;
    }
    
    // Check if we have meals with aiMetadata for debugging
    const mealsWithMetadata = allNearbyMeals.filter(meal => meal.aiMetadata);
    console.log(`HomeScreen: Found ${mealsWithMetadata.length} out of ${allNearbyMeals.length} meals with aiMetadata`);
    
    // Print some sample data to understand the structure
    if (allNearbyMeals.length > 0) {
      console.log('HomeScreen: Sample meal data (first meal):', {
        id: allNearbyMeals[0].id,
        meal: allNearbyMeals[0].meal,
        restaurant: allNearbyMeals[0].restaurant,
        city: allNearbyMeals[0].city,
        locationCity: allNearbyMeals[0].location?.city,
        aiMetadata: allNearbyMeals[0].aiMetadata
      });
    }
    
    // If no filters are active, show all meals
    if (!activeFilters || activeFilters.length === 0) {
      console.log('HomeScreen: No active filters, showing all meals');
      setNearbyMeals(allNearbyMeals);
      return;
    }
    
    console.log(`HomeScreen: Applying ${activeFilters.length} filters:`, JSON.stringify(activeFilters));
    
    // Start with all meals
    let result = [...allNearbyMeals];
    
    // Apply each filter sequentially
    activeFilters.forEach(filter => {
      const countBefore = result.length;
      console.log(`HomeScreen: Applying filter: ${filter.type} = ${filter.value}`);
      
      if (filter.type === 'cuisineType') {
        result = result.filter(meal => {
          const matches = meal.aiMetadata && 
                        meal.aiMetadata.cuisineType && 
                        meal.aiMetadata.cuisineType === filter.value;
          if (matches) {
            console.log(`HomeScreen: Meal "${meal.meal}" matches cuisineType: ${filter.value}`);
          }
          return matches;
        });
      } else if (filter.type === 'foodType') {
        result = result.filter(meal => {
          if (!meal.aiMetadata || !meal.aiMetadata.foodType) return false;
          
          // foodType is now an array
          let matches = false;
          if (Array.isArray(meal.aiMetadata.foodType)) {
            matches = meal.aiMetadata.foodType.includes(filter.value);
          } else {
            // Handle old data that might still be a string
            matches = meal.aiMetadata.foodType === filter.value;
          }
          
          if (matches) {
            console.log(`HomeScreen: Meal "${meal.meal}" matches foodType: ${filter.value}`);
          }
          return matches;
        });
      } else if (filter.type === 'city') {
        result = result.filter(meal => {
          // First check if city is stored as top-level city property
          if (meal.city) {
            const matches = meal.city.toLowerCase() === filter.value.toLowerCase();
            if (matches) {
              console.log(`HomeScreen: Meal "${meal.meal}" matches city (top-level): ${filter.value}`);
            }
            return matches;
          }
          
          // Next check if city is stored in location.city
          if (meal.location && meal.location.city) {
            const matches = meal.location.city.toLowerCase() === filter.value.toLowerCase();
            if (matches) {
              console.log(`HomeScreen: Meal "${meal.meal}" matches city (location): ${filter.value}`);
            }
            return matches;
          }
          
          // Fallback: Try to match city in restaurant field
          if (meal.restaurant && meal.restaurant.includes(',')) {
            const restaurantParts = meal.restaurant.split(',');
            if (restaurantParts.length > 1) {
              // Handle cases where city might be "Portland OR" format
              const secondPart = restaurantParts[1].trim();
              const cityPart = secondPart.includes(' ') ? secondPart.split(' ')[0] : secondPart;
              
              const matches = cityPart.toLowerCase() === filter.value.toLowerCase();
              if (matches) {
                console.log(`HomeScreen: Meal "${meal.meal}" matches city (restaurant): ${filter.value}`);
              }
              return matches;
            }
          }
          return false;
        });
      }
      console.log(`HomeScreen: After applying filter ${filter.type}=${filter.value}: ${countBefore} meals -> ${result.length} meals remain`);
    });
    
    console.log(`HomeScreen: Final filter results: ${result.length} meals match all filter criteria`);
    
    // Set filtered meals
    setNearbyMeals(result);
  };
  
  // Handle filter changes from SimpleFilterComponent
  const handleFilterChange = (filters: FilterItem[] | null) => {
    console.log('HomeScreen: Filters changed:', filters);
    setActiveFilters(filters);
    // applyFilter will be called via useEffect
  };

  const handleImageError = (mealId: string) => {
    console.log(`Image load error for meal: ${mealId}`);
    setImageErrors(prev => ({...prev, [mealId]: true}));
  };

  const renderStars = (rating: number) => {
    return (
      <StarRating rating={rating} starSize={14} />
    );
  };

  const formatDistance = (distance: number | undefined, meal: MealEntry): string => {
    // Check if location is null
    if (!meal.location) return "No location";

    // Check if location was from EXIF data
    if (meal.location.source === 'exif') {
      return "At photo location";
    }

    // If no distance available
    if (!distance) return "Unknown distance";

    if (distance < 1) {
      // Convert to meters
      return `${Math.round(distance * 1000)}m away`;
    } else {
      // In kilometers with one decimal
      return `${distance.toFixed(1)}km away`;
    }
  };

  // Navigation function for meal details
  const viewMealDetails = (meal: MealEntry) => {
    console.log("Navigating to meal detail with ID:", meal.id);
    console.log("Current scroll position:", scrollPosition.current);
    
    // Navigate to meal detail (scroll position is already tracked by onScroll)
    navigation.navigate('MealDetail', { 
      mealId: meal.id, 
      previousScreen: 'Home',
      previousTabIndex: index // Pass current tab index
    });
  };

  // Load saved meals from Firestore
  const loadSavedMeals = async () => {
    try {
      const userId = user?.uid;
      if (!userId) return;

      const savedMealsRef = firestore()
        .collection('users')
        .doc(userId)
        .collection('savedMeals');
      
      const snapshot = await savedMealsRef.get();
      const savedMealIds = new Set(snapshot.docs.map(doc => doc.data().mealId));
      savedMealsRef.current = savedMealIds;
    } catch (error) {
      console.error('Error loading saved meals:', error);
    }
  };

  // Save meal to wishlist
  const saveMealToWishlist = async (mealId: string) => {
    try {
      const userId = user?.uid;
      if (!userId) {
        Alert.alert('Error', 'Please log in to save meals');
        return;
      }

      // Find the meal data from our current nearby meals
      const mealData = nearbyMeals.find(meal => meal.id === mealId);
      if (!mealData) {
        Alert.alert('Error', 'Meal data not found');
        return;
      }

      const savedMealRef = firestore()
        .collection('users')
        .doc(userId)
        .collection('savedMeals')
        .doc(mealId);

      // Store complete meal data for the wishlist
      await savedMealRef.set({
        mealId,
        photoUrl: mealData.photoUrl,
        rating: mealData.rating,
        restaurant: mealData.restaurant,
        mealName: mealData.meal,
        userId: mealData.userId,
        userName: mealData.userName,
        userPhoto: mealData.userPhoto,
        location: mealData.location,
        createdAt: mealData.createdAt,
        aiMetadata: mealData.aiMetadata,
        savedAt: firestore.FieldValue.serverTimestamp(),
      });

      // Update local state without triggering re-render
      savedMealsRef.current.add(mealId);
      
      // Update the specific card's heart visibility if it exists
      if (cardRefs.current[mealId]?.updateHeartVisibility) {
        cardRefs.current[mealId].updateHeartVisibility(true);
      }
      
      // Show subtle success feedback without alert to maintain scroll position
      console.log('Meal saved to wishlist:', mealData.meal);
    } catch (error) {
      console.error('Error saving meal:', error);
      Alert.alert('Error', 'Failed to save meal to wishlist');
    }
  };

  // Remove meal from wishlist
  const removeMealFromWishlist = async (mealId: string) => {
    try {
      const userId = user?.uid;
      if (!userId) return;

      const savedMealRef = firestore()
        .collection('users')
        .doc(userId)
        .collection('savedMeals')
        .doc(mealId);

      await savedMealRef.delete();

      // Update local state without triggering re-render
      savedMealsRef.current.delete(mealId);
      
      // Update the specific card's heart visibility if it exists
      if (cardRefs.current[mealId]?.updateHeartVisibility) {
        cardRefs.current[mealId].updateHeartVisibility(false);
      }

      console.log('Meal removed from wishlist');
    } catch (error) {
      console.error('Error removing meal:', error);
      Alert.alert('Error', 'Failed to remove meal from wishlist');
    }
  };

  // Swipeable meal card component
  const SwipeableMealCard = ({ item }: { item: MealEntry }) => {
    const translateX = useRef(new Animated.Value(0)).current;
    const isAnimating = useRef(false);
    const [showHeart, setShowHeart] = useState(savedMealsRef.current.has(item.id));

    // Register this card's update function
    React.useEffect(() => {
      cardRefs.current[item.id] = {
        updateHeartVisibility: (visible: boolean) => {
          setShowHeart(visible);
        }
      };
      
      return () => {
        delete cardRefs.current[item.id];
      };
    }, [item.id]);

    // Force reset function to ensure card always returns to 0
    const forceReset = () => {
      if (isAnimating.current) return; // Don't interrupt existing animations
      
      isAnimating.current = true;
      Animated.spring(translateX, {
        toValue: 0,
        tension: 200,
        friction: 10,
        useNativeDriver: false,
      }).start(() => {
        isAnimating.current = false;
        translateX.setValue(0); // Force to exactly 0
      });
    };

    const panResponder = PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Very forgiving gesture detection
        if (isAnimating.current) return false;
        
        const horizontalMovement = Math.abs(gestureState.dx);
        const verticalMovement = Math.abs(gestureState.dy);
        
        // Allow swipe if:
        // 1. There's any reasonable horizontal movement (>5px), AND
        // 2. Horizontal movement is at least 15% of total movement (very lenient)
        const totalMovement = horizontalMovement + verticalMovement;
        const horizontalRatio = totalMovement > 0 ? horizontalMovement / totalMovement : 1;
        
        return horizontalMovement > 5 && horizontalRatio > 0.15;
      },
      onPanResponderGrant: () => {
        // Stop any ongoing animations
        translateX.stopAnimation();
        isAnimating.current = false;
      },
      onPanResponderMove: (_, gestureState) => {
        // Continue tracking horizontal movement regardless of vertical movement
        if (gestureState.dx > 0) {
          const maxSwipe = width * 0.4; // 40% of screen width max
          const adjustedDx = Math.min(gestureState.dx, maxSwipe);
          translateX.setValue(adjustedDx);
        } else if (gestureState.dx < -10) {
          // Only snap back if there's significant leftward movement
          translateX.setValue(0);
        }
        // For small negative values (-10 to 0), keep current position to avoid jitter
      },
      onPanResponderRelease: (_, gestureState) => {
        const swipeThreshold = width * 0.25; // 25% of screen width for easy activation
        const swipeVelocity = gestureState.vx; // Consider velocity too
        
        // Check if swipe was fast enough or far enough
        const shouldActivate = gestureState.dx > swipeThreshold || 
                              (gestureState.dx > width * 0.15 && swipeVelocity > 0.4);
        
        if (shouldActivate) {
          // Swipe right - save to wishlist
          isAnimating.current = true;
          Animated.timing(translateX, {
            toValue: width,
            duration: 200,
            useNativeDriver: false,
          }).start(() => {
            // Reset position after animation
            translateX.setValue(0);
            isAnimating.current = false;
            
            // Toggle wishlist status
            if (showHeart) {
              removeMealFromWishlist(item.id);
            } else {
              saveMealToWishlist(item.id);
            }
          });
        } else {
          // Snap back to original position
          forceReset();
        }
      },
      onPanResponderTerminate: () => {
        // Handle case where gesture is interrupted
        forceReset();
      },
    });

    return (
      <View style={styles.swipeContainer}>
        {/* Background indicator */}
        <View style={styles.swipeBackground}>
          <Image 
            source={showHeart 
              ? require('../assets/icons/wishlist-inactive.png')  // Show unfilled heart to indicate removal
              : require('../assets/icons/wishlist-active.png')    // Show filled heart to indicate adding
            }
            style={styles.swipeHeartIcon}
            resizeMode="contain"
          />
        </View>
        
        {/* Swipeable card */}
        <Animated.View
          style={[
            styles.swipeableCard,
            {
              transform: [{ translateX }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity
            style={styles.mealCard}
            onPress={() => viewMealDetails(item)}
            activeOpacity={0.9}
          >
            <View style={styles.imageContainer}>
              {/* Saved indicator with heart icon */}
              {showHeart && (
                <Image 
                  source={require('../assets/icons/wishlist-active.png')}
                  style={styles.heartIcon}
                  resizeMode="contain"
                />
              )}
              
              {/* Add safe image handling */}
              {item.photoUrl && !imageErrors[item.id] ? (
                <Image
                  source={{ uri: item.photoUrl }}
                  style={styles.mealImage}
                  resizeMode="cover"
                  onError={() => handleImageError(item.id)}
                />
              ) : (
                <View style={[styles.mealImage, styles.placeholderContainer]}>
                  <Icon name="image-not-supported" size={32} color="#D8D6B8" />
                </View>
              )}
              
              {/* Star rating overlay */}
              <View style={styles.ratingOverlay}>
                {renderStars(item.rating)}
              </View>
            </View>
            
            <View style={styles.mealCardContent}>
              <View style={styles.infoRow}>
                <Text style={styles.mealName} numberOfLines={1}>
                  {item.meal || 'Delicious meal'}
                </Text>
                
                {item.distance !== undefined && (
                  <Text style={styles.distanceText}>
                    {formatDistance(item.distance, item)}
                  </Text>
                )}
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  };

  // Render a meal item in the feed
  const renderMealItem = ({ item }: { item: MealEntry }) => (
    <SwipeableMealCard item={item} />
  );
  


  



  // Feed view component (current content)
  const FeedViewComponent = () => (
    <>
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff6b6b" />
          <Text style={styles.loadingText}>Finding meals nearby...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={nearbyMeals}
          keyExtractor={(item) => item.id}
          renderItem={renderMealItem}
          contentContainerStyle={styles.feedContainer}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          initialNumToRender={10}
          windowSize={10}
          getItemLayout={(data, index) => ({
            length: 360, // Approximate height of meal card (320px image + 40px content)
            offset: 360 * index,
            index,
          })}
          onScroll={(event) => {
            scrollPosition.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#ff6b6b']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="no-meals" size={64} color="#ccc" />
              <Text style={styles.emptyText}>
                {locationError
                  ? "Couldn't access your location. Please check your settings."
                  : activeFilters && activeFilters.length > 0
                    ? "No meals match your current filters"
                    : "No meals from other users found nearby"}
              </Text>
              <Text style={styles.emptySubtext}>
                {activeFilters && activeFilters.length > 0
                  ? "Try adjusting your filters or exploring a new area"
                  : "Share the app with friends to see their meals in your feed!"}
              </Text>
            </View>
          }
        />
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Updated Header with Map Toggle */}
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>DishItOut</Text>
        <TouchableOpacity
          style={styles.mapToggleButton}
          onPress={() => setIndex(index === 0 ? 1 : 0)}
        >
          <Image 
            source={index === 1 ? MAP_HOME_ICONS.mapActive : MAP_HOME_ICONS.mapInactive} 
            style={styles.mapToggleIcon}
            resizeMode="contain"
          />
        </TouchableOpacity>
      </View>
      
      {/* Multi Filter Component */}
      <View style={styles.filterArea}>
        <SimpleFilterComponent 
          key="home-filter"
          onFilterChange={handleFilterChange}
          initialFilters={activeFilters}
        />
      </View>

      {/* Tab View - Render both components but show/hide based on index */}
      <View style={styles.tabView}>
        <View style={[styles.tabContent, index !== 0 && styles.hiddenTab]}>
          <FeedViewComponent />
        </View>
        <View style={[styles.tabContent, index !== 1 && styles.hiddenTab]}>
          <HomeMapComponent
            navigation={navigation}
            nearbyMeals={nearbyMeals}
            loading={loading}
            refreshing={refreshing}
            activeFilters={activeFilters}
            showingLimitedResults={showingLimitedResults}
            userLocation={userLocation}
            imageErrors={imageErrors}
            onImageError={handleImageError}
            onViewMealDetails={viewMealDetails}
            tabIndex={index}
            MAX_MEALS_TO_DISPLAY={MAX_MEALS_TO_DISPLAY}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6', // Light off-white color
  },
  headerContainer: {
    backgroundColor: 'transparent',
    paddingTop: 20, // Keep space at the top
    paddingBottom: 5, // Reduced from 10 to 5
    paddingHorizontal: 20,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filterArea: {
    paddingHorizontal: 15,
    paddingTop: 5, // Reduced top padding from 10 to 5
    paddingBottom: 10, // Keep bottom padding
    backgroundColor: '#FAF9F6', // Match the container background
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    zIndex: 5,
  },
  headerTitle: {
    fontFamily: 'Lobster-Regular',
    fontSize: 38, // Made even bigger
    color: '#E63946', // Red color
    textAlign: 'left', // Left-aligned text
    fontWeight: undefined, // Clear any default weight that might interfere
    marginBottom: 0, // Removed spacing below the title
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 50,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  feedContainer: {
    paddingBottom: 20,
  },
  mealCard: {
    backgroundColor: '#FAF3E0',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
  },
  mealImage: {
    width: '100%',
    height: 320, // Decreased from 350 to 320
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  placeholderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9F8E5', // Light cream for placeholder
    height: 320, // Match the image height
  },
  ratingOverlay: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 20,
    padding: 5,
    paddingHorizontal: 8,
  },
  mealCardContent: {
    padding: 14,
    paddingBottom: 16, // Restored to original
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  mealName: {
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    fontSize: 16,
    fontWeight: 'normal',
    flex: 1,
    marginRight: 8,
    color: '#1a2b49',
  },
  distanceText: {
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    fontSize: 13,
    color: '#1a2b49',
    textAlign: 'right',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 18,
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  // Map toggle button style
  mapToggleButton: {
    padding: 8,
  },
  mapToggleIcon: {
    width: 24,
    height: 24,
  },
  // Tab view style
  tabView: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
  },
  hiddenTab: {
    position: 'absolute',
    left: -10000,
    opacity: 0,
  },
  // Swipe functionality styles
  swipeContainer: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  swipeBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FAF9F6', // Same cream color as homescreen background
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center', // Center the heart icon
  },
  swipeHeartIcon: {
    width: 40,
    height: 40,
  },
  swipeableCard: {
    backgroundColor: 'transparent',
  },
  heartIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    zIndex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 5,
  },
  // Map styles (copied from MapScreen)
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  // Custom photo marker styles
  customPhotoMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerPhoto: {
    width: 50,
    height: 50,
    borderRadius: 25,
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
  // Callout styles
  callout: {
    width: 220,
    borderRadius: 10,
    padding: 0,
    backgroundColor: 'transparent',
  },
  photoCallout: {
    width: 220,
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
  calloutRatingRow: {
    flexDirection: 'row',
    marginVertical: 3,
    justifyContent: 'center',
  },
  calloutStar: {
    width: 14,
    height: 14,
    marginHorizontal: 1,
  },
  calloutUserName: {
    fontSize: 11,
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 2,
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
  calloutInstruction: {
    fontSize: 9,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 3,
    textAlign: 'center',
  },
  // Map button styles
  mapButtonContainer: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  floatingLocationButton: {
    backgroundColor: 'white',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    borderWidth: 1,
    borderColor: '#E63946',
  },
  limitedResultsIndicator: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  limitedResultsText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});

export default HomeScreen;
