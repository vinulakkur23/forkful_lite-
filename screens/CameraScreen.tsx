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
  Image
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

      // Step 2: Now upload photo to Firebase Storage (document exists, so security rules pass)
      console.log('📤 Uploading photo to Firebase Storage...');
      const photoUrl = await uploadImageToFirebase(photoUri, user.uid);
      console.log('✅ Photo uploaded:', photoUrl);

      // Step 3: Update document with photo URL
      await firestore().collection('mealEntries').doc(mealId).update({
        photoUrl: photoUrl,
        imageUrl: photoUrl, // For compatibility
      });
      console.log('✅ Document updated with photo URL');

      // Show brief loading message AFTER upload completes
      Alert.alert('Photo Saved!', 'Analyzing your meal in the background...', [
        { text: 'OK', onPress: () => navigation.navigate('FoodPassport', { tabIndex: 0 }) }
      ]);

      // Step 4: Start background API calls (non-blocking)
      console.log('🔄 Starting background API calls...');

      // Call 1: Identify dish from photo
      identifyDishFromPhoto(photoUri).then(async (dishData) => {
        if (dishData && dishData.dish_name) {
          console.log('✅ Dish identified:', dishData.dish_name);

          // Update meal with dish identification result
          await firestore().collection('mealEntries').doc(mealId).update({
            dish_identification_result: dishData,
            meal: dishData.dish_name // Pre-populate meal name
          });

          // Call 2: Extract rating criteria based on dish name (for quick ratings UI)
          extractDishRatingCriteria(dishData.dish_name).then(async (criteriaData) => {
            if (criteriaData) {
              console.log('✅ Rating criteria extracted (for quick ratings)');
              await firestore().collection('mealEntries').doc(mealId).update({
                dish_rating_criteria: criteriaData
              });
            }
          }).catch(err => console.error('❌ Rating criteria error:', err));

          // Call 3: Extract rating statements (for push notifications)
          extractRatingStatements(dishData.dish_name).then(async (statementsData) => {
            if (statementsData) {
              console.log('✅ Rating statements extracted (for notifications)');
              await firestore().collection('mealEntries').doc(mealId).update({
                rating_statements_result: statementsData
              });

              // Schedule push notifications with top 3 rating statements
              console.log('📬 Scheduling notifications with rating statements');
              scheduleUnratedMealNotifications({
                mealId: mealId,
                dishName: dishData.dish_name,
                restaurantName: undefined,
                city: undefined,
                ratingStatements: statementsData.rating_statements
              }).catch(err => {
                console.error('❌ Error scheduling notifications:', err);
                // Don't fail the whole flow if notifications fail
              });
            }
          }).catch(err => console.error('❌ Rating statements error:', err));

          // Call 4: Generate pixel art icon (nano banana)
          generatePixelArtIcon(dishData.dish_name, photoUri).then(async (pixelArtData) => {
            if (pixelArtData && pixelArtData.image_data) {
              console.log('✅ Pixel art generated');

              // Upload pixel art to Firebase Storage and save URL
              try {
                const pixelArtFileName = `pixel_art_${mealId}_${Date.now()}.png`;
                const pixelArtStoragePath = `pixel_art/${user.uid}/${pixelArtFileName}`;

                // Convert base64 to data URI
                const dataUri = `data:image/png;base64,${pixelArtData.image_data}`;

                console.log('📤 Uploading pixel art to Storage:', pixelArtStoragePath);

                // Upload to Firebase Storage
                const storageRef = storage().ref(pixelArtStoragePath);
                await storageRef.putString(dataUri, 'data_url');

                // Get download URL
                const downloadUrl = await storageRef.getDownloadURL();
                console.log('✅ Pixel art uploaded, URL:', downloadUrl);

                // Update meal with pixel art URL
                await firestore().collection('mealEntries').doc(mealId).update({
                  pixel_art_url: downloadUrl,
                  pixel_art_prompt: pixelArtData.prompt_used,
                  pixel_art_updated_at: firestore.FieldValue.serverTimestamp()
                });

                console.log('✅ Pixel art saved to Firestore');
              } catch (uploadError) {
                console.error('❌ Error uploading pixel art:', uploadError);
              }
            }
          }).catch(err => console.error('❌ Pixel art error:', err));
        }
      }).catch(err => console.error('❌ Dish identification error:', err));

      console.log('✅ Path 1 flow complete - meal saved as unrated');

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
    left: 40,
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
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
});

export default CameraScreen;
