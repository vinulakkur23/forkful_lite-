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
  SafeAreaView,
  TouchableOpacity,
  ScrollView
} from 'react-native';
import Slider from '@react-native-community/slider';
import { ColorMatrix, concatColorMatrices, brightness, contrast, saturate } from 'react-native-color-matrix-image-filters';
import Icon from 'react-native-vector-icons/MaterialIcons';
import ImageResizer from 'react-native-image-resizer';
import { CompositeNavigationProp, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, TabParamList } from '../App';
import ImageCropPicker from 'react-native-image-crop-picker';
// Import theme
import { colors, typography, spacing, shadows } from '../themes';
import { searchNearbyRestaurants } from '../services/placesService';
// import { getMenuSuggestionsForRestaurant } from '../services/menuSuggestionService'; // DISABLED FOR PERFORMANCE
import Geolocation from '@react-native-community/geolocation';
import Exif from 'react-native-exif';
import RNFS from 'react-native-fs';
import ViewShot from 'react-native-view-shot';
import { uploadImageToFirebase } from '../services/imageUploadService';
import { auth } from '../firebaseConfig';
import API_CONFIG, { ensureServerAwake } from '../config/api';

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
      // CLEAN APPROACH: Pass meal ID instead of meal data
      mealId?: string;
      // New parameters for adding photos to existing meals
      isAddingToExistingMeal?: boolean;
      existingMealId?: string;
      returnToEditMeal?: boolean;
      fromGalleryFlow?: boolean;
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
  const { photo, location, _navigationKey, mealId, isAddingToExistingMeal, existingMealId, returnToEditMeal } = route.params;
  const [processing, setProcessing] = useState(false);
  const [prefetchingSuggestions, setPrefetchingSuggestions] = useState(false);
  const [brightnessValue, setBrightnessValue] = useState(1.0);
  const [contrastValue, setContrastValue] = useState(1.0);
  const [saturationValue, setSaturationValue] = useState(1.0);
  const [croppedImage, setCroppedImage] = useState<{uri: string, width: number, height: number} | null>(null);
  const [hasEdits, setHasEdits] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceMode, setEnhanceMode] = useState<'lut_only' | 'gemini_only' | 'full' | null>(null);
  const [originalBeforeEnhance, setOriginalBeforeEnhance] = useState<{uri: string, width: number, height: number} | null>(null);
  const [isEnhanced, setIsEnhanced] = useState(false);
  const [enhancedWith, setEnhancedWith] = useState<'lut_only' | 'gemini_only' | 'full' | null>(null);
  
  // Use refs to track component mounted state
  const isMounted = useRef(true);
  const cropperOpened = useRef(false);
  const hasCompletedCrop = useRef(false); // Prevents re-opening cropper after it's been used
  const suggestionsFetched = useRef(false);
  
  // Ref for capturing the filtered image
  const filteredImageRef = useRef<ViewShot>(null);
  
  // Store the previous photo URI to detect changes
  const prevPhotoUri = useRef('');
  
  // Track if edits have been made
  useEffect(() => {
    setHasEdits(
      brightnessValue !== 1.0 || 
      contrastValue !== 1.0 || 
      saturationValue !== 1.0
    );
  }, [brightnessValue, contrastValue, saturationValue]);
  
  const applyFiltersAndSave = async (imageUri: string): Promise<string> => {
    if (!hasEdits) {
      // No edits, return original
      return imageUri;
    }
    
    try {
      console.log('Capturing filtered image...');
      console.log('Filter values:', { brightnessValue, contrastValue, saturationValue });
      console.log('Cropped image URI:', croppedImage?.uri);
      
      if (!filteredImageRef.current) {
        console.error('ViewShot ref not available');
        return imageUri;
      }
      
      if (!croppedImage?.uri) {
        console.error('No cropped image available for filtering');
        return imageUri;
      }
      
      // Verify the image file exists before trying to capture
      try {
        const fileExists = await RNFS.exists(croppedImage.uri);
        if (!fileExists) {
          console.error('Cropped image file no longer exists:', croppedImage.uri);
          return imageUri;
        }
      } catch (fileCheckError) {
        console.error('Error checking if file exists:', fileCheckError);
        return imageUri;
      }
      
      // Simple capture of the filtered image
      const capturedImageUri = await filteredImageRef.current.capture({
        format: 'jpg',
        quality: 0.9,
      });
      
      console.log('Filter applied and saved:', capturedImageUri);
      return capturedImageUri;

    } catch (error) {
      console.error('Error capturing filtered image:', error);
      return imageUri;
    }
  };

  const handleEnhance = async (mode: 'lut_only' | 'gemini_only' | 'full' = 'full') => {
    if (!croppedImage?.uri || isEnhancing) return;

    try {
      setIsEnhancing(true);
      setEnhanceMode(mode);

      // Store original for revert (only if not already enhanced)
      if (!originalBeforeEnhance) {
        setOriginalBeforeEnhance({ ...croppedImage });
      }

      // Wake up the server if needed
      await ensureServerAwake();

      // Build FormData with the current image
      const formData = new FormData();
      formData.append('image', {
        uri: croppedImage.uri,
        name: 'food_photo.jpg',
        type: 'image/jpeg',
      } as any);
      formData.append('mode', mode);

      const timeoutMs = mode === 'lut_only' ? 30000 : 90000;
      console.log(`Sending image for ${mode} enhancement...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(API_CONFIG.getUrl('/enhance-photo'), {
        method: 'POST',
        body: formData,
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log('Enhancement result:', result.mode, result.steps, result.output_size);

      if (result.enhanced_image) {
        // Write base64 to a temp file (more reliable than data URI in RN Image)
        const base64Data = result.enhanced_image.replace(/^data:image\/\w+;base64,/, '');
        const tempPath = `${RNFS.TemporaryDirectoryPath}/enhanced_${Date.now()}.jpg`;
        await RNFS.writeFile(tempPath, base64Data, 'base64');

        // Update displayed image
        setCroppedImage({
          uri: tempPath,
          width: parseInt(result.output_size?.split('x')[0]) || 1024,
          height: parseInt(result.output_size?.split('x')[1]) || 1024,
        });
        setIsEnhanced(true);
        setEnhancedWith(mode);

        // Reset sliders since the image changed
        setBrightnessValue(1.0);
        setContrastValue(1.0);
        setSaturationValue(1.0);
        setHasEdits(false);
        setImageLoaded(false);
      } else {
        throw new Error('No enhanced image returned');
      }
    } catch (error: any) {
      console.error('Enhancement failed:', error);
      if (error.name === 'AbortError') {
        Alert.alert('Timeout', 'Enhancement took too long. Please try again.');
      } else {
        Alert.alert('Enhancement Failed', 'Could not enhance the photo. You can continue with the original.');
      }
      // Only revert originalBeforeEnhance if nothing was previously enhanced
      if (!isEnhanced) {
        setOriginalBeforeEnhance(null);
      }
    } finally {
      setIsEnhancing(false);
      setEnhanceMode(null);
    }
  };

  const handleRevertEnhance = () => {
    if (originalBeforeEnhance) {
      setCroppedImage(originalBeforeEnhance);
      setOriginalBeforeEnhance(null);
      setIsEnhanced(false);
      setEnhancedWith(null);
      // Reset sliders
      setBrightnessValue(1.0);
      setContrastValue(1.0);
      setSaturationValue(1.0);
      setHasEdits(false);
      setImageLoaded(false);
    }
  };
  
  const handleContinue = async () => {
    if (!croppedImage || !croppedImage.uri) {
      console.error('No valid cropped image to continue with');
      return;
    }
    
    try {
      setProcessing(true);
      
      // Apply filters and get final image URI
      const finalImageUri = await applyFiltersAndSave(croppedImage.uri);
      
      // Check if this is adding to an existing meal
      if (isAddingToExistingMeal && returnToEditMeal && existingMealId) {
        console.log('Adding processed photo to existing meal:', existingMealId);
        
        // Navigate back to EditMealScreen with the processed photo
        navigation.navigate('EditMeal', {
          mealId: existingMealId,
          meal: {}, // This will be refreshed by EditMealScreen
          processedPhotoUri: finalImageUri,
          editingPhotoIndex: route.params.editingPhotoIndex // Pass back the photo index if editing
        });
        
        return;
      }
      
      // Check if this is Path 2 (upload flow with pending meal data)
      const pendingMealData = route.params.pendingMealData;

      if (pendingMealData && mealId) {
        // Path 2: Gallery upload flow → Mark meal as no longer unrated and navigate to EditMealScreen
        console.log('Path 2: Updating meal and navigating to EditMealScreen');

        try {
          // Import firestore
          const { firestore } = await import('../firebaseConfig');

          // Get current user for upload path
          const currentUser = auth().currentUser;
          if (!currentUser) {
            console.error('No authenticated user for upload');
            Alert.alert('Error', 'Please log in to continue');
            return;
          }

          // Upload edited photo to Firebase Storage
          console.log('Uploading edited photo to Firebase Storage...');
          const firebasePhotoUrl = await uploadImageToFirebase(finalImageUri, currentUser.uid);
          console.log('Photo uploaded to Firebase:', firebasePhotoUrl);

          // Update the meal with Firebase Storage URL (not local path)
          await firestore().collection('mealEntries').doc(mealId).update({
            isUnrated: false,
            photoUrl: firebasePhotoUrl, // Firebase Storage URL
            updatedAt: firestore.FieldValue.serverTimestamp(),
          });

          console.log('Meal updated, navigating to EditMealScreen');

          // Navigate to EditMealScreen
          navigation.navigate('EditMeal', {
            mealId: mealId,
            meal: {
              id: mealId,
              photoUrl: firebasePhotoUrl, // Use Firebase URL
              meal: pendingMealData.dishName,
              restaurant: pendingMealData.restaurant,
              rating: 0, // Still needs rating
            },
            previousScreen: 'CropScreen',
          });

          return;
        } catch (error) {
          console.error('Error updating meal for Path 2:', error);
          Alert.alert('Error', 'Failed to update meal. Please try again.');
          return;
        }
      }

      // Original flow for new meals (current flow)
      const timestamp = new Date().getTime();
      const cachedSuggestions = (global as any).prefetchedSuggestions;
      const isFromCamera = !route.params.photo?.fromGallery;
      const locationToUse = (global as any).prefetchedLocation || location;

      // Create clean photo data with final processed image
      const photoData = {
        uri: finalImageUri,  // Use the processed image
        width: croppedImage.width,
        height: croppedImage.height,
        timestamp: route.params.photo?.timestamp, // Pass through photo creation date
      };

      const safeLocation = locationToUse ? {
        latitude: Number(locationToUse.latitude),
        longitude: Number(locationToUse.longitude),
        source: String(locationToUse.source || 'unknown')
      } : null;

      // Gallery flow: navigate to RatingScreen2 for meal details entry
      if (route.params.fromGalleryFlow) {
        console.log('Gallery flow: navigating to RatingScreen2 with edited photo');
        navigation.navigate('RatingScreen2', {
          photo: photoData,
          location: safeLocation,
          exifData: route.params.exifData,
          photoSource: 'gallery',
          _uniqueKey: `gallery_${timestamp}`,
          rating: 0,
          likedComment: '',
          dislikedComment: '',
        });
        return;
      }

      // CLEAN APPROACH: Navigate to Results with cropped image and meal ID
      console.log('Navigating to Results with cropped image and meal ID:', mealId);

      try {
        const resultParams = {
          photo: photoData,
          location: safeLocation,
          // CLEAN APPROACH: Pass meal ID to load data from Firestore
          mealId: mealId,
          _uniqueKey: `result_${timestamp}`,
        };

        console.log('CropScreen navigation to Results params preview:', {
          hasPhoto: !!resultParams.photo,
          hasLocation: !!resultParams.location,
          mealId: resultParams.mealId,
          uniqueKey: resultParams._uniqueKey
        });

        navigation.navigate('Result', resultParams);
      } catch (navError) {
        console.error('CropScreen navigation error:', navError);
        Alert.alert('Navigation Error', 'Failed to proceed to results. Please try again.');
      }
      
      console.log('Passing location data to RatingScreen:', 
        locationToUse ? `${locationToUse.latitude}, ${locationToUse.longitude} (source: ${locationToUse.source})` : 'No location');
        
    } catch (error) {
      console.error('Error processing image:', error);
      Alert.alert('Error', 'Failed to process image');
    } finally {
      setProcessing(false);
    }
  };
  
  // Focus effect to reset state when screen gains focus
  useFocusEffect(
    React.useCallback(() => {
      console.log('CropScreen focused with key:', _navigationKey);
      console.log('Photo URI:', photo?.uri);
      console.log('Previous photo URI:', prevPhotoUri.current);
      
      // Check if this is a new photo by comparing URIs
      const isNewPhoto = photo?.uri && photo.uri !== prevPhotoUri.current;
      
      if (isNewPhoto) {
        console.log('New photo detected, resetting all state and clearing cache');
        // Store the current URI as previous for next comparison
        prevPhotoUri.current = photo.uri;
        // Reset the suggestion fetched state to ensure we fetch again
        suggestionsFetched.current = false;
        
        // Reset all editing values to defaults for new photo
        setBrightnessValue(1.0);
        setContrastValue(1.0);
        setSaturationValue(1.0);
        setCroppedImage(null);
        setHasEdits(false);
        setImageLoaded(false);
        setIsEnhancing(false);
        setEnhanceMode(null);
        setIsEnhanced(false);
        setEnhancedWith(null);
        setOriginalBeforeEnhance(null);
        
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

      // Only reset cropper state for NEW photos — not on every focus.
      // This prevents the cropper from re-opening when navigating back
      // from RatingScreen2 (which refocuses this tab route).
      if (isNewPhoto) {
        cropperOpened.current = false;
        hasCompletedCrop.current = false;
        setProcessing(false);
        console.log('Starting suggestion prefetch for new photo');
        prefetchSuggestions();
      }

      // Delay opening the cropper to ensure:
      // 1. Component is fully rendered
      // 2. Previous picker is fully dismissed
      // 3. Memory is cleaned up
      setTimeout(() => {
        if (isMounted.current && !cropperOpened.current && !hasCompletedCrop.current) {
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
            
          // DISABLED FOR PERFORMANCE - EXPENSIVE API CALLS
          // If we have restaurant suggestions, also prefetch meal suggestions for the first restaurant
          if (restaurants.length > 0) {
            console.log(`Skipping meal suggestions prefetch for restaurant: ${restaurants[0].name} (disabled for performance)`);
            /* COMMENTED OUT - EXPENSIVE API CALLS
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
            */
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
      
      // Clean up temporary images to free memory
      const cleanupTempImages = async () => {
        try {
          const tempDir = Platform.OS === 'ios' 
            ? RNFS.TemporaryDirectoryPath 
            : RNFS.CachesDirectoryPath;
          const files = await RNFS.readDir(tempDir);
          const editedImages = files.filter(file => 
            file.name.includes('viewshot-') || 
            file.name.includes('ReactNative')
          );
          for (const file of editedImages.slice(0, 10)) { // Only clean oldest 10
            await RNFS.unlink(file.path).catch(() => {});
          }
        } catch (error) {
          // Ignore cleanup errors
        }
      };
      cleanupTempImages();
      
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
        1400, // Max width - increased for better quality (display images need higher res)
        1400, // Max height - increased for better quality
        'JPEG', // Format
        95, // Quality - increased from 85% to 95% for better quality
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
      let cleanUri = photo.uri.split('?')[0];
      console.log('Opening cropper with original URI:', cleanUri);

      // Gallery photos from the native PHPicker are saved to NSTemporaryDirectory
      // which can get cleaned up. Copy to a persistent location and ensure file:// prefix.
      if (photo.fromGallery) {
        try {
          // Strip file:// if present to get the raw path for RNFS
          const rawPath = cleanUri.replace('file://', '');
          const exists = await RNFS.exists(rawPath);
          console.log('Gallery photo exists at path:', exists, rawPath);

          if (exists) {
            const persistDir = `${RNFS.DocumentDirectoryPath}/CropInput`;
            await RNFS.mkdir(persistDir).catch(() => {});
            const localPath = `${persistDir}/crop_input_${Date.now()}.jpg`;
            await RNFS.copyFile(rawPath, localPath);
            cleanUri = `file://${localPath}`;
            console.log('Gallery photo copied for cropper:', cleanUri);
          } else {
            // File doesn't exist — the temp file was cleaned up
            console.error('Gallery photo temp file was cleaned up:', rawPath);
            Alert.alert('Photo Error', 'The selected photo is no longer available. Please try again.');
            navigation.goBack();
            return;
          }
        } catch (copyErr) {
          console.warn('Could not copy gallery photo:', copyErr);
          // Ensure file:// prefix at minimum
          if (!cleanUri.startsWith('file://')) {
            cleanUri = `file://${cleanUri}`;
          }
        }
      } else {
        // Camera photos — ensure file:// prefix
        if (!cleanUri.startsWith('file://')) {
          cleanUri = `file://${cleanUri}`;
        }
      }

      console.log('Final URI for cropper:', cleanUri);

      // Add a small delay to ensure UI is ready
      await new Promise(resolve => setTimeout(resolve, 100));

      // The native cropper handles large source images fine (uses native decoders,
      // not the JS thread). We just cap the OUTPUT size to 1400px.
      // compressImage() after crop brings it to 1400px too, so this is consistent.
      const cropSize = 1400;
      console.log(`Opening cropper with output size: ${cropSize}x${cropSize}`);

      // Open image cropper with square aspect ratio
      const result = await ImageCropPicker.openCropper({
        path: cleanUri,
        width: cropSize,
        height: cropSize,
        cropperCircleOverlay: false,
        cropping: true,
        cropperToolbarTitle: 'Crop Photo',
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
      
      // If component is still mounted, compress image and show editing interface
      if (isMounted.current) {
        // Compress the cropped image to reduce file size and AI processing costs
        const compressedImageUri = await compressImage(result.path);
        
        console.log('Crop successful, showing editing interface:', compressedImageUri);

        // Mark crop as completed so useFocusEffect won't re-open it
        hasCompletedCrop.current = true;

        // Store the cropped image for editing
        setCroppedImage({
          uri: compressedImageUri,
          width: result.width,
          height: result.height
        });
        
        // Reset slider values to default when new photo is cropped
        setBrightnessValue(1.0);
        setContrastValue(1.0);
        setSaturationValue(1.0);
        setHasEdits(false);
        
        // Reset processing state to show the editing interface
        setProcessing(false);
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

  // Render content based on state
  if (!croppedImage) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar translucent backgroundColor="transparent" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a2b49" />
          <Text style={styles.loadingText}>
            {cropperOpened.current ? 'Processing photo...' : 'Opening editor...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.editContainer}>
      <StatusBar translucent backgroundColor="transparent" />
      
      {/* Image Preview */}
      <View style={styles.editImageContainer}>
        <ViewShot ref={filteredImageRef} options={{ format: 'jpg', quality: 0.9 }}>
          <ColorMatrix
            key={`color-matrix-${photo?.uri || 'default'}`}
            matrix={concatColorMatrices(
              brightness(brightnessValue),
              contrast(contrastValue),
              saturate(saturationValue)
            )}
          >
            <Image
              key={`preview-image-${croppedImage?.uri || 'default'}`}
              source={{ uri: croppedImage.uri }}
              style={[styles.editPreviewImage, !imageLoaded && { opacity: 0 }]}
              resizeMode="contain"
              onLoadEnd={() => setImageLoaded(true)}
            />
          </ColorMatrix>
          {!imageLoaded && (
            <View style={StyleSheet.absoluteFillObject}>
              <ActivityIndicator size="large" color="#1a2b49" style={{ flex: 1 }} />
            </View>
          )}
        </ViewShot>
      </View>
      
      {/* Edit Controls */}
      <View style={styles.editControlsContainer}>
        <ScrollView style={styles.editControlsList} showsVerticalScrollIndicator={false}>
          {/* AI Enhance Section */}
          <View style={styles.enhanceSection}>
            {!isEnhanced && !isEnhancing && (
              <View style={styles.enhanceButtonRow}>
                <TouchableOpacity
                  style={styles.enhanceButtonCompact}
                  onPress={() => handleEnhance('lut_only')}
                >
                  <Icon name="palette" size={18} color="#fff" />
                  <View style={styles.enhanceButtonTextContainer}>
                    <Text style={styles.enhanceButtonText}>Color Grade</Text>
                    <Text style={styles.enhanceButtonSubtext}>Fast ~2s</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.enhanceButtonCompact, styles.enhanceButtonFull]}
                  onPress={() => handleEnhance('gemini_only')}
                >
                  <Icon name="auto-fix-high" size={18} color="#fff" />
                  <View style={styles.enhanceButtonTextContainer}>
                    <Text style={styles.enhanceButtonText}>AI Enhance</Text>
                    <Text style={styles.enhanceButtonSubtext}>Declutter + fix lighting</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}
            {isEnhancing && (
              <View style={styles.enhancingContainer}>
                <ActivityIndicator size="small" color="#1a2b49" />
                <Text style={styles.enhancingText}>
                  {enhanceMode === 'lut_only' ? 'Color grading...' : enhanceMode === 'gemini_only' ? 'Enhancing photo...' : 'Enhancing photo...'}
                </Text>
              </View>
            )}
            {isEnhanced && !isEnhancing && (
              <View style={styles.enhancedRow}>
                <View style={styles.enhancedBadge}>
                  <Icon name="check-circle" size={16} color="#5B8A72" />
                  <Text style={styles.enhancedBadgeText}>
                    {enhancedWith === 'lut_only' ? 'Color Graded' : 'Enhanced'}
                  </Text>
                </View>
                <View style={styles.enhancedActions}>
                  {enhancedWith === 'lut_only' && (
                    <TouchableOpacity
                      style={styles.upgradeButton}
                      onPress={() => handleEnhance('gemini_only')}
                    >
                      <Text style={styles.upgradeText}>+ Declutter</Text>
                    </TouchableOpacity>
                  )}
                  {enhancedWith === 'gemini_only' && (
                    <TouchableOpacity
                      style={[styles.upgradeButton, { backgroundColor: '#1a2b49' }]}
                      onPress={() => handleEnhance('lut_only')}
                    >
                      <Text style={styles.upgradeText}>+ Color Grade</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={handleRevertEnhance}>
                    <Text style={styles.revertText}>Undo</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Brightness Slider */}
          <View style={styles.editAdjustmentItem}>
            <View style={styles.editAdjustmentHeader}>
              <Text style={styles.editAdjustmentLabel}>Brightness</Text>
              <Text style={styles.editAdjustmentValue}>
                {Math.round((brightnessValue - 1) * 100)}
              </Text>
            </View>
            <Slider
              style={styles.editSlider}
              minimumValue={0.5}
              maximumValue={1.5}
              value={brightnessValue}
              onValueChange={setBrightnessValue}
              minimumTrackTintColor="#1a2b49"
              maximumTrackTintColor="#ddd"
              thumbTintColor="#1a2b49"
            />
          </View>
          
          {/* Contrast Slider */}
          <View style={styles.editAdjustmentItem}>
            <View style={styles.editAdjustmentHeader}>
              <Text style={styles.editAdjustmentLabel}>Contrast</Text>
              <Text style={styles.editAdjustmentValue}>
                {Math.round((contrastValue - 1) * 100)}
              </Text>
            </View>
            <Slider
              style={styles.editSlider}
              minimumValue={0.5}
              maximumValue={1.5}
              value={contrastValue}
              onValueChange={setContrastValue}
              minimumTrackTintColor="#1a2b49"
              maximumTrackTintColor="#ddd"
              thumbTintColor="#1a2b49"
            />
          </View>
          
          {/* Saturation Slider */}
          <View style={styles.editAdjustmentItem}>
            <View style={styles.editAdjustmentHeader}>
              <Text style={styles.editAdjustmentLabel}>Saturation</Text>
              <Text style={styles.editAdjustmentValue}>
                {Math.round((saturationValue - 1) * 100)}
              </Text>
            </View>
            <Slider
              style={styles.editSlider}
              minimumValue={0.5}
              maximumValue={1.3}
              value={saturationValue}
              onValueChange={setSaturationValue}
              minimumTrackTintColor="#1a2b49"
              maximumTrackTintColor="#ddd"
              thumbTintColor="#1a2b49"
            />
          </View>
        </ScrollView>
        
        {/* Continue Button */}
        <View style={styles.editContinueContainer}>
          <TouchableOpacity
            style={[styles.editContinueButton, processing && styles.continueButtonDisabled]}
            onPress={handleContinue}
            disabled={processing}
          >
            {processing ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.continueButtonText}>
                {isAddingToExistingMeal ? 'Add Photo' : 'Continue'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
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
  // New edit screen styles
  editContainer: {
    flex: 1,
    backgroundColor: colors.lightTan,
  },
  editImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.lightTan,
    paddingVertical: spacing.sm,
  },
  editPreviewImage: {
    width: screenWidth - 80, // Smaller preview for better performance
    height: screenWidth - 80,
    borderRadius: 12,
  },
  editControlsContainer: {
    backgroundColor: colors.white,
    borderTopLeftRadius: spacing.borderRadius.lg,
    borderTopRightRadius: spacing.borderRadius.lg,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.screenPadding,
    minHeight: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  editControlsList: {
    flex: 1,
  },
  enhanceSection: {
    paddingBottom: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  enhanceButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  enhanceButtonCompact: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2b49',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  enhanceButtonFull: {
    backgroundColor: '#5B8A72',
  },
  enhanceButtonTextContainer: {
    marginLeft: 8,
    flexShrink: 1,
  },
  enhanceButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  enhanceButtonSubtext: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    marginTop: 1,
  },
  enhancingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  enhancingText: {
    marginLeft: 10,
    color: '#1a2b49',
    fontSize: 14,
    fontWeight: '500',
  },
  enhancedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  enhancedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  enhancedBadgeText: {
    marginLeft: 6,
    color: '#5B8A72',
    fontSize: 14,
    fontWeight: '600',
  },
  enhancedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  upgradeButton: {
    backgroundColor: '#5B8A72',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  upgradeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  revertText: {
    color: '#D9534F',
    fontSize: 14,
    fontWeight: '600',
  },
  editAdjustmentItem: {
    paddingVertical: 8,
  },
  editAdjustmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  editAdjustmentLabel: {
    flex: 1,
    fontSize: 12,
    color: '#1a2b49',
    fontFamily: 'Inter',
  },
  editAdjustmentValue: {
    fontSize: 11,
    color: '#666',
    fontFamily: 'Inter',
    minWidth: 35,
    textAlign: 'right',
  },
  editSlider: {
    height: 25,
    marginHorizontal: -4,
  },
  editContinueContainer: {
    paddingTop: 16,
    paddingBottom: 20,
  },
  editContinueButton: {
    backgroundColor: '#5B8A72',
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  continueButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Inter',
  },
});

export default CropScreen;