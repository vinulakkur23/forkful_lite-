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
  MAX_MEALS_TO_DISPLAY
}) => {
  // Map-specific state - isolated from parent component
  // Use useRef to persist state across component hide/show
  const selectedMarkerIndexRef = useRef<{ [key: string]: number }>({});
  const [, forceUpdate] = useState({});
  const mapRef = useRef<MapView | null>(null);

  const handleLocationPress = (meals: MealEntry[]) => {
    return;
  };
  
  const handleMarkerPress = (locationKey: string, meals: MealEntry[]) => {
    console.log(`Marker pressed: ${locationKey}, meals count: ${meals.length}`);
    
    if (meals.length > 1) {
      const currentIndex = selectedMarkerIndexRef.current[locationKey] || 0;
      const nextIndex = (currentIndex + 1) % meals.length;
      console.log(`Cycling from index ${currentIndex} to ${nextIndex}`);
      selectedMarkerIndexRef.current[locationKey] = nextIndex;
      forceUpdate({}); // Force re-render
    } else {
      handleLocationPress(meals);
    }
  };

  // Group meals by location for carousel display
  const locationGroupedMarkers = React.useMemo(() => {
    const mealsWithLocation = nearbyMeals.filter(meal => meal.location?.latitude && meal.location?.longitude);
    
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
    
    return groupedMarkers;
  }, [nearbyMeals]);

  // Calculate initial region based on filtered meals
  const initialRegion = React.useMemo<Region>(() => {
    const mealsToUse = nearbyMeals;
    
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
      if (nearbyMeals.length > 0) {
        setTimeout(() => fitMapToMarkers(), 500);
      }
    }
  }, [tabIndex, nearbyMeals.length]);
  
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

  const fitMapToMarkers = () => {
    if (!mapRef.current || nearbyMeals.length === 0) return;
    
    const points = nearbyMeals
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
  
  if (nearbyMeals.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="place" size={64} color="#ddd" />
        {activeFilters && activeFilters.length > 0 ? (
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
      >
        {locationGroupedMarkers.map(({ locationKey, coordinate, meals, restaurant }) => {
          const currentIndex = selectedMarkerIndexRef.current[locationKey] || 0;
          const currentMeal = meals[currentIndex];
          
          return (
            <Marker
              key={locationKey}
              coordinate={coordinate}
              onPress={() => handleMarkerPress(locationKey, meals)}
            >
              <View style={styles.customPhotoMarker}>
                {currentMeal.photoUrl && !imageErrors[currentMeal.id] ? (
                  <Image
                    source={{ uri: currentMeal.photoUrl }}
                    style={styles.markerPhoto}
                    onError={() => onImageError(currentMeal.id)}
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
                    />
                  ) : (
                    <View style={styles.calloutImageLargePlaceholder}>
                      <Icon name="image" size={30} color="#ddd" />
                    </View>
                  )}
                  <Text style={styles.calloutTitle} numberOfLines={1}>
                    {currentMeal.meal || 'Untitled meal'}
                  </Text>
                  {currentMeal.restaurant && (
                    <Text style={styles.calloutSubtitle} numberOfLines={1}>{currentMeal.restaurant}</Text>
                  )}
                  <View style={styles.calloutRatingRow}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Image
                        key={star}
                        source={star <= currentMeal.rating 
                          ? require('../assets/stars/star-filled.png')
                          : require('../assets/stars/star-empty.png')
                        }
                        style={styles.calloutStar}
                      />
                    ))}
                  </View>
                  {currentMeal.userName && (
                    <Text style={styles.calloutUserName}>by {currentMeal.userName}</Text>
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
            </Marker>
          );
        })}
      </MapView>
      
      {showingLimitedResults && (
        <View style={styles.limitedResultsIndicator}>
          <Text style={styles.limitedResultsText}>
            Showing closest {MAX_MEALS_TO_DISPLAY} meals
          </Text>
        </View>
      )}
      
      <View style={styles.mapButtonContainer}>
        <TouchableOpacity
          style={styles.floatingLocationButton}
          onPress={centerOnUserLocation}
        >
          <Icon name="my-location" size={24} color="#E63946" />
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

export default HomeMapComponent;