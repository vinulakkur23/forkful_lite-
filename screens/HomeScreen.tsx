import React, { useEffect, useState, useRef, useCallback } from 'react';
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
// Import our custom EmojiDisplay component
import EmojiDisplay from '../components/EmojiDisplay';
import SimpleFilterComponent, { FilterItem } from '../components/SimpleFilterComponent';
import CompositeFilterComponent from '../components/CompositeFilterComponent';
import HomeMapComponent from '../components/HomeMapComponent';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { getFollowing } from '../services/followService';
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
  mealType?: string; // "Restaurant" or "Homemade"
  location: {
    latitude: number;
    longitude: number;
    source?: string; // 'device', 'exif', etc.
    city?: string; // City can also be stored in location
  } | null;
  createdAt: any;
  distance?: number; // Distance in meters from user's current location
  score?: number; // Tiered relevance score
  tier?: string; // Tier description for debugging
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
  const [activeRatingFilters, setActiveRatingFilters] = useState<number[] | null>(null);
  
  // Track if we're showing limited results
  const [showingLimitedResults, setShowingLimitedResults] = useState(false);
  
  // Cache following list for performance
  const [followingUserIds, setFollowingUserIds] = useState<string[]>([]);
  const [followingLastFetched, setFollowingLastFetched] = useState<number>(0);
  
  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
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
    
    // Handle navigation from meal detail to show on map
    if (route.params?.initialTab === 'map') {
      console.log('HomeScreen: Switching to map tab from meal detail');
      setIndex(1); // Map tab is index 1
      
      // Clear the navigation parameters after processing them to prevent reuse
      setTimeout(() => {
        navigation.setParams({
          initialTab: undefined,
          centerOnLocation: undefined
        });
      }, 1000); // Clear after the map animation completes
    }
  }, [route.params?.tabIndex, route.params?.initialTab, navigation]);

  // Get user's current location
  useEffect(() => {
    Geolocation.getCurrentPosition(
      position => {
        if (isMountedRef.current) {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          setLocationError(null);
        }
      },
      error => {
        console.log('Location error:', error);
        if (isMountedRef.current) {
          setLocationError(error.message);
          Alert.alert('Location Error', 'Could not get your location. Showing all meals instead.');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  }, []);

  // Check if user is logged in and set up saved meals listener
  useEffect(() => {
    const currentUser = auth().currentUser;
    if (isMountedRef.current) {
      setUser(currentUser);
    }
    
    // Set up real-time listener for saved meals
    if (currentUser) {
      const unsubscribe = firestore()
        .collection('users')
        .doc(currentUser.uid)
        .collection('savedMeals')
        .onSnapshot(snapshot => {
          if (isMountedRef.current) {
            const savedMealIds = new Set(snapshot.docs.map(doc => doc.id));
            savedMealsRef.current = savedMealIds;
            
            // Update all visible cards
            Object.keys(cardRefs.current).forEach(mealId => {
              if (cardRefs.current[mealId]?.updateHeartVisibility) {
                cardRefs.current[mealId].updateHeartVisibility(savedMealIds.has(mealId));
              }
            });
          }
        }, error => {
          console.error('Error listening to saved meals:', error);
        });
      
      return () => unsubscribe();
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
    console.log('HomeScreen: activeFilters or activeRatingFilters changed:', activeFilters, activeRatingFilters);
    // Add a small delay to prevent rapid successive calls
    const timeoutId = setTimeout(() => {
      if (isMountedRef.current) {
        applyFilter();
      }
    }, 50);
    
    return () => clearTimeout(timeoutId);
  }, [allNearbyMeals, activeFilters, activeRatingFilters]);

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

  // Get cached following list (refresh every 5 minutes)
  const getCachedFollowingList = async (): Promise<string[]> => {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    if (followingUserIds.length > 0 && (now - followingLastFetched) < fiveMinutes) {
      console.log('Using cached following list:', followingUserIds.length, 'users');
      return followingUserIds;
    }
    
    console.log('Refreshing following list...');
    const followingList = await getFollowing();
    const userIds = followingList.map(follow => follow.followingId);
    
    setFollowingUserIds(userIds);
    setFollowingLastFetched(now);
    
    console.log('Updated following cache:', userIds.length, 'users');
    return userIds;
  };

  const fetchNearbyMeals = async () => {
    try {
      if (!isMountedRef.current) return;
      setLoading(true);
      
      // Get the current user's ID
      const currentUserId = auth().currentUser?.uid;
      console.log('Current user ID:', currentUserId);
      
      // Get cached following list (performance optimization)
      const followingUserIds = await getCachedFollowingList();
      
      // Get meals from all users (limited to 75 for faster processing)
      const querySnapshot = await firestore()
        .collection('mealEntries')
        .orderBy('createdAt', 'desc')
        .limit(75) // Reduced limit for faster processing
        .get();

      const rawMeals = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      // Get unique user IDs for batch fetching user data
      const uniqueUserIds = [...new Set(rawMeals.map(meal => meal.userId).filter(Boolean))];
      console.log(`Batch fetching user data for ${uniqueUserIds.length} unique users`);
      
      // Batch fetch user data (performance optimization)
      const userDataMap = new Map<string, any>();
      
      // Firebase 'in' queries are limited to 10 items, so we batch them
      const batchSize = 10;
      for (let i = 0; i < uniqueUserIds.length; i += batchSize) {
        const batch = uniqueUserIds.slice(i, i + batchSize);
        try {
          const userSnapshot = await firestore()
            .collection('users')
            .where(firestore.FieldPath.documentId(), 'in', batch)
            .get();
          
          userSnapshot.docs.forEach(doc => {
            userDataMap.set(doc.id, doc.data());
          });
        } catch (error) {
          console.log('Error batch fetching user data:', error);
        }
      }
      
      console.log(`Successfully fetched user data for ${userDataMap.size} users`);

      const meals: MealEntry[] = [];
      
      // Process meals and calculate tiered scores
      for (const rawMeal of rawMeals) {
        // Skip entries without location
        if (!rawMeal.location) continue;
        
        // Calculate distance if user location is available
        let distance = null;
        if (userLocation) {
          distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            rawMeal.location.latitude,
            rawMeal.location.longitude
          );
        }

        // Determine if this is a new post (within 7 days)
        const mealDate = rawMeal.createdAt?.toDate?.() || new Date(0);
        const isNewPost = mealDate > sevenDaysAgo;
        
        // Determine if user is following the meal creator
        const isFromFollowedUser = followingUserIds.includes(rawMeal.userId);
        
        // Calculate tiered score
        let score = 0;
        let tier = 'Unknown';
        
        if (isFromFollowedUser) {
          // Tier 1: Posts from followed users (regardless of location)
          score = 1000;
          if (isNewPost) score += 200; // Bonus for recent posts from followed users
          tier = 'Tier 1 (Following)';
        } else if (distance !== null) {
          if (distance <= 8) { // 5 miles ≈ 8 km
            if (isNewPost) {
              // Tier 1: New posts within 5 miles
              score = 1000 + (100 - distance * 10); // Distance bonus (closer = higher score)
              tier = 'Tier 1 (New + Close)';
            } else {
              // Tier 2: Older posts within 5 miles
              score = 500 + (100 - distance * 10);
              tier = 'Tier 2 (Old + Close)';
            }
          } else if (distance <= 16) { // 10 miles ≈ 16 km
            if (isNewPost) {
              // Tier 2: New posts within 10 miles
              score = 500 + (50 - distance * 3);
              tier = 'Tier 2 (New + Medium)';
            } else {
              // Tier 3: Older posts within 10 miles
              score = 100 + (50 - distance * 3);
              tier = 'Tier 3 (Old + Medium)';
            }
          } else {
            // Tier 4: Meals beyond 10 miles (very low priority but still included)
            if (isNewPost) {
              score = 25 + Math.max(0, 50 - distance); // Very low score for distant new posts
              tier = 'Tier 4 (New + Distant)';
            } else {
              score = 10 + Math.max(0, 25 - distance * 0.5); // Extremely low score for distant old posts
              tier = 'Tier 4 (Old + Distant)';
            }
          }
        } else {
          // No location data, low priority
          score = 50;
          tier = 'Tier 3 (No Location)';
        }

        // Get user data from batch-fetched map (performance optimization)
        const userData = userDataMap.get(rawMeal.userId);
        const userName = userData?.displayName || rawMeal.userName || '';
        const userPhoto = userData?.photoURL || rawMeal.userPhoto || '';
        
        // Make sure aiMetadata has the expected properties
        const aiMetadata = rawMeal.aiMetadata || {};
        
        meals.push({
          id: rawMeal.id,
          photoUrl: rawMeal.photoUrl,
          rating: rawMeal.rating,
          restaurant: rawMeal.restaurant || '',
          meal: rawMeal.meal || '',
          userId: rawMeal.userId,
          userName,
          userPhoto,
          city: rawMeal.city || '', // Include city for filtering
          mealType: rawMeal.mealType || 'Restaurant', // Include meal type (defaults to Restaurant for older entries)
          location: rawMeal.location,
          distance: distance,
          createdAt: rawMeal.createdAt?.toDate?.() || new Date(),
          score: score,
          tier: tier,
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
      
      // Sort by score (highest first) then by creation date for tie-breaking
      meals.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      
      // Limit the number of meals to prevent performance issues
      const limitedMeals = meals.slice(0, MAX_MEALS_TO_DISPLAY);
      
      console.log(`Processed ${meals.length} meals in ${uniqueUserIds.length} batched user queries`);
      console.log('Top 5 meals by score:', limitedMeals.slice(0, 5).map(m => ({ 
        meal: m.meal, 
        score: m.score, 
        tier: m.tier,
        isFollowing: followingUserIds.includes(m.userId),
        distance: m.distance 
      })));
      
      // Show info to user if we're limiting results
      const isLimited = meals.length > MAX_MEALS_TO_DISPLAY;
      setShowingLimitedResults(isLimited);
      
      if (isLimited) {
        console.log(`Limiting display to ${MAX_MEALS_TO_DISPLAY} meals for performance`);
      }
      
      if (!isMountedRef.current) return;
      setAllNearbyMeals(limitedMeals);
      // Filtered meals will be updated via the useEffect
    } catch (error) {
      console.error('Error fetching nearby meals:', error);
      if (isMountedRef.current) {
        Alert.alert('Error', 'Failed to load nearby meals');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
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
    
    // Start by filtering out homemade food (regardless of active filters)
    let result = allNearbyMeals.filter(meal => {
      // Check if meal is marked as homemade using the mealType field
      const isHomemade = meal.mealType === "Homemade";
      
      if (isHomemade) {
        console.log(`HomeScreen: Filtering out homemade meal: "${meal.meal}" (mealType: ${meal.mealType})`);
      }
      
      return !isHomemade; // Exclude homemade meals
    });
    
    console.log(`HomeScreen: After filtering out homemade: ${allNearbyMeals.length} meals -> ${result.length} meals remain`);
    
    // If no other filters are active, show the non-homemade meals (but still need to check for rating filters)
    if ((!activeFilters || activeFilters.length === 0) && (!activeRatingFilters || activeRatingFilters.length === 0)) {
      console.log('HomeScreen: No active filters, showing all non-homemade meals');
      setNearbyMeals(result);
      return;
    }
    
    console.log(`HomeScreen: Applying ${activeFilters?.length || 0} additional filters and ${activeRatingFilters?.length || 0} rating filters:`, JSON.stringify(activeFilters), activeRatingFilters);
    
    // Apply each filter sequentially
    if (activeFilters && activeFilters.length > 0) {
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
    }
    
    console.log(`HomeScreen: Final filter results: ${result.length} meals match all filter criteria`);
    
    // Apply rating filters if any are active
    if (activeRatingFilters && activeRatingFilters.length > 0) {
      console.log(`HomeScreen: Applying rating filters:`, activeRatingFilters);
      const beforeRatingFilter = result.length;
      result = result.filter(meal => activeRatingFilters.includes(meal.rating));
      console.log(`HomeScreen: After rating filter: ${beforeRatingFilter} meals -> ${result.length} meals remain`);
    }
    
    // Set filtered meals
    setNearbyMeals(result);
  };
  
  // Handle filter changes from SimpleFilterComponent
  const handleFilterChange = (filters: FilterItem[] | null) => {
    console.log('HomeScreen: Filters changed:', filters);
    setActiveFilters(filters);
    // applyFilter will be called via useEffect
  };

  // Handle rating filter changes
  const handleRatingFilterChange = useCallback((ratings: number[] | null) => {
    console.log('HomeScreen: Rating filters changed:', ratings);
    setActiveRatingFilters(ratings);
    // applyFilter will be called via useEffect when activeRatingFilters changes
  }, []);

  const handleImageError = (mealId: string) => {
    // Prevent excessive logging of the same image error
    if (!imageErrors[mealId] && isMountedRef.current) {
      console.log(`Image load error for meal: ${mealId}`);
      setImageErrors(prev => ({...prev, [mealId]: true}));
    }
  };

  const renderEmoji = (rating: number) => {
    return (
      <EmojiDisplay rating={rating} size={28} />
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
      // Convert to meters with proper formatting
      const meters = Math.round(distance * 1000);
      return `${meters.toLocaleString()} m`;
    } else {
      // In kilometers with proper formatting
      if (distance >= 0.1) { // 100+ meters
        const roundedKm = Math.round(distance);
        return `${roundedKm.toLocaleString()} km`;
      } else {
        // Less than 100m, show one decimal
        return `${distance.toFixed(1)} km`;
      }
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


  // Save meal to wishlist
  const saveMealToWishlist = async (mealId: string, mealData?: MealEntry) => {
    try {
      const currentUser = auth().currentUser;
      const userId = currentUser?.uid;
      if (!userId) {
        Alert.alert('Error', 'Please log in to save meals');
        return;
      }

      // If meal data is not provided, try to find it from nearby meals
      if (!mealData) {
        mealData = nearbyMeals.find(meal => meal.id === mealId);
        if (!mealData) {
          Alert.alert('Error', 'Meal data not found');
          return;
        }
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
      const currentUser = auth().currentUser;
      const userId = currentUser?.uid;
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

  // Double tap meal card component - memoized to prevent unnecessary re-renders
  const DoubleTapMealCard = React.memo(({ item }: { item: MealEntry }) => {
    const [showHeart, setShowHeart] = useState(savedMealsRef.current.has(item.id));
    const lastTap = useRef<number>(0);

    // Register this card's update function
    React.useEffect(() => {
      // Check initial state
      setShowHeart(savedMealsRef.current.has(item.id));
      
      cardRefs.current[item.id] = {
        updateHeartVisibility: (visible: boolean) => {
          setShowHeart(visible);
        }
      };
      
      return () => {
        delete cardRefs.current[item.id];
      };
    }, [item.id]);

    const handleDoubleTap = () => {
      const now = Date.now();
      const DOUBLE_TAP_DELAY = 300;
      
      if (lastTap.current && (now - lastTap.current) < DOUBLE_TAP_DELAY) {
        // Double tap detected
        lastTap.current = 0; // Reset
        
        // Toggle wishlist status
        if (showHeart) {
          removeMealFromWishlist(item.id);
        } else {
          saveMealToWishlist(item.id, item);
        }
      } else {
        // First tap - wait for potential double tap
        lastTap.current = now;
        
        // If no second tap, navigate to details after delay
        setTimeout(() => {
          if (lastTap.current === now) {
            viewMealDetails(item);
          }
        }, DOUBLE_TAP_DELAY);
      }
    };

    return (
      <View style={styles.mealCardContainer}>
        <TouchableOpacity
          style={styles.mealCard}
          onPress={handleDoubleTap}
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
              {renderEmoji(item.rating)}
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
      </View>
    );
  }, (prevProps, nextProps) => {
    // Only re-render if the meal item actually changed
    return prevProps.item.id === nextProps.item.id &&
           prevProps.item.photoUrl === nextProps.item.photoUrl &&
           prevProps.item.rating === nextProps.item.rating;
  });

  // Render a meal item in the feed - memoized to prevent recreation
  const renderMealItem = React.useCallback(({ item }: { item: MealEntry }) => (
    <DoubleTapMealCard item={item} />
  ), []);
  


  



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
          // Additional performance optimizations
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
          }}
          legacyImplementation={false}
          disableVirtualization={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#ff6b6b']}
            />
          }
          ListEmptyComponent={
            !loading && !refreshing && allNearbyMeals.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Icon name="restaurant" size={64} color="#ccc" />
                <Text style={styles.emptyText}>
                  {locationError
                    ? "Couldn't access your location. Please check your settings."
                    : activeFilters && activeFilters.length > 0
                      ? "No meals match your current filters"
                      : "No meals found nearby"}
                </Text>
                <Text style={styles.emptySubtext}>
                  {activeFilters && activeFilters.length > 0
                    ? "Try adjusting your filters or exploring a new area"
                    : "Start rating meals to populate your feed!"}
                </Text>
              </View>
            ) : null
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
        <CompositeFilterComponent 
          key="home-filter"
          onFilterChange={handleFilterChange}
          onRatingFilterChange={handleRatingFilterChange}
          initialFilters={activeFilters}
          initialRatings={activeRatingFilters}
          onUserSelect={(userId, userName, userPhoto) => {
            console.log('Navigating to user profile:', userName, userId, 'Photo:', userPhoto);
            navigation.navigate('FoodPassport', { 
              userId, 
              userName,
              userPhoto,
              tabIndex: 0 // Always start on meals tab
            });
          }}
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
            centerOnLocation={route.params?.centerOnLocation}
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
    backgroundColor: '#FAF9F6', // Back to original
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
    paddingTop: 1, // Reduced top padding from 3 to 1
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
    backgroundColor: '#fff', // White like search bar
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
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
    backgroundColor: 'rgba(250, 248, 230, 0.8)', // Cream color with 80% opacity
    borderRadius: 20,
    padding: 4,
    paddingHorizontal: 5,
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
    marginRight: -4,
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
  // Meal card container
  mealCardContainer: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
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

// Wrap HomeScreen with React.memo to prevent unnecessary re-renders
// This will only re-render if navigation or route props actually change
export default React.memo(HomeScreen, (prevProps, nextProps) => {
  // Custom comparison function
  // Return true if props are equal (skip re-render)
  // Return false if props are different (re-render needed)
  
  // Check if navigation state is the same
  const navStateEqual = 
    prevProps.navigation.getState() === nextProps.navigation.getState();
  
  // Check if route params are the same
  const routeParamsEqual = 
    JSON.stringify(prevProps.route.params) === JSON.stringify(nextProps.route.params);
  
  // Only re-render if navigation state or route params actually changed
  return navStateEqual && routeParamsEqual;
});
