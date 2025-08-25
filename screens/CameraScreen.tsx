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

              // Start fetching restaurant suggestions as early as possible
              console.log("Starting early fetch of restaurant suggestions after taking photo (EXIF location)");
              setTimeout(() => {
                getMealSuggestions(normalizedPath, exifLocation)
                  .then(suggestions => {
                    console.log("Early restaurant suggestions fetched successfully:",
                      suggestions.restaurants?.length || 0, "restaurants");
                    // Store in global app cache for later screens to use
                    (global as any).prefetchedSuggestions = suggestions;
                  })
                  .catch(err => {
                    console.log("Early restaurant suggestions fetch failed:", err);
                  });
              }, 0);

              // Navigate directly to RatingScreen2 with EXIF location data
              navigation.navigate('RatingScreen2', {
                photo: {
                  uri: normalizedPath,
                  width: photo.width,
                  height: photo.height,
                },
                location: exifLocation,
                exifData: exifData, // Pass the full EXIF data for potential future use
                photoSource: 'camera',
                _uniqueKey: navigationKey,
                rating: 0,
                likedComment: '',
                dislikedComment: ''
              });
              return;
            } else {
              console.log("No EXIF GPS data found in the captured photo, using device location");
            }
          } catch (exifError) {
            console.log("Error extracting EXIF data from captured photo:", exifError);
            console.log("Falling back to device location");
          }

          // Start fetching restaurant suggestions as early as possible
          console.log("Starting early fetch of restaurant suggestions after taking photo (device location)");
          if (location) {
            setTimeout(() => {
              getMealSuggestions(normalizedPath, location)
                .then(suggestions => {
                  console.log("Early restaurant suggestions fetched successfully:",
                    suggestions.restaurants?.length || 0, "restaurants");
                  // Store in global app cache for later screens to use
                  (global as any).prefetchedSuggestions = suggestions;
                })
                .catch(err => {
                  console.log("Early restaurant suggestions fetch failed:", err);
                });
            }, 0);
          }

          // Use device location as fallback - navigate directly to RatingScreen2
          navigation.navigate('RatingScreen2', {
            photo: {
              uri: normalizedPath,
              width: photo.width,
              height: photo.height,
            },
            location: location, // Use the device location as fallback
            photoSource: 'camera',
            _uniqueKey: navigationKey, // Add unique key for component refresh
            rating: 0,
            likedComment: '',
            dislikedComment: ''
          });
          
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
      
      {/* Upload from Library button - top center */}
      <TouchableOpacity style={styles.uploadButton} onPress={selectFromGallery}>
        <Image 
          source={require('../assets/icons/upload-inactive.png')} 
          style={styles.uploadIcon}
        />
        <Text style={styles.uploadButtonText}>Upload from Library</Text>
      </TouchableOpacity>

      <View style={styles.buttonContainer}>
        {/* Capture button */}
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
    paddingHorizontal: 20,
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
  }
});

export default CameraScreen;
