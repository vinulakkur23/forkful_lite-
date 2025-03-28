import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Camera, useCameraDevices } from 'react-native-vision-camera';
import Geolocation from '@react-native-community/geolocation';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../App';

type CameraScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Camera'>;

type Props = {
  navigation: CameraScreenNavigationProp;
};

const CameraScreen: React.FC<Props> = ({ navigation }) => {
  const camera = useRef<Camera>(null);
  const [location, setLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
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

  useEffect(() => {
    // Request camera permission
    (async () => {
      const cameraPermission = await Camera.requestCameraPermission();
      console.log(`Camera permission status: ${cameraPermission}`);
      
      // Add a short delay to ensure devices are properly initialized
      setTimeout(() => {
        setIsLoading(false);
      }, 1500);
    })();

    // Get location
    Geolocation.getCurrentPosition(
      position => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      error => {
        console.log('Location error:', error);
        Alert.alert('Location Error', 'Could not get your location.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  }, []);

  const takePicture = async () => {
    if (camera.current) {
      try {
        console.log("Taking photo...");
        const photo = await camera.current.takePhoto({
          qualityPrioritization: 'quality',
          flash: 'off',
        });
        
        console.log("Photo taken:", photo.path);
        
        navigation.navigate('EditPhoto', {
          photo: {
            uri: `file://${photo.path}`,
            width: photo.width,
            height: photo.height,
          },
          location: location,
        });
      } catch (error) {
        console.error('Error taking photo:', error);
        Alert.alert('Error', 'Failed to take photo');
      }
    } else {
      console.log("Camera ref is null");
      Alert.alert('Error', 'Camera is not ready');
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

  if (!device) {
    // Fallback to display camera info
    return (
      <View style={styles.container}>
        <Text style={{ color: 'white', textAlign: 'center', padding: 20 }}>
          Camera device not available.
        </Text>
        <Text style={{ color: 'white', textAlign: 'center', padding: 10, fontSize: 12 }}>
          Devices detected: {Object.keys(devices).length}
        </Text>
        <TouchableOpacity
          style={styles.fallbackButton}
          onPress={() => {
            // Navigate with a mock image
            navigation.navigate('EditPhoto', {
              photo: {
                uri: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=1000',
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
      <Camera
        ref={camera}
        style={styles.camera}
        device={device}
        isActive={true}
        photo={true}
        enableZoomGesture
      />
      <View style={styles.overlay}>
        <Text style={styles.overlayText}>Position your meal in the frame</Text>
      </View>
      <View style={styles.buttonContainer}>
        <TouchableOpacity onPress={takePicture} style={styles.captureButton}>
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
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 30,
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
  buttonContainer: {
    position: 'absolute',
    bottom: 30,
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
  }
});

export default CameraScreen;
