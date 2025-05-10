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
import { CompositeNavigationProp, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, TabParamList } from '../App';
import ImageCropPicker from 'react-native-image-crop-picker';

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
  
  // Use refs to track component mounted state
  const isMounted = useRef(true);
  const cropperOpened = useRef(false);
  
  // Focus effect to reset state when screen gains focus
  useFocusEffect(
    React.useCallback(() => {
      console.log('CropScreen focused with key:', _navigationKey);
      
      // Reset state when screen comes into focus
      isMounted.current = true;
      cropperOpened.current = false;
      setProcessing(false);
      
      // Delay opening the cropper slightly to ensure component is fully rendered
      setTimeout(() => {
        if (isMounted.current && !cropperOpened.current) {
          openCropper();
        }
      }, 300);
      
      return () => {
        console.log('CropScreen blurred');
      };
    }, [_navigationKey])
  );

  // Setup effect that runs once on mount
  useEffect(() => {
    console.log('CropScreen mounted with key:', _navigationKey);
    
    // Set mounted flag
    isMounted.current = true;
    
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

    // Set transparent status bar
    StatusBar.setTranslucent(true);
    StatusBar.setBackgroundColor('transparent');
    
    // Cleanup when component unmounts
    return () => {
      console.log('CropScreen unmounting');
      isMounted.current = false;
      
      // Restore status bar
      StatusBar.setTranslucent(false);
      StatusBar.setBackgroundColor('#ffffff');
      
      // Clean up any remaining resources
      ImageCropPicker.clean().catch(e => {
        console.log('ImageCropPicker cleanup error:', e);
      });
    };
  }, []);

  // Open the cropper directly
  const openCropper = async () => {
    try {
      // Check if already processing or component unmounted
      if (processing || !isMounted.current || cropperOpened.current) {
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
      
      // Clean crop params to avoid issues on iOS
      ImageCropPicker.clean().catch(() => {
        // Ignore errors during cleanup
      });

      // Set square crop dimensions - use the minimum dimension to ensure a proper square
      const cropSize = Math.min(photo.width, photo.height);

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
      
      // If component is still mounted, navigate to next screen
      if (isMounted.current) {
        // Generate a unique navigation key
        const timestamp = new Date().getTime();
        
        // Navigate to EditPhoto with the cropped image
        console.log('Navigating to EditPhoto with cropped image:', result.path);
        navigation.navigate('EditPhoto', {
          photo: {
            uri: result.path,
            width: result.width,
            height: result.height,
          },
          location: location,
          _navigationKey: `edit_photo_${timestamp}`,
        });
      }
    } catch (error) {
      console.log('Crop error:', error);
      
      if (isMounted.current) {
        if (error.message !== 'User cancelled image selection') {
          // For actual errors, show an alert
          Alert.alert(
            'Error',
            'Failed to crop image. Please try again.',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
        } else {
          // If user cancelled, go back
          navigation.goBack();
        }
      }
    } finally {
      // Reset processing state if component still mounted
      if (isMounted.current) {
        setProcessing(false);
      }
    }
  };

  // Simple loading screen
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" />
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff6b6b" />
        <Text style={styles.loadingText}>Opening cropper...</Text>
        <Text style={[styles.loadingText, styles.smallText]}>
          All photos will be cropped to a square format
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