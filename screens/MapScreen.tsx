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
  ScrollView,
  Modal,
} from 'react-native';
import { firebase, auth, firestore } from '../firebaseConfig';
import MapView, { Marker, Callout, Region, PROVIDER_GOOGLE } from 'react-native-maps';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../App';
import Geolocation from '@react-native-community/geolocation';
import { FilterItem } from '../components/SimpleFilterComponent';
import EmojiDisplay from '../components/EmojiDisplay';
// Import theme
import { colors, typography, spacing, shadows } from '../themes';
import { mapStyle } from '../config/mapStyle';

// Custom button icons - replace these with actual assets when available
const MAP_ICONS = {
  myLocation: require('../assets/icons/map/my-location.png'),
  share: require('../assets/icons/map/share.png'),
  checkmark: { uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAsTAAALEwEAmpwYAAAA8klEQVR4nO2VMU7DQBBF3xaUBpooJQ2hpPYFkhtwAtLQpM0dcgFEGuqUdDkFdLkDcAJS0FBkCyOtbCsKGstJSvKkkUYz+1/P7swG/o0JKlzwSI4FNV44IseZZB94HMbPVaRQ0OJU0PziMiixJ1h9sxkdwRRHWLMtXIJdwfKH7l2CE8F8DdeRGQyxF1M4L8d0xZUbQbvDZRKCDTWzKAIHM4zjXuMkgaDBbkzhuAZX1DngELeJXZQz6AmqFRCPRNDinncFFS7/4OpLJHbRfYcgBXV8+vQTcT9SbfVcx39uqSBf8Kn5rmDYWNgJsZygCZYf+HfeAe9jVYQkXxGBAAAAAElFTkSuQmCC' }
};

// Map style imported from shared config (config/mapStyle.ts)

type MapScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, 'FoodPassport'>;
  activeFilters: FilterItem[] | null;
  activeRatingFilters?: number[] | null;
  isActive?: boolean; // Flag to indicate if this tab is currently active
  userId?: string; // Optional userId to view other users' maps
  onFilterChange?: (filters: FilterItem[] | null) => void;
};

