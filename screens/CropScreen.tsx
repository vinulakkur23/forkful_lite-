import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ActivityIndicator,
  Dimensions,
  Alert,
  Platform,
  StatusBar,
  SafeAreaView
} from 'react-native';
import ImageResizer from 'react-native-image-resizer';
import { CompositeNavigationProp, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, TabParamList } from '../App';
import ImageCropPicker from 'react-native-image-crop-picker';
import { searchNearbyRestaurants } from '../services/placesService';
import { getMenuSuggestionsForRestaurant } from '../services/menuSuggestionService';
import Geolocation from '@react-native-community/geolocation';
import Exif from 'react-native-exif';

// Extend the TabParamList to include exifData in the Crop screen params
declare module '../App' {
  interface TabParamList {
    Crop: {
      photo: {
        uri: string;
        width?: number;
        height?: number;
        originalUri?: string;
        fromGallery?: boolean;
        assetId?: string;
      };
      location?: {
        latitude: number;
        longitude: number;
        source: string;
      } | null;
      exifData?: any;
      _navigationKey: string;
    };
  }
}

// Define the navigation prop type
type CropScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Crop'>,
  StackNavigationProp<RootStackParamList>
>;

type CropScreenRouteProp = RouteProp<TabParamList, 'Crop'>;

type Props = {
  navigation: CropScreenNavigationProp;
  route: CropScreenRouteProp;
};

const { width: screenWidth } = Dimensions.get('window');

