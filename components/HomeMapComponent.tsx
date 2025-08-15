import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import MapView, { Marker, Callout, Region } from 'react-native-maps';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../App';
import Geolocation from '@react-native-community/geolocation';
import { FilterItem } from './SimpleFilterComponent';
import EmojiDisplay from './EmojiDisplay';
import { getFollowing } from '../services/followService';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

// Map button icons - same as MapScreen
const MAP_ICONS = {
  myLocation: require('../assets/icons/map/my-location.png'),
};

// Custom map style to match app theme
const mapStyle = [
  {
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#FAF9F6" // Cream background
      }
    ]
  },
  {
    "elementType": "labels.icon",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#1a2b49" // Navy text
      }
    ]
  },
  {
    "elementType": "labels.text.stroke",
    "stylers": [
      {
        "color": "#FAF3E0" // Cream stroke
      }
    ]
  },
  {
    "featureType": "administrative.land_parcel",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#1a2b49"
      }
    ]
  },
  {
    "featureType": "poi",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#F5E6D3" // Lighter cream for POIs
      }
    ]
  },
  {
    "featureType": "poi",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#666666"
      }
    ]
  },
  {
    "featureType": "poi.park",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#E8F5E8" // Soft green for parks
      }
    ]
  },
  {
    "featureType": "road",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#FFFFFF" // White roads
      }
    ]
  },
  {
    "featureType": "road",
    "elementType": "geometry.stroke",
    "stylers": [
      {
        "color": "#E0DDD8" // Light gray stroke
      }
    ]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#FFE4E4" // Very light red for highways
      }
    ]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry.stroke",
    "stylers": [
      {
        "color": "#E63946" // Lobster red stroke for highways
      },
      {
        "lightness": 50
      }
    ]
  },
  {
    "featureType": "transit.line",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#FFE4B5" // Light gold for transit
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#D4E4F1" // Light blue for water
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#1a2b49" // Navy for water labels
      }
    ]
  }
];

// Calculate zoom level from region
const calculateZoomLevel = (region: Region): number => {
  const longitudeDelta = region.longitudeDelta;
  // Approximate zoom level calculation
  return Math.round(Math.log(360 / longitudeDelta) / Math.LN2);
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
  city?: string;
  location: {
    latitude: number;
    longitude: number;
    source?: string;
    city?: string;
  } | null;
  createdAt: any;
  distance?: number;
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
}

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'Home'>;
  nearbyMeals: MealEntry[];
  loading: boolean;
  refreshing: boolean;
  activeFilters: FilterItem[] | null;
  showingLimitedResults: boolean;
  userLocation: {latitude: number, longitude: number} | null;
  imageErrors: {[key: string]: boolean};
  onImageError: (mealId: string) => void;
  onViewMealDetails: (meal: MealEntry) => void;
  tabIndex: number;
  MAX_MEALS_TO_DISPLAY: number;
  centerOnLocation?: {
    latitude: number;
    longitude: number;
    mealId?: string;
  };
};