interface MealEntry {
  id: string;
  photoUrl: string;
  pixel_art_url?: string;
  pixel_art_data?: string; // base64 — older meals stored pixel art inline
  rating: number;
  restaurant: string;
  meal: string;
  userId?: string;
  userName?: string;
  userPhoto?: string;
  city?: string;
  location: {
    latitude: number;
    longitude: number;
    city?: string;
    source?: string;
  } | null;
  createdAt: number;
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

// Calculate zoom level from region
const calculateZoomLevel = (region: Region): number => {
  const longitudeDelta = region.longitudeDelta;
  // Approximate zoom level calculation
  return Math.round(Math.log(360 / longitudeDelta) / Math.LN2);
};

const MapScreen: React.FC<MapScreenProps> = ({ navigation, activeFilters, activeRatingFilters, isActive, userId, onFilterChange }) => {
  // Note: `userId` is always passed from FoodPassportWrapper (it falls back to the
  // current user's uid). So `!userId` is NOT a reliable "own profile" check here —
  // we have to compare against the auth uid explicitly.
  const currentUid = auth().currentUser?.uid;
  const isOwnProfile = !userId || userId === currentUid;
  const [allMeals, setAllMeals] = useState<MealEntry[]>([]);
  const [filteredMeals, setFilteredMeals] = useState<MealEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<{[key: string]: boolean}>({});
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [showWishlist, setShowWishlist] = useState<boolean>(false); // Toggle between user's meals and saved meals
  const [selectedLocationMeals, setSelectedLocationMeals] = useState<MealEntry[] | null>(null);
  const [showMealsModal, setShowMealsModal] = useState(false);
  const [selectedMarkerIndex, setSelectedMarkerIndex] = useState<{ [key: string]: number }>({});
  const [currentZoom, setCurrentZoom] = useState<number>(10); // Track current zoom level
  
  // Map view reference
  const mapRef = useRef<MapView | null>(null);
  
  // Group meals by location for carousel display
  // Zoom-aware clustering: at low zoom, nearby restaurants merge into dots.
  // As you zoom in, clusters break apart into individual pixel art markers.
  const locationGroupedMarkers = useMemo(() => {
    const mealsWithLocation = filteredMeals.filter(meal => meal.location?.latitude && meal.location?.longitude);

    // Grid precision based on zoom level:
    // Lower zoom → coarser grid → more merging
    // Higher zoom → finer grid → individual markers
    // Caps at 1 decimal (~11km) so cities/regions never merge into one blob
    let decimals: number;
    if (currentZoom >= 15) {
      decimals = 4;      // ~11m — exact locations, no clustering
    } else if (currentZoom >= 13) {
      decimals = 3;      // ~110m — very close restaurants merge
    } else if (currentZoom >= 11) {
      decimals = 2;      // ~1.1km — neighborhood-level clusters
    } else {
      decimals = 1;      // ~11km — area-level clusters (cap here)
    }

    const locationGroups: { [key: string]: MealEntry[] } = {};

    mealsWithLocation.forEach(meal => {
      if (!meal.location) return;

      const lat = meal.location.latitude.toFixed(decimals);
      const lng = meal.location.longitude.toFixed(decimals);
      const locationKey = `${lat},${lng}`;

      if (!locationGroups[locationKey]) {
        locationGroups[locationKey] = [];
      }
      locationGroups[locationKey].push(meal);
    });

    // Create one marker per cluster — coordinate is the average of all meals in the cluster
    const groupedMarkers: Array<{
      locationKey: string,
      coordinate: {latitude: number, longitude: number},
      meals: MealEntry[],
      restaurant?: string,
      uniqueRestaurants: number,
    }> = [];

    Object.entries(locationGroups).forEach(([locationKey, meals]) => {
      const avgLat = meals.reduce((sum, m) => sum + m.location!.latitude, 0) / meals.length;
      const avgLng = meals.reduce((sum, m) => sum + m.location!.longitude, 0) / meals.length;
      const restaurant = meals[0].restaurant || meals.find(m => m.restaurant)?.restaurant;
      const uniqueRestaurants = new Set(meals.map(m => m.restaurant || m.id)).size;

      groupedMarkers.push({
        locationKey,
        coordinate: { latitude: avgLat, longitude: avgLng },
        meals,
        restaurant,
        uniqueRestaurants,
      });
    });

    return groupedMarkers;
  }, [filteredMeals, currentZoom]);

  // Force meals view (not wishlist) when viewing someone else's profile
  useEffect(() => {
    if (!isOwnProfile && showWishlist) {
      setShowWishlist(false);
    }
  }, [isOwnProfile]);

  useEffect(() => {
    if (showWishlist && isOwnProfile) {
      fetchSavedMeals();
    } else {
      fetchMealEntries();
    }
  }, [showWishlist, isOwnProfile]); // Re-fetch when toggling between modes or profile changes

  const fetchSavedMeals = async () => {
    try {
      setLoading(true);
      const targetUserId = userId || auth().currentUser?.uid;
      
      if (!targetUserId) {
        setError('User not authenticated');
        setLoading(false);
        return;
      }
      
      // Only show saved meals for own profile
      if (userId && userId !== auth().currentUser?.uid) {
        setAllMeals([]);
        setFilteredMeals([]);
        setLoading(false);
        return;
      }
      
      // Get list of saved meal IDs first
      const savedMealsRef = firestore()
        .collection('users')
        .doc(targetUserId)
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
                  pixel_art_url: data.pixel_art_url,
                  pixel_art_data: data.pixel_art_data,
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
      const result = applyFilter(fetchedMeals, activeFilters, activeRatingFilters);
      setLoading(false);

      // Trigger map fitting with freshly computed meals
      if (result && result.length > 0 && mapRef.current) {
        setTimeout(() => fitMapToMarkers(result), 300);
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
      const targetUserId = userId || auth().currentUser?.uid;
      
      if (!targetUserId) {
        setError('User not authenticated');
        setLoading(false);
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
        // Only include meals that have location data
        if (data.location) {
          // Make sure aiMetadata has the expected properties
          const aiMetadata = data.aiMetadata || {};
          
          fetchedMeals.push({
            id: doc.id,
            photoUrl: data.photoUrl,
            pixel_art_url: data.pixel_art_url || '',
            pixel_art_data: data.pixel_art_data,
            rating: data.rating,
            restaurant: data.restaurant || '',
            meal: data.meal || '',
            city: data.city || data.location?.city || '',
            userId: data.userId,
            location: data.location,
            createdAt: data.createdAt?.toDate?.() || Date.now(),
            aiMetadata: {
              cuisineType: aiMetadata.cuisineType || 'Unknown',
              foodType: aiMetadata.foodType || ['Unknown'],
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
      const result = applyFilter(fetchedMeals, activeFilters, activeRatingFilters);
      setLoading(false);

      // Trigger map fitting with freshly computed meals
      if (result && result.length > 0 && mapRef.current) {
        setTimeout(() => fitMapToMarkers(result), 300);
      }
    } catch (err: any) {
      console.error('Error fetching meal entries:', err);
      setError(`Failed to load meals: ${err.message}`);
      setLoading(false);
    }
  };

  const viewMealDetails = (meal: MealEntry) => {
    // Close modal if open
    setShowMealsModal(false);
    setSelectedLocationMeals(null);
    navigation.navigate('MealDetail', { 
      mealId: meal.id,
      previousScreen: 'FoodPassport',
      previousTabIndex: 2 // Map tab is at index 2
    });
  };
  
  const handleLocationPress = (meals: MealEntry[]) => {
    // Always use pager dot view behavior now
    // For both single and multiple meals, don't navigate directly
    // Let the callout handle navigation
    return;
  };
  
  const handleMarkerPress = (locationKey: string, meals: MealEntry[]) => {
    // Always open carousel — even for single meals
    setSelectedLocationMeals(meals);
    setShowMealsModal(true);
  };

  const handleImageError = (mealId: string) => {
    console.log(`Image load error for meal: ${mealId}`);
    setImageErrors(prev => ({ ...prev, [mealId]: true }));
  };

  // Add function to apply multiple filters
  const applyFilter = (mealsToFilter: MealEntry[], filters: FilterItem[] | null, ratingFilters?: number[] | null) => {
    console.log(`MapScreen: Applying filters to ${mealsToFilter.length} meals`);
    
    if ((!filters || filters.length === 0) && (!ratingFilters || ratingFilters.length === 0)) {
      console.log('MapScreen: No filters active, showing all meals');
      setFilteredMeals(mealsToFilter);
      return;
    }
    
    console.log(`MapScreen: ${filters?.length || 0} filters active, ${ratingFilters?.length || 0} rating filters active`);
    
    // Check if we have meals with metadata
    const mealsWithMetadata = mealsToFilter.filter(meal => meal.aiMetadata);
    console.log(`MapScreen: Found ${mealsWithMetadata.length} meals with aiMetadata`);
    
    // Start with all meals
    let result = [...mealsToFilter];
    
    // Apply each filter sequentially
    if (filters && filters.length > 0) {
      filters.forEach(filter => {
      console.log(`MapScreen: Applying filter: ${filter.type} = ${filter.value}`);
      
      if (filter.type === 'cuisineType') {
        result = result.filter(meal => 
          meal.aiMetadata && 
          meal.aiMetadata.cuisineType && 
          meal.aiMetadata.cuisineType === filter.value
        );
      } else if (filter.type === 'foodType') {
        result = result.filter(meal => {
          if (!meal.aiMetadata || !meal.aiMetadata.foodType) return false;
          
          // foodType is now an array
          if (Array.isArray(meal.aiMetadata.foodType)) {
            return meal.aiMetadata.foodType.includes(filter.value);
          } else {
            // Handle old data that might still be a string
            return meal.aiMetadata.foodType === filter.value;
          }
        });
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
    }
    
    console.log(`MapScreen: Final filter results: ${result.length} meals match all filter criteria`);
    
    // Apply rating filters if any are active
    if (ratingFilters && ratingFilters.length > 0) {
      console.log(`MapScreen: Applying rating filters:`, ratingFilters);
      const beforeRatingFilter = result.length;
      result = result.filter(meal => ratingFilters.includes(meal.rating));
      console.log(`MapScreen: After rating filter: ${beforeRatingFilter} meals -> ${result.length} meals remain`);
    }
    
    setFilteredMeals(result);
    return result; // Return so callers can use the result immediately
  };

  // Update the filter whenever activeFilters changes or when switching between modes
  useEffect(() => {
    console.log('MapScreen: activeFilters or activeRatingFilters changed or showWishlist toggled');
    const result = applyFilter(allMeals, activeFilters, activeRatingFilters);

    // Fit map to the freshly computed meals (not stale state)
    if (result && result.length > 0 && mapRef.current && !loading) {
      setTimeout(() => fitMapToMarkers(result), 300);
    }
  }, [activeFilters, activeRatingFilters, allMeals, showWishlist]);
  
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
  const fitMapToMarkers = (mealsOverride?: MealEntry[]) => {
    if (!mapRef.current) return;

    const meals = mealsOverride || filteredMeals;
    if (meals.length === 0) return;

    // Create an array of coordinates from meals
    const points = meals
      .filter(meal => meal.location && meal.location.latitude && meal.location.longitude)
      .map(meal => ({
        latitude: meal.location!.latitude,
        longitude: meal.location!.longitude
      }));

    if (points.length === 0) return;

    // If there's only one point, center on it at street level
    if (points.length === 1) {
      mapRef.current.animateToRegion({
        latitude: points[0].latitude,
        longitude: points[0].longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 1000);
      return;
    }

    // For multiple points, fit all markers on screen with tight padding
    mapRef.current.fitToCoordinates(points, {
      edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
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

  // Generate a shareable HTML map page, upload to Firebase Storage, share the link
  const shareMapToGoogleMaps = async () => {
    try {
      const mealsToShare = filteredMeals.filter(
        m => m.location?.latitude && m.location?.longitude
      );

      if (mealsToShare.length === 0) {
        Alert.alert('Nothing to Share', 'Add meals with location to share your food map.');
        return;
      }

      const userName = auth().currentUser?.displayName || 'A Forkful User';

      // Build markers JSON for the embedded map
      const markersJson = mealsToShare.map(meal => ({
        lat: meal.location!.latitude,
        lng: meal.location!.longitude,
        name: meal.meal || 'Untitled meal',
        restaurant: meal.restaurant || '',
        rating: meal.rating || 0,
      }));

      // Calculate map center
      const avgLat = markersJson.reduce((s, m) => s + m.lat, 0) / markersJson.length;
      const avgLng = markersJson.reduce((s, m) => s + m.lng, 0) / markersJson.length;

      // Generate a self-contained HTML page with Google Maps embed
      const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${userName}'s Food Passport</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,system-ui,sans-serif;background:#FAF9F6}
  #map{width:100%;height:70vh;min-height:400px}
  .header{padding:16px 20px;background:#1A1A1A;color:white}
  .header h1{font-size:18px;font-weight:600}
  .header p{font-size:13px;color:#aaa;margin-top:4px}
  .list{padding:12px 20px}
  .meal{padding:10px 0;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center}
  .meal-name{font-size:14px;font-weight:600;color:#1A1A1A}
  .meal-restaurant{font-size:12px;color:#858585;margin-top:2px}
  .meal-rating{font-size:13px;color:#8B7355;font-weight:600}
  .footer{padding:16px 20px;text-align:center;font-size:12px;color:#aaa}
  .footer a{color:#2D7A3E;text-decoration:none;font-weight:600}
</style>
</head><body>
<div class="header">
  <h1>🍽️ ${userName}'s Food Passport</h1>
  <p>${mealsToShare.length} dining experiences</p>
</div>
<div id="map"></div>
<div class="list">
${markersJson.map(m => `  <div class="meal">
    <div><div class="meal-name">${m.name}</div><div class="meal-restaurant">${m.restaurant}</div></div>
    ${m.rating > 0 ? `<div class="meal-rating">${m.rating}/6</div>` : ''}
  </div>`).join('\n')}
</div>
<div class="footer">Shared via <a href="https://apps.apple.com/app/forkful">Forkful</a></div>
<script>
const markers=${JSON.stringify(markersJson)};
function initMap(){
  const map=new google.maps.Map(document.getElementById('map'),{
    center:{lat:${avgLat},lng:${avgLng}},zoom:12,
    styles:[{featureType:"poi",stylers:[{visibility:"off"}]}]
  });
  const bounds=new google.maps.LatLngBounds();
  markers.forEach(m=>{
    const marker=new google.maps.Marker({
      position:{lat:m.lat,lng:m.lng},map,
      title:m.name
    });
    const info=new google.maps.InfoWindow({
      content:'<div style="font-family:sans-serif"><strong>'+m.name+'</strong><br><span style="color:#666">'+m.restaurant+'</span>'+(m.rating>0?'<br><span style="color:#8B7355">'+m.rating+'/6</span>':'')+'</div>'
    });
    marker.addListener('click',()=>info.open(map,marker));
    bounds.extend({lat:m.lat,lng:m.lng});
  });
  if(markers.length>1)map.fitBounds(bounds,{padding:50});
}
</script>
<script src="https://maps.googleapis.com/maps/api/js?key=AIzaSyAC3ibPKbYQFvv47fwTG9QqwUS5GYZhxFI&callback=initMap" async defer></script>
</body></html>`;

      // Write HTML to temp file
      const RNFS = require('react-native-fs');
      const fileName = `food-passport-${Date.now()}.html`;
      const filePath = `${RNFS.TemporaryDirectoryPath}${fileName}`;
      await RNFS.writeFile(filePath, html, 'utf8');

      // Upload to Firebase Storage with HTML content type
      const storageRef = firebase.storage().ref(`shared_maps/${auth().currentUser?.uid}/${fileName}`);
      await storageRef.putFile(filePath, { contentType: 'text/html' });
      const downloadUrl = await storageRef.getDownloadURL();

      // Clean up temp file
      await RNFS.unlink(filePath).catch(() => {});

      // Share the link
      const shareText = `Check out my Food Passport with ${mealsToShare.length} dining experiences! 🍽️\n\nFeaturing: ${mealsToShare.slice(0, 5).map(m => m.restaurant || m.meal || 'Untitled').join(', ')}${mealsToShare.length > 5 ? ' and more...' : ''}`;

      try {
        await Share.share({
          message: `${shareText}\n\n${downloadUrl}`,
        });
      } catch (shareError) {
        Clipboard.setString(downloadUrl);
        Alert.alert(
          'Link Copied',
          'Your Food Passport map link has been copied to clipboard.',
          [
            { text: 'OK', style: 'default' },
            { text: 'Open', onPress: () => Linking.openURL(downloadUrl) },
          ]
        );
      }
    } catch (error) {
      console.error('Error creating share link:', error);
      Alert.alert('Error', 'Could not create share link. Please try again.');
    }
  };

  // City chips — derived from all meals (must be above early returns).
  // Dedupe case-insensitively so "Venice" and "venice" collapse into one
  // chip, and always display Title Case (matches the Cities section on the
  // List tab, which already normalizes this way).
  const cityChips = useMemo(() => {
    const counts: Record<string, number> = {};
    const display: Record<string, string> = {};
    allMeals.forEach((m) => {
      const raw = (m.city || m.location?.city || '').trim();
      const key = raw.toLowerCase();
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
      if (!display[key]) {
        display[key] = raw
          .split(/\s+/)
          .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
          .join(' ');
      }
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([key]) => ({ label: display[key], type: 'city', value: display[key] }));
  }, [allMeals]);

  const isCityChipActive = (chip: {type: string; value: string}) =>
    !!activeFilters?.some((f) => f.type === chip.type && f.value === chip.value);

  const handleCityChipPress = (chip: {label: string; type: string; value: string}) => {
    if (!onFilterChange) return;
    const current = activeFilters || [];
    const active = isCityChipActive(chip);
    if (active) {
      const next = current.filter((f) => !(f.type === chip.type && f.value === chip.value));
      onFilterChange(next.length > 0 ? next : null);
    } else {
      onFilterChange([...current, chip]);
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
        {activeFilters && activeFilters.length > 0 ? (
          <>
            <Icon name="place" size={64} color="#ddd" />
            <Text style={styles.emptyText}>No meals match your filters</Text>
            <Text style={styles.emptySubtext}>
              Try different filters or clear your search
            </Text>
          </>
        ) : (
          <>
            {showWishlist ? (
              <>
                <Text style={styles.emptyText}>No saved meals yet</Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyText}>Add meals to see your automatically generated, sharable map!</Text>
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
        provider={PROVIDER_GOOGLE}
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={true}
        customMapStyle={mapStyle}
        onMapReady={fitMapToMarkers}
        onRegionChangeComplete={(region) => {
          const zoomLevel = calculateZoomLevel(region);
          setCurrentZoom(zoomLevel);
        }}
      >
        {locationGroupedMarkers.map(({ locationKey, coordinate, meals, restaurant, uniqueRestaurants }) => {
          // Pick the best meal to represent this cluster:
          // highest rated, tiebreak by earliest photo (oldest first)
          const bestMeal = [...meals].sort((a, b) => {
            if (b.rating !== a.rating) return b.rating - a.rating;
            return (a.createdAt || 0) - (b.createdAt || 0);
          })[0];

          // Show dot when cluster has 2+ unique restaurants, pixel art when just 1
          const showDot = uniqueRestaurants >= 2;
          const markerType = showDot ? 'dot' : 'emoji';

          return (
            <Marker
              key={`${locationKey}-${markerType}`}
              coordinate={coordinate}
              tracksViewChanges={false}
              onPress={() => handleMarkerPress(locationKey, meals)}
            >
              {showDot ? (
                // Scaled dot — sized by unique restaurant count
                (() => {
                  const baseSize = 14;
                  const dotSize = Math.min(baseSize + Math.sqrt(uniqueRestaurants - 1) * 8, 36);
                  return (
                    <View style={[
                      styles.scaledDot,
                      {
                        width: dotSize,
                        height: dotSize,
                        borderRadius: dotSize / 2,
                      },
                    ]} />
                  );
                })()
              ) : (
                // Single restaurant — show pixel art if we have it.
                // Older meals stored pixel art as base64 in pixel_art_data;
                // newer meals use a Storage URL in pixel_art_url. If neither
                // exists (older / wishlist meals without pixel art), fall back
                // to a small dot rather than the raw photo — keeps the map
                // looking consistent with the artistic style.
                bestMeal.pixel_art_url ? (
                  <View style={styles.customPhotoMarker}>
                    <Image
                      source={{ uri: bestMeal.pixel_art_url }}
                      style={styles.markerPixelArt}
                      resizeMode="contain"
                    />
                  </View>
                ) : bestMeal.pixel_art_data ? (
                  <View style={styles.customPhotoMarker}>
                    <Image
                      source={{ uri: `data:image/png;base64,${bestMeal.pixel_art_data}` }}
                      style={styles.markerPixelArt}
                      resizeMode="contain"
                    />
                  </View>
                ) : (
                  <View style={[
                    styles.scaledDot,
                    { width: 14, height: 14, borderRadius: 7 },
                  ]} />
                )
              )}
            </Marker>
          );
        })}
      </MapView>

      {/* Chip strip — rendered AFTER MapView so it sits on top of the native
          map. Wishlist is pinned as the first chip (own-profile only, since
          savedMeals are private); its tap swaps the map's data source via
          showWishlist rather than pushing a filter onto activeFilters. City
          chips follow. Replaces the older "Showing: Wishlist / Meals" toggle
          button that used to live in the bottom-right corner. */}
      {(cityChips.length > 0 || (isOwnProfile && onFilterChange)) && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.cityChipsContainer}
          contentContainerStyle={styles.cityChipsRow}
        >
          {isOwnProfile && (
            <TouchableOpacity
              key="wishlist-chip"
              style={[styles.cityChip, showWishlist && styles.cityChipActive]}
              onPress={() => setShowWishlist(!showWishlist)}
              activeOpacity={0.7}
            >
              <Text style={[styles.cityChipText, showWishlist && styles.cityChipTextActive]}>
                Wishlist
              </Text>
            </TouchableOpacity>
          )}
          {onFilterChange && cityChips.map((chip) => {
            const active = isCityChipActive(chip);
            return (
              <TouchableOpacity
                key={chip.value}
                style={[styles.cityChip, active && styles.cityChipActive]}
                onPress={() => handleCityChipPress(chip)}
                activeOpacity={0.7}
              >
                <Text style={[styles.cityChipText, active && styles.cityChipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
      
      {/* Floating buttons */}
      <View style={styles.buttonContainer}>
        {/* My Location button - to center on user's current location */}
        <TouchableOpacity
          style={[
            styles.floatingButton, 
            styles.locationButton, 
            showWishlist && { backgroundColor: 'rgba(255, 192, 8, 0.5)' }
          ]}
          onPress={requestLocationPermission}
        >
          <Image source={MAP_ICONS.myLocation} style={styles.buttonIcon} />
        </TouchableOpacity>
        
        {/* Share button */}
        <TouchableOpacity
          style={[
            styles.floatingButton, 
            styles.locationButton, 
            showWishlist && { backgroundColor: 'rgba(255, 192, 8, 0.5)' }
          ]}
          onPress={shareMapToGoogleMaps}
        >
          <Image source={MAP_ICONS.share} style={styles.buttonIcon} />
        </TouchableOpacity>
      </View>
      
      {/* Modal for multiple meals at one location */}
      <Modal
        visible={showMealsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowMealsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedLocationMeals?.[0]?.restaurant || 'Meals at this location'}
              </Text>
              <TouchableOpacity 
                onPress={() => setShowMealsModal(false)}
                style={styles.modalCloseButton}
              >
                <Icon name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              {selectedLocationMeals?.map((meal, index) => (
                <TouchableOpacity
                  key={meal.id}
                  style={[
                    styles.modalMealCard,
                    index === selectedLocationMeals.length - 1 && { marginRight: 0 }
                  ]}
                  activeOpacity={0.9}
                  onPress={() => viewMealDetails(meal)}
                >
                  {/* Photo with pixel art overlay */}
                  <View style={styles.modalImageContainer}>
                    {meal.photoUrl && !imageErrors[meal.id] ? (
                      <Image
                        source={{ uri: meal.photoUrl }}
                        style={styles.modalMealImage}
                        onError={() => handleImageError(meal.id)}
                      />
                    ) : (
                      <View style={styles.modalMealImagePlaceholder}>
                        <Icon name="image" size={30} color="#ddd" />
                      </View>
                    )}
                    {meal.pixel_art_url ? (
                      <Image
                        source={{ uri: meal.pixel_art_url }}
                        style={styles.modalPixelArtOverlay}
                        resizeMode="contain"
                      />
                    ) : null}
                  </View>
                  <View style={styles.modalMealInfo}>
                    <Text style={styles.modalMealName} numberOfLines={2}>
                      {meal.meal || 'Untitled meal'}
                    </Text>
                    <EmojiDisplay rating={meal.rating} size={22} />
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    paddingTop: 0,
    paddingBottom: 50,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'normal',
    color: '#555',
    marginTop: 15,
    textAlign: 'center',
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
  cityChipsContainer: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    zIndex: 10,
    elevation: 10,
  },
  cityChipsRow: {
    paddingHorizontal: 12,
    gap: 6,
  },
  cityChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.mediumGray,
  },
  cityChipActive: {
    backgroundColor: '#5B8A72',
    borderColor: '#5B8A72',
  },
  cityChipText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    fontWeight: '500',
    color: colors.textSecondary,
  },
  cityChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  map: {
    flex: 1,
    width: '100%',
    minHeight: 400, // Minimum height to ensure map is visible
  },
  buttonContainer: {
    position: 'absolute',
    right: 16,
    bottom: 120,
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  floatingButton: {
    backgroundColor: 'rgba(26, 43, 73, 0.8)', // Navy blue with 0.8 opacity
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
    tintColor: '#fff', // White tint for the icons
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
  calloutTapText: {
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 5,
  },
  calloutGroupText: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
  },
  // Custom marker styles
  customMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  markerBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  markerBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  // Carousel callout styles
  carouselCallout: {
    width: 280,
    minHeight: 200,
    borderRadius: 10,
    padding: 0,
    backgroundColor: 'transparent',
  },
  carouselCalloutContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  carouselTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  carouselScrollView: {
    maxHeight: 140,
    marginBottom: 5,
  },
  carouselItem: {
    width: 100,
    marginRight: 10,
    alignItems: 'center',
  },
  carouselImage: {
    width: 90,
    height: 90,
    borderRadius: 8,
    marginBottom: 5,
  },
  carouselImagePlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  carouselMealName: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
    marginBottom: 3,
  },
  carouselRating: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  carouselTapText: {
    fontSize: 10,
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
    backgroundColor: '#1a2b49', // Changed to navy blue for "My Meals" mode
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
    backgroundColor: '#FFC008', // Orange color for "Wishlist" mode
  },
  wishlistToggleText: {
    color: 'white',
    fontWeight: 'bold',
    marginLeft: 5,
    fontSize: 12,
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: spacing.borderRadius.lg,
    borderTopRightRadius: spacing.borderRadius.lg,
    paddingBottom: spacing.screenPadding,
    maxHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.screenPadding,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
  },
  modalTitle: {
    ...typography.bodyLarge,
    fontWeight: 'bold',
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  modalCloseButton: {
    padding: spacing.xs,
  },
  modalScrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.md,
  },
  modalMealCard: {
    width: 150,
    marginRight: 15,
  },
  modalImageContainer: {
    position: 'relative',
    width: 150,
    height: 150,
    marginBottom: 8,
  },
  modalMealImage: {
    width: 150,
    height: 150,
    borderRadius: 12,
  },
  modalMealImagePlaceholder: {
    width: 150,
    height: 150,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalPixelArtOverlay: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 36,
    height: 36,
  },
  modalMealInfo: {
    alignItems: 'center',
  },
  modalMealName: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
    marginBottom: 5,
    fontWeight: '500',
  },
  calloutStar: {
    width: 14,
    height: 14,
    marginHorizontal: 1,
  },
  modalStar: {
    width: 14,
    height: 14,
    marginHorizontal: 1,
  },
  // Custom photo marker styles for pager dot view
  customPhotoMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerPixelArt: {
    width: 30,
    height: 30,
  },
  markerCountBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#E63946',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'white',
  },
  markerCountBadgeText: {
    color: 'white',
    fontSize: 9,
    fontWeight: '700',
  },
  // Multi-meal emoji cluster
  emojiClusterMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  emojiClusterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 60,
    justifyContent: 'center',
  },
  emojiClusterCell: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 1,
  },
  emojiClusterIcon: {
    width: 26,
    height: 26,
  },
  emojiClusterPhoto: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  emojiClusterDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E63946',
  },
  emojiClusterOverflow: {
    backgroundColor: '#E63946',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 2,
  },
  emojiClusterOverflowText: {
    color: 'white',
    fontSize: 9,
    fontWeight: '700',
  },
  markerPhoto: {
    width: 60,
    height: 60,
    borderRadius: 8,
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
  photoCallout: {
    width: 220,
  },
  calloutRatingRow: {
    flexDirection: 'row',
    marginVertical: 3,
    justifyContent: 'center',
  },
  calloutInstruction: {
    fontSize: 9,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 3,
    textAlign: 'center',
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
  // Zoomed-out marker — single dot that scales with meal count
  scaledDot: {
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
});

export default MapScreen;