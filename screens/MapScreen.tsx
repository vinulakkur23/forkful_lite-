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
} from 'react-native';
import { firebase, auth, firestore } from '../firebaseConfig';
import MapView, { Marker, Callout, Region } from 'react-native-maps';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../App';

type MapScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, 'FoodPassport'>;
  activeFilter: { type: string, value: string } | null;
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

const MapScreen: React.FC<MapScreenProps> = ({ navigation, activeFilter }) => {
  const [allMeals, setAllMeals] = useState<MealEntry[]>([]);
  const [filteredMeals, setFilteredMeals] = useState<MealEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<{[key: string]: boolean}>({});
  
  // Map view reference
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    fetchMealEntries();
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
        // Only include meals that have location data
        if (data.location) {
          fetchedMeals.push({
            id: doc.id,
            photoUrl: data.photoUrl,
            rating: data.rating,
            restaurant: data.restaurant || '',
            meal: data.meal || '',
            userId: data.userId,
            location: data.location,
            createdAt: data.createdAt?.toDate?.() || Date.now(),
            aiMetadata: data.aiMetadata || null // Include aiMetadata for filtering
          });
        }
      });

      setAllMeals(fetchedMeals);
      applyFilter(fetchedMeals, activeFilter);
      setLoading(false);
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

  // Add function to apply filter
  const applyFilter = (mealsToFilter: MealEntry[], filter: { type: string, value: string } | null) => {
    console.log(`MapScreen: Applying filter to ${mealsToFilter.length} meals`);
    
    if (!filter) {
      console.log('MapScreen: No filter active, showing all meals');
      setFilteredMeals(mealsToFilter);
      return;
    }
    
    console.log(`MapScreen: Filter active: ${filter.type} = ${filter.value}`);
    
    // Check if we have meals with metadata
    const mealsWithMetadata = mealsToFilter.filter(meal => meal.aiMetadata);
    console.log(`MapScreen: Found ${mealsWithMetadata.length} meals with aiMetadata`);
    
    let result = [...mealsToFilter];
    
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
    }
    
    console.log(`MapScreen: Filter results: ${result.length} meals match the filter criteria`);
    setFilteredMeals(result);
  };
  
  // Update the filter whenever activeFilter changes
  useEffect(() => {
    console.log('MapScreen: activeFilter changed:', activeFilter);
    applyFilter(allMeals, activeFilter);
  }, [activeFilter, allMeals]);

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
        <Icon name="place" size={64} color="#ddd" />
        {activeFilter ? (
          <>
            <Text style={styles.emptyText}>No meals match your filter</Text>
            <Text style={styles.emptySubtext}>
              Try a different filter or clear your search
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
});

export default MapScreen;