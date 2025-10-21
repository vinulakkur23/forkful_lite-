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
  SafeAreaView,
  ScrollView,
  Share,
  Modal
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useIsFocused } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { RootStackParamList } from '../App';
// Import Firebase from our central config
import { firebase, auth, firestore, storage } from '../firebaseConfig';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as ImagePicker from 'react-native-image-picker';
import Geolocation from '@react-native-community/geolocation';
// Re-enable EXIF for extracting location data from images
import Exif from 'react-native-exif';
import EmojiDisplay from '../components/EmojiDisplay';
import SimpleFilterComponent, { FilterItem } from '../components/SimpleFilterComponent';
// Import components for tab view
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
// Import map component
import MapView, { Marker, Callout } from 'react-native-maps';
// Import achievement service - DISABLED
// import { getUserAchievements } from '../services/achievementService';
import { checkIfMigrationNeeded, updateUserMealsWithProfile } from '../services/userProfileMigration';
import { getTotalCheersForUser } from '../services/cheersService';
import { refreshUserCounts } from '../services/countRefreshService';
import { followUser, unfollowUser, isFollowing, getFollowCounts } from '../services/followService';
import { getPhotoWithMetadata } from '../services/photoLibraryService';
// Import for accolades section
import { PieChart } from 'react-native-chart-kit';
import { getActiveChallenges, getCompletedChallenges, getUserChallenges, UserChallenge, deleteChallenge } from '../services/userChallengesService';
// Import new theme
import { colors, typography, spacing, shadows, addAlpha } from '../themes';
// Import monument service for passport stamps
import { getOrGenerateMonument } from '../services/monumentPixelArtService';

type FoodPassportScreenNavigationProp = StackNavigationProp<RootStackParamList, 'FoodPassport'>;

type Props = {
  navigation: FoodPassportScreenNavigationProp;
  activeFilters: FilterItem[] | null;
  activeRatingFilters?: number[] | null;
  userId?: string;
  userName?: string;
  userPhoto?: string;
  onStatsUpdate?: (stats: { totalMeals: number; totalCheers: number; badgeCount: number; followersCount: number }) => void;
  onFilterChange?: (filters: FilterItem[] | null) => void;
  onTabChange?: (tabIndex: number) => void;
};

interface MealEntry {
  id: string;
  userId: string; // Add userId field
  photoUrl: string;
  rating: number;
  restaurant: string;
  meal: string;
  // Add city as a top-level field
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
  metadata_enriched?: {
    cuisine_type?: string;
    dish_general?: string;
    dish_specific?: string;
    key_ingredients?: string[];
    interesting_ingredient?: string;
    [key: string]: any;
  } | null;
  enhanced_facts?: any;
  quick_criteria_result?: any;
  isUnrated?: boolean;
  photoSource?: string;
}

const { width } = Dimensions.get('window');
const itemWidth = (width - 30) / 2; // 2 items per row with more even spacing (for meal cards)
const STAMP_SIZE = (width - 50) / 2.5; // ~2.5 items per row for challenges/cities/cuisines (bigger stamps)

// Define interfaces for accolades section
interface City {
  name: string;
  imageUrl: string;
  mealCount: number;
  stampUrl?: string;
}

interface Cuisine {
  name: string;
  imageUrl: string;
  mealCount: number;
}

interface Restaurant {
  name: string;
  mealCount: number;
}

// Define the tab routes
type TabRoutes = {
  key: string;
  title: string;
};

