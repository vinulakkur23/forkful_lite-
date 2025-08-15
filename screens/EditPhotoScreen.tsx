import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  Dimensions,
  PanResponder,
  Animated,
  Modal,
  Platform
} from 'react-native';
import { CompositeNavigationProp, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { RootStackParamList, TabParamList } from '../App';

// Extend the TabParamList to include exifData in the EditPhoto screen params
declare module '../App' {
  interface TabParamList {
    EditPhoto: {
      photo: {
        uri: string;
        width?: number;
        height?: number;
      };
      location?: {
        latitude: number;
        longitude: number;
        source: string;
      } | null;
      exifData?: any;
      suggestionData?: any;
      _navigationKey: string;
    };
  }
}
import API_CONFIG from '../config/api';
import ImageResizer from 'react-native-image-resizer';
import ImageCropPicker from 'react-native-image-crop-picker';
import RNFS from 'react-native-fs';
import { getMealSuggestions } from '../services/mealService';

// Update the navigation prop type to use composite navigation
type EditPhotoScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'EditPhoto'>,
  StackNavigationProp<RootStackParamList>
>;

type EditPhotoScreenRouteProp = RouteProp<TabParamList, 'EditPhoto'>;

type Props = {
  navigation: EditPhotoScreenNavigationProp;
  route: EditPhotoScreenRouteProp;
};

// Define the edit options
interface EditOption {
  id: string;
  label: string;
  selected: boolean;
}

const EditPhotoScreen: React.FC<Props> = ({ route, navigation }) => {
  const { photo, location } = route.params;
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [imageSource, setImageSource] = useState<{uri: string}>({uri: ''});
  // Edit options with checkboxes
  const [editOptions, setEditOptions] = useState<EditOption[]>([
    { id: 'angle', label: 'Change Angle', selected: false },
    { id: 'sharpen', label: 'Sharpen Image', selected: false },
    { id: 'lighting', label: 'Improve Lighting', selected: false },
    { id: 'plate', label: 'Change Plate', selected: false },
    { id: 'background', label: 'Remove Background Clutter', selected: false },
  ]);
  const [imageError, setImageError] = useState<boolean>(false);

  // New state for the cropping functionality
  const [showCropModal, setShowCropModal] = useState<boolean>(false);
  const [croppedImage, setCroppedImage] = useState<string | null>(null);

  // State for restaurant suggestions - prefetch while editing
  const [fetchingSuggestions, setFetchingSuggestions] = useState<boolean>(false);
  const [suggestionData, setSuggestionData] = useState<any>(null);
  
  // Get screen dimensions for cropping
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  
  // Reset state when the screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      console.log('EditPhoto screen focused - setting up with new photo data');
      
      // Always reset the edit options when the screen is focused
      setEditOptions([
        { id: 'angle', label: 'Change Angle', selected: false },
        { id: 'sharpen', label: 'Sharpen Image', selected: false },
        { id: 'lighting', label: 'Improve Lighting', selected: false },
        { id: 'plate', label: 'Change Plate', selected: false },
        { id: 'background', label: 'Remove Background Clutter', selected: false },
      ]);
      
      // Reset processing state
      setIsProcessing(false);
      
      // Reset image error state
      setImageError(false);
      
      // Reset cropped image state
      setCroppedImage(null);
      
      // Set image source from route params
      if (photo && photo.uri) {
        setImageSource({ uri: photo.uri });
        console.log("Set new image source from route params:", photo.uri);
      } else {
        console.error("No valid photo in route params:", photo);
      }
      
      return () => {
        // Cleanup when screen loses focus (if needed)
        console.log('EditPhoto screen blurred');
      };
    }, [photo]) // Depend on photo prop to re-run when it changes
  );
  
  // Add validation on component mount
  useEffect(() => {
    if (!photo || !photo.uri) {
      console.error("Invalid photo object in EditPhotoScreen:", photo);
      Alert.alert(
        "Error",
        "Invalid photo data received. Please try taking a photo again.",
        [
          {
            text: "OK",
            onPress: () => navigation.goBack()
          }
        ]
      );
      return;
    }

    // Set image source if photo is valid
    setImageSource({ uri: photo.uri });
    
    // Prefetch restaurant suggestions
    const fetchRestaurantSuggestions = async () => {
      if (!photo || !photo.uri || fetchingSuggestions) return;

      // First check if we already have suggestion data from the previous screen
      if (route.params.suggestionData) {
        console.log('Using suggestion data passed from previous screen');
        setSuggestionData(route.params.suggestionData);
        return;
      }

      // Check if we have prefetched suggestions in global context
      if ((global as any).prefetchedSuggestions) {
        console.log('Using prefetched suggestions from global context');
        setSuggestionData((global as any).prefetchedSuggestions);
        return;
      }

      // If we don't have any suggestion data yet, fetch it now
      try {
        console.log('Prefetching restaurant suggestions while user edits photo');
        setFetchingSuggestions(true);

        // Use the best location data available
        let bestLocation = location;
        
        // If we have exifData with location, prioritize it
        if (route.params.exifData && route.params.exifData.location) {
          console.log('Using location from EXIF data for suggestion prefetch');
          bestLocation = {
            latitude: route.params.exifData.location.latitude,
            longitude: route.params.exifData.location.longitude,
            source: 'exif'
          };
        }

        const suggestions = await getMealSuggestions(photo.uri, bestLocation);

        // Store the suggestion data for later use
        setSuggestionData(suggestions);
        console.log('Successfully prefetched restaurant suggestions:',
          suggestions.restaurants?.length || 0, 'restaurants,',
          suggestions.menu_items?.length || 0, 'menu items');
      } catch (error) {
        console.log('Error prefetching restaurant suggestions:', error);
        // Don't show errors to the user - this is a background operation
      } finally {
        setFetchingSuggestions(false);
      }
    };

    // Start fetching suggestions in the background
    fetchRestaurantSuggestions();
  }, []);
  
  const toggleEditOption = (id: string): void => {
    setEditOptions(prevOptions =>
      prevOptions.map(option =>
        option.id === id
          ? { ...option, selected: !option.selected }
          : option
      )
    );
  };
  
  // Handle opening the crop interface
  const handleCrop = async () => {
      try {
        // Use the current image source
        const currentImage = croppedImage || imageSource.uri;
        
        const result = await ImageCropPicker.openCropper({
          path: currentImage,
          width: 1000,
          height: 1000,
          cropperCircleOverlay: false,
          freeStyleCropEnabled: true,
          cropperToolbarTitle: 'Crop Photo',
          showCropGuidelines: true,
          showCropFrame: true,
          enableRotationGesture: true,
          aspectRatio: 1/1, // Force square (1:1) aspect ratio
        });
        
        console.log('Cropped image result:', result);
        
        // Set the cropped image as the new image source
        setCroppedImage(result.path);
        setImageSource({ uri: result.path });
      } catch (error) {
        console.log('Cropping cancelled or failed:', error);
        // User cancelled, no need to show error
        if (error.message !== 'User cancelled image selection') {
          Alert.alert('Error', 'Failed to crop image. Please try again.');
        }
      }
    };
  
  // API configuration - hardcoded for testing
  const HARDCODED_URL = 'https://dishitout-imageinhancer.onrender.com';
  
  // Add this new function to resize the image
  const resizeAndUploadImage = async (uri: string): Promise<string> => {
    try {
      console.log('Resizing image from:', uri);
      
      // Resize to a reasonable size (1400x1400 max, maintaining aspect ratio)
      const resizedImage = await ImageResizer.createResizedImage(
        uri,
        1400,
        1400,
        'JPEG',
        92,  // 92% quality - increased for better display quality
        0,
        undefined,
        false,
        { mode: 'contain', onlyScaleDown: true }
      );
      
      console.log('Resized image path:', resizedImage.uri);
      console.log('Resized image size:', resizedImage.size / 1024, 'KB');
      
      return resizedImage.uri;
    } catch (error) {
      console.error('Error resizing image:', error);
      // Fall back to original if resizing fails
      return uri;
    }
  };

  const processPhoto = async (): Promise<void> => {
    // Only process if at least one option is selected
    const anySelected = editOptions.some(option => option.selected);
    
    if (anySelected) {
      setIsProcessing(true);
      
      try {
        // Use cropped image if available, otherwise use original
        const imageUri = croppedImage || (photo && photo.uri);
        
        // Verify image URI exists
        if (!imageUri) {
          throw new Error('Invalid photo object');
        }
        
        // Resize the image first
        const resizedImageUri = await resizeAndUploadImage(imageUri);
        
        // Create form data
        const formData = new FormData();
        
        // Create a file object from the resized image
        const fileExtension = resizedImageUri.split('.').pop() || 'jpg';
        const fileName = `photo.${fileExtension}`;
        const fileType = `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`;
        
        // Add the resized image instead of the original
        formData.append('image', {
          uri: resizedImageUri,  // Use the resized image URI
          name: fileName,
          type: fileType,
        } as any);
        
        // Add selected options
        const selectedOptions = editOptions
          .filter(option => option.selected)
          .map(option => option.id);
        formData.append('options', JSON.stringify(selectedOptions));
        
        // Add location data if available
        if (location) {
          formData.append('latitude', location.latitude.toString());
          formData.append('longitude', location.longitude.toString());
        }
        
        console.log('Sending request to API');
        console.log('Full API URL:', `${HARDCODED_URL}/edit-photo`);
        
        // Send to your API using hardcoded URL
        const response = await fetch(`${HARDCODED_URL}/edit-photo`, {
          method: 'POST',
          body: formData,
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Network response error ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        console.log('Received API response');
        
        // Check if we have a processed image
        if (result.processed_image) {
          // Update the image with the processed version
          setImageSource({ uri: result.processed_image });
          setCroppedImage(result.processed_image);
          setImageError(false); // Reset any image error state

          // Log any message from the model (optional)
          if (result.model_response) {
            console.log('Model response:', result.model_response);
          }

          // Log that we're receiving a base64 data URL if that's the case
          if (result.processed_image.startsWith('data:image')) {
            console.log('Received image as base64 data URL - will be converted to file when needed');
          }
        } else {
          throw new Error('API response did not contain a processed image');
        }
      } catch (error) {
        console.error('Error processing photo:', error);
        alert(`Failed to process photo: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsProcessing(false);
      }
    } else {
      // Show some feedback that no options were selected
      alert('Please select at least one edit option');
    }
  };
  
  const processGoBig = async (): Promise<void> => {
    setIsProcessing(true);
    
    try {
      // Use cropped image if available, otherwise use original
      const imageUri = croppedImage || (photo && photo.uri);
      
      // Verify image URI exists
      if (!imageUri) {
        throw new Error('Invalid photo object');
      }
      
      // Resize the image first
      const resizedImageUri = await resizeAndUploadImage(imageUri);
      
      // Create form data
      const formData = new FormData();
      
      // Create a file object from the resized image
      const fileExtension = resizedImageUri.split('.').pop() || 'jpg';
      const fileName = `photo.${fileExtension}`;
      const fileType = `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`;
      
      // Add the resized image instead of the original
      formData.append('image', {
        uri: resizedImageUri,  // Use the resized image URI
        name: fileName,
        type: fileType,
      } as any);
      
      // Add location data if available
      if (location) {
        formData.append('latitude', location.latitude.toString());
        formData.append('longitude', location.longitude.toString());
      }
      
      console.log('Sending Go Big request to API');
      console.log('Full API URL for Go Big:', `${HARDCODED_URL}/go-big`);
      
      // Send to your API using hardcoded URL
      const response = await fetch(`${HARDCODED_URL}/go-big`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Network response error ${response.status}: ${errorText}`);
      }
      
      const result = await response.json();
      console.log('Received Go Big API response');
      
      // Check if we have a processed image
      if (result.processed_image) {
        // Update the image with the processed version
        setImageSource({ uri: result.processed_image });
        setCroppedImage(result.processed_image);
        setImageError(false); // Reset any image error state

        // Log any message from the model (optional)
        if (result.model_response) {
          console.log('Model response:', result.model_response);
        }

        // Log that we're receiving a base64 data URL if that's the case
        if (result.processed_image.startsWith('data:image')) {
          console.log('Received image as base64 data URL - will be converted to file when needed');
        }
      } else {
        throw new Error('API response did not contain a processed image');
      }
    } catch (error) {
      console.error('Error processing Go Big:', error);
      alert(`Failed to enhance photo: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const continueToRating = async (): Promise<void> => {
        try {
          // Show loading indication if needed
          setIsProcessing(true);

          // Use the cropped image if available, otherwise use the original
          const sourceImageUri = croppedImage || imageSource.uri;

          // Create a clean copy of the image without query parameters for passing to next screen
          const timestamp = new Date().getTime();
          const sessionId = Math.random().toString(36).substring(2, 15);
          const fileExt = 'jpg'; // Default to jpg

          // Create a path for the new clean image file
          const newFilename = `rating_image_${timestamp}.${fileExt}`;

          // Determine the temp directory path based on platform
          const dirPath = Platform.OS === 'ios'
            ? `${RNFS.TemporaryDirectoryPath}/`
            : `${RNFS.CachesDirectoryPath}/`;

          const newFilePath = `${dirPath}${newFilename}`;
          console.log('Creating clean image for Rating screen at:', newFilePath);

          // Check if the source image is a base64 data URL
          if (sourceImageUri.startsWith('data:image')) {
            console.log('Converting base64 data URL to file');

            // Extract the base64 content from the data URL
            const base64Data = sourceImageUri.split(',')[1];

            // Write the base64 data directly to a file
            await RNFS.writeFile(newFilePath, base64Data, 'base64');
            console.log('Base64 image data written to file successfully');
          } else {
            // It's a regular file URI, copy it
            console.log('Copying image file from regular URI');
            await RNFS.copyFile(sourceImageUri, newFilePath);
            console.log('File copied successfully for Rating screen');
          }

          // Create a fresh image object for the Rating screen
          const freshImageSource = {
            uri: newFilePath,
            width: photo.width,
            height: photo.height,
            sessionId: sessionId // Add session ID for tracking
          };

          console.log(`Navigating to Rating with fresh image: ${freshImageSource.uri}`);

          // IMPORTANT: Clear any global prefetched suggestions to prevent caching issues
          if ((global as any).prefetchedSuggestions) {
            console.log('!!! CLEARING GLOBAL PREFETCHED SUGGESTIONS IN EDITPHOTOSCREEN !!!');
            (global as any).prefetchedSuggestions = null;
            delete (global as any).prefetchedSuggestions;
          }

          // Set useSuggestionData to null to force a fresh API call
          let useSuggestionData = null;

          // Force a fresh API call by not using any cached suggestions
          console.log('Setting useSuggestionData to null to FORCE fresh API call in RatingScreen');

          // Log suggestion data status
          console.log('Suggestion data for Rating screen:', 
            useSuggestionData ? 
              `Present with ${useSuggestionData.restaurants?.length || 0} restaurants` : 
              'Not available');

          // Check if we have EXIF data
          const exifData = route.params.exifData || null;
          if (exifData) {
            console.log('Passing EXIF data to Rating screen');
          }

          // CLEAN APPROACH: Pass meal ID and photo - ResultScreen will load from Firestore
          const cleanParams = {
            photo: freshImageSource,
            location: location ? {
              latitude: location.latitude,
              longitude: location.longitude,
              source: location.source
            } : null,
            // CLEAN: Pass meal ID instead of meal data - ResultScreen will load from Firestore
            mealId: route.params.mealId || null,
            // Include exifData if available
            exifData: exifData || null,
            _uniqueKey: sessionId
          };
          
          try {
            console.log('EditPhoto navigating to Results with clean params', {
              hasPhoto: !!cleanParams.photo,
              hasLocation: !!cleanParams.location,
              hasMealData: !!cleanParams.rating,
              uniqueKey: cleanParams._uniqueKey
            });
            navigation.navigate('Result', cleanParams);
          } catch (navError) {
            console.error('Navigation error in EditPhoto:', navError);
            console.error('Failed params:', JSON.stringify(cleanParams, null, 2));
            Alert.alert('Navigation Error', 'Failed to navigate to results. Please try again.');
          }
        } catch (error) {
          console.error('Error preparing image for Rating screen:', error);
          Alert.alert('Error', 'Failed to prepare image for rating. Please try again.');
        } finally {
          setIsProcessing(false);
        }
    };
  
  // Handle image load error
  const handleImageError = () => {
    console.log('Image failed to load in EditPhotoScreen');
    setImageError(true);
  };
  
  return (
    <View style={styles.container}>
      {/* Top half - Image preview */}
      <View style={styles.imageContainer}>
        {!imageError ? (
          <Image
            source={{ uri: croppedImage || imageSource.uri }}
            style={styles.image}
            resizeMode="cover"
            onError={handleImageError}
          />
        ) : (
          <View style={styles.errorImageContainer}>
            <Icon name="broken-image" size={64} color="#ccc" />
            <Text style={styles.errorImageText}>Failed to load image</Text>
          </View>
        )}
        {isProcessing && (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.processingText}>
              AI is enhancing your photo...{'\n'}
              This may take up to 30 seconds
            </Text>
          </View>
        )}
      </View>
      
      {/* Action buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.actionButton, styles.editButton, { flex: 1 }]}
          onPress={processPhoto}
          disabled={isProcessing}
        >
          <Icon name="edit" size={20} color="white" />
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.doneButton, { flex: 1 }]}
          onPress={continueToRating}
        >
          <Icon name="check" size={20} color="white" />
          <Text style={styles.actionButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
      
      {/* Edit options with checkboxes */}
      <ScrollView style={styles.optionsContainer}>
        {editOptions.map((option) => (
          <TouchableOpacity
            key={option.id}
            style={styles.optionRow}
            onPress={() => toggleEditOption(option.id)}
          >
            <View style={[
              styles.checkbox,
              option.selected ? styles.checkboxChecked : {}
            ]}>
              {option.selected && <Icon name="check" size={18} color="white" />}
            </View>
            <Text style={styles.optionText}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      
      {/* No location information displayed */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  imageContainer: {
    height: 320, // Fixed height like MealDetailScreen
    width: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  errorImageContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  errorImageText: {
    marginTop: 10,
    color: '#999',
    fontSize: 16,
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: {
    color: 'white',
    marginTop: 10,
    fontSize: 16,
    textAlign: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    marginHorizontal: 5,
    borderRadius: 8,
  },
  editButton: {
    backgroundColor: '#4CAF50',
    marginRight: 5,
  },
  doneButton: {
    backgroundColor: '#ff6b6b',
    marginLeft: 5,
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '600',
    marginLeft: 5,
  },
  optionsContainer: {
    flex: 1,
    padding: 15,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#666',
    borderRadius: 4,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  optionText: {
    fontSize: 16,
  },
  // Location text removed
  // Crop modal styles
  cropContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  cropImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cropControlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: 80,
    backgroundColor: 'black',
  },
  cropButton: {
    padding: 12,
    borderRadius: 25,
  },
  cropButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  }
});

export default EditPhotoScreen;
