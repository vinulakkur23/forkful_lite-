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
  SafeAreaView
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { RootStackParamList } from '../App';
// Import Firebase from our central config
import { firebase, auth, firestore, storage } from '../firebaseConfig';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as ImagePicker from 'react-native-image-picker';
import Geolocation from '@react-native-community/geolocation';
// Re-enable EXIF for extracting location data from images
import Exif from 'react-native-exif';
import StarRating from '../components/StarRating';
import SimpleFilterComponent, { FilterItem } from '../components/SimpleFilterComponent';
// Import components for tab view
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
// Import map component
import MapView, { Marker, Callout } from 'react-native-maps';
// Import achievement service
import { getUserAchievements } from '../services/achievementService';

type FoodPassportScreenNavigationProp = StackNavigationProp<RootStackParamList, 'FoodPassport'>;

type Props = {
  navigation: FoodPassportScreenNavigationProp;
  activeFilters: FilterItem[] | null;
};

interface MealEntry {
  id: string;
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
    foodType: string;
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

const FoodPassportScreen: React.FC<Props> = ({ navigation, activeFilters }) => {
    const [meals, setMeals] = useState<MealEntry[]>([]);
    const [filteredMeals, setFilteredMeals] = useState<MealEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [userInfo, setUserInfo] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [imageErrors, setImageErrors] = useState<{[key: string]: boolean}>({}); 

    // State for profile stats
    const [profileStats, setProfileStats] = useState({
        totalMeals: 0,
        averageRating: 0,
        badgeCount: 0
    });

    // Tab view state
    const [tabIndex, setTabIndex] = useState(0);
    const [tabRoutes] = useState<TabRoutes[]>([
      { key: 'list', title: 'List' },
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
    
    // Apply filter whenever meals or active filters change
    useEffect(() => {
        console.log('FoodPassportScreen: activeFilters changed:', activeFilters);
        applyFilter();
    }, [meals, activeFilters]);
    
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
                // Make sure aiMetadata has the expected properties
                const aiMetadata = data.aiMetadata || {};
                
                fetchedMeals.push({
                    id: doc.id,
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

            setMeals(fetchedMeals);
            // Filtered meals will be updated via the useEffect

            // Calculate profile stats
            const totalMeals = fetchedMeals.length;
            let averageRating = 0;

            if (totalMeals > 0) {
                const totalRating = fetchedMeals.reduce((sum, meal) => sum + (meal.rating || 0), 0);
                averageRating = totalRating / totalMeals;
            }

            // Get badge count
            const userAchievements = await getUserAchievements();
            const badgeCount = userAchievements.length;

            setProfileStats({
                totalMeals,
                averageRating,
                badgeCount
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
                    const matches = meal.aiMetadata && 
                                  meal.aiMetadata.foodType && 
                                  meal.aiMetadata.foodType === filter.value;
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
        navigation.navigate('MealDetail', { mealId: meal.id, previousScreen: 'FoodPassport' });
    };
    
    const handleImageError = (mealId: string) => {
        console.log(`Image load error for meal: ${mealId}`);
        setImageErrors(prev => ({...prev, [mealId]: true}));
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
            </View>
        </TouchableOpacity>
    );
    
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
                <>


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
                            userInfo ? (
                                <View>
                                    {/* User Profile Card (moved inside FlatList) */}
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
                                                    <Icon name="person" size={22} color="#fff" />
                                                </View>
                                            )}
                                            <View style={styles.profileInfo}>
                                                <Text style={styles.profileName}>
                                                    {userInfo.displayName || "Food Enthusiast"}
                                                </Text>
                                            </View>
                                        </View>
                                        
                                        <View style={styles.profileStats}>
                                            <View style={styles.statItem}>
                                                <Text style={styles.statValue}>{profileStats.totalMeals}</Text>
                                                <Text style={styles.statLabel}>Uploads</Text>
                                            </View>
                                            <View style={styles.statDivider} />
                                            <View style={styles.statItem}>
                                                <Text style={styles.statValue}>
                                                    {profileStats.averageRating.toFixed(1)}
                                                </Text>
                                                <Text style={styles.statLabel}>Avg. Rating</Text>
                                            </View>
                                            <View style={styles.statDivider} />
                                            <View style={styles.statItem}>
                                                <Text style={styles.statValue}>
                                                    {profileStats.badgeCount}
                                                </Text>
                                                <Text style={styles.statLabel}>Badges</Text>
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            ) : null
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
                </>
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
        marginTop: 0,  // Reduced from 10 to 0 to move card up
        marginBottom: 8, // Slightly reduced bottom margin 
        borderRadius: 12,
        padding: 10,
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
        borderTopColor: '#ffc008',
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
        backgroundColor: '#ffc008',
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
        fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
        fontSize: 16,
        fontWeight: 'normal',
        color: '#1a2b49',
        marginBottom: 5,
    },
    ratingContainer: {
        flexDirection: 'row',
        marginBottom: 5,
    },
    restaurantName: {
        fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
        fontSize: 14,
        color: '#1a2b49',
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
});

export default FoodPassportScreen;