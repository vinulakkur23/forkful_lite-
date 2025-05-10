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
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import Geolocation from '@react-native-community/geolocation';
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
}

const { width } = Dimensions.get('window');

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const [user, setUser] = useState<any>(null);
  const [nearbyMeals, setNearbyMeals] = useState<MealEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<{[key: string]: boolean}>({});

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
        
        meals.push({
          id: doc.id,
          ...data,
          userName,
          userPhoto,
          distance: distance,
          createdAt: data.createdAt?.toDate?.() || new Date()
        });
      }
      
      // Sort by distance if location is available, otherwise by date
      let sortedMeals = userLocation
        ? meals.sort((a, b) => (a.distance || 9999) - (b.distance || 9999))
        : meals;
      
      setNearbyMeals(sortedMeals);
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

  const viewMealDetails = (meal: MealEntry) => {
    console.log("Navigating to meal detail with ID:", meal.id);
    navigation.navigate('MealDetail', { mealId: meal.id });
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
      return "📍 At photo location";
    }

    // If no distance available
    if (!distance) return "📍 Unknown distance";

    if (distance < 1) {
      // Convert to meters
      return `📍 ${Math.round(distance * 1000)}m away`;
    } else {
      // In kilometers with one decimal
      return `📍 ${distance.toFixed(1)}km away`;
    }
  };

  // Render a meal item in the feed
  const renderMealItem = ({ item }: { item: MealEntry }) => (
    <TouchableOpacity
      style={styles.mealCard}
      onPress={() => viewMealDetails(item)}
    >
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
          <Icon name="image-not-supported" size={32} color="#ddd" />
        </View>
      )}
      
      <View style={styles.mealCardContent}>
        <View style={styles.mealCardHeader}>
          {item.userPhoto && !imageErrors[`user-${item.userId}`] ? (
            <Image
              source={{ uri: item.userPhoto }}
              style={styles.userPhoto}
              onError={() => setImageErrors(prev => ({...prev, [`user-${item.userId}`]: true}))}
            />
          ) : (
            <View style={styles.userPhotoPlaceholder}>
              <Icon name="person" size={16} color="#fff" />
            </View>
          )}
          <Text style={styles.userName}>{item.userName || 'Food Lover'}</Text>
        </View>
        
        <Text style={styles.mealName} numberOfLines={1}>
          {item.meal || 'Delicious meal'}
        </Text>
        
        {item.restaurant && (
          <View style={styles.restaurantRow}>
            <Icon name="restaurant" size={14} color="#666" />
            <Text style={styles.restaurantName} numberOfLines={1}>
              {item.restaurant}
            </Text>
          </View>
        )}
        
        <View style={styles.mealCardFooter}>
          {renderStars(item.rating)}
          
          {item.distance !== undefined && (
            <View style={styles.distanceContainer}>
              <Icon name="place" size={12} color="#666" />
              <Text style={styles.distanceText}>
                {formatDistance(item.distance, item)}
              </Text>
            </View>
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
                  : "No meals found nearby"}
              </Text>
              <Text style={styles.emptySubtext}>
                Be the first to add a meal in this area!
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
    backgroundColor: '#f8f8f8',
  },
  headerContainer: {
    backgroundColor: '#ff8b8b', // Lighter color than before
    paddingVertical: 15,
    paddingHorizontal: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'left', // Align to the left instead of center
    paddingLeft: 5, // Add a bit of padding
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
    backgroundColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  mealImage: {
    width: '100%',
    height: 300,
  },
  placeholderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  mealCardContent: {
    padding: 16,
  },
  mealCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  userPhoto: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 8,
  },
  userPhotoPlaceholder: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  userName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  mealName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  restaurantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  restaurantName: {
    fontSize: 14,
    color: '#666',
    marginLeft: 4,
  },
  mealCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  starsContainer: {
    flexDirection: 'row',
  },
  distanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  distanceText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
});

export default HomeScreen;