const CropScreen: React.FC<Props> = ({ route, navigation }) => {
  const { photo, location, _navigationKey } = route.params;
  const [processing, setProcessing] = useState(false);
  const [prefetchingSuggestions, setPrefetchingSuggestions] = useState(false);
  
  // Use refs to track component mounted state
  const isMounted = useRef(true);
  const cropperOpened = useRef(false);
  const suggestionsFetched = useRef(false);
  
  // Store the previous photo URI to detect changes
  const prevPhotoUri = useRef('');
  
  // Focus effect to reset state when screen gains focus
  useFocusEffect(
    React.useCallback(() => {
      console.log('CropScreen focused with key:', _navigationKey);
      console.log('Photo URI:', photo?.uri);
      console.log('Previous photo URI:', prevPhotoUri.current);
      
      // Check if this is a new photo by comparing URIs
      const isNewPhoto = photo?.uri && photo.uri !== prevPhotoUri.current;
      
      if (isNewPhoto) {
        console.log('New photo detected, resetting suggestion fetch state and clearing cache');
        // Store the current URI as previous for next comparison
        prevPhotoUri.current = photo.uri;
        // Reset the suggestion fetched state to ensure we fetch again
        suggestionsFetched.current = false;
        
        // IMMEDIATELY clear any previous prefetched suggestions to prevent using stale data
        if ((global as any).prefetchedSuggestions) {
          console.log("!!! EARLY CLEARING OF PREFETCHED SUGGESTIONS FOR NEW PHOTO !!!");
          (global as any).prefetchedSuggestions = null;
          delete (global as any).prefetchedSuggestions;
          (global as any).prefetchedPhotoUri = null;
          (global as any).prefetchedLocation = null;
        }
      }
      
      // Reset state when screen comes into focus
      isMounted.current = true;
      cropperOpened.current = false;
      setProcessing(false);
      
      // Start prefetching suggestions again for new photos
      if (isNewPhoto) {
        console.log('Starting suggestion prefetch for new photo');
        prefetchSuggestions();
      }
      
      // Delay opening the cropper to ensure:
      // 1. Component is fully rendered
      // 2. Previous picker is fully dismissed
      // 3. Memory is cleaned up
      setTimeout(() => {
        if (isMounted.current && !cropperOpened.current) {
          // Clean up memory before opening cropper
          ImageCropPicker.clean()
            .then(() => {
              console.log('Memory cleaned, opening cropper');
              openCropper();
            })
            .catch(e => {
              console.log('Cleanup error (ignoring):', e);
              // Try to open cropper anyway
              openCropper();
            });
        }
      }, 800); // Increased delay to ensure picker is fully dismissed
      
      return () => {
        console.log('CropScreen blurred');
      };
    }, [_navigationKey, photo?.uri]) // Add photo URI as dependency
  );

  // Setup effect that runs once on mount
  // Function to prefetch restaurant suggestions from original image
  const prefetchSuggestions = async () => {
    // Only prefetch if not already doing so and we have a valid photo
    if (!photo || !photo.uri || prefetchingSuggestions || suggestionsFetched.current) {
      return;
    }

    try {
      console.log('Starting to prefetch restaurant suggestions from original photo URI');
      setPrefetchingSuggestions(true);
      suggestionsFetched.current = true;

      // Use the original URI if available (for uploaded photos)
      let photoUriToUse = photo.originalUri || photo.uri;
      
      // Clean the URI by removing query parameters which can cause issues with EXIF extraction
      photoUriToUse = photoUriToUse.split('?')[0];
      
      // Assume ANY photo in iOS temporary directory is from gallery upload or camera
      // This is more reliable than checking for fromGallery which might be undefined
      const isFromIosTemporaryDir = Platform.OS === 'ios' && 
        (photoUriToUse.includes('/tmp/') || photoUriToUse.includes('/temporary/'));
      const isGalleryUpload = Boolean(photo.originalUri || photo.fromGallery || isFromIosTemporaryDir);
      
      // Log sources for debugging
      console.log(`Prefetching with photo URI (cleaned): ${photoUriToUse}`);
      console.log(`Is from gallery/camera: ${isGalleryUpload ? 'Yes' : 'No'} (fromGallery=${photo.fromGallery}, originalUri=${Boolean(photo.originalUri)}, isFromIosTemporaryDir=${isFromIosTemporaryDir})`);
      console.log(`Location data for prefetch:`, 
        location ? `${location.latitude}, ${location.longitude} (source: ${location.source})` : 'No location');
      
      // Check if we already have location from PHAsset (preferred source)
      // Make a defensive copy of the location and ensure source is set
      let enhancedLocation = location ? {
        ...location,
        // Add a default source if it's missing - PHAsset is the preferred source, not EXIF
        source: location.source || (isGalleryUpload ? 'phasset' : 'device')
      } : location;
      
      // If we have location data from photoLibraryService (either phasset or exif), prioritize it and skip EXIF extraction
      if (location) {
        console.log("Using location data provided from PHAsset/photoLibraryService extraction:", {
          latitude: location.latitude,
          longitude: location.longitude,
          source: enhancedLocation.source
        });
      } 
      // If we have route.params.exifData from photoLibraryService, use it
      else if (route.params.exifData) {
        console.log("Using EXIF data passed in route params (no location found in PHAsset):", route.params.exifData);
        
        // Check if GPS coordinates are available in the passed EXIF data
        if (route.params.exifData.location) {
          console.log("Found GPS data in passed EXIF data:", route.params.exifData.location);
          
          enhancedLocation = {
            latitude: route.params.exifData.location.latitude,
            longitude: route.params.exifData.location.longitude,
            source: 'exif'
          };
          
          console.log("Will use passed EXIF location data for API call");
        } else {
          console.log("Passed EXIF data doesn't contain GPS coordinates");
        }
      }
      // Immediate fallback to device location when PHAsset and EXIF fail
      else {
        console.log("No location data available from PHAsset or EXIF, immediately getting device location");
        
        try {
          // Get current device location with better timeout handling
          const deviceLocationPromise = new Promise<any>((resolve, reject) => {
            // Add a timeout to ensure we don't wait too long
            const timeoutId = setTimeout(() => {
              reject(new Error('Device location request timed out'));
            }, 4000); // 4-second timeout
            
            // Request location with high accuracy
            Geolocation.getCurrentPosition(
              (position) => {
                clearTimeout(timeoutId);
                resolve(position);
              },
              (error) => {
                clearTimeout(timeoutId);
                reject(error);
              },
              { 
                enableHighAccuracy: true, 
                timeout: 3500,       // Less than our outer timeout 
                maximumAge: 10000    // Accept cached results up to 10 seconds old
              }
            );
          });
          
          const devicePosition = await deviceLocationPromise;
          if (devicePosition && devicePosition.coords) {
            enhancedLocation = {
              latitude: devicePosition.coords.latitude,
              longitude: devicePosition.coords.longitude,
              source: 'device'
            };
            console.log(`Successfully got device location as fallback: ${enhancedLocation.latitude}, ${enhancedLocation.longitude}`);
          }
        } catch (locationError) {
          console.log('Error getting device location:', locationError);
          console.log('Will proceed without location data');
        }
      }
      
      // Track the current photo URI in global state to prevent caching issues
      (global as any).currentPhotoUri = photoUriToUse;
      
      // We've already cleared the suggestions in the useFocusEffect when a new photo was detected
      // so we don't need to clear them again here
      
      // Make a fresh API call for this photo
      console.log("Making API call for fresh suggestions");
      
      // Use a clean URI for the API call (no query parameters)
      // This should work better with the API and EXIF extraction
      const apiUri = photoUriToUse.split('?')[0];
      console.log(`Using cleaned URI for API call: ${apiUri}`);
      
      // Try to get a location - with aggressive fallbacks to ensure we have data
      let effectiveLocation = enhancedLocation;
      
      // If we don't have location data from PHAsset/EXIF, try to get device location as a last resort
      if (!effectiveLocation) {
        console.log('No PHAsset or EXIF location data, attempting to get device location as fallback');
        try {
          // Use Platform-specific APIs to get current device location
          if (Platform.OS === 'ios') {
            const deviceLocationPromise = new Promise<any>((resolve, reject) => {
              // Add a timeout to ensure we don't wait too long
              const timeoutId = setTimeout(() => {
                reject(new Error('Device location request timed out'));
              }, 3000); // 3 second timeout
              
              // Request location
              Geolocation.getCurrentPosition(
                (position) => {
                  clearTimeout(timeoutId);
                  resolve(position);
                },
                (error) => {
                  clearTimeout(timeoutId);
                  reject(error);
                },
                { enableHighAccuracy: true, timeout: 2500, maximumAge: 5000 }
              );
            });
            
            try {
              const devicePosition = await deviceLocationPromise;
              if (devicePosition && devicePosition.coords) {
                effectiveLocation = {
                  latitude: devicePosition.coords.latitude,
                  longitude: devicePosition.coords.longitude,
                  source: 'device'
                };
                console.log(`Got device location as fallback: ${effectiveLocation.latitude}, ${effectiveLocation.longitude}`);
              }
            } catch (locationError) {
              console.log('Failed to get device location as fallback:', locationError);
            }
          }
        } catch (fallbackError) {
          console.log('Error during location fallback:', fallbackError);
        }
      }
      
      // Even if we don't have location data, we still want to proceed to the next screen
      // We'll just store the photo URI to ensure it can be processed correctly
      (global as any).prefetchedPhotoUri = photoUriToUse;
      
      // If we have either original or fallback location data, proceed with API call
      if (effectiveLocation) {
        console.log(`Using location data for Google Places API search: ${effectiveLocation.latitude}, ${effectiveLocation.longitude} (source: ${effectiveLocation.source})`);

        try {
          // DIRECTLY call Google Places API instead of the dishitout API
          const restaurants = await searchNearbyRestaurants(effectiveLocation);
          
          // Create suggestions object in the format expected by later screens
          const suggestions = {
            restaurants: restaurants,
            menu_items: [],
            suggested_meal: null,
            suggested_meals: [] // Add array for multiple meal suggestions
          };

          // Store the suggestion data in global scope for use in the Rating screen
          // Also store the photo URI and location to validate in later screens
          (global as any).prefetchedSuggestions = suggestions;
          (global as any).prefetchedLocation = effectiveLocation;

          console.log('Successfully prefetched restaurant suggestions directly from Google Places API:',
            suggestions.restaurants?.length || 0, 'restaurants');
            
          // If we have restaurant suggestions, also prefetch meal suggestions for the first restaurant
          if (restaurants.length > 0) {
            try {
              console.log(`Prefetching meal suggestions for restaurant: ${restaurants[0].name}`);
              
              // Call the meal suggestion API for the first restaurant
              const mealSuggestions = await getMenuSuggestionsForRestaurant(
                restaurants[0].name,
                photoUriToUse,
                effectiveLocation
              );
              
              // Update the prefetched suggestions with meal data
              if (mealSuggestions.menu_items && mealSuggestions.menu_items.length > 0) {
                (global as any).prefetchedSuggestions.menu_items = mealSuggestions.menu_items;
                console.log(`Successfully prefetched ${mealSuggestions.menu_items.length} menu items`);
              }
              
              // Store the meal suggestions
              if (mealSuggestions.suggested_meals && mealSuggestions.suggested_meals.length > 0) {
                (global as any).prefetchedSuggestions.suggested_meals = mealSuggestions.suggested_meals;
                // Also set the first suggestion as the main suggested meal for backward compatibility
                (global as any).prefetchedSuggestions.suggested_meal = mealSuggestions.suggested_meals[0];
                console.log(`Successfully prefetched ${mealSuggestions.suggested_meals.length} meal suggestions`);
              }
            } catch (mealError) {
              console.error('Error prefetching meal suggestions:', mealError);
              // Continue without meal suggestions - they will be fetched later if needed
            }
          }
        } catch (apiError) {
          console.error('Error calling Places API:', apiError);
          // Continue without suggestions - the RatingScreen will handle missing data
        }
      } else {
        console.log('No location data available after all fallbacks, proceeding without restaurant suggestions');
        // We still continue to the next screen - the user will need to enter restaurant info manually
      }
    } catch (error) {
      console.error('Error prefetching restaurant suggestions:', error);
      // Don't show errors to the user - this is a background operation
    } finally {
      if (isMounted.current) {
        setPrefetchingSuggestions(false);
      }
    }
  };

  useEffect(() => {
    console.log('CropScreen mounted with key:', _navigationKey);
    
    // Set mounted flag
    isMounted.current = true;
    suggestionsFetched.current = false;
    
    // Always clear the global suggestions cache on mount to ensure fresh data
    if ((global as any).prefetchedSuggestions) {
      console.log('Clearing any previously cached suggestions');
      (global as any).prefetchedSuggestions = null;
    }
    
    // Validate photo object
    if (!photo || !photo.uri) {
      console.error("Invalid photo object in CropScreen:", photo);
      Alert.alert(
        "Error",
        "Invalid photo data received. Please try taking a photo again.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
      return;
    }
    
    // Update the previous URI reference
    if (photo.uri !== prevPhotoUri.current) {
      console.log('New photo detected in mount effect');
      prevPhotoUri.current = photo.uri;
    }

    // Set transparent status bar (platform-specific)
    if (Platform.OS === 'android') {
      StatusBar.setTranslucent(true);
      StatusBar.setBackgroundColor('transparent');
    } else {
      // iOS handling
      StatusBar.setBarStyle('dark-content');
    }
    
    // Start prefetching suggestions in the background
    // This should happen even for uploaded photos
    prefetchSuggestions();
    
    // Cleanup when component unmounts
    return () => {
      console.log('CropScreen unmounting');
      isMounted.current = false;
      
      // Restore status bar (platform-specific)
      if (Platform.OS === 'android') {
        StatusBar.setTranslucent(false);
        StatusBar.setBackgroundColor('#ffffff');
      } else {
        // iOS handling
        StatusBar.setBarStyle('default');
      }
      
      // Clean up any remaining resources
      ImageCropPicker.clean().catch(e => {
        console.log('ImageCropPicker cleanup error:', e);
      });
    };
  }, []);

  // Open the cropper directly
  // Helper function to compress image
  const compressImage = async (imagePath: string): Promise<string> => {
    try {
      console.log('Compressing image to reduce file size and AI processing costs...');
      
      // Compress with quality settings optimized for AI processing
      // Lower resolution saves significantly on AI vision API costs (charged per pixel)
      const compressedImage = await ImageResizer.createResizedImage(
        imagePath,
        800, // Max width - good balance between quality and cost
        800, // Max height - good balance between quality and cost  
        'JPEG', // Format
        85, // Quality (85% is sweet spot for good quality + smaller size)
        0, // Rotation
        undefined, // Output path (auto-generated)
        false, // Keep metadata
        {
          mode: 'contain', // Maintain aspect ratio
          onlyScaleDown: true, // Don't upscale if image is smaller
        }
      );
      
      console.log('Image compressed successfully. Original:', imagePath, 'Compressed:', compressedImage.uri);
      console.log('Compression details:', {
        originalSize: 'Unknown',
        newSize: `${compressedImage.width}x${compressedImage.height}`,
        quality: '85%',
        format: 'JPEG'
      });
      
      return compressedImage.uri;
    } catch (error) {
      console.error('Error compressing image:', error);
      // If compression fails, return original path
      console.log('Falling back to original image due to compression error');
      return imagePath;
    }
  };

  const openCropper = async () => {
    try {
      // Check if already processing or component unmounted
      if (processing || !isMounted.current || cropperOpened.current) {
        console.log('Skipping cropper open - already processing or opened');
        return;
      }
      
      // Mark that we're processing and have opened the cropper
      setProcessing(true);
      cropperOpened.current = true;
      
      // Ensure we have a valid photo URI
      if (!photo || !photo.uri) {
        throw new Error('Invalid photo URI');
      }
      
      // Clean up URI by removing query parameters if any
      const cleanUri = photo.uri.split('?')[0];
      console.log('Opening cropper with URI:', cleanUri);
      
      // Add a small delay to ensure UI is ready (helps with memory pressure)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Set square crop dimensions - use the minimum dimension to ensure a proper square
      const cropSize = Math.min(photo.width || 1000, photo.height || 1000);
      
      console.log(`Opening cropper with size: ${cropSize}x${cropSize}`);

      // Open image cropper with square aspect ratio
      const result = await ImageCropPicker.openCropper({
        path: cleanUri,
        width: cropSize || 1000, // Use image's size if available
        height: cropSize || 1000,
        cropperCircleOverlay: false,
        cropping: true,
        cropperToolbarTitle: 'Crop Photo (Square)',
        hideBottomControls: false,
        showCropGuidelines: true,
        cropperActiveWidgetColor: '#ff6b6b',
        cropperStatusBarColor: '#000000',
        cropperToolbarColor: '#000000',
        cropperToolbarWidgetColor: '#ffffff',
        freeStyleCropEnabled: false,
        aspectRatio: 1/1, // Force square (1:1) aspect ratio
        mediaType: 'photo',
      });
      
      // If component is still mounted, compress image and navigate to next screen
      if (isMounted.current) {
        // Compress the cropped image to reduce file size and AI processing costs
        const compressedImageUri = await compressImage(result.path);
        
        // Generate a unique navigation key
        const timestamp = new Date().getTime();
        
        // Prepare any cached suggestion data
        const cachedSuggestions = (global as any).prefetchedSuggestions;
        
        // Check if photo is from camera (fresh photo) or gallery (already taken)
        const isFromCamera = !route.params.photo?.fromGallery;
        
        // Use the saved location in prefetchedLocation if available (has the right source)
        const locationToUse = (global as any).prefetchedLocation || location;
        
        if (isFromCamera) {
          // Camera photos: Skip RatingScreen1, go directly to RatingScreen2 (meal hasn't been eaten yet)
          console.log('Camera photo detected - navigating directly to RatingScreen2 (meal not eaten yet)');
          navigation.navigate('RatingScreen2', {
            photo: {
              uri: compressedImageUri, // Use compressed image
              width: result.width,
              height: result.height,
            },
            location: locationToUse,
            rating: 0, // No rating yet
            likedComment: '',
            dislikedComment: '',
            suggestionData: cachedSuggestions || undefined,
            _uniqueKey: `rating_screen2_${timestamp}`,
          });
        } else {
          // Gallery photos: Go to RatingScreen1 (meal already eaten, rate the experience)
          console.log('Gallery photo detected - navigating to RatingScreen1 with cropped image:', compressedImageUri);
          console.log('Passing prefetched suggestions:', 
            cachedSuggestions ? 'Yes - cached data available' : 'No - no cached data');
          
          navigation.navigate('RatingScreen1', {
            photo: {
              uri: compressedImageUri, // Use compressed image
              width: result.width,
              height: result.height,
            },
            location: locationToUse,
            // Include EXIF data if available from route params
            exifData: route.params.exifData,
            // Include suggestionData if available
            suggestionData: cachedSuggestions || undefined,
            // Pass through photo source
            photoSource: route.params.photoSource,
            _uniqueKey: `rating_screen1_${timestamp}`,
          });
        }
        
        console.log('Passing location data to RatingScreen:', 
          locationToUse ? `${locationToUse.latitude}, ${locationToUse.longitude} (source: ${locationToUse.source})` : 'No location');
        
        // Don't clear the global cache here since EditPhoto will pass it along to Rating
      }
    } catch (error) {
      console.log('Crop error:', error);
      
      if (isMounted.current) {
        // Check for specific error types
        if (error.code === 'E_PICKER_CANCELLED' || error.message === 'User cancelled image selection') {
          // If user cancelled, go back
          console.log('User cancelled cropping');
          navigation.goBack();
        } else if (error.message && error.message.includes('memory')) {
          // Memory pressure error
          Alert.alert(
            'Memory Warning',
            'Your device is running low on memory. Please close some apps and try again.',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
        } else {
          // For other errors, show a more detailed alert
          Alert.alert(
            'Error',
            `Failed to crop image: ${error.message || 'Unknown error'}`,
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
        }
      }
    } finally {
      // Reset processing state if component still mounted
      if (isMounted.current) {
        setProcessing(false);
        cropperOpened.current = false; // Reset cropper opened flag
      }
    }
  };

  // Simple loading screen with better feedback
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" />
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff6b6b" />
        <Text style={styles.loadingText}>
          {cropperOpened.current ? 'Loading photo...' : 'Opening cropper...'}
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  loadingText: {
    color: 'white',
    marginTop: 10,
    fontSize: 16,
    textAlign: 'center',
  },
  smallText: {
    fontSize: 14,
    marginTop: 8,
    opacity: 0.8,
    fontWeight: '400',
  },
});

export default CropScreen;