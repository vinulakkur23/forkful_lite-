import React, { useEffect, useState } from 'react';
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
  SafeAreaView
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialIcons';
// Import our custom StarRating component instead of FontAwesome
import StarRating from '../components/StarRating';
import SimpleFilterComponent, { FilterItem } from '../components/SimpleFilterComponent';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import Geolocation from '@react-native-community/geolocation';
import { fonts } from '../src/theme/fonts';
import { RootStackParamList } from '../App';

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

type Props = {
  navigation: HomeScreenNavigationProp;
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
  location: {
    latitude: number;
    longitude: number;
    source?: string; // 'device', 'exif', etc.
  } | null;
  createdAt: any;
  distance?: number; // Distance in meters from user's current location
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

const HomeScreen: React.FC<Props> = ({ navigation }) => {
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
      
      // Get all meals from Firestore - we'll filter locally for nearby ones
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
            foodType: aiMetadata.foodType || 'Unknown',
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
      
      console.log(`Found ${sortedMeals.length} meals from other users`);
      setAllNearbyMeals(sortedMeals);
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
          const matches = meal.aiMetadata && 
                        meal.aiMetadata.foodType && 
                        meal.aiMetadata.foodType === filter.value;
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

  const viewMealDetails = (meal: MealEntry) => {
    console.log("Navigating to meal detail with ID:", meal.id);
    navigation.navigate('MealDetail', { mealId: meal.id, previousScreen: 'Home' });
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

  // Render a meal item in the feed
  const renderMealItem = ({ item }: { item: MealEntry }) => (
    <TouchableOpacity
      style={styles.mealCard}
      onPress={() => viewMealDetails(item)}
    >
      <View style={styles.imageContainer}>
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
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Updated Header */}
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>DishItOut</Text>
      </View>
      
      {/* Multi Filter Component */}
      <View style={styles.filterArea}>
        <SimpleFilterComponent 
          key="home-filter"
          onFilterChange={handleFilterChange}
          initialFilters={activeFilters}
        />
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff6b6b" />
          <Text style={styles.loadingText}>Finding meals nearby...</Text>
        </View>
      ) : (
        <FlatList
          data={nearbyMeals}
          keyExtractor={(item) => item.id}
          renderItem={renderMealItem}
          contentContainerStyle={styles.feedContainer}
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
    alignItems: 'flex-start', // Align items to the left
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
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
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
});

export default HomeScreen;
