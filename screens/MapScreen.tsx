import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Alert,
  Linking,
  Clipboard,
  Share,
  Platform,
  PermissionsAndroid,
  ImageSourcePropType,
} from 'react-native';
import { firebase, auth, firestore } from '../firebaseConfig';
import MapView, { Marker, Callout, Region } from 'react-native-maps';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../App';
import Geolocation from '@react-native-community/geolocation';
import { FilterItem } from '../components/SimpleFilterComponent';

// Custom button icons - replace these with actual assets when available
const MAP_ICONS = {
  myLocation: require('../assets/icons/map/my-location.png'),
  share: require('../assets/icons/map/share.png'),
};

type MapScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, 'FoodPassport'>;
  activeFilters: FilterItem[] | null;
  isActive?: boolean; // Flag to indicate if this tab is currently active
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
  location: {
    latitude: number;
    longitude: number;
    source?: string;
  } | null;
  createdAt: number;
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

const MapScreen: React.FC<MapScreenProps> = ({ navigation, activeFilters, isActive }) => {
  const [allMeals, setAllMeals] = useState<MealEntry[]>([]);
  const [filteredMeals, setFilteredMeals] = useState<MealEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<{[key: string]: boolean}>({});
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [showWishlist, setShowWishlist] = useState<boolean>(false); // Toggle between user's meals and saved meals
  
  // Map view reference
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    if (showWishlist) {
      fetchSavedMeals();
    } else {
      fetchMealEntries();
    }
  }, [showWishlist]); // Re-fetch when toggling between modes

  const fetchSavedMeals = async () => {
    try {
      setLoading(true);
      const userId = auth().currentUser?.uid;
      
      if (!userId) {
        setError('User not authenticated');
        setLoading(false);
        return;
      }
      
      // Get list of saved meal IDs first
      const savedMealsRef = firestore()
        .collection('users')
        .doc(userId)
        .collection('savedMeals');
      
      const savedMealsSnapshot = await savedMealsRef.get();
      const savedMealIds = savedMealsSnapshot.docs.map(doc => doc.data().mealId);
      
      if (savedMealIds.length === 0) {
        // No saved meals
        setAllMeals([]);
        setFilteredMeals([]);
        setLoading(false);
        return;
      }
      
      // Fetch full meal details for each saved meal ID
      const fetchedMeals: MealEntry[] = [];
      
      // Process in batches to avoid potential issues with large arrays
      const batchSize = 10;
      for (let i = 0; i < savedMealIds.length; i += batchSize) {
        const batch = savedMealIds.slice(i, i + batchSize);
        
        // For each batch, get the actual meal data
        for (const mealId of batch) {
          try {
            const mealDoc = await firestore().collection('mealEntries').doc(mealId).get();
            
            if (mealDoc.exists) {
              const data = mealDoc.data();
              
              // Only include meals that have location data
              if (data.location) {
                // Make sure aiMetadata has the expected properties
                const aiMetadata = data.aiMetadata || {};
                
                fetchedMeals.push({
                  id: mealDoc.id,
                  photoUrl: data.photoUrl,
                  rating: data.rating,
                  restaurant: data.restaurant || '',
                  meal: data.meal || '',
                  userId: data.userId,
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
                  }
                });
              }
            }
          } catch (err) {
            console.error(`Error fetching meal ${mealId}:`, err);
          }
        }
      }
      
      setAllMeals(fetchedMeals);
      applyFilter(fetchedMeals, activeFilters);
      setLoading(false);
      
      // Trigger map fitting after data is loaded
      if (fetchedMeals.length > 0 && mapRef.current) {
        setTimeout(() => fitMapToMarkers(), 500);
      }
    } catch (err: any) {
      console.error('Error fetching saved meals:', err);
      setError(`Failed to load saved meals: ${err.message}`);
      setLoading(false);
    }
  };
  
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
        // Only include meals that have location data
        if (data.location) {
          // Make sure aiMetadata has the expected properties
          const aiMetadata = data.aiMetadata || {};
          
          fetchedMeals.push({
            id: doc.id,
            photoUrl: data.photoUrl,
            rating: data.rating,
            restaurant: data.restaurant || '',
            meal: data.meal || '',
            userId: data.userId,
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
            }
          });
        }
      });

      setAllMeals(fetchedMeals);
      applyFilter(fetchedMeals, activeFilters);
      setLoading(false);
      
      // Trigger map fitting after data is loaded
      if (fetchedMeals.length > 0 && mapRef.current) {
        setTimeout(() => fitMapToMarkers(), 500);
      }
    } catch (err: any) {
      console.error('Error fetching meal entries:', err);
      setError(`Failed to load meals: ${err.message}`);
      setLoading(false);
    }
  };

  const viewMealDetails = (meal: MealEntry) => {
    navigation.navigate('MealDetail', { mealId: meal.id });
  };

  const handleImageError = (mealId: string) => {
    console.log(`Image load error for meal: ${mealId}`);
    setImageErrors(prev => ({ ...prev, [mealId]: true }));
  };

  // Add function to apply multiple filters
  const applyFilter = (mealsToFilter: MealEntry[], filters: FilterItem[] | null) => {
    console.log(`MapScreen: Applying filters to ${mealsToFilter.length} meals`);
    
    if (!filters || filters.length === 0) {
      console.log('MapScreen: No filters active, showing all meals');
      setFilteredMeals(mealsToFilter);
      return;
    }
    
    console.log(`MapScreen: ${filters.length} filters active`);
    
    // Check if we have meals with metadata
    const mealsWithMetadata = mealsToFilter.filter(meal => meal.aiMetadata);
    console.log(`MapScreen: Found ${mealsWithMetadata.length} meals with aiMetadata`);
    
    // Start with all meals
    let result = [...mealsToFilter];
    
    // Apply each filter sequentially
    filters.forEach(filter => {
      console.log(`MapScreen: Applying filter: ${filter.type} = ${filter.value}`);
      
      if (filter.type === 'cuisineType') {
        result = result.filter(meal => 
          meal.aiMetadata && 
          meal.aiMetadata.cuisineType && 
          meal.aiMetadata.cuisineType === filter.value
        );
      } else if (filter.type === 'foodType') {
        result = result.filter(meal => 
          meal.aiMetadata && 
          meal.aiMetadata.foodType && 
          meal.aiMetadata.foodType === filter.value
        );
      } else if (filter.type === 'city') {
        result = result.filter(meal => {
          // First check if city is stored in location.city
          if (meal.location && meal.location.city) {
            return meal.location.city.toLowerCase() === filter.value.toLowerCase();
          }
          
          // Fallback: Try to match city in restaurant field
          if (meal.restaurant) {
            const restaurantParts = meal.restaurant.split(',');
            if (restaurantParts.length > 1) {
              const city = restaurantParts[1].trim();
              return city.toLowerCase() === filter.value.toLowerCase();
            }
          }
          return false;
        });
      }
      
      console.log(`MapScreen: After filter ${filter.type}=${filter.value}, ${result.length} meals remain`);
    });
    
    console.log(`MapScreen: Final filter results: ${result.length} meals match all filter criteria`);
    setFilteredMeals(result);
  };
  
  // Update the filter whenever activeFilters changes or when switching between modes
  useEffect(() => {
    console.log('MapScreen: activeFilters changed or showWishlist toggled');
    applyFilter(allMeals, activeFilters);
    
    // When filter changes and we have meals, fit the map to show them
    if (filteredMeals.length > 0 && mapRef.current && !loading) {
      setTimeout(() => fitMapToMarkers(), 500); // Small delay to ensure filteredMeals is updated
    }
  }, [activeFilters, allMeals, showWishlist]);
  
  // Request location permission and get current position
  const requestLocationPermission = async () => {
    if (Platform.OS === 'ios') {
      Geolocation.requestAuthorization();
      getCurrentPosition();
    } else {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Location Permission",
            message: "This app needs access to your location to center the map",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK"
          }
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          getCurrentPosition();
        }
      } catch (err) {
        console.warn(err);
      }
    }
  };
  
  // Get current position and center map on it
  const getCurrentPosition = () => {
    Geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ latitude, longitude });
        
        // Always center on user location when this function is called directly
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude,
            longitude,
            latitudeDelta: 0.02, // Very close zoom level
            longitudeDelta: 0.02,
          }, 1000); // Animation duration in ms
        }
      },
      error => {
        console.log('Error getting location:', error);
        Alert.alert('Location Error', 'Could not get your current location. Please check your location settings.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };
  
  // Effect to handle tab activation or switching between My Meals and Wishlist
  useEffect(() => {
    if (isActive && mapRef.current) {
      // If we have filtered meals, fit map to those pins
      if (filteredMeals.length > 0) {
        fitMapToMarkers();
      } else {
        // If no filtered meals, try to center on user location
        requestLocationPermission();
      }
    }
  }, [isActive, filteredMeals.length, showWishlist]);
  
  // Function to fit map to all markers
  const fitMapToMarkers = () => {
    if (!mapRef.current || filteredMeals.length === 0) return;
    
    // Create an array of coordinates from filtered meals
    const points = filteredMeals
      .filter(meal => meal.location && meal.location.latitude && meal.location.longitude)
      .map(meal => ({
        latitude: meal.location!.latitude,
        longitude: meal.location!.longitude
      }));
    
    if (points.length === 0) return;
    
    // If there's only one point, center on it with a closer zoom
    if (points.length === 1) {
      mapRef.current.animateToRegion({
        latitude: points[0].latitude,
        longitude: points[0].longitude,
        latitudeDelta: 0.01,  // Closer zoom for single point
        longitudeDelta: 0.01,
      }, 1000);
      return;
    }
    
    // For multiple points, fit all markers on screen with padding
    mapRef.current.fitToCoordinates(points, {
      edgePadding: { top: 80, right: 80, bottom: 80, left: 80 },
      animated: true
    });
  };

  // Calculate initial region based on filtered meals
  const initialRegion = useMemo<Region>(() => {
    const mealsToUse = filteredMeals;
    
    // Default fallback if no meals with location
    if (mealsToUse.length === 0) {
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
    
    mealsToUse.forEach(meal => {
      if (meal.location) {
        minLat = Math.min(minLat, meal.location.latitude);
        maxLat = Math.max(maxLat, meal.location.latitude);
        minLng = Math.min(minLng, meal.location.longitude);
        maxLng = Math.max(maxLng, meal.location.longitude);
      }
    });
    
    // Check if we have valid bounds
    if (minLat === Number.MAX_VALUE) {
      return {
        latitude: 37.78825,
        longitude: -122.4324,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };
    }
    
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
  }, [filteredMeals]);

  // Function to share map locations via Google Maps
  const shareMapToGoogleMaps = async () => {
    try {
      // Use filtered meals for sharing
      const mealsToShare = filteredMeals;
      
      if (mealsToShare.length === 0) {
        Alert.alert("Nothing to Share", "Add meals with location to share your food map.");
        return;
      }

      // Build a Google Maps URL with multiple markers
      // Format: https://www.google.com/maps/dir/?api=1&destination=lat,lng&waypoints=lat,lng|lat,lng

      // Use first meal as destination
      const firstMeal = mealsToShare[0];
      let mapUrl = `https://www.google.com/maps/search/?api=1&query=${firstMeal.location?.latitude},${firstMeal.location?.longitude}`;

      // If there are multiple meals, create a custom map link instead
      if (mealsToShare.length > 1) {
        // Start a custom map link
        mapUrl = 'https://www.google.com/maps/dir/?api=1';

        // Add destination (first meal)
        mapUrl += `&destination=${firstMeal.location?.latitude},${firstMeal.location?.longitude}`;

        // Add waypoints (other meals) - limited to 10 due to URL length limits
        const waypoints = mealsToShare.slice(1, 10).map(meal =>
          `${meal.location?.latitude},${meal.location?.longitude}`
        ).join('|');

        if (waypoints) {
          mapUrl += `&waypoints=${waypoints}`;
        }
      }

      // Create a shareable text
      const shareText = `Check out my Food Passport with ${mealsToShare.length} dining experiences! 🍽️\n\n`;
      const locationNames = mealsToShare.slice(0, 5).map(meal =>
        meal.restaurant || meal.meal || 'Untitled meal'
      ).join(', ');

      const shareMessage = `${shareText}Featuring: ${locationNames}${mealsToShare.length > 5 ? ' and more...' : ''}`;

      try {
        // Use React Native's Share API
        await Share.share({
          message: shareMessage + '\n\n' + mapUrl,
          url: mapUrl // Note: this may only work on iOS
        });
      } catch (error) {
        console.log('Error sharing:', error);
        // Fallback - copy to clipboard
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff6b6b" />
        <Text style={styles.loadingText}>Loading your food map...</Text>
      </View>
    );
  }
  
  if (filteredMeals.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name={showWishlist ? "bookmark" : "place"} size={64} color="#ddd" />
        {activeFilters && activeFilters.length > 0 ? (
          <>
            <Text style={styles.emptyText}>No meals match your filters</Text>
            <Text style={styles.emptySubtext}>
              Try different filters or clear your search
            </Text>
          </>
        ) : (
          <>
            {showWishlist ? (
              <>
                <Text style={styles.emptyText}>No saved meals with location data</Text>
                <Text style={styles.emptySubtext}>
                  Save meals by tapping the bookmark icon on the meal details screen
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyText}>No meals with location data</Text>
                <Text style={styles.emptySubtext}>
                  Add meals with location information to see them on the map
                </Text>
              </>
            )}
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.mapContainer}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={true}
        onMapReady={fitMapToMarkers}
      >
        {filteredMeals.map(meal => (
          <Marker
            key={meal.id}
            coordinate={{
              latitude: meal.location?.latitude || 0,
              longitude: meal.location?.longitude || 0
            }}
            title={meal.meal || 'Untitled meal'}
            description={meal.restaurant || ''}
            pinColor={showWishlist ? "#ffc008" : "#ff6b6b"}
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
                {showWishlist && (
                  <View style={styles.calloutSavedBadge}>
                    <Icon name="bookmark" size={10} color="#fff" />
                    <Text style={styles.calloutSavedText}>Saved</Text>
                  </View>
                )}
                <Text style={styles.calloutTapText}>Tap to view details</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Wishlist Toggle Button */}
      <View style={styles.wishlistToggleContainer}>
        <TouchableOpacity
          style={[styles.wishlistToggleButton, showWishlist && styles.wishlistActive]}
          onPress={() => setShowWishlist(!showWishlist)}
        >
          <Image
            source={showWishlist 
              ? require('../assets/icons/wishlist-active.png')
              : require('../assets/icons/wishlist-inactive.png')}
            style={styles.wishlistButtonIcon}
            resizeMode="contain"
          />
          <Text style={styles.wishlistToggleText}>
            {showWishlist ? `Wishlist (${filteredMeals.length})` : `My Meals (${filteredMeals.length})`}
          </Text>
        </TouchableOpacity>
      </View>
      
      {/* Floating buttons */}
      <View style={styles.buttonContainer}>
        {/* My Location button - to center on user's current location */}
        <TouchableOpacity
          style={[styles.floatingButton, styles.locationButton]}
          onPress={requestLocationPermission}
        >
          <Image source={MAP_ICONS.myLocation} style={styles.buttonIcon} />
        </TouchableOpacity>
        
        {/* Share button */}
        <TouchableOpacity
          style={[styles.floatingButton, styles.locationButton]}
          onPress={shareMapToGoogleMaps}
        >
          <Image source={MAP_ICONS.share} style={styles.buttonIcon} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  buttonContainer: {
    position: 'absolute',
    right: 16,
    bottom: 30,
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  floatingButton: {
    backgroundColor: '#ff6b6b',
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    marginBottom: 10,
  },
  locationButton: {
    width: 48,
  },
  buttonIcon: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
  },
  callout: {
    width: 160,
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
    height: 80,
    borderRadius: 5,
    marginBottom: 5,
  },
  calloutImagePlaceholder: {
    width: '100%',
    height: 80,
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
  calloutTapText: {
    fontSize: 10,
    color: '#ff6b6b',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 5,
  },
  wishlistToggleContainer: {
    position: 'absolute',
    top: 10, // Reduced from 16 to 10 for less space at the top
    left: 16,
    zIndex: 1,
  },
  wishlistToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff6b6b',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  wishlistActive: {
    backgroundColor: '#ffc008',
  },
  wishlistToggleText: {
    color: 'white',
    fontWeight: 'bold',
    marginLeft: 5,
    fontSize: 14,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  calloutSavedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffc008',
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  calloutSavedText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 3,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  wishlistButtonIcon: {
    width: 18,
    height: 18,
    tintColor: 'white',
  },
});

export default MapScreen;