const HomeMapComponent: React.FC<Props> = ({
  navigation,
  nearbyMeals,
  loading,
  refreshing,
  activeFilters,
  showingLimitedResults,
  userLocation,
  imageErrors,
  onImageError,
  onViewMealDetails,
  tabIndex,
  MAX_MEALS_TO_DISPLAY,
  centerOnLocation
}) => {
  // Map-specific state - isolated from parent component
  const [selectedMarkerIndex, setSelectedMarkerIndex] = useState<{ [key: string]: number }>({});
  const mapRef = useRef<MapView | null>(null);
  
  // Store centerOnLocation locally to prevent it from being lost when params are cleared
  const storedCenterLocationRef = useRef<typeof centerOnLocation>(null);
  
  // Filter state (map-specific, isolated from parent)
  const [filterMode, setFilterMode] = useState<'all' | 'following' | 'saved'>('all');
  const [followingUserIds, setFollowingUserIds] = useState<string[]>([]);
  const [savedMealIds, setSavedMealIds] = useState<string[]>([]);
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [currentZoom, setCurrentZoom] = useState<number>(10); // Track current zoom level

  const handleLocationPress = (meals: MealEntry[]) => {
    return;
  };
  
  const handleMarkerPress = (locationKey: string, meals: MealEntry[]) => {
    console.log(`Marker pressed: ${locationKey}, meals count: ${meals.length}`);
    
    if (meals.length > 1) {
      const currentIndex = selectedMarkerIndex[locationKey] || 0;
      const nextIndex = (currentIndex + 1) % meals.length;
      console.log(`Cycling from index ${currentIndex} to ${nextIndex}`);
      setSelectedMarkerIndex(prev => ({ ...prev, [locationKey]: nextIndex }));
    } else {
      handleLocationPress(meals);
    }
  };

  // Load data when filter mode changes
  useEffect(() => {
    if (filterMode === 'following' && !loadingFollowing) {
      console.log('HomeMapComponent: Loading following list for filter');
      loadFollowingList();
    }
    if (filterMode === 'saved' && !loadingSaved) {
      console.log('HomeMapComponent: Loading saved meals for filter');
      loadSavedMealsList();
    }
  }, [filterMode]);

  const loadFollowingList = async () => {
    setLoadingFollowing(true);
    try {
      const followingList = await getFollowing();
      const userIds = followingList.map(follow => follow.followingId);
      setFollowingUserIds(userIds);
      console.log('HomeMapComponent: Loaded following list:', userIds.length, 'users');
    } catch (error) {
      console.error('HomeMapComponent: Error loading following list:', error);
      Alert.alert('Error', 'Could not load following list');
    } finally {
      setLoadingFollowing(false);
    }
  };

  const loadSavedMealsList = async () => {
    setLoadingSaved(true);
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) return;

      const savedMealsRef = firestore()
        .collection('users')
        .doc(currentUser.uid)
        .collection('savedMeals');
      
      const snapshot = await savedMealsRef.get();
      const mealIds = snapshot.docs.map(doc => doc.data().mealId);
      setSavedMealIds(mealIds);
      console.log('HomeMapComponent: Saved meals loaded:', mealIds.length, 'meals');
    } catch (error) {
      console.error('HomeMapComponent: Error loading saved meals:', error);
    } finally {
      setLoadingSaved(false);
    }
  };

  // Filter meals based on selected filter mode (without affecting parent component)
  const filteredMealsForMap = React.useMemo(() => {
    console.log(`HomeMapComponent: Filter memo recalculating - filterMode: ${filterMode}, followingUserIds: ${followingUserIds.length}, savedMealIds: ${savedMealIds.length}`);
    
    if (filterMode === 'all') {
      console.log(`HomeMapComponent: Showing all ${nearbyMeals.length} meals`);
      return nearbyMeals;
    }
    
    const currentUserId = auth().currentUser?.uid;
    let filtered: any[] = [];
    
    if (filterMode === 'following') {
      filtered = nearbyMeals.filter(meal => {
        // Always include own meals
        if (meal.userId === currentUserId) {
          return true;
        }
        // Include meals from followed users
        return followingUserIds.includes(meal.userId);
      });
      console.log(`HomeMapComponent: Following filter - ${nearbyMeals.length} meals -> ${filtered.length} meals (following: ${followingUserIds.length} users)`);
    } else if (filterMode === 'saved') {
      filtered = nearbyMeals.filter(meal => {
        // Include meals that are in saved list
        return savedMealIds.includes(meal.id);
      });
      console.log(`HomeMapComponent: Saved filter - ${nearbyMeals.length} meals -> ${filtered.length} meals (saved: ${savedMealIds.length} meals)`);
    }
    
    return filtered;
  }, [nearbyMeals, filterMode, followingUserIds, savedMealIds]);

  // Group meals by location for carousel display
  const locationGroupedMarkers = React.useMemo(() => {
    console.log(`HomeMapComponent: locationGroupedMarkers memo recalculating with ${filteredMealsForMap.length} filtered meals`);
    
    const mealsWithLocation = filteredMealsForMap.filter(meal => meal.location?.latitude && meal.location?.longitude);
    
    const locationGroups: { [key: string]: MealEntry[] } = {};
    
    mealsWithLocation.forEach(meal => {
      if (!meal.location) return;
      
      const lat = meal.location.latitude.toFixed(4);
      const lng = meal.location.longitude.toFixed(4);
      const locationKey = `${lat},${lng}`;
      
      if (!locationGroups[locationKey]) {
        locationGroups[locationKey] = [];
      }
      locationGroups[locationKey].push(meal);
    });
    
    const groupedMarkers: Array<{
      locationKey: string,
      coordinate: {latitude: number, longitude: number},
      meals: MealEntry[],
      restaurant?: string
    }> = [];
    
    Object.entries(locationGroups).forEach(([locationKey, meals]) => {
      const firstMeal = meals[0];
      const restaurant = firstMeal.restaurant || meals.find(m => m.restaurant)?.restaurant;
      
      groupedMarkers.push({
        locationKey,
        coordinate: {
          latitude: firstMeal.location!.latitude,
          longitude: firstMeal.location!.longitude
        },
        meals: meals,
        restaurant: restaurant
      });
    });
    
    console.log(`HomeMapComponent: Created ${groupedMarkers.length} marker groups from ${mealsWithLocation.length} meals with location`);
    return groupedMarkers;
  }, [filteredMealsForMap]);

  // Calculate initial region based on filtered meals
  const initialRegion = React.useMemo<Region>(() => {
    const mealsToUse = filteredMealsForMap;
    
    if (mealsToUse.length === 0) {
      if (userLocation) {
        return {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        };
      }
      return {
        latitude: 37.78825,
        longitude: -122.4324,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };
    }
    
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
    
    if (minLat === Number.MAX_VALUE) {
      if (userLocation) {
        return {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        };
      }
      return {
        latitude: 37.78825,
        longitude: -122.4324,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };
    }
    
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    
    const latDelta = (maxLat - minLat) * 1.2; 
    const lngDelta = (maxLng - minLng) * 1.2;
    
    return {
      latitude: centerLat,
      longitude: centerLng,
      latitudeDelta: Math.max(0.01, latDelta),
      longitudeDelta: Math.max(0.01, lngDelta),
    };
  }, [nearbyMeals, userLocation]);
  
  // Effect to handle tab activation
  useEffect(() => {
    if (tabIndex === 1 && mapRef.current) {
      if (filteredMealsForMap.length > 0) {
        setTimeout(() => fitMapToMarkers(), 500);
      }
    }
  }, [tabIndex, filteredMealsForMap.length]);
  
  // When user location becomes available, center the map
  useEffect(() => {
    if (userLocation && mapRef.current && tabIndex === 1) {
      console.log('Centering on user location');
      setTimeout(() => {
        mapRef.current?.animateToRegion({
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }, 1000);
      }, 500);
    }
  }, [userLocation, tabIndex]);

  // Handle centering on specific location when navigating from meal detail
  useEffect(() => {
    // Store centerOnLocation when it's first received
    if (centerOnLocation && !storedCenterLocationRef.current) {
      storedCenterLocationRef.current = centerOnLocation;
      console.log('Storing center location from meal detail:', centerOnLocation);
    }
    
    // Clear stored location when centerOnLocation is cleared (params reset)
    if (!centerOnLocation && storedCenterLocationRef.current) {
      console.log('Clearing stored center location');
      storedCenterLocationRef.current = null;
    }
    
    // Animate to stored location when map tab becomes active
    if (storedCenterLocationRef.current && mapRef.current && tabIndex === 1) {
      console.log('Centering on stored location:', storedCenterLocationRef.current);
      setTimeout(() => {
        if (storedCenterLocationRef.current) {
          mapRef.current?.animateToRegion({
            latitude: storedCenterLocationRef.current.latitude,
            longitude: storedCenterLocationRef.current.longitude,
            latitudeDelta: 0.01, // Zoom in closer for specific meal location
            longitudeDelta: 0.01,
          }, 1000);
          // Clear the stored location after using it
          storedCenterLocationRef.current = null;
        }
      }, 500);
    }
  }, [centerOnLocation, tabIndex]);

  const fitMapToMarkers = () => {
    if (!mapRef.current || filteredMealsForMap.length === 0) return;
    
    const points = filteredMealsForMap
      .filter(meal => meal.location && meal.location.latitude && meal.location.longitude)
      .map(meal => ({
        latitude: meal.location!.latitude,
        longitude: meal.location!.longitude
      }));
    
    if (points.length === 0) return;
    
    if (points.length === 1) {
      mapRef.current.animateToRegion({
        latitude: points[0].latitude,
        longitude: points[0].longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
      return;
    }
    
    mapRef.current.fitToCoordinates(points, {
      edgePadding: { top: 80, right: 80, bottom: 80, left: 80 },
      animated: true
    });
  };

  const centerOnUserLocation = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }, 1000);
    } else {
      Geolocation.getCurrentPosition(
        position => {
          const newLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          
          if (mapRef.current) {
            mapRef.current.animateToRegion({
              latitude: newLocation.latitude,
              longitude: newLocation.longitude,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }, 1000);
          }
        },
        error => {
          console.log('Location error:', error);
          Alert.alert('Location Error', 'Could not get your current location. Please check your location settings.');
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff6b6b" />
        <Text style={styles.loadingText}>Loading nearby meals...</Text>
      </View>
    );
  }
  
  if (filteredMealsForMap.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="place" size={64} color="#ddd" />
        {filterMode === 'following' ? (
          <>
            <Text style={styles.emptyText}>No meals from followed users</Text>
            <Text style={styles.emptySubtext}>
              Toggle the filter to see all meals
            </Text>
          </>
        ) : filterMode === 'saved' ? (
          <>
            <Text style={styles.emptyText}>No saved meals in this area</Text>
            <Text style={styles.emptySubtext}>
              Toggle the filter to see all meals
            </Text>
          </>
        ) : activeFilters && activeFilters.length > 0 ? (
          <>
            <Text style={styles.emptyText}>No meals match your filters</Text>
            <Text style={styles.emptySubtext}>
              Try different filters or clear your search
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.emptyText}>No meals with location data</Text>
            <Text style={styles.emptySubtext}>
              Encourage friends to share their meals with location!
            </Text>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.mapContainer}>
      <MapView
        key="homescreen-mapview"
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={true}
        customMapStyle={mapStyle}
        onRegionChangeComplete={(region) => {
          const zoomLevel = calculateZoomLevel(region);
          setCurrentZoom(zoomLevel);
        }}
      >
        {locationGroupedMarkers.map(({ locationKey, coordinate, meals, restaurant }) => {
          const currentIndex = selectedMarkerIndex[locationKey] || 0;
          const currentMeal = meals[currentIndex];
          
          return (
            <Marker
              key={`${locationKey}-${currentZoom < 14 ? 'pin' : 'photo'}`}
              coordinate={coordinate}
              onPress={() => handleMarkerPress(locationKey, meals)}
            >
              {/* Show simple pins when zoomed out, photos when zoomed in */}
              {currentZoom < 14 ? (
                // Simple pin marker for zoomed out view
                <View style={styles.simplePinMarker}>
                  <View style={styles.pinDot} />
                  {meals.length > 1 && (
                    <View style={styles.pinBadge}>
                      <Text style={styles.pinBadgeText}>{meals.length}</Text>
                    </View>
                  )}
                </View>
              ) : (
                // Photo marker for zoomed in view (existing behavior)
                <View style={styles.customPhotoMarker}>
                {currentMeal.photoUrl && !imageErrors[currentMeal.id] ? (
                  <Image
                    source={{ uri: currentMeal.photoUrl }}
                    style={styles.markerPhoto}
                    onError={() => onImageError(currentMeal.id)}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.markerPhoto, styles.markerPhotoPlaceholder]}>
                    <Icon name="image" size={20} color="#ddd" />
                  </View>
                )}
                {meals.length > 1 && (
                  <View style={styles.pagerDots}>
                    {meals.map((_, index) => (
                      <View
                        key={index}
                        style={[
                          styles.pagerDot,
                          index === currentIndex && styles.pagerDotActive,
                          { backgroundColor: index === currentIndex ? '#E63946' : '#ddd' }
                        ]}
                      />
                    ))}
                  </View>
                )}
              </View>
              )}
              {/* Only show callout when zoomed in for photo markers */}
              {currentZoom >= 14 && (
                <Callout
                tooltip
                onPress={() => onViewMealDetails(currentMeal)}
                style={[styles.callout, styles.photoCallout]}
              >
                <View style={styles.calloutContent}>
                  {currentMeal.photoUrl && !imageErrors[currentMeal.id] ? (
                    <Image
                      source={{ uri: currentMeal.photoUrl }}
                      style={styles.calloutImageLarge}
                      onError={() => onImageError(currentMeal.id)}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.calloutImageLargePlaceholder}>
                      <Icon name="image" size={30} color="#ddd" />
                    </View>
                  )}
                  <View style={styles.calloutTitleRow}>
                    <Text style={styles.calloutTitle} numberOfLines={1}>
                      {currentMeal.meal || 'Untitled meal'}
                    </Text>
                    <EmojiDisplay rating={currentMeal.rating} size={16} />
                  </View>
                  {currentMeal.restaurant && (
                    <Text style={styles.calloutSubtitle} numberOfLines={1}>{currentMeal.restaurant}</Text>
                  )}
                  {meals.length > 1 && (
                    <>
                      <View style={styles.calloutPagerDots}>
                        {meals.map((_, index) => (
                          <View
                            key={index}
                            style={[
                              styles.calloutPagerDot,
                              index === currentIndex && styles.calloutPagerDotActive,
                              { backgroundColor: index === currentIndex ? '#E63946' : '#ddd' }
                            ]}
                          />
                        ))}
                      </View>
                      <Text style={styles.calloutInstruction}>
                        Tap marker to cycle • Tap here for details
                      </Text>
                    </>
                  )}
                </View>
              </Callout>
              )}
            </Marker>
          );
        })}
      </MapView>
      
      
      {/* Filter toggle - positioned at top left */}
      <View style={styles.followingToggleContainer}>
        <TouchableOpacity
          style={[
            styles.followingToggleButton, 
            filterMode === 'following' && styles.followingToggleButtonActive,
            filterMode === 'saved' && styles.savedToggleButtonActive
          ]}
          onPress={() => {
            const nextMode = filterMode === 'all' ? 'following' : filterMode === 'following' ? 'saved' : 'all';
            console.log(`HomeMapComponent: Toggle pressed - current mode: ${filterMode}, new mode: ${nextMode}`);
            setFilterMode(nextMode);
          }}
          disabled={loadingFollowing || loadingSaved}
        >
          {(loadingFollowing || loadingSaved) ? (
            <ActivityIndicator size="small" color="#1a2b49" />
          ) : (
            <Text style={[
              styles.followingToggleText, 
              filterMode === 'following' && styles.followingToggleTextActive,
              filterMode === 'saved' && styles.followingToggleTextActive
            ]}>
              {filterMode === 'all' ? 'Showing: All' : 
               filterMode === 'following' ? 'Showing: Following' : 
               'Showing: Wishlist'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
      
      <View style={styles.mapButtonContainer}>
        <TouchableOpacity
          style={styles.floatingLocationButton}
          onPress={centerOnUserLocation}
        >
          <Image 
            source={MAP_ICONS.myLocation} 
            style={styles.buttonIcon} 
          />
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
    paddingBottom: 50,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
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
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  customPhotoMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerPhoto: {
    width: 60, // Increased from 50 for better visibility
    height: 60, // Increased from 50 for better visibility
    borderRadius: 8, // Slightly more rounded for the larger size
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
  calloutTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  calloutTitle: {
    fontWeight: 'bold',
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  calloutSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 3,
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
  followingToggleContainer: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 10,
  },
  followingToggleButton: {
    backgroundColor: '#FAF9F6', // Cream when showing all
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#FAF9F6',
  },
  followingToggleButtonActive: {
    backgroundColor: '#1a2b49', // Navy blue when showing following
    borderColor: '#1a2b49',
  },
  savedToggleButtonActive: {
    backgroundColor: '#ffc008', // Gold when showing wishlist
    borderColor: '#ffc008',
  },
  followingToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a2b49', // Navy text on cream background
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  followingToggleTextActive: {
    color: '#ffffff', // White text on colored background
  },
  mapButtonContainer: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  floatingLocationButton: {
    backgroundColor: '#FAF9F6', // Cream background
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
    borderColor: '#ddd',
  },
  buttonIcon: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
    tintColor: '#1a2b49', // Navy tint for the icon on cream background
  },
  // Simple pin marker styles for zoomed out view
  simplePinMarker: {
    width: 22, // Width to accommodate pin (12) + badge extension (5+5)
    height: 22, // Height to accommodate pin (12) + badge extension (5+5)
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E63946', // Lobster red
    borderWidth: 1.5,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },
  pinBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#ffc008', // Gold
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'white',
  },
  pinBadgeText: {
    color: '#1a2b49', // Navy
    fontSize: 9,
    fontWeight: 'bold',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
});

export default HomeMapComponent;