const FoodPassportScreen: React.FC<Props> = ({ navigation, activeFilters, activeRatingFilters, userId, userName, userPhoto, onStatsUpdate, onFilterChange, onTabChange }) => {
    const [meals, setMeals] = useState<MealEntry[]>([]);
    const [filteredMeals, setFilteredMeals] = useState<MealEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [userInfo, setUserInfo] = useState<any>(null);
    const [userProfile, setUserProfile] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [imageErrors, setImageErrors] = useState<{[key: string]: boolean}>({}); 

    // State for profile stats
    const [profileStats, setProfileStats] = useState({
        totalMeals: 0,
        totalCheers: 0,
        badgeCount: 0,
        followersCount: 0
    });
    
    // Follow state
    const [isUserFollowing, setIsUserFollowing] = useState(false);
    const [followLoading, setFollowLoading] = useState(false);
    
    // Track if viewing own profile  
    const [isOwnProfile, setIsOwnProfile] = useState(!userId || userId === auth().currentUser?.uid);
    
    // Photo selection menu state
    const [showPhotoMenu, setShowPhotoMenu] = useState(false);
    

    // Tab view state
    const [tabIndex, setTabIndex] = useState(0);
    const [tabRoutes] = useState<TabRoutes[]>([
      { key: 'list', title: 'List' },
      { key: 'map', title: 'Map' },
    ]);

    // Map view reference
    const mapRef = useRef<MapView | null>(null);

    // Track screen focus for refreshing data
    const isFocused = useIsFocused();

    // State for accolades section
    const [pixelArtEmojis, setPixelArtEmojis] = useState<string[]>([]);
    const [emojisLoading, setEmojisLoading] = useState(true);
    const [allChallenges, setAllChallenges] = useState<UserChallenge[]>([]);
    const [challengesLoading, setChallengesLoading] = useState(true);
    const [selectedChallenge, setSelectedChallenge] = useState<UserChallenge | null>(null);
    const [cities, setCities] = useState<City[]>([]);
    const [citiesLoading, setCitiesLoading] = useState(true);
    const [cuisines, setCuisines] = useState<Cuisine[]>([]);
    const [cuisinesLoading, setCuisinesLoading] = useState(true);
    const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
    const [restaurantsLoading, setRestaurantsLoading] = useState(true);

    useEffect(() => {
        // Initialize GoogleSignin
        GoogleSignin.configure({
            webClientId: '219668861569-qm93jan5voigimfur98slrudb78r6uvp.apps.googleusercontent.com',
            iosClientId: '219668861569-qm93jan5voigimfur98slrudb78r6uvp.apps.googleusercontent.com',
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
    
    // Apply filter whenever meals or active filters change
    useEffect(() => {
        console.log('FoodPassportScreen: activeFilters or activeRatingFilters changed:', activeFilters, activeRatingFilters);
        applyFilter();
    }, [meals, activeFilters, activeRatingFilters]);

    // Load accolades data when component mounts or userId changes
    useEffect(() => {
        loadPixelArtEmojis();
        loadAllChallenges();
        loadCities();
        loadCuisines();
        loadRestaurants();
    }, [userId]);
    
    // Refresh data when screen comes into focus (handles returning from deletion)
    const lastFocusTime = useRef<number>(0);
    
    useEffect(() => {
        if (isFocused && userInfo) {
            const now = Date.now();
            // Only refresh if it's been more than 1 second since last focus refresh
            if (now - lastFocusTime.current > 1000) {
                console.log('FoodPassportScreen focused, refreshing meal data...');
                lastFocusTime.current = now;
                fetchMealEntries();
            }
        }
    }, [isFocused]);
    
    const isMountedRef = useRef(true);
    
    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);
    
    const fetchMealEntries = async () => {
        try {
            if (!isMountedRef.current) return;
            setLoading(true);
            const targetUserId = userId || auth().currentUser?.uid;
            
            if (!targetUserId) {
                if (isMountedRef.current) {
                    setError('User not authenticated');
                    setLoading(false);
                }
                return;
            }
            
            // For other users' profiles, only show rated meals (rating > 0)
            const isViewingOwnProfile = !userId || userId === auth().currentUser?.uid;
            let query = firestore()
                .collection('mealEntries')
                .where('userId', '==', targetUserId);
                
            if (!isViewingOwnProfile) {
                // Only show rated meals for other users
                query = query.where('rating', '>', 0);
                // Need to add composite index for userId + rating + createdAt
                query = query.orderBy('rating', 'desc').orderBy('createdAt', 'desc');
            } else {
                // Show all meals for own profile
                query = query.orderBy('createdAt', 'desc');
            }
            
            const querySnapshot = await query.get();
            
            const fetchedMeals: MealEntry[] = [];
            
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                // Make sure aiMetadata has the expected properties
                const aiMetadata = data.aiMetadata || {};
                
                fetchedMeals.push({
                    id: doc.id,
                    userId: data.userId, // Include the userId field
                    photoUrl: data.photoUrl,
                    rating: data.rating,
                    restaurant: data.restaurant || '',
                    meal: data.meal || '',
                    // Include top-level city field
                    city: data.city || '',
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
                    },
                    metadata_enriched: data.metadata_enriched || null, // Include metadata_enriched field
                    enhanced_facts: data.enhanced_facts || null, // Include enhanced_facts field
                    quick_criteria_result: data.quick_criteria_result || null, // Include quick_criteria_result field
                    mealType: data.mealType || 'Restaurant',
                    comments: data.comments || { liked: '', disliked: '' },
                    isUnrated: data.isUnrated,
                    photoSource: data.photoSource
                });
            });

            if (!isMountedRef.current) return;
            setMeals(fetchedMeals);
            // Filtered meals will be updated via the useEffect

            // Calculate profile stats
            const totalMeals = fetchedMeals.length;
            
            // Get total cheers for the user
            const totalCheers = await getTotalCheersForUser(targetUserId);

            // DISABLED: Get badge count
            // const userAchievements = await getUserAchievements(targetUserId);
            const badgeCount = 0; // DISABLED achievements

            // Get follower count
            const followCounts = await getFollowCounts(targetUserId);
            const followersCount = followCounts.followersCount;

            if (!isMountedRef.current) return;
            setProfileStats({
                totalMeals,
                totalCheers,
                badgeCount,
                followersCount
            });
            
            // Call the stats update callback if provided
            if (onStatsUpdate) {
                onStatsUpdate({
                    totalMeals,
                    totalCheers,
                    badgeCount,
                    followersCount
                });
            }

            // Load user profile
            setIsOwnProfile(isViewingOwnProfile);
            
            if (!isViewingOwnProfile && userId) {
                // Load other user's profile
                const profile: any = {
                    userId: userId,
                    displayName: userName || 'User',
                    photoURL: userPhoto || null,
                };
                
                // Try to get user info from their meals if not provided in route params
                if (fetchedMeals.length > 0) {
                    const firstMeal = fetchedMeals[0];
                    // Use route params first, then fall back to meal data
                    if (!userPhoto && firstMeal.userPhoto) {
                        profile.photoURL = firstMeal.userPhoto;
                    }
                    if (!userName && firstMeal.userName) {
                        profile.displayName = firstMeal.userName;
                    }
                }
                
                setUserProfile(profile);
            } else {
                // Own profile - fetch from Firestore to ensure we have the latest data
                const currentUser = auth().currentUser;
                if (currentUser) {
                    try {
                        // Try to get user data from Firestore first
                        const userDoc = await firestore()
                            .collection('users')
                            .doc(currentUser.uid)
                            .get();
                        
                        if (userDoc.exists) {
                            const userData = userDoc.data();
                            setUserProfile({
                                userId: currentUser.uid,
                                displayName: userData?.displayName || currentUser.displayName || 'User',
                                photoURL: userData?.photoURL || currentUser.photoURL,
                            });
                        } else {
                            // Fallback to auth user data
                            setUserProfile({
                                userId: currentUser.uid,
                                displayName: currentUser.displayName || 'User',
                                photoURL: currentUser.photoURL,
                            });
                        }
                    } catch (error) {
                        console.error('Error fetching user profile from Firestore:', error);
                        // Fallback to auth user data
                        setUserProfile({
                            userId: currentUser.uid,
                            displayName: currentUser.displayName || 'User',
                            photoURL: currentUser.photoURL,
                        });
                    }
                }
            }

            // Reset image errors when fetching new data
            setImageErrors({});
            
            // Check follow status if viewing another user's profile
            if (!isViewingOwnProfile && userId) {
                const followStatus = await isFollowing(userId);
                setIsUserFollowing(followStatus);
            }
            
            // Check if migration is needed for user profile data (only for own profile)
            const currentUser = auth().currentUser;
            if (!userId && currentUser && currentUser.displayName) {
                const needsMigration = await checkIfMigrationNeeded();
                if (needsMigration) {
                    console.log("User meals need profile migration");
                    Alert.alert(
                        "Update Your Meals",
                        "We noticed some of your meals are showing 'Anonymous User'. Would you like to update them with your name?",
                        [
                            {
                                text: "Not Now",
                                style: "cancel"
                            },
                            {
                                text: "Update",
                                onPress: async () => {
                                    const result = await updateUserMealsWithProfile();
                                    if (result.success) {
                                        Alert.alert(
                                            "Success",
                                            `Updated ${result.updatedMeals} meal${result.updatedMeals !== 1 ? 's' : ''} with your profile information.`,
                                            [{ text: "OK", onPress: () => fetchMealEntries() }]
                                        );
                                    } else {
                                        Alert.alert("Error", "Failed to update meals. Please try again later.");
                                    }
                                }
                            }
                        ]
                    );
                }
            }
        } catch (err: any) {
            console.error('Error fetching meal entries:', err);
            if (isMountedRef.current) {
                setError(`Failed to load meals: ${err.message}`);
                // Remove alert when returning from deletion - just log the error
                console.log('Silenced error alert for food passport entries');
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
        fetchMealEntries();
    };
    
    // Apply filter to meals - now handles multiple filters
    const applyFilter = () => {
        if (!meals.length) {
            console.log('No meals to filter');
            setFilteredMeals([]);
            return;
        }
        
        // Check if we have meals with metadata for debugging
        const mealsWithMetadata = meals.filter(meal => meal.aiMetadata);
        const mealsWithEnrichedMetadata = meals.filter(meal => meal.metadata_enriched);
        console.log(`FoodPassport: Found ${mealsWithMetadata.length} meals with aiMetadata, ${mealsWithEnrichedMetadata.length} with metadata_enriched out of ${meals.length} total`);
        
        // Print some sample data to understand the structure
        if (meals.length > 0) {
            console.log('FoodPassport: Sample meal data (first meal):', {
                id: meals[0].id,
                meal: meals[0].meal,
                restaurant: meals[0].restaurant,
                city: meals[0].city,
                locationCity: meals[0].location?.city,
                aiMetadata: meals[0].aiMetadata,
                metadata_enriched: meals[0].metadata_enriched
            });
        }
        
        // If no filters are active, show all meals (but still need to check for rating filters)
        if ((!activeFilters || activeFilters.length === 0) && (!activeRatingFilters || activeRatingFilters.length === 0)) {
            console.log('No active filters, showing all meals');
            setFilteredMeals(meals);
            return;
        }
        
        console.log(`Applying ${activeFilters?.length || 0} filters and ${activeRatingFilters?.length || 0} rating filters:`, JSON.stringify(activeFilters), activeRatingFilters);
        
        // Start with all meals
        let result = [...meals];
        
        // Apply each filter sequentially
        if (activeFilters && activeFilters.length > 0) {
            activeFilters.forEach(filter => {
            const countBefore = result.length;
            console.log(`Applying filter: ${filter.type} = ${filter.value}`);
            
            if (filter.type === 'cuisineType') {
                result = result.filter(meal => {
                    // Check old aiMetadata format
                    if (meal.aiMetadata?.cuisineType && meal.aiMetadata.cuisineType === filter.value) {
                        console.log(`FoodPassport: Meal "${meal.meal}" matches cuisineType (aiMetadata): ${filter.value}`);
                        return true;
                    }
                    
                    // Check metadata_enriched format
                    if (meal.metadata_enriched?.cuisine_type && meal.metadata_enriched.cuisine_type === filter.value) {
                        console.log(`FoodPassport: Meal "${meal.meal}" matches cuisineType (metadata_enriched): ${filter.value}`);
                        return true;
                    }
                    
                    // Check enhanced_facts format
                    if (meal.enhanced_facts?.food_facts?.cuisine_type && meal.enhanced_facts.food_facts.cuisine_type === filter.value) {
                        console.log(`FoodPassport: Meal "${meal.meal}" matches cuisineType (enhanced_facts): ${filter.value}`);
                        return true;
                    }
                    
                    // Check quick_criteria_result format
                    if (meal.quick_criteria_result?.cuisine_type && meal.quick_criteria_result.cuisine_type === filter.value) {
                        console.log(`FoodPassport: Meal "${meal.meal}" matches cuisineType (quick_criteria_result): ${filter.value}`);
                        return true;
                    }
                    
                    return false;
                });
            } else if (filter.type === 'foodType') {
                result = result.filter(meal => {
                    // Check old aiMetadata format
                    if (meal.aiMetadata?.foodType) {
                        let matches = false;
                        if (Array.isArray(meal.aiMetadata.foodType)) {
                            matches = meal.aiMetadata.foodType.includes(filter.value);
                        } else {
                            matches = meal.aiMetadata.foodType === filter.value;
                        }
                        if (matches) {
                            console.log(`FoodPassport: Meal "${meal.meal}" matches foodType (aiMetadata): ${filter.value}`);
                            return true;
                        }
                    }
                    
                    // Check metadata_enriched format
                    if (meal.metadata_enriched?.dish_general && meal.metadata_enriched.dish_general === filter.value) {
                        console.log(`FoodPassport: Meal "${meal.meal}" matches foodType (metadata_enriched): ${filter.value}`);
                        return true;
                    }
                    
                    // Check enhanced_facts format
                    if (meal.enhanced_facts?.food_facts?.dish_general && meal.enhanced_facts.food_facts.dish_general === filter.value) {
                        console.log(`FoodPassport: Meal "${meal.meal}" matches foodType (enhanced_facts): ${filter.value}`);
                        return true;
                    }
                    
                    // Check quick_criteria_result format
                    if (meal.quick_criteria_result?.dish_general && meal.quick_criteria_result.dish_general === filter.value) {
                        console.log(`FoodPassport: Meal "${meal.meal}" matches foodType (quick_criteria_result): ${filter.value}`);
                        return true;
                    }
                    
                    return false;
                });
            } else if (filter.type === 'city') {
                result = result.filter(meal => {
                    // First check if city is stored as top-level city property
                    if (meal.city) {
                        const matches = meal.city.toLowerCase() === filter.value.toLowerCase();
                        if (matches) {
                            console.log(`Meal "${meal.meal}" matches city (top-level): ${filter.value}`);
                        }
                        return matches;
                    }
                    
                    // Next check if city is stored in location.city
                    if (meal.location && meal.location.city) {
                        const matches = meal.location.city.toLowerCase() === filter.value.toLowerCase();
                        if (matches) {
                            console.log(`Meal "${meal.meal}" matches city (location): ${filter.value}`);
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
                                console.log(`Meal "${meal.meal}" matches city (restaurant): ${filter.value}`);
                            }
                            return matches;
                        }
                    }
                    return false;
                });
            } else if (filter.type === 'dishName') {
                result = result.filter(meal => {
                    // Check basic meal name
                    if (meal.meal && meal.meal.toLowerCase().includes(filter.value.toLowerCase())) {
                        console.log(`FoodPassport: Meal "${meal.meal}" matches dishName (basic): ${filter.value}`);
                        return true;
                    }
                    
                    // Check metadata_enriched.dish_specific
                    if (meal.metadata_enriched?.dish_specific && 
                        meal.metadata_enriched.dish_specific.toLowerCase().includes(filter.value.toLowerCase())) {
                        console.log(`FoodPassport: Meal "${meal.meal}" matches dishName (metadata_enriched): ${filter.value}`);
                        return true;
                    }
                    
                    // Check enhanced_facts.food_facts.dish_specific
                    if (meal.enhanced_facts?.food_facts?.dish_specific && 
                        meal.enhanced_facts.food_facts.dish_specific.toLowerCase().includes(filter.value.toLowerCase())) {
                        console.log(`FoodPassport: Meal "${meal.meal}" matches dishName (enhanced_facts): ${filter.value}`);
                        return true;
                    }
                    
                    // Check quick_criteria_result.dish_specific
                    if (meal.quick_criteria_result?.dish_specific && 
                        meal.quick_criteria_result.dish_specific.toLowerCase().includes(filter.value.toLowerCase())) {
                        console.log(`FoodPassport: Meal "${meal.meal}" matches dishName (quick_criteria_result): ${filter.value}`);
                        return true;
                    }
                    
                    return false;
                });
            } else if (filter.type === 'ingredient') {
                result = result.filter(meal => {
                    // Check metadata_enriched.key_ingredients
                    if (meal.metadata_enriched?.key_ingredients && Array.isArray(meal.metadata_enriched.key_ingredients)) {
                        const matches = meal.metadata_enriched.key_ingredients.some(ingredient => 
                            ingredient.toLowerCase().includes(filter.value.toLowerCase())
                        );
                        if (matches) {
                            console.log(`FoodPassport: Meal "${meal.meal}" matches ingredient (metadata_enriched): ${filter.value}`);
                            return true;
                        }
                    }
                    
                    // Check metadata_enriched.interesting_ingredient
                    if (meal.metadata_enriched?.interesting_ingredient && 
                        meal.metadata_enriched.interesting_ingredient.toLowerCase().includes(filter.value.toLowerCase())) {
                        console.log(`FoodPassport: Meal "${meal.meal}" matches ingredient (interesting_ingredient): ${filter.value}`);
                        return true;
                    }
                    
                    // Check enhanced_facts.food_facts.key_ingredients
                    if (meal.enhanced_facts?.food_facts?.key_ingredients && Array.isArray(meal.enhanced_facts.food_facts.key_ingredients)) {
                        const matches = meal.enhanced_facts.food_facts.key_ingredients.some(ingredient => 
                            ingredient.toLowerCase().includes(filter.value.toLowerCase())
                        );
                        if (matches) {
                            console.log(`FoodPassport: Meal "${meal.meal}" matches ingredient (enhanced_facts): ${filter.value}`);
                            return true;
                        }
                    }
                    
                    return false;
                });
            } else if (filter.type === 'restaurant') {
                result = result.filter(meal => {
                    if (meal.restaurant) {
                        // Extract just the restaurant name (remove city/state if present)
                        let restaurantName = meal.restaurant.trim();
                        if (restaurantName.includes(',')) {
                            restaurantName = restaurantName.split(',')[0].trim();
                        }

                        const matches = restaurantName.toLowerCase() === filter.value.toLowerCase();
                        if (matches) {
                            console.log(`Meal "${meal.meal}" matches restaurant: ${filter.value}`);
                        }
                        return matches;
                    }
                    return false;
                });
            }
            console.log(`After applying filter ${filter.type}=${filter.value}: ${countBefore} meals -> ${result.length} meals remain`);
            });
        }
        
        console.log(`Final filter results: ${result.length} meals match all filter criteria`);
        
        // Apply rating filters if any are active
        if (activeRatingFilters && activeRatingFilters.length > 0) {
            console.log(`FoodPassportScreen: Applying rating filters:`, activeRatingFilters);
            const beforeRatingFilter = result.length;
            result = result.filter(meal => activeRatingFilters.includes(meal.rating));
            console.log(`FoodPassportScreen: After rating filter: ${beforeRatingFilter} meals -> ${result.length} meals remain`);
        }
        
        setFilteredMeals(result);
    };
    
    // No longer need handleFilterChange as it's handled in the wrapper

    // Load accolades data functions
    const loadPixelArtEmojis = async () => {
        try {
            setEmojisLoading(true);
            const targetUserId = userId || auth().currentUser?.uid;
            if (!targetUserId) return;

            console.log(`🎨 Loading pixel art emojis for user: ${targetUserId}`);

            // Query user's meals that have pixel art (check both URL and data fields)
            const mealsQuery = await firestore()
                .collection('mealEntries')
                .where('userId', '==', targetUserId)
                .orderBy('createdAt', 'desc')
                .limit(100) // Get more meals to check
                .get();

            const emojiUrls: string[] = [];
            mealsQuery.forEach((doc) => {
                const data = doc.data();

                // Only show pixel art for meals that have been rated (rating > 0)
                if (data.rating && data.rating > 0) {
                    // Check for both pixel_art_url and pixel_art_data
                    if (data.pixel_art_url) {
                        emojiUrls.push(data.pixel_art_url);
                    } else if (data.pixel_art_data) {
                        // If it's base64 data, convert to data URI
                        emojiUrls.push(`data:image/png;base64,${data.pixel_art_data}`);
                    }
                }
            });

            console.log(`🎨 Found ${emojiUrls.length} pixel art emojis`);
            setPixelArtEmojis(emojiUrls);
        } catch (error) {
            console.error('Error loading pixel art emojis:', error);
        } finally {
            setEmojisLoading(false);
        }
    };

    const loadAllChallenges = async () => {
        try {
            setChallengesLoading(true);
            const targetUserId = userId || auth().currentUser?.uid;
            console.log(`🍽️ Loading all challenges for user: ${targetUserId}`);

            // Get challenges for the target user
            const challenges = await getUserChallenges(targetUserId);
            console.log(`🍽️ Found ${challenges.length} total challenges for user ${targetUserId}`);

            // Sort challenges: incomplete first, then completed
            const sortedChallenges = [...challenges].sort((a, b) => {
                if (a.status === 'completed' && b.status !== 'completed') return 1;
                if (a.status !== 'completed' && b.status === 'completed') return -1;
                return 0;
            });

            setAllChallenges(sortedChallenges);
        } catch (error) {
            console.error('Error loading challenges:', error);
        } finally {
            setChallengesLoading(false);
        }
    };

    const loadCities = async () => {
        try {
            setCitiesLoading(true);

            const targetUserId = userId || auth().currentUser?.uid;
            if (!targetUserId) return;

            console.log(`🌎 Loading cities for user: ${targetUserId}`);

            // Get user document to get unique cities
            const userDoc = await firestore().collection('users').doc(targetUserId).get();
            const userData = userDoc.data();
            const uniqueCities = userData?.uniqueCities || [];

            // Load city images and count meals per city
            const citiesWithData: City[] = [];

            // Get meal counts per city
            const mealsQuery = await firestore()
                .collection('mealEntries')
                .where('userId', '==', targetUserId)
                .get();

            const cityMealCounts: { [city: string]: number } = {};
            mealsQuery.docs.forEach(doc => {
                const data = doc.data();
                const city = data.location?.city;
                if (city) {
                    cityMealCounts[city] = (cityMealCounts[city] || 0) + 1;
                }
            });

            for (const cityName of uniqueCities) {
                const normalizedCityName = cityName.toLowerCase().trim().replace(/\s+/g, '-');
                const cityDoc = await firestore().collection('cityImages').doc(normalizedCityName).get();

                // Capitalize each word in the city name
                const capitalizedCityName = cityName.split(' ').map(word =>
                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                ).join(' ');

                const mealCount = cityMealCounts[cityName] || cityMealCounts[capitalizedCityName] || 0;

                // Get or generate passport stamp for this city
                let stampUrl: string | undefined;
                try {
                    console.log(`🏛️ FoodPassport: Getting stamp for city: ${capitalizedCityName}`);
                    const stampData = await getOrGenerateMonument(capitalizedCityName);
                    stampUrl = stampData?.monument_url;
                    console.log(`🏛️ FoodPassport: Got stamp for ${capitalizedCityName}:`, stampUrl ? 'success' : 'failed');
                } catch (error) {
                    console.log(`🏛️ FoodPassport: Error getting stamp for ${capitalizedCityName}:`, error);
                }

                if (cityDoc.exists) {
                    const cityData = cityDoc.data();
                    if (cityData.imageUrl) {
                        citiesWithData.push({
                            name: capitalizedCityName,
                            imageUrl: cityData.imageUrl,
                            mealCount: mealCount,
                            stampUrl: stampUrl
                        });
                    }
                } else {
                    // Use placeholder if no image exists
                    citiesWithData.push({
                        name: capitalizedCityName,
                        imageUrl: 'https://via.placeholder.com/350',
                        mealCount: mealCount,
                        stampUrl: stampUrl
                    });
                }
            }

            // Sort cities by meal count (highest first)
            citiesWithData.sort((a, b) => b.mealCount - a.mealCount);

            console.log(`🌎 Found ${citiesWithData.length} cities for user`);
            setCities(citiesWithData);
        } catch (error) {
            console.error('Error loading cities:', error);
        } finally {
            setCitiesLoading(false);
        }
    };

    const loadCuisines = async () => {
        try {
            setCuisinesLoading(true);

            const targetUserId = userId || auth().currentUser?.uid;
            if (!targetUserId) return;

            console.log(`🍳 Loading cuisines for user: ${targetUserId}`);

            // Get user document to get unique cuisines
            const userDoc = await firestore().collection('users').doc(targetUserId).get();
            const userData = userDoc.data();
            const uniqueCuisines = userData?.uniqueCuisines || [];

            // Load cuisine data and count meals per cuisine
            const cuisinesWithData: Cuisine[] = [];

            // Get meal counts per cuisine
            const mealsQuery = await firestore()
                .collection('mealEntries')
                .where('userId', '==', targetUserId)
                .get();

            const cuisineMealCounts: { [cuisine: string]: number } = {};
            mealsQuery.docs.forEach(doc => {
                const data = doc.data();
                // Primary source: metadata_enriched.cuisine_type
                let cuisine = data.metadata_enriched?.cuisine_type;

                // Fallback sources
                if (!cuisine) {
                    cuisine = data.quick_criteria_result?.cuisine_type ||
                             data.enhanced_facts?.food_facts?.cuisine_type ||
                             data.aiMetadata?.cuisineType;
                }

                if (cuisine) {
                    cuisine = cuisine.toLowerCase().trim();
                    if (cuisine !== 'unknown' && cuisine !== 'n/a' && cuisine !== '' && cuisine !== 'null') {
                        cuisineMealCounts[cuisine] = (cuisineMealCounts[cuisine] || 0) + 1;
                    }
                }
            });

            for (const cuisineName of uniqueCuisines) {
                const normalizedCuisineName = cuisineName.toLowerCase().trim().replace(/\s+/g, '-');

                // Capitalize cuisine name for display
                const capitalizedCuisineName = cuisineName.split(' ').map(word =>
                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                ).join(' ');

                const mealCount = cuisineMealCounts[cuisineName] || cuisineMealCounts[normalizedCuisineName] || cuisineMealCounts[capitalizedCuisineName] || 0;

                // For now, use a placeholder image
                cuisinesWithData.push({
                    name: capitalizedCuisineName,
                    imageUrl: 'https://via.placeholder.com/350',
                    mealCount: mealCount
                });
            }

            // Sort cuisines by meal count (highest first)
            cuisinesWithData.sort((a, b) => b.mealCount - a.mealCount);

            console.log(`🍳 Found ${cuisinesWithData.length} cuisines for user`);
            setCuisines(cuisinesWithData);
        } catch (error) {
            console.error('Error loading cuisines:', error);
        } finally {
            setCuisinesLoading(false);
        }
    };

    const loadRestaurants = async () => {
        try {
            setRestaurantsLoading(true);

            const targetUserId = userId || auth().currentUser?.uid;
            if (!targetUserId) return;

            console.log(`🍽️ Loading restaurants for user: ${targetUserId}`);

            // Get user document to get unique restaurants
            const userDoc = await firestore().collection('users').doc(targetUserId).get();
            const userData = userDoc.data();
            const uniqueRestaurants = userData?.uniqueRestaurants || [];

            // Get meal counts per restaurant
            const mealsQuery = await firestore()
                .collection('mealEntries')
                .where('userId', '==', targetUserId)
                .get();

            const restaurantMealCounts: { [restaurant: string]: number } = {};
            mealsQuery.docs.forEach(doc => {
                const data = doc.data();
                if (data.restaurant) {
                    let restaurantName = data.restaurant.trim();

                    // If restaurant includes city/state, extract just the name
                    if (restaurantName.includes(',')) {
                        const parts = restaurantName.split(',');
                        restaurantName = parts[0].trim();
                    }

                    if (restaurantName && restaurantName !== '' && restaurantName.toLowerCase() !== 'unknown' && restaurantName.toLowerCase() !== 'n/a') {
                        restaurantMealCounts[restaurantName] = (restaurantMealCounts[restaurantName] || 0) + 1;
                    }
                }
            });

            const restaurantsWithData: Restaurant[] = [];

            for (const restaurantName of uniqueRestaurants) {
                const mealCount = restaurantMealCounts[restaurantName] || 0;

                if (mealCount > 0) {
                    restaurantsWithData.push({
                        name: restaurantName,
                        mealCount: mealCount
                    });
                }
            }

            // Sort restaurants by meal count (highest first)
            restaurantsWithData.sort((a, b) => b.mealCount - a.mealCount);

            console.log(`🍽️ Found ${restaurantsWithData.length} restaurants for user`);
            setRestaurants(restaurantsWithData);
        } catch (error) {
            console.error('Error loading restaurants:', error);
        } finally {
            setRestaurantsLoading(false);
        }
    };

    // Helper functions for accolades section
    const renderTextWithBold = (text: string) => {
        if (!text) return null;

        // Split by double asterisks
        const parts = text.split(/\*\*(.*?)\*\*/g);

        return (
            <Text style={styles.detailDescription}>
                {parts.map((part, index) => {
                    // Even indices are regular text, odd indices are bold
                    if (index % 2 === 0) {
                        return <Text key={index}>{part}</Text>;
                    } else {
                        return <Text key={index} style={{ fontWeight: 'bold' }}>{part}</Text>;
                    }
                })}
            </Text>
        );
    };

    const handleShareChallenge = async (challenge: UserChallenge) => {
        try {
            // Create a shareable challenge in public collection
            const publicChallengeRef = await firestore()
                .collection('publicChallenges')
                .add({
                    ...challenge,
                    sharedBy: auth().currentUser?.uid,
                    sharedAt: firestore.FieldValue.serverTimestamp(),
                    originalChallengeId: challenge.challenge_id
                });

            const shareableLink = `forkful://challenge/${publicChallengeRef.id}`;
            const message = `Join me on a food challenge! ${challenge.recommended_dish_name}`;

            const result = await Share.share({
                message: `${message}\n${shareableLink}`,
                title: 'Food Challenge from Forkful',
                url: shareableLink
            });

            if (result.action === Share.sharedAction) {
                console.log('Challenge shared successfully');
            }
        } catch (error) {
            console.error('Error sharing challenge:', error);
            Alert.alert('Error', 'Failed to share challenge');
        }
    };

    const handleDeleteChallenge = async (challenge: UserChallenge) => {
        Alert.alert(
            'Delete Challenge',
            `Are you sure you want to delete the challenge "${challenge.recommended_dish_name}"?`,
            [
                {
                    text: 'Cancel',
                    style: 'cancel'
                },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const success = await deleteChallenge(challenge.challenge_id);
                            if (success) {
                                // Refresh challenges list
                                const updatedChallenges = await getUserChallenges();
                                setAllChallenges(updatedChallenges);
                                setSelectedChallenge(null);
                                Alert.alert('Success', 'Challenge deleted');
                            } else {
                                Alert.alert('Error', 'Failed to delete challenge');
                            }
                        } catch (error) {
                            console.error('Error deleting challenge:', error);
                            Alert.alert('Error', 'Failed to delete challenge');
                        }
                    }
                }
            ]
        );
    };

    const viewMealDetails = (meal: MealEntry) => {
        console.log("Navigating to meal detail with ID:", meal.id);
        navigation.navigate('MealDetail', {
            mealId: meal.id,
            previousScreen: 'FoodPassport',
            // Pass passport context for proper back navigation
            passportUserId: userId,
            passportUserName: userName,
            passportUserPhoto: userPhoto
        });
    };
    
    const handleImageError = (mealId: string) => {
        // Prevent excessive logging of the same image error
        if (!imageErrors[mealId]) {
            console.log(`Image load error for meal: ${mealId}`);
            setImageErrors(prev => ({...prev, [mealId]: true}));
        }
    };

    const handleFollowToggle = async () => {
        if (!userId || !userProfile) return;
        
        setFollowLoading(true);
        try {
            if (isUserFollowing) {
                const result = await unfollowUser(userId);
                if (result.success) {
                    setIsUserFollowing(false);
                    // Removed success alert - silent operation
                } else {
                    Alert.alert('Error', result.message);
                }
            } else {
                const result = await followUser(userId, userProfile.displayName, userProfile.photoURL);
                if (result.success) {
                    setIsUserFollowing(true);
                    // Removed success alert - silent operation
                } else {
                    Alert.alert('Error', result.message);
                }
            }
        } catch (error) {
            console.error('Error toggling follow:', error);
            Alert.alert('Error', 'Failed to update follow status');
        } finally {
            setFollowLoading(false);
        }
    };

    // Simplified Image Picker function for debugging

    const openImagePicker = async () => {
      console.log('Opening image picker with EXIF data extraction');

      const options = {
        mediaType: 'photo',
        includeBase64: false,
        maxHeight: 2000,
        maxWidth: 2000,
        quality: 0.8,
      };

      try {
        // Use the Promise API
        const result = await ImagePicker.launchImageLibrary(options);

        if (result.didCancel) {
          console.log('User cancelled image picker');
          return;
        }

        if (result.errorCode) {
          console.log('Image picker error:', result.errorCode, result.errorMessage);
          Alert.alert('Error', 'There was an error selecting the image.');
          return;
        }

        if (!result.assets || result.assets.length === 0) {
          console.log('No assets returned from picker');
          return;
        }

        const selectedImage = result.assets[0];

        if (!selectedImage.uri) {
          Alert.alert('Error', 'Could not get image data. Please try another image.');
          return;
        }

        // Use the clean URI directly without any modifications
        const imageUri = selectedImage.uri;
        console.log(`Selected image with URI: ${imageUri}`);

        // Create a simple photo object for the crop screen
        const photoObject = {
          uri: imageUri,
          width: selectedImage.width || 1000,
          height: selectedImage.height || 1000
        };

        // Try to extract EXIF data including location
        try {
          console.log("Attempting to extract EXIF data from image");
          const exifData = await Exif.getExif(imageUri);
          console.log("EXIF data retrieved:", JSON.stringify(exifData));

          // Check if GPS data is available in the EXIF
          if (exifData && exifData.GPSLatitude && exifData.GPSLongitude) {
            console.log("EXIF GPS data found:", {
              lat: exifData.GPSLatitude,
              lng: exifData.GPSLongitude
            });

            // Create a location object from EXIF data
            const location = {
              latitude: parseFloat(exifData.GPSLatitude),
              longitude: parseFloat(exifData.GPSLongitude),
              source: 'exif'
            };

            // Navigate directly to RatingScreen2 with EXIF location data
            navigation.navigate('RatingScreen2', {
              photo: photoObject,
              location: location,
              exifData: exifData, // Pass the full EXIF data for potential future use
              _navigationKey: `image_${Date.now()}`,
              photoSource: 'gallery',
              rating: 0,
              likedComment: '',
              dislikedComment: ''
            });
            return;
          } else {
            console.log("No EXIF GPS data found in the image, falling back to device location");
          }
        } catch (exifError) {
          console.log("Error extracting EXIF data:", exifError);
          console.log("Falling back to device location");
        }

        // Fallback to device location if EXIF extraction fails or no GPS data
        Geolocation.getCurrentPosition(
          position => {
            const location = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              source: 'device'
            };

            // Navigate directly to RatingScreen2 with device location as fallback
            navigation.navigate('RatingScreen2', {
              photo: photoObject,
              location: location,
              // Generate a unique navigation key
              _navigationKey: `image_${Date.now()}`,
              photoSource: 'gallery',
              rating: 0,
              likedComment: '',
              dislikedComment: ''
            });
          },
          error => {
            console.log('Location error:', error);

            // Navigate directly to RatingScreen2 without location info
            navigation.navigate('RatingScreen2', {
              photo: photoObject,
              location: null,
              _navigationKey: `image_${Date.now()}`,
              photoSource: 'gallery',
              rating: 0,
              likedComment: '',
              dislikedComment: ''
            });
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
      } catch (error) {
        console.error('Unexpected error in image picker:', error);
        Alert.alert('Error', 'An unexpected error occurred while selecting an image.');
      }
    };
    
    // Photo selection handlers
    const openCamera = () => {
        setShowPhotoMenu(false);
        navigation.navigate('Camera');
    };

    const selectFromGallery = async () => {
        setShowPhotoMenu(false);
        
        try {
            console.log("Opening gallery from Food Passport");
            const photoAsset = await getPhotoWithMetadata();
            
            if (!photoAsset) {
                console.log("No photo selected from gallery");
                return;
            }
            
            console.log("Photo selected from gallery:", {
                uri: photoAsset.uri,
                hasLocation: !!photoAsset.location
            });
            
            // Navigate to RatingScreen2 with the selected photo
            const timestamp = new Date().getTime();
            const navigationKey = `gallery_photo_${timestamp}`;
            
            navigation.navigate('RatingScreen2', {
                photo: {
                    uri: photoAsset.uri,
                    width: photoAsset.width,
                    height: photoAsset.height,
                    originalUri: photoAsset.originalUri,
                    fromGallery: true,
                    assetId: photoAsset.assetId,
                },
                location: photoAsset.location || null,
                exifData: photoAsset.exifData,
                photoSource: 'gallery',
                _uniqueKey: navigationKey,
                rating: 0,
                likedComment: '',
                dislikedComment: ''
            });
        } catch (error) {
            console.error("Error selecting photo from gallery:", error);
            Alert.alert(
                "Gallery Error", 
                "There was a problem accessing your photo library. Please try again."
            );
        }
    };

    const signOut = async () => {
        try {
            console.log("Starting sign out process");

            // No need to call getAuth again, use the imported auth directly

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

    // Share passport function
    const handleSharePassport = async () => {
        try {
            await Share.share({
                message: 'Download Forkful and check out my passport!',
            });
        } catch (error) {
            console.error('Error sharing:', error);
        }
    };
    
    // Render functions for accolades sections
    const renderEmojiItem = ({ item }: { item: string }) => (
        <View style={styles.emojiItem}>
            <Image
                source={{ uri: item }}
                style={styles.emojiImage}
                resizeMode="contain"
            />
        </View>
    );

    const renderChallengeItem = ({ item }: { item: UserChallenge }) => {
        const isCompleted = item.status === 'completed';

        return (
            <TouchableOpacity
                style={[
                    styles.stampItem,
                    styles.challengeItem,
                    isCompleted && styles.completedChallengeItem
                ]}
                onPress={() => setSelectedChallenge(item)}
            >
                {/* Completion status indicator */}
                {isCompleted && (
                    <View style={styles.challengeStatusIndicator}>
                        <Text style={styles.checkmarkText}>✓</Text>
                    </View>
                )}

                <View style={styles.stampIconContainer}>
                    {item.image_data ? (
                        <Image
                            source={{ uri: item.image_data }}
                            style={[
                                styles.challengeEmojiImage,
                                isCompleted && styles.completedChallengeImage
                            ]}
                            resizeMode="contain"
                        />
                    ) : (
                        <Icon
                            name="restaurant"
                            size={40}
                            color={isCompleted ? "#999" : "#ff6b6b"}
                        />
                    )}
                </View>

                <Text
                    style={[
                        styles.stampName,
                        styles.earnedStampText,
                        isCompleted && styles.completedChallengeText
                    ]}
                    numberOfLines={2}
                >
                    {item.recommended_dish_name}
                </Text>

                {isCompleted && item.completedWithDish && (
                    <Text style={styles.completedWithText} numberOfLines={1}>
                        ✓ {item.completedWithDish}
                    </Text>
                )}
            </TouchableOpacity>
        );
    };

    const renderCityItem = ({ item }: { item: City }) => (
        <TouchableOpacity
            style={styles.cityItem}
            onPress={() => {
                if (navigation && onFilterChange && onTabChange) {
                    // Create city filter
                    const cityFilter: FilterItem = {
                        type: 'city',
                        value: item.name.toLowerCase(),
                        label: item.name
                    };

                    // Set the filter
                    onFilterChange([cityFilter]);

                    // Switch to meals tab (index 0)
                    onTabChange(0);
                } else {
                    // Fallback if functions not available
                    Alert.alert('View City', `Showing meals for ${item.name}`);
                }
            }}
        >
            <View style={styles.cityImageContainer}>
                {item.stampUrl ? (
                    <Image
                        source={{ uri: item.stampUrl }}
                        style={styles.cityImage}
                        resizeMode="contain"
                    />
                ) : (
                    <Image
                        source={{ uri: item.imageUrl }}
                        style={styles.cityImage}
                        resizeMode="cover"
                    />
                )}
            </View>
            <Text style={styles.cityName} numberOfLines={1}>
                {item.name}
            </Text>
            <Text style={styles.cityMealCount} numberOfLines={1}>
                {item.mealCount} {item.mealCount === 1 ? 'meal' : 'meals'}
            </Text>
        </TouchableOpacity>
    );

    const renderCuisineItem = ({ item }: { item: Cuisine }) => (
        <TouchableOpacity
            style={styles.cuisineItem}
            onPress={() => {
                if (navigation && onFilterChange && onTabChange) {
                    // Create cuisine filter
                    const cuisineFilter: FilterItem = {
                        type: 'cuisineType',
                        value: item.name,
                        label: item.name
                    };

                    // Set the filter
                    onFilterChange([cuisineFilter]);

                    // Switch to meals tab (index 0)
                    onTabChange(0);
                } else {
                    // Fallback if functions not available
                    Alert.alert('View Cuisine', `Showing meals for ${item.name}`);
                }
            }}
        >
            <View style={styles.cuisineImageContainer}>
                <Image
                    source={{ uri: item.imageUrl }}
                    style={styles.cuisineImage}
                    resizeMode="cover"
                />
            </View>
            <Text style={styles.cuisineName} numberOfLines={1}>
                {item.name}
            </Text>
            <Text style={styles.cuisineMealCount} numberOfLines={1}>
                {item.mealCount} {item.mealCount === 1 ? 'meal' : 'meals'}
            </Text>
        </TouchableOpacity>
    );

    const renderRestaurantItem = ({ item }: { item: Restaurant }) => (
        <TouchableOpacity
            style={styles.restaurantListItem}
            onPress={() => {
                if (navigation && onFilterChange && onTabChange) {
                    // Create restaurant filter
                    const restaurantFilter: FilterItem = {
                        type: 'restaurant',
                        value: item.name,
                        label: item.name
                    };

                    // Set the filter
                    onFilterChange([restaurantFilter]);

                    // Switch to meals tab (index 0)
                    onTabChange(0);
                } else {
                    // Fallback if functions not available
                    Alert.alert('View Restaurant', `Showing meals for ${item.name}`);
                }
            }}
        >
            <Text style={styles.restaurantListName} numberOfLines={1}>
                {item.name}
            </Text>
        </TouchableOpacity>
    );

    // Generate pie chart data for cities
    const generateCitiesPieData = () => {
        if (!cities.length) return [];

        // Generate bright, fresh color palette complementing sage green
        const sageColors = [
            '#5B8A72', // Sage green
            '#A8E6CF', // Mint green
            '#FFD3B6', // Butter yellow
            '#FF8B94', // Coral
            '#A8D8EA', // Sky blue
            '#FFB7C3', // Soft pink
            '#8DD3C7', // Light teal
            '#C9B1E4', // Lavender
            '#FFAAA5', // Peach
            '#B4E7D3', // Pale mint
        ];

        return cities.slice(0, 10).map((city, index) => ({
            name: city.name,
            population: city.mealCount,
            color: sageColors[index % sageColors.length],
            legendFontColor: colors.textSecondary,
            legendFontSize: 12,
        }));
    };

    const renderCitiesPieChart = () => {
        if (!cities.length) return null;

        const pieData = generateCitiesPieData();

        return (
            <View style={styles.pieChartContainer}>
                <Text style={styles.pieChartTitle}>Meals by City (Top 10)</Text>
                <PieChart
                    data={pieData}
                    width={width - 40}
                    height={200}
                    chartConfig={{
                        color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                        labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                    }}
                    accessor="population"
                    backgroundColor="transparent"
                    paddingLeft="0"
                    absolute
                />
            </View>
        );
    };

    // Function to render each meal item
    const renderMealItem = ({ item }: { item: MealEntry }) => {
        const isUnrated = item.rating === 0 || item.isUnrated === true;
        const isUnratedCameraCapture = item.isUnrated === true && item.photoSource === 'camera';

        return (
            <TouchableOpacity
                style={styles.mealCard}
                onPress={() => {
                    if (isUnrated) {
                        // Path 1 (camera capture): Navigate to RatingScreen2 to enter meal details
                        if (isUnratedCameraCapture) {
                            navigation.navigate('RatingScreen2', {
                                isUnratedMeal: true,
                                existingMealId: item.id,
                                photo: item.photoUrl ? { uri: item.photoUrl } : null,
                                location: item.location || null,
                                photoSource: 'camera',
                                _uniqueKey: `unrated_${item.id}_${Date.now()}`,
                                rating: 0,
                                thoughts: '',
                                meal: item.meal || '',
                                restaurant: item.restaurant || '',
                                isEditingExisting: false
                            });
                        } else {
                            // Other unrated meals: Navigate to EditMealScreen
                            navigation.navigate('EditMeal', {
                                mealId: item.id,
                                meal: item,
                                previousScreen: 'FoodPassport',
                                previousTabIndex: tabIndex,
                                passportUserId: userId,
                                passportUserName: userName,
                                passportUserPhoto: userPhoto
                            });
                        }
                    } else {
                        // Navigate to meal detail for rated meals
                        viewMealDetails(item);
                    }
                }}
            >
                <View style={styles.imageContainer}>
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
                    
                    {/* Show "Rate Meal" overlay for unrated meals */}
                    {isUnrated && (
                        <>
                            {/* Gray wash overlay over entire image */}
                            <View style={styles.imageWashOverlay} />
                            {/* Rate Meal text overlay */}
                            <View style={styles.rateMealOverlay}>
                                <Text style={styles.rateMealText}>Click to review meal</Text>
                            </View>
                            {/* Badge for unrated camera captures */}
                            {isUnratedCameraCapture && (
                                <View style={styles.unratedBadge}>
                                    <Text style={styles.unratedBadgeText}>NEW</Text>
                                </View>
                            )}
                        </>
                    )}
                </View>

                <View style={styles.mealCardContent}>
                    <Text style={styles.mealName} numberOfLines={1}>{item.meal || 'Untitled meal'}</Text>
                    {item.restaurant && (
                        <Text style={styles.restaurantName} numberOfLines={1}>{item.restaurant}</Text>
                    )}

                    {/* Rating emoji/pixel art in bottom right */}
                    {!isUnrated && (
                        <View style={styles.ratingOverlay}>
                            {/* Show pixel art icon if available, otherwise fallback to emoji rating */}
                            {(item.pixel_art_url || item.pixel_art_data) ? (
                                <Image
                                    source={{ uri: item.pixel_art_url || `data:image/png;base64,${item.pixel_art_data}` }}
                                    style={{ width: 28, height: 28 }}
                                    resizeMode="contain"
                                />
                            ) : (
                                <EmojiDisplay rating={item.rating} size={22} />
                            )}
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        );
    };
    
    // Render the main screen
    return (
        <SafeAreaView style={styles.container}>
            {/* Filter is now in the wrapper component */}

            {loading && !refreshing ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#1a2b49" />
                </View>
            ) : (
                    <FlatList
                        data={filteredMeals}
                        renderItem={renderMealItem}
                        keyExtractor={(item) => item.id}
                        numColumns={2}
                        columnWrapperStyle={styles.row}
                        contentContainerStyle={styles.list}
                        ListHeaderComponent={() => (
                            <>
                                {/* Forkful Logo - only show on own profile */}
                                {(!userId || userId === auth().currentUser?.uid) && (
                                    <View style={styles.logoContainer}>
                                        <Image
                                            source={require('../assets/forkful_logos/forkful_logo_cursive2.png')}
                                            style={styles.logoImage}
                                            resizeMode="contain"
                                        />
                                    </View>
                                )}
                            </>
                        )}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={handleRefresh}
                                colors={['#ff6b6b']}
                            />
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                {activeFilters && activeFilters.length > 0 ? (
                                    <>
                                        <Text style={styles.emptyText}>No meals match your filters</Text>
                                        <Text style={styles.emptySubtext}>
                                            Try different filters or clear your search
                                        </Text>
                                    </>
                                ) : isOwnProfile ? (
                                    <>
                                        <Text style={styles.emptyText}>Welcome to your Food Passport!</Text>
                                        <Text style={styles.emptySubText}>
                                            <Text style={[styles.emptySubText, {fontWeight: 'bold'}]}>Track your culinary journey</Text>
                                            <Text> while enjoying a more </Text>
                                            <Text style={styles.highlightedWord}>insightful</Text>
                                            <Text style={[styles.emptySubText, {fontWeight: 'bold'}]}> eating experience</Text>
                                            <Text>.</Text>
                                        </Text>
                                        <Text style={styles.tryItOutText}>Upload a meal to try it out!</Text>
                                        <Text style={styles.downArrow}>↓</Text>
                                    </>
                                ) : (
                                    <>
                                        <Text style={styles.emptyText}>User is planning on posting meals soon!</Text>
                                    </>
                                )}
                            </View>
                        }
                        ListFooterComponent={() => (
                            <View>
                                {/* Accolades Section */}
                                <View style={styles.accoladesContainer}>
                                    {/* I've Eaten Section - Pixel Art Emojis */}
                                    {!emojisLoading && pixelArtEmojis.length > 0 && (
                                        <>
                                            <Text style={styles.sectionTitle}>Meals Eaten:</Text>
                                            <ScrollView
                                                horizontal
                                                showsHorizontalScrollIndicator={false}
                                                style={styles.challengeCarousel}
                                                contentContainerStyle={styles.challengeCarouselContent}
                                            >
                                                {pixelArtEmojis.map((item, index) => (
                                                    <View key={`emoji_${index}`} style={styles.emojiCarouselWrapper}>
                                                        {renderEmojiItem({ item, index: 0, separators: null as any })}
                                                    </View>
                                                ))}
                                            </ScrollView>
                                        </>
                                    )}

                                    {/* All Challenges Section */}
                                    {!challengesLoading && allChallenges.length > 0 && (
                                        <>
                                            <Text style={styles.sectionTitle}>Food Challenges</Text>
                                            <ScrollView
                                                horizontal
                                                showsHorizontalScrollIndicator={false}
                                                style={styles.challengeCarousel}
                                                contentContainerStyle={styles.challengeCarouselContent}
                                            >
                                                {allChallenges.map(item => (
                                                    <View key={item.challenge_id} style={styles.carouselItemWrapper}>
                                                        {renderChallengeItem({ item, index: 0, separators: null as any })}
                                                    </View>
                                                ))}
                                            </ScrollView>
                                        </>
                                    )}

                                    {/* Cities Section */}
                                    {!citiesLoading && cities.length > 0 && (
                                        <>
                                            <Text style={styles.sectionTitle}>Cities</Text>

                                            <ScrollView
                                                horizontal
                                                showsHorizontalScrollIndicator={false}
                                                style={styles.challengeCarousel}
                                                contentContainerStyle={styles.challengeCarouselContent}
                                            >
                                                {cities.map(item => (
                                                    <View key={item.name} style={styles.carouselItemWrapper}>
                                                        {renderCityItem({ item, index: 0, separators: null as any })}
                                                    </View>
                                                ))}
                                            </ScrollView>

                                            {/* Cities Pie Chart */}
                                            {renderCitiesPieChart()}
                                        </>
                                    )}

                                    {/* Cuisines Section */}
                                    {!cuisinesLoading && cuisines.length > 0 && (
                                        <>
                                            <Text style={styles.sectionTitle}>Cuisines</Text>

                                            {/* Cuisines Pie Chart */}
                                            <View style={styles.pieChartContainer}>
                                                <Text style={styles.pieChartTitle}>Meals by Cuisine (Top 10)</Text>
                                                <PieChart
                                                    data={cuisines.slice(0, 10).map((cuisine, index) => ({
                                                        name: cuisine.name,
                                                        population: cuisine.mealCount,
                                                        color: [
                                                            '#5B8A72', // Sage green
                                                            '#8B7355', // Warm taupe
                                                            '#7A9B8E', // Mid sage
                                                            '#9CA986', // Light sage
                                                            '#D4C5B9', // Light beige
                                                            '#6B8E7F', // Darker sage
                                                            '#B8A89A', // Tan
                                                            '#A89F91', // Warm grey
                                                            '#C8BCB0', // Light taupe
                                                            '#E8DDD3', // Cream
                                                        ][index % 10],
                                                        legendFontColor: colors.textSecondary,
                                                        legendFontSize: 12,
                                                        legendFontFamily: 'Inter-Regular',
                                                    }))}
                                                    width={width - 40}
                                                    height={200}
                                                    chartConfig={{
                                                        color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                                                        labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                                                    }}
                                                    accessor="population"
                                                    backgroundColor="transparent"
                                                    paddingLeft="0"
                                                    absolute
                                                />
                                            </View>

                                            <ScrollView
                                                horizontal
                                                showsHorizontalScrollIndicator={false}
                                                style={styles.challengeCarousel}
                                                contentContainerStyle={styles.challengeCarouselContent}
                                            >
                                                {cuisines.map(item => (
                                                    <View key={item.name} style={styles.carouselItemWrapper}>
                                                        {renderCuisineItem({ item, index: 0, separators: null as any })}
                                                    </View>
                                                ))}
                                            </ScrollView>
                                        </>
                                    )}

                                    {/* Restaurants Section */}
                                    {!restaurantsLoading && restaurants.length > 0 && (
                                        <>
                                            <Text style={styles.sectionTitle}>Restaurants</Text>
                                            <View style={styles.restaurantsList}>
                                                {restaurants.map(item => (
                                                    <View key={item.name}>
                                                        {renderRestaurantItem({ item, index: 0, separators: null as any })}
                                                    </View>
                                                ))}
                                            </View>
                                        </>
                                    )}
                                </View>

                                {/* Share button - only show if user has meals and it's their own profile */}
                                {filteredMeals.length > 0 && (!userId || userId === auth().currentUser?.uid) && (
                                    <View style={styles.shareContainer}>
                                        <TouchableOpacity
                                            style={styles.shareButton}
                                            onPress={handleSharePassport}
                                            activeOpacity={0.8}
                                        >
                                            <Image
                                                source={require('../assets/icons/map/share.png')}
                                                style={styles.shareIcon}
                                            />
                                            <Text style={styles.shareButtonText}>Share</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        )}
                    />
            )}
            
            {/* Photo selection menu */}
            {showPhotoMenu && (
                <TouchableOpacity
                    style={styles.photoMenuOverlay}
                    onPress={() => setShowPhotoMenu(false)}
                    activeOpacity={1}
                >
                    <View style={styles.photoMenuContainer}>
                        <TouchableOpacity
                            style={styles.photoMenuItem}
                            onPress={openCamera}
                            activeOpacity={0.8}
                        >
                            <Image
                                source={require('../assets/icons/camera-inactive.png')}
                                style={{ width: 32, height: 32 }}
                            />
                            <Text style={styles.photoMenuText}>Camera</Text>
                        </TouchableOpacity>

                        <View style={styles.photoMenuDivider} />

                        <TouchableOpacity
                            style={styles.photoMenuItem}
                            onPress={selectFromGallery}
                            activeOpacity={0.8}
                        >
                            <Image
                                source={require('../assets/icons/upload-inactive.png')}
                                style={{ width: 32, height: 32 }}
                            />
                            <Text style={styles.photoMenuText}>Upload</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            )}

            {/* Challenge detail modal */}
            <Modal
                visible={selectedChallenge !== null}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setSelectedChallenge(null)}
            >
                <View style={styles.detailOverlay}>
                    <TouchableOpacity
                        style={styles.detailOverlay}
                        onPress={() => setSelectedChallenge(null)}
                        activeOpacity={1}
                    >
                        <View style={styles.detailCard}>
                            <TouchableOpacity
                                style={styles.closeButton}
                                onPress={() => setSelectedChallenge(null)}
                            >
                                <Text style={styles.closeButtonX}>×</Text>
                            </TouchableOpacity>

                            {/* Zoomed challenge image */}
                            <View style={styles.zoomedStampContainer}>
                                {selectedChallenge?.image_data ? (
                                    <Image
                                        source={{ uri: selectedChallenge.image_data }}
                                        style={styles.zoomedStampImage}
                                        resizeMode="contain"
                                    />
                                ) : (
                                    <Icon name="restaurant" size={120} color="#ff6b6b" />
                                )}
                            </View>

                            {/* Title and description at bottom */}
                            <View style={styles.stampInfo}>
                                {selectedChallenge && (
                                    <>
                                        <Text style={styles.detailName}>
                                            {selectedChallenge.recommended_dish_name}
                                        </Text>

                                        {renderTextWithBold(
                                            selectedChallenge.challenge_description ||
                                            `${selectedChallenge.why_this_dish || ''}\n\n${selectedChallenge.what_to_notice || ''}`.trim()
                                        )}

                                        {/* Action buttons for active challenges only - only show on own profile */}
                                        {selectedChallenge.status === 'active' && (!userId || userId === auth().currentUser?.uid) && (
                                            <View style={styles.challengeActionButtons}>
                                                <TouchableOpacity
                                                    style={styles.shareButton}
                                                    onPress={() => handleShareChallenge(selectedChallenge)}
                                                >
                                                    <Text style={styles.shareButtonText}>Challenge Friend</Text>
                                                </TouchableOpacity>

                                                <TouchableOpacity
                                                    style={styles.deleteButton}
                                                    onPress={() => handleDeleteChallenge(selectedChallenge)}
                                                >
                                                    <Text style={styles.deleteButtonText}>Delete Challenge</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </>
                                )}
                            </View>
                        </View>
                    </TouchableOpacity>
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
    logoContainer: {
        alignItems: 'center',
        paddingTop: spacing.sm,
        paddingBottom: spacing.md,
        backgroundColor: colors.lightTan,
    },
    logoText: {
        ...typography.h1,
        color: colors.warmTaupe,
    },
    logoImage: {
        width: 170,
        height: 57,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: spacing.md,
        backgroundColor: colors.error,
        zIndex: 10,
    },
    title: {
        ...typography.h3,
        fontWeight: 'bold',
        color: colors.white,
    },
    signOutButton: {
        padding: spacing.sm,
        backgroundColor: addAlpha(colors.white, 0.2),
        borderRadius: spacing.xs,
    },
    signOutText: {
        ...typography.bodyMedium,
        color: colors.white,
        fontWeight: '500',
    },
    filterContainer: {
        marginVertical: spacing.sm,
        paddingHorizontal: spacing.sm,
    },
    filterArea: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.mediumGray,
        zIndex: 100,
        position: 'relative',
        ...shadows.light,
        marginTop: spacing.xs,
        marginBottom: spacing.xs,
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
        backgroundColor: colors.mediumGray,
        marginHorizontal: spacing.sm,
    },
    statValue: {
        ...typography.h3,
        color: colors.charcoal,
        marginVertical: 2,
    },
    statLabel: {
        ...typography.caption,
        color: colors.textSecondary,
    },
    // Styles for the standalone button removed and integrated into profile stats
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: spacing.xxxl,
    },
    loadingText: {
        marginTop: spacing.sm,
        ...typography.bodyLarge,
        color: colors.textSecondary,
    },
    list: {
        padding: spacing.sm,
        paddingTop: spacing.xs,
        paddingBottom: spacing.xl,
    },
    row: {
        justifyContent: 'space-between',
    },
    mealCard: {
        width: itemWidth,
        marginBottom: spacing.md,
        backgroundColor: colors.white,
        borderRadius: spacing.borderRadius.md,
        ...shadows.light,
    },
    imageContainer: {
        position: 'relative',
        width: '100%',
        borderTopLeftRadius: spacing.borderRadius.md,
        borderTopRightRadius: spacing.borderRadius.md,
        overflow: 'hidden',
    },
    mealImage: {
        width: '100%',
        height: itemWidth,
        backgroundColor: colors.lightGray,
    },
    imagePlaceholder: {
        width: '100%',
        height: itemWidth,
        backgroundColor: colors.lightGray,
        justifyContent: 'center',
        alignItems: 'center',
    },
    ratingOverlay: {
        position: 'absolute',
        bottom: spacing.sm,
        right: spacing.sm,
        backgroundColor: 'transparent',
    },
    imageWashOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.overlay,
    },
    rateMealOverlay: {
        position: 'absolute',
        bottom: spacing.sm,
        left: spacing.sm,
        backgroundColor: addAlpha(colors.white, 0.9),
        borderRadius: spacing.borderRadius.md,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
        ...shadows.light,
    },
    rateMealText: {
        ...typography.caption,
        color: colors.textPrimary,
        textAlign: 'center',
    },
    unratedBadge: {
        position: 'absolute',
        top: spacing.sm,
        right: spacing.sm,
        backgroundColor: '#5B8A72',
        borderRadius: spacing.borderRadius.sm,
        paddingVertical: 4,
        paddingHorizontal: 8,
        ...shadows.medium,
    },
    unratedBadgeText: {
        ...typography.caption,
        fontSize: 10,
        fontWeight: '700',
        color: colors.white,
        letterSpacing: 0.5,
    },
    mealCardContent: {
        padding: spacing.sm,
        position: 'relative',
    },
    mealName: {
        fontFamily: 'Unna',
        fontSize: 16,
        lineHeight: 20,
        color: colors.textPrimary,
        marginBottom: spacing.xs,
        paddingRight: 30,
    },
    restaurantName: {
        ...typography.bodySmall,
        color: colors.textSecondary,
        paddingRight: 30,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
        paddingTop: spacing.xxxl,
    },
    emptyText: {
        ...typography.bodyLarge,
        color: colors.textPrimary,
        textAlign: 'center',
        marginBottom: spacing.lg,
    },
    emptySubText: {
        ...typography.bodyMedium,
        color: colors.textPrimary,
        textAlign: 'center',
        marginBottom: 0,
    },
    highlightedWord: {
        backgroundColor: colors.warmTaupe,
        paddingHorizontal: spacing.xs,
        paddingVertical: 1,
        borderRadius: spacing.xs,
        fontWeight: 'bold',
    },
    tryItOutText: {
        ...typography.bodyMedium,
        color: colors.textPrimary,
        textAlign: 'center',
        marginTop: spacing.xxxl,
        marginBottom: 0,
    },
    downArrow: {
        fontSize: 90,
        color: colors.textPrimary,
        textAlign: 'center',
        fontWeight: '50', // Ultra light weight
        lineHeight: 140, // Keep the same line height for thickness
    },
    emptySubtext: {
        ...typography.bodyMedium,
        color: colors.textTertiary,
        textAlign: 'center',
        marginTop: spacing.xs,
    },
    debugButtonsContainer: {
        flexDirection: 'row',
        marginTop: spacing.sm,
        gap: spacing.sm,
    },
    debugButton: {
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.md,
        backgroundColor: addAlpha(colors.error, 0.1),
        borderRadius: spacing.xs,
        borderWidth: 1,
        borderColor: addAlpha(colors.error, 0.3),
    },
    debugButtonText: {
        ...typography.bodySmall,
        color: colors.error,
        fontWeight: '500',
    },
    photoMenuOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        top: 0,
        backgroundColor: colors.overlay,
        justifyContent: 'center',
        alignItems: 'center',
    },
    photoMenuContainer: {
        backgroundColor: colors.white,
        borderRadius: spacing.borderRadius.md,
        ...shadows.medium,
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.xl,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
    },
    photoMenuItem: {
        alignItems: 'center',
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
    },
    photoMenuText: {
        marginTop: spacing.sm,
        ...typography.bodyMedium,
        color: colors.textPrimary,
        fontWeight: '500',
    },
    photoMenuDivider: {
        width: 1,
        height: 60,
        backgroundColor: colors.mediumGray,
    },
    shareContainer: {
        alignItems: 'center',
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.lg,
    },
    shareButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        borderWidth: 2,
        borderColor: colors.charcoal,
        borderRadius: spacing.borderRadius.sm,
        backgroundColor: 'transparent',
    },
    shareIcon: {
        width: 20,
        height: 20,
        marginRight: spacing.sm,
        tintColor: colors.charcoal,
    },
    shareButtonText: {
        ...typography.buttonLarge,
        color: colors.charcoal,
    },
    // Accolades section styles
    accoladesContainer: {
        paddingTop: spacing.sm,
    },
    sectionTitle: {
        ...typography.h2,
        marginHorizontal: spacing.md,
        marginTop: spacing.md,
        color: colors.charcoal,
    },
    stampItem: {
        width: STAMP_SIZE,
        height: STAMP_SIZE + 30,
        margin: spacing.xs,
        borderRadius: spacing.borderRadius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.sm,
        backgroundColor: colors.white,
        ...shadows.light,
    },
    stampName: {
        textAlign: 'center',
        ...typography.bodySmall,
        fontWeight: 'bold',
        marginTop: spacing.xs,
    },
    earnedStampText: {
        color: colors.charcoal,
    },
    stampIconContainer: {
        width: 60,
        height: 60,
        borderRadius: 0,
        backgroundColor: 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
        overflow: 'hidden',
    },
    challengeItem: {
        position: 'relative',
    },
    completedChallengeItem: {
        backgroundColor: colors.white,
        borderColor: colors.mediumGray,
        borderWidth: 2,
    },
    challengeStatusIndicator: {
        position: 'absolute',
        top: 5,
        right: 5,
        zIndex: 1,
    },
    checkmarkText: {
        fontSize: 18,
        color: '#4CAF50',
        fontWeight: 'bold',
        textAlign: 'center',
        lineHeight: 20,
    },
    challengeEmojiImage: {
        width: '100%',
        height: '100%',
    },
    completedChallengeImage: {
        opacity: 0.5,
    },
    completedChallengeText: {
        color: colors.textTertiary,
        textDecorationLine: 'line-through',
    },
    completedWithText: {
        ...typography.caption,
        fontSize: 9,
        color: colors.success,
        marginTop: 2,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    challengeCarousel: {
        marginTop: spacing.sm,
        marginBottom: spacing.md,
    },
    challengeCarouselContent: {
        paddingHorizontal: spacing.md,
        paddingRight: spacing.lg,
    },
    carouselItemWrapper: {
        marginRight: spacing.sm,
    },
    emojiCarouselWrapper: {
        marginRight: spacing.xs,
    },
    emojiItem: {
        width: 100,
        height: 100,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emojiImage: {
        width: '100%',
        height: '100%',
        borderRadius: spacing.borderRadius.md,
    },
    cityItem: {
        width: STAMP_SIZE,
        height: STAMP_SIZE + 25,
        margin: spacing.xs,
        alignItems: 'center',
        justifyContent: 'flex-start',
    },
    cityImageContainer: {
        width: STAMP_SIZE - 16,
        height: STAMP_SIZE - 50,
        borderRadius: spacing.borderRadius.sm,
        backgroundColor: 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        marginBottom: spacing.sm,
    },
    cityImage: {
        width: '100%',
        height: '100%',
        borderRadius: spacing.borderRadius.sm,
    },
    cityName: {
        textAlign: 'center',
        ...typography.bodySmall,
        fontWeight: 'bold',
        color: colors.charcoal,
        marginBottom: 2,
        marginTop: 0,
    },
    cityMealCount: {
        textAlign: 'center',
        ...typography.caption,
        color: colors.textSecondary,
        marginTop: 2,
    },
    cuisineItem: {
        width: STAMP_SIZE,
        height: STAMP_SIZE + 25,
        margin: spacing.xs,
        borderRadius: spacing.borderRadius.sm,
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: spacing.sm,
        backgroundColor: colors.white,
        ...shadows.light,
    },
    cuisineImageContainer: {
        width: STAMP_SIZE - 16,
        height: STAMP_SIZE - 50,
        borderRadius: spacing.borderRadius.sm,
        backgroundColor: 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        marginBottom: spacing.sm,
    },
    cuisineImage: {
        width: '100%',
        height: '100%',
        borderRadius: spacing.borderRadius.sm,
    },
    cuisineName: {
        textAlign: 'center',
        ...typography.bodyLarge,
        fontWeight: 'bold',
        color: colors.charcoal,
        marginBottom: 2,
        marginTop: -40,
    },
    cuisineMealCount: {
        textAlign: 'center',
        ...typography.bodyMedium,
        color: colors.textSecondary,
        marginTop: spacing.xs,
    },
    restaurantsList: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.sm,
    },
    restaurantListItem: {
        backgroundColor: colors.white,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        marginBottom: spacing.xs,
        borderRadius: spacing.xs,
        ...shadows.light,
    },
    restaurantListName: {
        fontFamily: 'Unna',
        fontSize: 16,
        fontWeight: '500',
        color: colors.textPrimary,
    },
    pieChartContainer: {
        alignItems: 'center',
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
        paddingHorizontal: spacing.lg,
    },
    pieChartTitle: {
        ...typography.h3,
        color: colors.charcoal,
        marginBottom: spacing.md,
    },
    detailOverlay: {
        flex: 1,
        width: '100%',
        height: '100%',
        backgroundColor: colors.overlay,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    detailCard: {
        width: itemWidth * 2.7,
        backgroundColor: colors.white,
        borderRadius: spacing.borderRadius.lg,
        alignItems: 'center',
        padding: spacing.lg,
        ...shadows.heavy,
    },
    closeButton: {
        position: 'absolute',
        top: spacing.sm,
        right: spacing.sm,
        padding: spacing.xs,
        width: 30,
        height: 30,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    closeButtonX: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.charcoal,
        textAlign: 'center',
        lineHeight: 24,
    },
    zoomedStampContainer: {
        width: 120,
        height: 120,
        borderRadius: 0,
        backgroundColor: 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.lg,
        overflow: 'hidden',
    },
    zoomedStampImage: {
        width: '100%',
        height: '100%',
    },
    stampInfo: {
        alignItems: 'center',
        paddingHorizontal: 0,
        width: '100%',
    },
    detailName: {
        ...typography.h3,
        fontWeight: 'bold',
        marginBottom: spacing.md,
        textAlign: 'center',
        color: colors.charcoal,
    },
    detailDescription: {
        ...typography.bodyMedium,
        color: colors.textPrimary,
        textAlign: 'center',
        marginBottom: spacing.md,
    },
    challengeActionButtons: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: spacing.md,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.mediumGray,
        width: '100%',
    },
    deleteButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: colors.charcoal,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: spacing.borderRadius.lg,
        flex: 0.45,
        justifyContent: 'center',
    },
    deleteButtonText: {
        ...typography.bodySmall,
        color: colors.charcoal,
        fontWeight: '600',
    },
});

export default FoodPassportScreen;