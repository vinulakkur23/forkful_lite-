import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  StatusBar,
  Platform,
  Dimensions
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
  
  // Size for square guide (80% of screen width)
  const guideSize = screenWidth * 0.8;
  
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

          const photo = await camera.current.takePhoto({
            qualityPrioritization: 'quality',
            flash: 'off',
            enableAutoStabilization: true,
            skipMetadata: false
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

              // Navigate with EXIF location data
              navigation.navigate('Crop', {
                photo: {
                  uri: normalizedPath,
                  width: photo.width,
                  height: photo.height,
                },
                location: exifLocation,
                exifData: exifData, // Pass the full EXIF data for potential future use
                _navigationKey: navigationKey,
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

          // Use device location as fallback if EXIF extraction fails or no GPS data available
          navigation.navigate('Crop', {
            photo: {
              uri: normalizedPath,
              width: photo.width,
              height: photo.height,
            },
            location: location, // Use the device location as fallback
            _navigationKey: navigationKey, // Add navigation key for component refresh
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
        <Icon name="no-photography" size={64} color="#ff6b6b" />
        <Text style={styles.permissionText}>
          Camera permission is required to capture meals
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={async () => {
            const result = await Camera.requestCameraPermission();
            setHasPermission(result === 'granted');
          }}
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goBack}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
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
            
            navigation.navigate('EditPhoto', {
              photo: {
                uri: mockImageUri,
                width: 800,
                height: 600
              },
              location: location,
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
        enableZoomGesture
      />
      
      {/* Square framing guide centered on screen */}
      <View style={styles.guideCenterer}>
        <View style={[styles.framingGuide, { width: guideSize, height: guideSize }]}>
          {/* Top line */}
          <View style={styles.dottedLine} />
          
          {/* Bottom line */}
          <View style={[styles.dottedLine, styles.bottomLine]} />
          
          {/* Corner guides */}
          <View style={[styles.cornerGuide, styles.topLeftCorner]} />
          <View style={[styles.cornerGuide, styles.topRightCorner]} />
          <View style={[styles.cornerGuide, styles.bottomLeftCorner]} />
          <View style={[styles.cornerGuide, styles.bottomRightCorner]} />
        </View>
      </View>
      
      <View style={styles.overlay}>
        <Text style={styles.overlayText}>Position your meal in the frame</Text>
      </View>
      
      <TouchableOpacity style={styles.closeButton} onPress={goBack}>
        <Icon name="close" size={24} color="white" />
      </TouchableOpacity>
      
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
    flex: 1, // Make camera fill the entire screen
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
    borderColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'space-between', // For dashed lines at top and bottom
    position: 'relative',
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
    width: 20,
    height: 20,
    borderColor: 'white',
    borderWidth: 2,
  },
  topLeftCorner: {
    top: 0,
    left: 0,
    borderBottomWidth: 0,
    borderRightWidth: 0,
    borderTopLeftRadius: 4,
  },
  topRightCorner: {
    top: 0,
    right: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderTopRightRadius: 4,
  },
  bottomLeftCorner: {
    bottom: 0,
    left: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomLeftRadius: 4,
  },
  bottomRightCorner: {
    bottom: 0,
    right: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderBottomRightRadius: 4,
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
  buttonContainer: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'white',
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
    backgroundColor: '#f8f8f8',
    padding: 20,
  },
  permissionText: {
    fontSize: 18,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 20,
    color: '#333',
  },
  permissionButton: {
    backgroundColor: '#ff6b6b',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    marginTop: 15,
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
    color: '#666',
    fontSize: 16,
  }
});

export default CameraScreen;
