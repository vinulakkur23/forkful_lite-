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
  ScrollView
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
// Import achievement service
import { getUserAchievements } from '../services/achievementService';
import { checkIfMigrationNeeded, updateUserMealsWithProfile } from '../services/userProfileMigration';
import { getTotalCheersForUser } from '../services/cheersService';
import { refreshUserCounts } from '../services/countRefreshService';
import { getCityImageUrl, preloadCityImages } from '../services/cityImageService';

type FoodPassportScreenNavigationProp = StackNavigationProp<RootStackParamList, 'FoodPassport'>;

type Props = {
  navigation: FoodPassportScreenNavigationProp;
  activeFilters: FilterItem[] | null;
  userId?: string;
  userName?: string;
  userPhoto?: string;
  onStatsUpdate?: (stats: { totalMeals: number; totalCheers: number; badgeCount: number }) => void;
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
}

const { width } = Dimensions.get('window');
const itemWidth = (width - 40) / 2; // 2 items per row with 10px spacing

// Define the tab routes
type TabRoutes = {
  key: string;
  title: string;
};

const FoodPassportScreen: React.FC<Props> = ({ navigation, activeFilters, userId, userName, userPhoto, onStatsUpdate, onFilterChange, onTabChange }) => {
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
        badgeCount: 0
    });
    
    // State for cities and their images
    const [uniqueCities, setUniqueCities] = useState<string[]>([]);
    const [cityImages, setCityImages] = useState<{ [city: string]: string }>({});

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
    
    // Apply filter whenever meals or active filters change
    useEffect(() => {
        console.log('FoodPassportScreen: activeFilters changed:', activeFilters);
        applyFilter();
    }, [meals, activeFilters]);
    
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
            
            const querySnapshot = await firestore()
                .collection('mealEntries')
                .where('userId', '==', targetUserId)
                .orderBy('createdAt', 'desc')
                .get();
            
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
                    mealType: data.mealType || 'Restaurant',
                    comments: data.comments || { liked: '', disliked: '' }
                });
            });

            if (!isMountedRef.current) return;
            setMeals(fetchedMeals);
            // Filtered meals will be updated via the useEffect

            // Calculate profile stats
            const totalMeals = fetchedMeals.length;
            
            // Get total cheers for the user
            const totalCheers = await getTotalCheersForUser(targetUserId);

            // Get badge count
            const userAchievements = await getUserAchievements(targetUserId);
            const badgeCount = userAchievements.length;

            if (!isMountedRef.current) return;
            setProfileStats({
                totalMeals,
                totalCheers,
                badgeCount
            });
            
            // Call the stats update callback if provided
            if (onStatsUpdate) {
                onStatsUpdate({
                    totalMeals,
                    totalCheers,
                    badgeCount
                });
            }

            // Load user profile and cities
            const isOwnProfile = !userId || userId === auth().currentUser?.uid;
            
            // Load user document to get cities
            try {
                const userDoc = await firestore()
                    .collection('users')
                    .doc(targetUserId)
                    .get();
                
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const cities = userData?.uniqueCities || [];
                    
                    console.log(`🏙️ [FoodPassport] User has ${cities.length} unique cities:`, cities);
                    
                    // Capitalize and sort cities alphabetically
                    const processedCities = cities
                        .map((city: string) => {
                            // Capitalize each word in the city name
                            return city.split(' ').map(word => 
                                word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                            ).join(' ');
                        })
                        .sort(); // Sort alphabetically
                    
                    if (!isMountedRef.current) return;
                    setUniqueCities(processedCities);
                    
                    // Preload city images
                    if (processedCities.length > 0) {
                        console.log(`🏙️ [FoodPassport] Starting to preload city images for:`, processedCities);
                        preloadCityImages(processedCities).then(() => {
                            // Load city images
                            const loadCityImages = async () => {
                                console.log(`🏙️ [FoodPassport] Loading city images...`);
                                const images: { [city: string]: string } = {};
                                for (const city of processedCities) {
                                    console.log(`🏙️ [FoodPassport] Loading image for: ${city}`);
                                    images[city] = await getCityImageUrl(city);
                                    console.log(`🏙️ [FoodPassport] Loaded image for ${city}:`, images[city]);
                                }
                                if (isMountedRef.current) {
                                    console.log(`🏙️ [FoodPassport] Setting city images:`, images);
                                    setCityImages(images);
                                }
                            };
                            loadCityImages();
                        });
                    } else {
                        console.log(`🏙️ [FoodPassport] No cities to load images for`);
                    }
                } else {
                    console.log(`🏙️ [FoodPassport] User document does not exist`);
                }
            } catch (error) {
                console.error('Error loading user cities:', error);
            }
            
            if (!isOwnProfile && userId) {
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
                // Own profile
                const currentUser = auth().currentUser;
                if (currentUser) {
                    setUserProfile({
                        userId: currentUser.uid,
                        displayName: currentUser.displayName || 'User',
                        photoURL: currentUser.photoURL,
                    });
                }
            }

            // Reset image errors when fetching new data
            setImageErrors({});
            
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
                Alert.alert('Error', 'Failed to load your food passport entries');
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
        
        // Check if we have meals with aiMetadata for debugging
        const mealsWithMetadata = meals.filter(meal => meal.aiMetadata);
        console.log(`Found ${mealsWithMetadata.length} out of ${meals.length} meals with aiMetadata`);
        
        // Print some sample data to understand the structure
        if (meals.length > 0) {
            console.log('Sample meal data (first meal):', {
                id: meals[0].id,
                meal: meals[0].meal,
                restaurant: meals[0].restaurant,
                city: meals[0].city,
                locationCity: meals[0].location?.city,
                aiMetadata: meals[0].aiMetadata
            });
        }
        
        // If no filters are active, show all meals
        if (!activeFilters || activeFilters.length === 0) {
            console.log('No active filters, showing all meals');
            setFilteredMeals(meals);
            return;
        }
        
        console.log(`Applying ${activeFilters.length} filters:`, JSON.stringify(activeFilters));
        
        // Start with all meals
        let result = [...meals];
        
        // Apply each filter sequentially
        activeFilters.forEach(filter => {
            const countBefore = result.length;
            console.log(`Applying filter: ${filter.type} = ${filter.value}`);
            
            if (filter.type === 'cuisineType') {
                result = result.filter(meal => {
                    const matches = meal.aiMetadata && 
                                  meal.aiMetadata.cuisineType && 
                                  meal.aiMetadata.cuisineType === filter.value;
                    if (matches) {
                        console.log(`Meal "${meal.meal}" matches cuisineType: ${filter.value}`);
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
                        console.log(`Meal "${meal.meal}" matches foodType: ${filter.value}`);
                    }
                    return matches;
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
            }
            console.log(`After applying filter ${filter.type}=${filter.value}: ${countBefore} meals -> ${result.length} meals remain`);
        });
        
        console.log(`Final filter results: ${result.length} meals match all filter criteria`);
        setFilteredMeals(result);
    };
    
    // No longer need handleFilterChange as it's handled in the wrapper
    
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

            // Navigate with EXIF location data
            navigation.navigate('Crop', {
              photo: photoObject,
              location: location,
              exifData: exifData, // Pass the full EXIF data for potential future use
              _navigationKey: `image_${Date.now()}`
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

            // Navigate with device location as fallback
            navigation.navigate('Crop', {
              photo: photoObject,
              location: location,
              // Generate a unique navigation key
              _navigationKey: `image_${Date.now()}`
            });
          },
          error => {
            console.log('Location error:', error);

            // Navigate without location info
            navigation.navigate('Crop', {
              photo: photoObject,
              location: null,
              _navigationKey: `image_${Date.now()}`
            });
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
      } catch (error) {
        console.error('Unexpected error in image picker:', error);
        Alert.alert('Error', 'An unexpected error occurred while selecting an image.');
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
    
    // Function to render each meal item
    const renderMealItem = ({ item }: { item: MealEntry }) => {
        const isUnrated = item.rating === 0;
        
        return (
            <TouchableOpacity 
                style={styles.mealCard}
                onPress={() => {
                    if (isUnrated) {
                        // Navigate to EditMealScreen for unrated meals (just add rating and comments)
                        navigation.navigate('EditMeal', {
                            mealId: item.id,
                            meal: item,
                            // Pass navigation context so EditMeal can navigate back properly
                            previousScreen: 'FoodPassport',
                            previousTabIndex: tabIndex,
                            passportUserId: userId,
                            passportUserName: userName,
                            passportUserPhoto: userPhoto
                        });
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
                    
                    {/* Show either rating or "Rate Meal" overlay */}
                    {isUnrated ? (
                        <>
                            {/* Gray wash overlay over entire image */}
                            <View style={styles.imageWashOverlay} />
                            {/* Rate Meal text overlay */}
                            <View style={styles.rateMealOverlay}>
                                <Text style={styles.rateMealText}>Click to review meal</Text>
                            </View>
                        </>
                    ) : (
                        <View style={styles.ratingOverlay}>
                            <EmojiDisplay rating={item.rating} size={22} />
                        </View>
                    )}
                </View>
                
                <View style={styles.mealCardContent}>
                    <Text style={styles.mealName} numberOfLines={1}>{item.meal || 'Untitled meal'}</Text>
                    {item.restaurant && (
                        <Text style={styles.restaurantName} numberOfLines={1}>{item.restaurant}</Text>
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
                    <ActivityIndicator size="large" color="#ff6b6b" />
                    <Text style={styles.loadingText}>Loading your food passport...</Text>
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
                            <View style={styles.profileCard}>
                                {/* Follow button in top right corner */}
                                {userId && userId !== auth().currentUser?.uid && (
                                    <TouchableOpacity 
                                        style={styles.followButton}
                                        onPress={() => Alert.alert("Coming Soon", "Following users will be available in a future update!")}
                                    >
                                        <Text style={styles.followButtonIcon}>+</Text>
                                    </TouchableOpacity>
                                )}
                                
                                <View style={styles.profileHeader}>
                                    <View style={styles.userAvatarContainer}>
                                        {userProfile?.photoURL ? (
                                            <Image 
                                                source={{ uri: userProfile.photoURL }} 
                                                style={styles.userAvatar}
                                            />
                                        ) : (
                                            <View style={styles.defaultAvatar}>
                                                <Icon name="person" size={24} color="#666" />
                                            </View>
                                        )}
                                    </View>
                                    <View style={styles.userDetails}>
                                        <Text style={styles.userName}>{userProfile?.displayName || 'User'}</Text>
                                        <View style={styles.statsRow}>
                                            <Text style={styles.statText}>{profileStats.totalMeals} meals</Text>
                                            <Text style={styles.statSeparator}>•</Text>
                                            <Text style={styles.statText}>
                                                {profileStats.totalCheers} cheers
                                            </Text>
                                            {profileStats.badgeCount > 0 && (
                                                <>
                                                    <Text style={styles.statSeparator}>•</Text>
                                                    <Text style={styles.statText}>{profileStats.badgeCount} stamps</Text>
                                                </>
                                            )}
                                        </View>
                                        {/* Debug button - only show for own profile */}
                                        {(!userId || userId === auth().currentUser?.uid) && (
                                            <TouchableOpacity 
                                                style={styles.debugButton}
                                                onPress={async () => {
                                                    Alert.alert(
                                                        "Refresh Counts",
                                                        "This will recalculate your achievement counts (cities, cuisines, sushi, takeout) based on your actual meals. Continue?",
                                                        [
                                                            { text: "Cancel", style: "cancel" },
                                                            { 
                                                                text: "Refresh", 
                                                                onPress: async () => {
                                                                    const result = await refreshUserCounts();
                                                                    if (result.success && result.counts) {
                                                                        Alert.alert(
                                                                            "Counts Refreshed",
                                                                            `Updated counts:\n• Cities: ${result.counts.cities}\n• Cuisines: ${result.counts.cuisines}\n• Sushi meals: ${result.counts.sushi}\n• Takeout meals: ${result.counts.takeout}`,
                                                                            [{ text: "OK", onPress: () => fetchMealEntries() }]
                                                                        );
                                                                    } else {
                                                                        Alert.alert("Error", result.error || "Failed to refresh counts");
                                                                    }
                                                                }
                                                            }
                                                        ]
                                                    );
                                                }}
                                            >
                                                <Text style={styles.debugButtonText}>🔄 Refresh Counts</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>
                            </View>
                        )}
                        ListFooterComponent={() => (
                            <>
                            {/* Cities Section */}
                            {uniqueCities.length > 0 && (
                                <View style={styles.citiesSection}>
                                    <Text style={styles.citiesSectionTitle}>Cities</Text>
                                    <FlatList
                                        horizontal
                                        data={uniqueCities}
                                        keyExtractor={(city) => city}
                                        showsHorizontalScrollIndicator={false}
                                        renderItem={({ item: city }) => (
                                            <TouchableOpacity
                                                style={styles.cityItem}
                                                onPress={() => {
                                                    if (onFilterChange && onTabChange) {
                                                        // Create city filter
                                                        const cityFilter: FilterItem = {
                                                            type: 'city',
                                                            value: city.toLowerCase(), // Use lowercase for filtering (database stores lowercase)
                                                            label: city
                                                        };
                                                        
                                                        // Set the filter
                                                        onFilterChange([cityFilter]);
                                                        
                                                        // Switch to map tab (index 2)
                                                        onTabChange(2);
                                                    } else {
                                                        // Fallback if functions not available
                                                        Alert.alert('View City', `Showing meals for ${city} on map`);
                                                    }
                                                }}
                                            >
                                                <Image
                                                    source={{ uri: cityImages[city] || 'https://via.placeholder.com/80' }}
                                                    style={styles.cityImage}
                                                />
                                                <Text style={styles.cityName} numberOfLines={1}>{city}</Text>
                                            </TouchableOpacity>
                                        )}
                                        contentContainerStyle={styles.citiesList}
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
                                <Icon name="book" size={64} color="#ddd" />
                                {activeFilters && activeFilters.length > 0 ? (
                                    <>
                                        <Text style={styles.emptyText}>No meals match your filters</Text>
                                        <Text style={styles.emptySubtext}>
                                            Try different filters or clear your search
                                        </Text>
                                    </>
                                ) : (
                                    <>
                                        <Text style={styles.emptyText}>No meals in your passport yet</Text>
                                        <Text style={styles.emptySubtext}>
                                            Tap "New Entry" to add your first meal!
                                        </Text>
                                    </>
                                )}
                            </View>
                        }
                    />
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FAF9F6',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 15,
        backgroundColor: '#ff6b6b',
        zIndex: 10,
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
    // Profile Card Styles
    profileCard: {
        backgroundColor: '#FAF3E0',
        margin: 10,
        marginTop: 10,
        marginBottom: 8,
        borderRadius: 12,
        padding: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    profileHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    profilePhoto: {
        width: 45,
        height: 45,
        borderRadius: 22.5,
        marginRight: 12,
    },
    profilePhotoPlaceholder: {
        width: 45,
        height: 45,
        borderRadius: 22.5,
        backgroundColor: '#ddd',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    profileInfo: {
        flex: 1,
    },
    profileName: {
        fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1a2b49',
        marginBottom: 2,
    },
    profileEmail: {
        fontSize: 14,
        color: '#666',
    },
    profileStats: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: '#FAF3E0',
        paddingTop: 10,
    },
    filterContainer: {
        marginVertical: 10,
        paddingHorizontal: 10,
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
        backgroundColor: '#FAF3E0',
        marginHorizontal: 10,
    },
    statValue: {
        fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1a2b49',
        marginVertical: 2,
    },
    statLabel: {
        fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
        fontSize: 12,
        color: '#1a2b49',
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
        paddingTop: 5, // Reduced top padding
        paddingBottom: 30,
    },
    row: {
        justifyContent: 'space-between',
    },
    mealCard: {
        width: itemWidth,
        marginBottom: 20,
        backgroundColor: '#FAF3E0',
        borderRadius: 12,
        overflow: 'hidden',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    imageContainer: {
        position: 'relative',
        width: '100%',
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
    ratingOverlay: {
        position: 'absolute',
        bottom: 8,
        left: 8,
        backgroundColor: 'rgba(250, 248, 230, 0.8)', // Cream color with 80% opacity
        borderRadius: 15,
        padding: 3,
        paddingHorizontal: 4,
    },
    imageWashOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(128, 128, 128, 0.7)', // Gray overlay with 70% opacity
    },
    rateMealOverlay: {
        position: 'absolute',
        bottom: 8,
        left: 8,
        backgroundColor: 'rgba(250, 248, 230, 0.8)', // Same cream color/opacity as emoji overlay
        borderRadius: 15, // Same border radius as emoji overlay
        paddingVertical: 4,
        paddingHorizontal: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
    },
    rateMealText: {
        color: '#1a2b49', // Navy blue text color
        fontSize: 10, // Smaller font size
        fontWeight: 'normal', // Not bold
        fontFamily: 'Inter-Regular', // Inter font
        textAlign: 'center',
    },
    mealCardContent: {
        padding: 10,
    },
    mealName: {
        fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
        fontSize: 16,
        fontWeight: 'normal',
        color: '#1a2b49',
        marginBottom: 3,
    },
    restaurantName: {
        fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
        fontSize: 13,
        color: '#666',
        fontWeight: '500',
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
    // Profile card styles
    userAvatarContainer: {
        marginRight: 12,
    },
    userAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
    },
    defaultAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#f0f0f0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    userDetails: {
        flex: 1,
    },
    userName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1a2b49',
        fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
        marginBottom: 2,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statText: {
        fontSize: 13,
        color: '#666',
        fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    },
    statSeparator: {
        marginHorizontal: 12, // Increased from 6 to spread out the stats more
        color: '#999',
    },
    followButton: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 36,
        height: 36,
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: '#1a2b49',
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
    followButtonText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 13,
        fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    },
    followButtonIcon: {
        color: '#1a2b49',
        fontWeight: 'bold',
        fontSize: 20,
        textAlign: 'center',
        lineHeight: 20,
    },
    debugButton: {
        marginTop: 8,
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(230, 57, 70, 0.1)',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(230, 57, 70, 0.3)',
        alignSelf: 'flex-start',
    },
    debugButtonText: {
        fontSize: 12,
        color: '#E63946',
        fontWeight: '500',
        fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    },
    // Cities section styles
    citiesSection: {
        marginTop: 20,
        marginBottom: 10,
    },
    citiesSectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1a2b49',
        marginBottom: 12,
        paddingHorizontal: 16,
        fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    },
    citiesList: {
        paddingHorizontal: 16,
    },
    cityItem: {
        marginRight: 12,
        alignItems: 'center',
    },
    cityImage: {
        width: 120,
        height: 120,
        borderRadius: 12,
        backgroundColor: '#f0f0f0',
        marginBottom: 8,
    },
    cityName: {
        fontSize: 13,
        color: '#666',
        maxWidth: 120,
        textAlign: 'center',
        fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    },
});

export default FoodPassportScreen;