// apiTest.ts - Direct API test for React Native
import { Alert } from 'react-native';
import { API_CONFIG } from '../config/api';

/**
 * Test the metadata API directly by submitting an image
 * 
 * @param imageUri The URI to a local image file
 * @returns Promise with the API response
 */
export const testMetadataApi = async (imageUri: string) => {
  try {
    console.log('Starting direct API test with image:', imageUri);
    
    // Create FormData
    const formData = new FormData();
    
    // Add the image to FormData
    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg', // Adjust if needed based on your image
      name: 'test_image.jpg',
    } as any);
    
    // Add a test meal ID
    formData.append('meal_id', 'test_from_app_' + Date.now());
    
    console.log('Sending request to API...');
    
    // Make the API request
    const response = await fetch(API_CONFIG.getUrl(API_CONFIG.ENDPOINTS.EXTRACT_METADATA), {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        // Do not set Content-Type manually when using FormData
      },
      body: formData,
    });
    
    console.log('Response status:', response.status);
    
    // Get response text no matter what
    const responseText = await response.text();
    
    // Try to parse as JSON
    try {
      const jsonResponse = JSON.parse(responseText);
      console.log('Response JSON:', jsonResponse);
      
      // Show success alert
      Alert.alert(
        'API Test Result',
        `Status: ${response.status} - ${response.ok ? 'Success' : 'Error'}\n\n` +
        (jsonResponse.metadata ? 
          `Metadata:\n• Cuisine: ${jsonResponse.metadata.cuisineType}\n• Food: ${jsonResponse.metadata.foodType}` : 
          'No metadata returned'),
        [{ text: 'OK' }]
      );
      
      return jsonResponse;
    } catch (parseError) {
      console.error('Error parsing response as JSON:', parseError);
      console.log('Raw response:', responseText);
      
      // Show error alert
      Alert.alert(
        'API Test Result',
        `Status: ${response.status} - Parse Error\n\nRaw response:\n${responseText.substring(0, 200)}...`,
        [{ text: 'OK' }]
      );
      
      return { error: 'Parse error', raw: responseText };
    }
  } catch (error) {
    console.error('Error making API request:', error);
    
    // Show error alert
    Alert.alert(
      'API Test Error',
      `Error: ${error instanceof Error ? error.message : String(error)}`,
      [{ text: 'OK' }]
    );
    
    return { error: String(error) };
  }
};