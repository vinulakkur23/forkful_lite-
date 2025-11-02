import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  StatusBar,
  Platform,
  Dimensions,
  Image,
  ActivityIndicator
} from 'react-native';
import { Camera, useCameraDevices } from 'react-native-vision-camera';
import Geolocation from '@react-native-community/geolocation';
import { CompositeNavigationProp, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RootStackParamList, TabParamList } from '../App';
import Icon from 'react-native-vector-icons/MaterialIcons';
import ImageCropPicker from 'react-native-image-crop-picker';
import Exif from 'react-native-exif';
import { getMealSuggestions } from '../services/mealService';
import { getPhotoWithMetadata } from '../services/photoLibraryService';
import { identifyDishFromPhoto } from '../services/dishIdentificationService';
import { extractDishRatingCriteria } from '../services/dishRatingCriteriaService';
import { extractRatingStatements } from '../services/ratingStatementsService';
import { generatePixelArtIcon } from '../services/geminiPixelArtService';
import { firebase, auth, firestore, storage } from '../firebaseConfig';
import ImageResizer from 'react-native-image-resizer';
import RNFS from 'react-native-fs';
import { scheduleUnratedMealNotifications } from '../services/unratedMealNotificationService';
import { uploadImageToFirebase } from '../services/imageUploadService';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
// Import theme
import { colors, typography, spacing, shadows } from '../themes';

// Update the navigation prop type to use composite navigation
type CameraScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Camera'>,
  StackNavigationProp<RootStackParamList>
>;

type Props = {
  navigation: CameraScreenNavigationProp;
};

