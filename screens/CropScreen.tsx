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
import { getMealSuggestions } from '../services/mealService';
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
        console.log('New photo detected, resetting suggestion fetch state');
        // Store the current URI as previous for next comparison
        prevPhotoUri.current = photo.uri;
        // Reset the suggestion fetched state to ensure we fetch again
        suggestionsFetched.current = false;
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
      
      // Delay opening the cropper slightly to ensure component is fully rendered
      setTimeout(() => {
        if (isMounted.current && !cropperOpened.current) {
          openCropper();
        }
      }, 300);
      
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
        // Add a default source if it's missing
        source: location.source || (isGalleryUpload ? 'exif' : 'device')
      } : location;
      
      // If we have location data with source='exif' from photoLibraryService, prioritize it
      if (location && location.source === 'exif') {
        console.log("Using location data provided from PHAsset extraction:", location);
      } 
      // If we have route.params.exifData from photoLibraryService, use it
      else if (route.params.exifData) {
        console.log("Using EXIF data passed in route params:", route.params.exifData);
        
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
      // Otherwise, try direct EXIF extraction as a fallback
      else {
        // For ALL photos, not just gallery uploads, try to extract EXIF data directly
        console.log("No PHAsset location data, attempting to extract EXIF directly before API call");
        
        try {
          // On iOS, we need to handle temporary file paths specially
          // Define exifData here so it's accessible in both branches
          let exifData = null;
          
          if (Platform.OS === 'ios') {
            console.log("iOS platform detected, using specialized EXIF extraction");
            
            // Clean any URI that might have query parameters
            const cleanUri = photoUriToUse.split('?')[0];
            
            // Try different variations of the URI for iOS
            const uriVariations = [
              cleanUri,
              cleanUri.replace('file://', ''),
              `file://${cleanUri.replace('file://', '')}`,
              // Try absolute paths that start with /var or /private/var
              cleanUri.startsWith('/var') ? cleanUri : null,
              cleanUri.startsWith('/private/var') ? cleanUri : null,
              // Try removing duplicated slashes if any
              cleanUri.replace('//', '/'),
            ].filter(Boolean); // Remove null/undefined entries
            
            console.log("Will try these URI variations for EXIF extraction:", uriVariations);
            
            // Try each URI variation until one works
            for (const uri of uriVariations) {
              try {
                console.log(`Trying EXIF extraction with URI: ${uri}`);
                const result = await Exif.getExif(uri);
                if (result) {
                  console.log(`EXIF extraction worked with URI: ${uri}`);
                  exifData = result;
                  break;
                }
              } catch (err) {
                console.log(`EXIF extraction failed with URI: ${uri}`);
              }
            }
          } else {
            // Android handling
            // Try multiple URI formats to maximize chances of success
            const uriVariations = [
              photoUriToUse,
              photoUriToUse.replace('file://', ''),
              'file://' + photoUriToUse.replace('file://', '')
            ];
            
            // Try each URI variation until one works
            for (const uri of uriVariations) {
              try {
                console.log(`Trying EXIF extraction with URI: ${uri}`);
                const result = await Exif.getExif(uri);
                if (result) {
                  console.log(`EXIF extraction worked with URI: ${uri}`);
                  exifData = result;
                  break;
                }
              } catch (err) {
                console.log(`EXIF extraction failed with URI: ${uri}`);
              }
            }
          }
          
          if (exifData) {
            console.log("EXIF data found:", JSON.stringify(exifData, null, 2));
            
            // Check if GPS data is available in the EXIF
            if (exifData.GPSLatitude && exifData.GPSLongitude) {
              console.log("Found GPS data in EXIF:", {
                lat: exifData.GPSLatitude,
                lng: exifData.GPSLongitude
              });
              
              // Create an enhanced location object from EXIF data
              enhancedLocation = {
                latitude: parseFloat(exifData.GPSLatitude),
                longitude: parseFloat(exifData.GPSLongitude),
                source: 'exif'
              };
              
              console.log("Will use EXIF location data for API call instead of passed location");
            } else {
              console.log("EXIF found but no GPS coordinates present");
            }
          } else {
            console.log("No EXIF data could be extracted from the photo");
          }
        } catch (exifError) {
          console.error("Failed to extract EXIF data:", exifError);
        }
      }
      
      // Check if we have prefetched suggestions in the global context
      // This would have been set by the photoLibraryService
      if ((global as any).prefetchedSuggestions) {
        console.log("Found prefetched suggestions in global context - skipping API call");
        // No need to make another API call, just log what we have
        const suggestions = (global as any).prefetchedSuggestions;
        console.log('Using existing prefetched suggestions:',
          suggestions.restaurants?.length || 0, 'restaurants,',
          suggestions.menu_items?.length || 0, 'menu items');
      } else {
        // No prefetched suggestions, need to call the API
        console.log("No prefetched suggestions found, making API call");
        
        // Use a clean URI for the API call (no query parameters)
        // This should work better with the API and EXIF extraction
        const apiUri = photoUriToUse.split('?')[0];
        console.log(`Using cleaned URI for API call: ${apiUri}`);
        
        // Use the original photo URI to preserve EXIF data with the best available location
        const suggestions = await getMealSuggestions(apiUri, enhancedLocation);

        // Store the suggestion data in global scope for use in the Rating screen
        (global as any).prefetchedSuggestions = suggestions;

        console.log('Successfully prefetched restaurant suggestions:',
          suggestions.restaurants?.length || 0, 'restaurants,',
          suggestions.menu_items?.length || 0, 'menu items');
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
        
        // Prepare any cached suggestion data
        const cachedSuggestions = (global as any).prefetchedSuggestions;
        
        // Navigate to RatingScreen1 with the cropped image and any prefetched suggestions
        console.log('Navigating to RatingScreen1 with cropped image:', result.path);
        console.log('Passing prefetched suggestions:', 
          cachedSuggestions ? 'Yes - cached data available' : 'No - no cached data');
        
        navigation.navigate('RatingScreen1', {
          photo: {
            uri: result.path,
            width: result.width,
            height: result.height,
          },
          location: location,
          // Include EXIF data if available from route params
          exifData: route.params.exifData,
          // Include suggestionData if available
          suggestionData: cachedSuggestions || undefined,
          _uniqueKey: `rating_screen1_${timestamp}`,
        });
        
        // Don't clear the global cache here since EditPhoto will pass it along to Rating
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