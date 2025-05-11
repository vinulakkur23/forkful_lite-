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
import StarRating from '../components/StarRating';
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
  location: {
    latitude: number;
    longitude: number;
    source?: string;
  } | null;
  createdAt: number;
  // Add any other fields that might be in your database
  mealType?: string;
  comments?: {
    liked: string;
    disliked: string;
  };
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
        fetchedMeals.push({
          id: doc.id,
          photoUrl: data.photoUrl,
          rating: data.rating,
          restaurant: data.restaurant || '',
          meal: data.meal || '',
          location: data.location,
          createdAt: data.createdAt?.toDate?.() || Date.now(),
          mealType: data.mealType || 'Restaurant',
          comments: data.comments || { liked: '', disliked: '' }
        });
      });

      setMeals(fetchedMeals);

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
  
  const viewMealDetails = (meal: MealEntry) => {
    console.log("Navigating to meal detail with ID:", meal.id);
    navigation.navigate('MealDetail', { mealId: meal.id });
  };
  
  const handleImageError = (mealId: string) => {
    console.log(`Image load error for meal: ${mealId}`);
    setImageErrors(prev => ({...prev, [mealId]: true}));
  };

  // Simplified Image Picker function for debugging
  const openImagePicker = async () => {
    console.log('Opening image picker with EXIF data extraction');

    const options = {
      mediaType: 'photo' as const,
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
        data={meals}
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
            <Icon name="book" size={64} color="#ddd" />
            <Text style={styles.emptyText}>No meals in your passport yet</Text>
            <Text style={styles.emptySubtext}>
              Tap "New Entry" to add your first meal!
            </Text>
          </View>
        }
      />
    );
  };

  // MapView Component for the second tab - simplified for stability
  const MapViewComponent = () => {
    // Filter meals that have location data
    const mealsWithLocation = meals.filter(meal => meal.location !== null);
    
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
          <Text style={styles.emptyText}>No meals with location data</Text>
          <Text style={styles.emptySubtext}>
            Add meals with location information to see them on the map
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
          {mealsWithLocation.map(meal => (
            <Marker
              key={meal.id}
              coordinate={{
                latitude: meal.location?.latitude || 0,
                longitude: meal.location?.longitude || 0
              }}
              title={meal.meal || 'Untitled meal'}
              description={meal.restaurant || ''}
              pinColor="#ff6b6b"
            >
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
      <View style={styles.header}>
        <Text style={styles.title}>Food Passport</Text>
        <TouchableOpacity onPress={signOut} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
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
  // Tab View Styles
  tabView: {
    flex: 1,
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
});

export default FoodPassportMapScreen;