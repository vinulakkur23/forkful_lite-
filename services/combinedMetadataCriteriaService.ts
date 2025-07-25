// combinedMetadataCriteriaService.ts - Service for combined metadata and criteria extraction
import { API_CONFIG } from '../config/api';
import { Platform } from 'react-native';
import RNFetchBlob from 'rn-fetch-blob';
import { EnhancedMetadata } from './enhancedMetadataService';
import { DishCriteria } from './dishCriteriaService';

/**
 * Interface for combined response from the new endpoint
 */
export interface CombinedResponse {
  metadata: EnhancedMetadata;
  dish_criteria: DishCriteria;
}

/**
 * Extract both enhanced metadata and dish criteria from a single API call
 * 
 * @param photoUri The URI of the photo to process
 * @param mealName Optional name of the meal provided by user
 * @param restaurantName Optional restaurant name
 * @param cuisineContext Optional cuisine type hint
 * @returns Combined metadata and criteria response
 */
export const extractCombinedMetadataAndCriteria = async (
  photoUri: string,
  mealName?: string,
  restaurantName?: string,
  cuisineContext?: string
): Promise<CombinedResponse | null> => {
  try {
    console.log('Extracting combined metadata and criteria for photo:', photoUri);
    
    // Download the image to a temp file
    const tempFilePath = `${RNFetchBlob.fs.dirs.CacheDir}/temp_combined_${Date.now()}.jpg`;
    
    // Handle file:// prefix properly
    let sourceUri = photoUri;
    if (Platform.OS === 'ios' && !photoUri.startsWith('file://')) {
      sourceUri = `file://${photoUri}`;
    }
    
    // Download using RNFetchBlob
    await RNFetchBlob.config({
      fileCache: true,
      path: tempFilePath
    }).fetch('GET', sourceUri);
    
    console.log(`Image downloaded for combined extraction: ${tempFilePath}`);
    
    // Prepare form data
    const formData = new FormData();
    
    // Add the image file
    const fileUri = Platform.OS === 'ios' 
      ? tempFilePath.replace('file://', '') 
      : tempFilePath;
      
    formData.append('image', {
      uri: fileUri,
      type: 'image/jpeg',
      name: 'meal_photo.jpg',
    } as any);
    
    // Add optional context
    if (mealName) {
      formData.append('meal_name', mealName);
    }
    if (restaurantName) {
      formData.append('restaurant_name', restaurantName);
    }
    if (cuisineContext) {
      formData.append('cuisine_context', cuisineContext);
    }
    
    console.log('Sending request to combined metadata and criteria endpoint...');
    
    // Make the API request to the new combined endpoint
    const response = await fetch(`${API_CONFIG.getBaseUrl()}/extract-combined-metadata-criteria`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
      },
      body: formData,
    });
    
    // Clean up temp file
    await RNFetchBlob.fs.unlink(tempFilePath);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Combined API error (${response.status}):`, errorText);
      throw new Error(`API Error: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('Combined metadata and criteria response:', result);
    
    if (result.success && result.metadata && result.dish_criteria) {
      return {
        metadata: result.metadata,
        dish_criteria: result.dish_criteria
      };
    }
    
    throw new Error('Invalid response format');
    
  } catch (error) {
    console.error('Error extracting combined metadata and criteria:', error);
    return null;
  }
};

/**
 * Test function to compare the new combined approach with separate calls
 * This is for development/testing purposes only
 */
export const testCombinedVsSeparate = async (
  photoUri: string,
  mealName?: string,
  restaurantName?: string,
  cuisineContext?: string
) => {
  console.log('🧪 Testing Combined vs Separate Approaches');
  
  const startTime = Date.now();
  
  try {
    // Test the combined approach
    console.log('📱 Testing Combined Approach...');
    const combinedStart = Date.now();
    const combinedResult = await extractCombinedMetadataAndCriteria(
      photoUri, 
      mealName, 
      restaurantName, 
      cuisineContext
    );
    const combinedTime = Date.now() - combinedStart;
    
    console.log(`✅ Combined approach completed in ${combinedTime}ms`);
    console.log('Combined result:', combinedResult);
    
    return {
      combined: {
        result: combinedResult,
        timeMs: combinedTime,
        success: !!combinedResult
      },
      totalTime: Date.now() - startTime
    };
    
  } catch (error) {
    console.error('❌ Error in combined vs separate test:', error);
    return null;
  }
};