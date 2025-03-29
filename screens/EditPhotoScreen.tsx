import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { RootStackParamList } from '../App';
import API_CONFIG from '../config/api';
import ImageResizer from 'react-native-image-resizer';

type EditPhotoScreenNavigationProp = StackNavigationProp<RootStackParamList, 'EditPhoto'>;
type EditPhotoScreenRouteProp = RouteProp<RootStackParamList, 'EditPhoto'>;

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
  const [imageSource, setImageSource] = useState<{uri: string}>(photo);
  // Edit options with checkboxes
  const [editOptions, setEditOptions] = useState<EditOption[]>([
    { id: 'angle', label: 'Change Angle', selected: false },
    { id: 'sharpen', label: 'Sharpen Image', selected: false },
    { id: 'lighting', label: 'Improve Lighting', selected: false },
    { id: 'plate', label: 'Change Plate', selected: false },
    { id: 'background', label: 'Remove Background Clutter', selected: false },
  ]);
  
  // Test basic API connectivity on component mount
  useEffect(() => {
    const testApi = async () => {
      try {
        const response = await fetch('https://dishitout-imageinhancer.onrender.com/');
        console.log('API reached with status:', response.status);
      } catch (error) {
        console.log('API test failed:', error);
      }
    };
    testApi();
  }, []);
  
  // Handle cases where the photo URI might be a remote URL (for simulator testing)
  useEffect(() => {
    if (photo && photo.uri) {
      setImageSource({ uri: photo.uri });
    }
  }, [photo]);
  
  const toggleEditOption = (id: string): void => {
    setEditOptions(prevOptions =>
      prevOptions.map(option =>
        option.id === id
          ? { ...option, selected: !option.selected }
          : option
      )
    );
  };
  
  // API configuration - hardcoded for testing
  const HARDCODED_URL = 'https://dishitout-imageinhancer.onrender.com';
  
  // Add this new function to resize the image
  const resizeAndUploadImage = async (uri: string): Promise<string> => {
    try {
      console.log('Resizing image from:', uri);
      
      // Resize to a reasonable size (1000x1000 max, maintaining aspect ratio)
      const resizedImage = await ImageResizer.createResizedImage(
        uri,
        1000,
        1000,
        'JPEG',
        70,  // 70% quality - good balance between size and quality
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
        // Resize the image first - add this line
        const resizedImageUri = await resizeAndUploadImage(photo.uri);
        
        // Create form data
        const formData = new FormData();
        
        // Create a file object from the resized image - update this section
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
        console.log('Full API URL:', `${HARDCODED_URL}/edit-photo`);  // Use hardcoded URL for testing
        
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
          
          // Log any message from the model (optional)
          if (result.model_response) {
            console.log('Model response:', result.model_response);
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
      // Resize the image first - add this line
      const resizedImageUri = await resizeAndUploadImage(photo.uri);
      
      // Create form data
      const formData = new FormData();
      
      // Create a file object from the resized image - update this section
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
        
        // Log any message from the model (optional)
        if (result.model_response) {
          console.log('Model response:', result.model_response);
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
  
  const continueToRating = (): void => {
    navigation.navigate('Rating', {
      photo: imageSource,  // Use the possibly processed image
      location: location,
    });
  };
  
  return (
    <View style={styles.container}>
      {/* Top half - Image preview */}
      <View style={styles.imageContainer}>
        <Image
          source={imageSource}
          style={styles.image}
          resizeMode="cover"
        />
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
          style={[styles.actionButton, styles.editButton]}
          onPress={processPhoto}
          disabled={isProcessing}
        >
          <Icon name="edit" size={20} color="white" />
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.actionButton, styles.goBigButton]}
          onPress={processGoBig}
          disabled={isProcessing}
        >
          <Icon name="photo_size_select_large" size={20} color="white" />
          <Text style={styles.actionButtonText}>Go Big</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.actionButton, styles.doneButton]}
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
      
      {/* Location info at bottom */}
      <Text style={styles.locationText}>
        {location ?
          `📍 ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` :
          'Location data not available'}
      </Text>
    </View>
  );
};

// Using the Google Places API
const getNearbyRestaurants = async (latitude, longitude) => {
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=50&type=restaurant&key=YOUR_API_KEY`
  );
  const data = await response.json();
  return data.results;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  imageContainer: {
    height: '50%',
    width: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
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
  },
  goBigButton: {
    backgroundColor: '#2196F3',
  },
  doneButton: {
    backgroundColor: '#ff6b6b',
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
  locationText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
});

export default EditPhotoScreen;
