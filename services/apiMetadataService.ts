// apiMetadataService.ts - Fixed implementation for API calls
import { firebase, firestore } from '../firebaseConfig';
import { API_CONFIG } from '../config/api';
import { Platform } from 'react-native';
import RNFetchBlob from 'rn-fetch-blob';

/**
 * Types for AI-generated metadata
 */
export interface AIMetadata {
  cuisineType: string;
  foodType: string;
  mealType: string;
  primaryProtein: string;
  dietType: string;
  eatingMethod: string;
  setting: string;
  platingStyle: string;
  beverageType: string;
}

/**
 * Process a meal image to extract AI-generated metadata using the API
 * 
 * This implementation properly handles the image upload by:
 * 1. Downloading the image from Firebase Storage to a local file
 * 2. Creating a multipart/form-data request with the proper MIME type
 * 3. Handling potential errors in the process
 * 
 * @param mealId The Firestore document ID of the meal
 * @param photoUrl The Firebase Storage URL of the meal photo
 * @returns A promise that resolves to the updated metadata
 */
export const processImageMetadataViaAPI = async (mealId: string, photoUrl: string): Promise<AIMetadata> => {
  try {
    console.log(`Processing metadata for meal ${mealId} via API`);
    
    // First check if we already have metadata for this meal
    const mealDoc = await firestore().collection('mealEntries').doc(mealId).get();
    if (!mealDoc.exists) {
      throw new Error('Meal entry not found');
    }
    
    const mealData = mealDoc.data();
    
    // If AI metadata is already populated with non-default values, return it
    if (mealData?.aiMetadata && 
        Object.values(mealData.aiMetadata).some(value => value !== 'Unknown')) {
      console.log('Metadata already exists, returning existing data');
      return mealData.aiMetadata as AIMetadata;
    }
    
    console.log('Downloading image from Firebase Storage...');
    
    // Download the image to a temp file
    const tempFilePath = `${RNFetchBlob.fs.dirs.CacheDir}/temp_${Date.now()}.jpg`;
    
    // Download using RNFetchBlob for better handling of binary data
    await RNFetchBlob.config({
      fileCache: true,
      path: tempFilePath
    }).fetch('GET', photoUrl);
    
    console.log(`Image downloaded to ${tempFilePath}`);
    
    // Prepare the form data with the correct format
    const formData = new FormData();
    
    // Add the image file with proper content type
    const fileUri = Platform.OS === 'ios' 
      ? tempFilePath.replace('file://', '') 
      : tempFilePath;
      
    // Create a proper file object that includes URI, type and name
    formData.append('image', {
      uri: fileUri,
      type: 'image/jpeg',
      name: 'meal_photo.jpg',
    } as any);
    
    // Add the meal ID
    formData.append('meal_id', mealId);
    
    console.log('Sending API request to extract metadata...');
    
    // Make the API request
    const response = await fetch(API_CONFIG.getUrl(API_CONFIG.ENDPOINTS.EXTRACT_METADATA), {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        // Important: Don't manually set Content-Type here - it will be set automatically with boundary
      },
      body: formData,
    });
    
    // Clean up the temp file
    await RNFetchBlob.fs.unlink(tempFilePath);
    
    // Handle API response
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Error (${response.status}): ${errorText}`);
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }
    
    // Parse and validate the response
    const result = await response.json();
    console.log('API Response:', result);
    
    if (result.status === 'success' && result.metadata) {
      // Update the Firestore document with the received metadata
      await firestore().collection('mealEntries').doc(mealId).update({
        aiMetadata: result.metadata,
      });
      
      console.log('Successfully updated meal with AI metadata from API');
      return result.metadata;
    } else {
      throw new Error('Invalid API response format - missing metadata or success status');
    }
    
  } catch (error) {
    console.error('Error processing image metadata via API:', error);
    
    // Return default metadata in case of error
    const defaultMetadata: AIMetadata = {
      cuisineType: 'Unknown',
      foodType: 'Unknown',
      mealType: 'Unknown',
      primaryProtein: 'Unknown',
      dietType: 'Unknown',
      eatingMethod: 'Unknown',
      setting: 'Unknown',
      platingStyle: 'Unknown',
      beverageType: 'Unknown',
    };
    
    return defaultMetadata;
  }
};