const CameraScreen: React.FC<Props> = ({ navigation }) => {
  const camera = useRef<Camera>(null);
  const [location, setLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);
  const [isTakingPicture, setIsTakingPicture] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [saveToCameraRoll, setSaveToCameraRoll] = useState(false);
  
  // Get device dimensions
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  
  // Size for square guide - match full screen width to show actual capture area
  const guideSize = screenWidth;
  
  // Get all devices and manually find the back camera
  const devices = useCameraDevices();
  // Try to explicitly find a back camera from available devices
  const backCameras = Object.values(devices).filter(
    device => device?.position === 'back'
  );
  const device = backCameras.length > 0 ? backCameras[0] : null;
  
  // Add extensive logging for debugging
  console.log('Camera devices object:', JSON.stringify(devices));
  console.log('Detected back cameras:', backCameras.length);
  console.log('Selected camera device:', device ? device.id : 'none');

  // Reset component state when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      console.log('Camera screen focused - resetting state');
      // Reset any necessary state when screen is focused
      setIsLoading(true);
      setIsTakingPicture(false);

      // IMPORTANT: Clear any global prefetched suggestions to prevent caching issues
      if ((global as any).prefetchedSuggestions) {
        console.log('!!! CLEARING GLOBAL PREFETCHED SUGGESTIONS IN CAMERA SCREEN !!!');
        (global as any).prefetchedSuggestions = null;
        delete (global as any).prefetchedSuggestions;
      }

      // Get location again
      getLocation();

      // Reset loading after a short delay to ensure devices are properly initialized
      setTimeout(() => {
        setIsLoading(false);
      }, 500);
      
      return () => {
        // Cleanup when screen is unfocused (optional)
        console.log('Camera screen blurred');
      };
    }, [])
  );

  useEffect(() => {
    // Set status bar to translucent for better camera experience
    StatusBar.setTranslucent(true);
    StatusBar.setBackgroundColor('transparent');
    
    // Request camera permission
    (async () => {
      const cameraPermission = await Camera.requestCameraPermission();
      console.log(`Camera permission status: ${cameraPermission}`);
      
      if (cameraPermission === 'granted') {
        setHasPermission(true);
      }
      
      // Add a short delay to ensure devices are properly initialized
      setTimeout(() => {
        setIsLoading(false);
      }, 1500);
    })();

    // Get location
    getLocation();
    
    // Cleanup function to restore status bar
    return () => {
      StatusBar.setTranslucent(false);
      StatusBar.setBackgroundColor('#ffffff');
    };
  }, []);

  // Separate function to get location for reuse
  const getLocation = () => {
    Geolocation.getCurrentPosition(
      position => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      error => {
        console.log('Location error:', error);
        Alert.alert(
          'Location Error',
          'Could not get your location. The meal will be saved without location data.',
          [{ text: 'OK' }]
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  // Helper function for Path 1: Save unrated meal with background API calls
  const saveUnratedMeal = async (photoUri: string, photoLocation: any) => {
    try {
      console.log('🚀 Path 1: Starting unrated meal save flow');

      // Check if user is authenticated
      const user = auth().currentUser;
      if (!user) {
        Alert.alert('Error', 'Please log in to save your meal');
        return;
      }

      // Navigate to Enjoy Meal screen immediately - don't wait for upload
      console.log('📱 Navigating to Enjoy Meal screen immediately');
      navigation.navigate('EnjoyMeal', { photoUri: photoUri });

      // Now do everything else in the background
      // Step 1: Create Firestore document FIRST (with placeholder photoUrl)
      // This is required for Firebase Storage security rules
      console.log('📝 Creating Firestore document first...');

      const basicMealData = {
        userId: user.uid,
        userName: user.displayName || 'Anonymous User',
        userPhoto: user.photoURL || null,
        photoUrl: null, // Placeholder - will update after upload
        rating: 0,
        meal: '', // Empty initially
        restaurant: '', // Empty initially
        mealType: 'Restaurant',
        city: '',
        isUnrated: true, // Flag for unrated meals
        photoSource: 'camera', // Track source
        location: photoLocation ? {
          latitude: photoLocation.latitude,
          longitude: photoLocation.longitude,
          source: photoLocation.source || 'unknown'
        } : null,
        createdAt: firestore.FieldValue.serverTimestamp(),
        platform: Platform.OS,
        appVersion: '1.0.0',
      };

      const docRef = await firestore().collection('mealEntries').add(basicMealData);
      const mealId = docRef.id;
      console.log('✅ Firestore document created:', mealId);

      // Step 1.5: Resize image before upload to reduce file size
      console.log('🔄 Resizing image for upload and API calls...');
      const resizedImage = await ImageResizer.createResizedImage(
        photoUri,
        1400, // Max width - matches gallery flow
        1400, // Max height - matches gallery flow
        'JPEG',
        95, // Quality - high quality for display
        0, // Rotation
        undefined, // Output path (auto-generated)
        false, // Keep metadata
        {
          mode: 'contain', // Maintain aspect ratio
          onlyScaleDown: true, // Don't upscale if image is smaller
        }
      );
      console.log('✅ Image resized:', {
        original: photoUri,
        resized: resizedImage.uri,
        dimensions: `${resizedImage.width}x${resizedImage.height}`
      });

      // Step 2: Now upload resized photo to Firebase Storage (document exists, so security rules pass)
      console.log('📤 Uploading resized photo to Firebase Storage...');
      const photoUrl = await uploadImageToFirebase(resizedImage.uri, user.uid);
      console.log('✅ Photo uploaded:', photoUrl);

      // Step 3: Update document with photo URL
      await firestore().collection('mealEntries').doc(mealId).update({
        photoUrl: photoUrl,
        imageUrl: photoUrl, // For compatibility
      });
      console.log('✅ Document updated with photo URL');

      // Step 4: Start background API calls with robust error handling and logging
      console.log('🔄 Starting background API calls...');
      console.log('📝 Meal ID for tracking:', mealId);

      // CRITICAL: Launch background APIs in a way that survives component navigation
      // Using setImmediate to ensure the async work continues even after navigation
      setImmediate(async () => {
        console.log('🚀 [Background] Starting API cascade for meal:', mealId);

        try {
          // === STEP 1: Dish Identification (Required) ===
          console.log('🔍 [Background] Step 1/3: Identifying dish...');
          await firestore().collection('mealEntries').doc(mealId).update({
            api_step_1_started: firestore.FieldValue.serverTimestamp()
          });

          const dishData = await identifyDishFromPhoto(resizedImage.uri);

          if (!dishData || !dishData.dish_name) {
            console.error('❌ [Background] Dish identification failed - no data returned');
            await firestore().collection('mealEntries').doc(mealId).update({
              api_step_1_failed: true,
              api_step_1_error: 'No dish data returned',
              api_step_1_timestamp: firestore.FieldValue.serverTimestamp()
            });
            return; // Exit - can't proceed without dish identification
          }

          console.log('✅ [Background] Dish identified:', dishData.dish_name);
          await firestore().collection('mealEntries').doc(mealId).update({
            dish_identification_result: dishData,
            meal: dishData.dish_name,
            api_step_1_success: true,
            api_step_1_timestamp: firestore.FieldValue.serverTimestamp()
          });

          const isDescriptive = dishData.confidence_level < 0.85 || dishData.is_descriptive;
          console.log(`📊 [Background] Dish confidence: ${dishData.confidence_level}, is_descriptive: ${isDescriptive}`);

          // === STEP 2 & 3: Parallel API calls (Rating Statements + Pixel Art) ===
          console.log('🚀 [Background] Step 2-3: Running parallel APIs (statements + pixel art)...');
          await firestore().collection('mealEntries').doc(mealId).update({
            api_step_2_3_started: firestore.FieldValue.serverTimestamp()
          });

          const [statementsResult, pixelArtResult] = await Promise.allSettled([
            extractRatingStatements(dishData.dish_name, isDescriptive),
            generatePixelArtIcon(dishData.dish_name, resizedImage.uri)
          ]);

          console.log('📊 [Background] Parallel APIs complete - Statements:', statementsResult.status, 'PixelArt:', pixelArtResult.status);

          // === Handle Rating Statements Result ===
          if (statementsResult.status === 'fulfilled' && statementsResult.value) {
            console.log('✅ [Background] Rating statements extracted');
            const statementsData = statementsResult.value;

            try {
              await firestore().collection('mealEntries').doc(mealId).update({
                rating_statements_result: statementsData,
                api_step_2_success: true,
                api_step_2_timestamp: firestore.FieldValue.serverTimestamp()
              });

              // Schedule push notifications
              console.log('📬 [Background] Scheduling notifications...');
              await scheduleUnratedMealNotifications({
                mealId: mealId,
                dishName: dishData.dish_name,
                restaurantName: undefined,
                city: undefined,
                ratingStatements: statementsData.rating_statements
              });
              console.log('✅ [Background] Notifications scheduled');
            } catch (notifError: any) {
              console.error('❌ [Background] Error with statements/notifications:', notifError);
              await firestore().collection('mealEntries').doc(mealId).update({
                api_step_2_notification_error: notifError.message || String(notifError),
                api_step_2_notification_error_timestamp: firestore.FieldValue.serverTimestamp()
              });
            }
          } else {
            const error = statementsResult.status === 'rejected' ? statementsResult.reason : 'Returned null';
            console.error('❌ [Background] Rating statements failed:', error);
            await firestore().collection('mealEntries').doc(mealId).update({
              api_step_2_failed: true,
              api_step_2_error: String(error),
              api_step_2_timestamp: firestore.FieldValue.serverTimestamp()
            });
          }

          // === Handle Pixel Art Result ===
          if (pixelArtResult.status === 'fulfilled' && pixelArtResult.value?.image_data) {
            console.log('✅ [Background] Pixel art generated');
            const pixelArtData = pixelArtResult.value;

            try {
              const pixelArtFileName = `pixel_art_${mealId}_${Date.now()}.png`;
              const pixelArtStoragePath = `pixel_art/${user.uid}/${pixelArtFileName}`;
              const dataUri = `data:image/png;base64,${pixelArtData.image_data}`;

              console.log('📤 [Background] Uploading pixel art to Storage...');
              const storageRef = storage().ref(pixelArtStoragePath);
              await storageRef.putString(dataUri, 'data_url');
              const downloadUrl = await storageRef.getDownloadURL();
              console.log('✅ [Background] Pixel art uploaded');

              // Save locally for notification
              let localPixelArtPath = null;
              try {
                const sharedDir = RNFS.LibraryDirectoryPath;
                const pixelArtDir = `${sharedDir}/PixelArt`;
                const dirExists = await RNFS.exists(pixelArtDir);
                if (!dirExists) {
                  await RNFS.mkdir(pixelArtDir);
                }

                const localFileName = `pixel_art_${mealId}.png`;
                localPixelArtPath = `${pixelArtDir}/${localFileName}`;
                await RNFS.writeFile(localPixelArtPath, pixelArtData.image_data, 'base64');
                console.log('✅ [Background] Pixel art saved locally');

                const { updatePixelArtNotificationWithImage } = await import('../services/pixelArtNotificationHelper');
                await updatePixelArtNotificationWithImage(mealId, dishData.dish_name, localPixelArtPath);
              } catch (localSaveError: any) {
                console.error('⚠️ [Background] Error saving pixel art locally:', localSaveError);
                await firestore().collection('mealEntries').doc(mealId).update({
                  pixel_art_local_save_error: localSaveError.message || String(localSaveError)
                });
              }

              await firestore().collection('mealEntries').doc(mealId).update({
                pixel_art_url: downloadUrl,
                pixel_art_local_path: localPixelArtPath,
                pixel_art_prompt: pixelArtData.prompt_used,
                pixel_art_updated_at: firestore.FieldValue.serverTimestamp(),
                api_step_3_success: true,
                api_step_3_timestamp: firestore.FieldValue.serverTimestamp()
              });
              console.log('✅ [Background] Pixel art saved to Firestore');
            } catch (uploadError: any) {
              console.error('❌ [Background] Error uploading pixel art:', uploadError);
              await firestore().collection('mealEntries').doc(mealId).update({
                api_step_3_failed: true,
                api_step_3_error: uploadError.message || String(uploadError),
                api_step_3_timestamp: firestore.FieldValue.serverTimestamp()
              });
            }
          } else {
            const error = pixelArtResult.status === 'rejected' ? pixelArtResult.reason : 'No image data';
            console.error('❌ [Background] Pixel art failed:', error);
            await firestore().collection('mealEntries').doc(mealId).update({
              api_step_3_failed: true,
              api_step_3_error: String(error),
              api_step_3_timestamp: firestore.FieldValue.serverTimestamp()
            });
          }

          console.log('✅ [Background] All API processing complete for meal:', mealId);
          await firestore().collection('mealEntries').doc(mealId).update({
            all_apis_complete: true,
            all_apis_complete_timestamp: firestore.FieldValue.serverTimestamp()
          });

        } catch (fatalError: any) {
          console.error('❌ [Background] FATAL ERROR in API cascade:', fatalError);
          console.error('❌ [Background] Error stack:', fatalError.stack);
          await firestore().collection('mealEntries').doc(mealId).update({
            fatal_background_error: fatalError.message || String(fatalError),
            fatal_background_error_stack: fatalError.stack || 'No stack trace',
            fatal_background_error_timestamp: firestore.FieldValue.serverTimestamp()
          }).catch(e => console.error('[Background] Could not log fatal error:', e));
        }
      });

      console.log('✅ Path 1 flow complete - meal saved, background APIs launched');

    } catch (error) {
      console.error('❌ Error saving unrated meal:', error);
      Alert.alert('Error', 'Failed to save meal. Please try again.');
    }
  };

  const takePicture = async () => {
      if (camera.current) {
        try {
          // Prevent multiple taps
          if (isTakingPicture) {
            return;
          }

          setIsTakingPicture(true);
          console.log("Taking photo...");
          
          // Clear any previously cached data before taking a new photo
          if ((global as any).prefetchedSuggestions) {
            console.log('!!! CLEARING PREVIOUS PREFETCHED SUGGESTIONS BEFORE NEW PHOTO !!!');
            (global as any).prefetchedSuggestions = null;
            delete (global as any).prefetchedSuggestions;
          }
          if ((global as any).prefetchedPhotoUri) {
            console.log('!!! CLEARING PREVIOUS PREFETCHED PHOTO URI !!!');
            (global as any).prefetchedPhotoUri = null;
            delete (global as any).prefetchedPhotoUri;
          }
          if ((global as any).currentPhotoUri) {
            (global as any).currentPhotoUri = null;
            delete (global as any).currentPhotoUri;
          }
          // Clear ALL dish criteria related data
          if ((global as any).quickCriteriaExtractionPromise) {
            console.log('!!! CLEARING DISH CRITERIA DATA !!!');
            (global as any).quickCriteriaExtractionPromise = null;
            delete (global as any).quickCriteriaExtractionPromise;
          }
          if ((global as any).quickCriteriaMealData) {
            (global as any).quickCriteriaMealData = null;
            delete (global as any).quickCriteriaMealData;
          }
          if ((global as any).quickCriteriaStartTime) {
            (global as any).quickCriteriaStartTime = null;
            delete (global as any).quickCriteriaStartTime;
          }

          const photo = await camera.current.takePhoto({
            qualityPrioritization: 'quality',
            flash: 'off',
            enableAutoStabilization: true,
            skipMetadata: false,
            // Ensure photo matches preview dimensions
            enableShutterSound: false
          });

          // Show camera flash animation immediately for feedback
          setShowFlash(true);
          setTimeout(() => {
            setShowFlash(false);
          }, 200);

          // Verify we got a valid photo
          if (!photo || !photo.path) {
            console.error("No photo path returned from camera");
            Alert.alert('Error', 'Failed to capture photo');
            setIsTakingPicture(false);
            return;
          }

          console.log("Photo taken:", photo.path);

          // Normalize the file path based on platform
          let normalizedPath = photo.path;
          if (Platform.OS === 'ios' && !normalizedPath.startsWith('file://')) {
            normalizedPath = `file://${normalizedPath}`;
          } else if (Platform.OS === 'android' && !normalizedPath.startsWith('file://')) {
            normalizedPath = `file://${normalizedPath}`;
          }

          console.log("Normalized photo path:", normalizedPath);

          // Save to camera roll if user opted in
          if (saveToCameraRoll) {
            try {
              console.log("Saving photo to camera roll...");
              await CameraRoll.save(normalizedPath, { type: 'photo' });
              console.log("✅ Photo saved to camera roll successfully");
            } catch (saveError) {
              console.error("❌ Failed to save to camera roll:", saveError);
              // Don't block the flow if save fails - just log it
            }
          }

          // Add a timestamp to create a unique navigation key
          const timestamp = new Date().getTime();
          const navigationKey = `camera_photo_${timestamp}`;

          // Reset any existing cropper state by cleaning up
          ImageCropPicker.clean().catch(e => {
            console.log('ImageCropPicker cleanup error:', e);
          });

          // Try to extract EXIF data including location from the captured photo
          try {
            console.log("Attempting to extract EXIF data from captured photo");
            const exifData = await Exif.getExif(normalizedPath);
            console.log("EXIF data retrieved:", JSON.stringify(exifData));

            // Check if GPS data is available in the EXIF
            if (exifData && exifData.GPSLatitude && exifData.GPSLongitude) {
              console.log("EXIF GPS data found in captured photo:", {
                lat: exifData.GPSLatitude,
                lng: exifData.GPSLongitude
              });

              // Create a location object from EXIF data
              const exifLocation = {
                latitude: parseFloat(exifData.GPSLatitude),
                longitude: parseFloat(exifData.GPSLongitude),
                source: 'exif'
              };

              // PATH 1: Save as unrated meal with background API calls
              console.log("Path 1: Saving unrated meal with EXIF location");
              await saveUnratedMeal(normalizedPath, exifLocation);
              return;
            } else {
              console.log("No EXIF GPS data found in the captured photo, using device location");
            }
          } catch (exifError) {
            console.log("Error extracting EXIF data from captured photo:", exifError);
            console.log("Falling back to device location");
          }

          // PATH 1: Save as unrated meal with device location as fallback
          console.log("Path 1: Saving unrated meal with device location");
          await saveUnratedMeal(normalizedPath, location);
          
        } catch (error) {
          console.error('Error taking photo:', error);
          Alert.alert('Error', 'Failed to take photo');
        } finally {
          setIsTakingPicture(false);
        }
      } else {
        console.log("Camera ref is null");
        Alert.alert('Error', 'Camera is not ready');
      }
    };
  
  const goBack = () => {
    navigation.navigate('Home');
  };

  // Function to select a photo from the gallery using the PhotoGPSModule
  const selectFromGallery = async () => {
    try {
      console.log("Opening gallery with PhotoGPSModule...");
      
      // Clear any previously cached data before selecting a new photo
      if ((global as any).prefetchedSuggestions) {
        console.log('!!! CLEARING PREVIOUS PREFETCHED SUGGESTIONS BEFORE NEW GALLERY SELECTION !!!');
        (global as any).prefetchedSuggestions = null;
        delete (global as any).prefetchedSuggestions;
      }
      if ((global as any).prefetchedPhotoUri) {
        console.log('!!! CLEARING PREVIOUS PREFETCHED PHOTO URI !!!');
        (global as any).prefetchedPhotoUri = null;
        delete (global as any).prefetchedPhotoUri;
      }
      if ((global as any).currentPhotoUri) {
        (global as any).currentPhotoUri = null;
        delete (global as any).currentPhotoUri;
      }
      // Clear ALL dish criteria related data
      if ((global as any).quickCriteriaExtractionPromise) {
        console.log('!!! CLEARING DISH CRITERIA DATA !!!');
        (global as any).quickCriteriaExtractionPromise = null;
        delete (global as any).quickCriteriaExtractionPromise;
      }
      if ((global as any).quickCriteriaMealData) {
        (global as any).quickCriteriaMealData = null;
        delete (global as any).quickCriteriaMealData;
      }
      if ((global as any).quickCriteriaStartTime) {
        (global as any).quickCriteriaStartTime = null;
        delete (global as any).quickCriteriaStartTime;
      }
      
      const photoAsset = await getPhotoWithMetadata();
      
      if (!photoAsset) {
        console.log("No photo selected from gallery");
        return;
      }
      
      console.log("Photo selected from gallery:", {
        uri: photoAsset.uri,
        hasLocation: !!photoAsset.location,
        location: photoAsset.location,
      });
      
      // Add a timestamp to create a unique navigation key
      const timestamp = new Date().getTime();
      const navigationKey = `gallery_photo_${timestamp}`;
      
      // Add a delay to ensure PHPicker is fully dismissed before navigation
      // This prevents "view not in window hierarchy" errors
      console.log("Waiting for picker dismissal before navigation...");
      setTimeout(() => {
        // Navigate directly to RatingScreen2 with the selected photo and location data
        navigation.navigate('RatingScreen2', {
          photo: {
            uri: photoAsset.uri,
            width: photoAsset.width,
            height: photoAsset.height,
            originalUri: photoAsset.originalUri,
            fromGallery: true,
            assetId: photoAsset.assetId,
          },
          location: photoAsset.location || location, // Use photo location or fallback to device location
          exifData: photoAsset.exifData,
          photoSource: 'gallery',
          _uniqueKey: navigationKey,
          rating: 0,
          likedComment: '',
          dislikedComment: ''
        });
      }, 600); // 600ms delay to ensure picker animation completes
      
      // If we have location data, start prefetching restaurant suggestions
      if (photoAsset.location && photoAsset.uri) {
        console.log("CAMERA: Starting early fetch of restaurant suggestions based on PHOTO LOCATION");
        console.log("CAMERA: Photo location data:", {
          latitude: photoAsset.location.latitude,
          longitude: photoAsset.location.longitude,
          source: photoAsset.location.source || 'unknown'
        });
        
        // Use setTimeout to ensure this doesn't block navigation
        setTimeout(() => {
          // Log the fact that we're making the API call
          console.log("CAMERA: Making API call to fetch restaurant suggestions with photo location");
          
          getMealSuggestions(photoAsset.uri, photoAsset.location)
            .then(suggestions => {
              console.log("CAMERA: Restaurant suggestions fetched successfully:", {
                count: suggestions.restaurants?.length || 0,
                firstRestaurant: suggestions.restaurants?.length > 0 ? suggestions.restaurants[0].name : 'none'
              });
              
              // Store in global app cache for later screens to use
              (global as any).prefetchedSuggestions = suggestions;
              console.log("CAMERA: Stored suggestions in global cache");
              
              // Log all restaurants for debugging
              if (suggestions.restaurants && suggestions.restaurants.length > 0) {
                console.log("CAMERA: All suggested restaurants:", 
                  suggestions.restaurants.map(r => r.name).join(', '));
              }
            })
            .catch(err => {
              console.log("CAMERA: Restaurant suggestions fetch failed:", err);
            });
        }, 0);
      } else if (location) {
        // If photo has no location, use device location as fallback
        console.log("CAMERA: Gallery photo has no location, using DEVICE LOCATION as fallback");
        console.log("CAMERA: Device location data:", {
          latitude: location.latitude,
          longitude: location.longitude,
          source: location.source || 'device'
        });
        
        // Use setTimeout to ensure this doesn't block navigation
        setTimeout(() => {
          // Log the fact that we're making the API call
          console.log("CAMERA: Making API call to fetch restaurant suggestions with device location");
          
          getMealSuggestions(photoAsset.uri, location)
            .then(suggestions => {
              console.log("CAMERA: Restaurant suggestions (device location) fetched successfully:", {
                count: suggestions.restaurants?.length || 0,
                firstRestaurant: suggestions.restaurants?.length > 0 ? suggestions.restaurants[0].name : 'none'
              });
              
              // Store in global app cache for later screens to use
              (global as any).prefetchedSuggestions = suggestions;
              console.log("CAMERA: Stored device-based suggestions in global cache");
              
              // Log all restaurants for debugging
              if (suggestions.restaurants && suggestions.restaurants.length > 0) {
                console.log("CAMERA: All suggested restaurants (device location):", 
                  suggestions.restaurants.map(r => r.name).join(', '));
              }
            })
            .catch(err => {
              console.log("CAMERA: Restaurant suggestions fetch (device location) failed:", err);
            });
        }, 0);
      }
    } catch (error) {
      console.error("Error selecting photo from gallery:", error);
      Alert.alert(
        "Gallery Error",
        "There was a problem accessing your photo library. Please try again."
      );
    }
  };

  // In your render function
  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={{ color: 'white', textAlign: 'center', padding: 20 }}>Initializing camera...</Text>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        {/* Clean blank screen - permission handled by iOS system alert */}
      </View>
    );
  }

  if (!device) {
    // Fallback to display camera info
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.closeButton} onPress={goBack}>
          <Icon name="close" size={24} color="white" />
        </TouchableOpacity>
        
        <Text style={{ color: 'white', textAlign: 'center', padding: 20 }}>
          Camera device not available.
        </Text>
        <Text style={{ color: 'white', textAlign: 'center', padding: 10, fontSize: 12 }}>
          Devices detected: {Object.keys(devices).length}
        </Text>
        <TouchableOpacity
          style={styles.fallbackButton}
          onPress={() => {
            // Navigate with a mock image - but provide an explicit and valid URI
            const mockImageUri = Platform.OS === 'ios'
              ? 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=1000'
              : 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=1000';
            
            // Navigate through the proper flow: RatingScreen2 -> Crop -> Results
            navigation.navigate('RatingScreen2', {
              photo: {
                uri: mockImageUri,
                width: 800,
                height: 600
              },
              location: location,
              photoSource: 'sample',
              _uniqueKey: `sample_${Date.now()}`,
              rating: 0,
              likedComment: '',
              dislikedComment: ''
            });
          }}
        >
          <Text style={styles.fallbackButtonText}>Use Sample Image</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Full screen camera */}
      <Camera
        ref={camera}
        style={styles.camera}
        device={device}
        isActive={true}
        photo={true}
        enableZoomGesture={false}
        // Ensure we capture at photo quality
        photoQualityBalance='quality'
        // Disable any zoom to ensure preview matches capture
        zoom={1}
        // Ensure preview matches capture by using same aspect ratio
        preset='photo'
        // Try to match preview with actual photo output
        videoAspectRatio={1}
      />

      {/* Square framing guide that matches capture area */}
      <View style={styles.guideCenterer}>
        <View style={[styles.framingGuide, { width: guideSize, height: guideSize }]}>
          {/* Semi-transparent overlay to show capture area */}
          <View style={styles.captureAreaOverlay} />

          {/* Corner guides */}
          <View style={[styles.cornerGuide, styles.topLeftCorner]} />
          <View style={[styles.cornerGuide, styles.topRightCorner]} />
          <View style={[styles.cornerGuide, styles.bottomLeftCorner]} />
          <View style={[styles.cornerGuide, styles.bottomRightCorner]} />
        </View>
      </View>

      {/* Camera flash overlay for snap feedback */}
      {showFlash && (
        <View style={styles.flashOverlay} />
      )}

      {/* Instructional text at top */}
      <View style={styles.instructionalTextContainer}>
        <Text style={styles.instructionalText}>
          Capture your meal for taste tips and a custom emoji
        </Text>
      </View>

      <TouchableOpacity style={styles.closeButton} onPress={goBack}>
        <Image
          source={require('../assets/icons/back-icon.png')}
          style={styles.backIcon}
        />
      </TouchableOpacity>
      
      {/* Upload from Library button - positioned left */}
      <TouchableOpacity style={styles.uploadButtonLarge} onPress={selectFromGallery}>
        <Image 
          source={require('../assets/icons/upload-inactive.png')} 
          style={styles.uploadIconLarge}
        />
        <Text style={styles.uploadButtonTextLarge}>Upload</Text>
      </TouchableOpacity>

      {/* Capture button container - centered */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          onPress={takePicture}
          style={styles.captureButton}
          disabled={isTakingPicture}
        >
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>
      </View>

      {/* Save to Camera Roll checkbox - positioned right */}
      <TouchableOpacity
        style={styles.saveToRollContainer}
        onPress={() => setSaveToCameraRoll(!saveToCameraRoll)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, saveToCameraRoll && styles.checkboxChecked]}>
          {saveToCameraRoll && (
            <Text style={styles.checkmark}>✓</Text>
          )}
        </View>
        <Text style={styles.saveToRollText}>Save to{'\n'}camera roll</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  guideCenterer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  framingGuide: {
    borderColor: 'rgba(255,255,255,0.8)',
    borderWidth: 2,
    borderRadius: 0, // Square corners to match capture
    position: 'relative',
    backgroundColor: 'transparent',
  },
  dottedLine: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.7)',
    marginTop: 0,
  },
  bottomLine: {
    marginTop: 'auto',
    marginBottom: 0,
  },
  cornerGuide: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: 'white',
    borderWidth: 3,
  },
  topLeftCorner: {
    top: -2,
    left: -2,
    borderBottomWidth: 0,
    borderRightWidth: 0,
    borderTopLeftRadius: 0,
  },
  topRightCorner: {
    top: -2,
    right: -2,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderTopRightRadius: 0,
  },
  bottomLeftCorner: {
    bottom: -2,
    left: -2,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomLeftRadius: 0,
  },
  bottomRightCorner: {
    bottom: -2,
    right: -2,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderBottomRightRadius: 0,
  },
  captureAreaOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.05)', // Very subtle overlay to show capture area
  },
  flashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'white',
    opacity: 0.8,
    zIndex: 10,
  },
  overlay: {
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  overlayText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 8,
    borderRadius: 4,
  },
  instructionalTextContainer: {
    position: 'absolute',
    top: 110,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
  },
  instructionalText: {
    color: colors.white,
    ...typography.bodySmall,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: spacing.sm,
    borderRadius: spacing.borderRadius.sm,
  },
  closeButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  backIcon: {
    width: 24,
    height: 24,
    tintColor: 'white',
    resizeMode: 'contain',
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 20,
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'white',
  },
  galleryButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackButton: {
    backgroundColor: '#ff6b6b',
    padding: 15,
    borderRadius: 10,
    margin: 20,
  },
  fallbackButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
    padding: 20,
  },
  permissionText: {
    fontSize: 18,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 20,
    color: 'white',
  },
  permissionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    marginTop: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  permissionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    marginTop: 15,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
  },
  uploadButton: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  uploadIcon: {
    width: 16,
    height: 16,
    marginRight: 8,
    tintColor: 'white',
  },
  uploadButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  // Large upload button styles for bottom positioning
  uploadButtonLarge: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 35,
    paddingVertical: 18,
    paddingHorizontal: 24,
    minWidth: 120,
    height: 70,
  },
  uploadIconLarge: {
    width: 32,
    height: 32,
    marginBottom: 6,
    tintColor: 'white',
  },
  uploadButtonTextLarge: {
    color: colors.white,
    ...typography.bodyMedium,
    fontWeight: '600',
  },
  // Save to camera roll checkbox styles
  saveToRollContainer: {
    position: 'absolute',
    bottom: 50,
    right: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 100,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  checkboxChecked: {
    backgroundColor: '#5B8A72',
    borderColor: '#5B8A72',
  },
  checkmark: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  saveToRollText: {
    color: colors.white,
    ...typography.bodySmall,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 14,
  },
});

export default CameraScreen;
