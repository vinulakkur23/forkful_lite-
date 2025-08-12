// enhancedMetadataService.ts - Enhanced metadata extraction with two-tier structure
import { API_CONFIG } from '../config/api';
import { Platform } from 'react-native';
import RNFetchBlob from 'rn-fetch-blob';

/**
 * Enhanced metadata types from simple enhanced metadata service
 */
export interface EnhancedMetadata {
  // Dish identification
  dish_specific: string;  // e.g., "Pad Thai with Shrimp"
  dish_general: string;   // e.g., "Noodles"
  cuisine_type: string;   // e.g., "Thai"
  
  // Core metadata
  key_ingredients: string[];
  interesting_ingredient: string; // Most unique ingredient that defines this dish
  cooking_method: string;
  flavor_profile: string[];
  dietary_info: string[];
  confidence_score: number;
  
  // Metadata about extraction
  extraction_timestamp: string;
  extraction_version: string;
  extraction_method?: string;
  extraction_error?: boolean;
}

/**
 * Extract enhanced metadata from a meal photo
 * 
 * @param photoUri The URI of the photo to process
 * @param mealName Optional name of the meal provided by user
 * @param restaurantName Optional restaurant name
 * @param cuisineContext Optional cuisine type hint
 * @returns Enhanced metadata with two-tier categorization
 */
export const extractEnhancedMetadata = async (
  photoUri: string,
  mealName?: string,
  restaurantName?: string,
  cuisineContext?: string
): Promise<EnhancedMetadata | null> => {
  try {
    console.log('Extracting enhanced metadata for photo:', photoUri);
    
    // Use the image file directly (no extra download needed)
    console.log(`Using image directly for enhanced metadata: ${photoUri}`);
    
    // Prepare form data
    const formData = new FormData();
    
    // Add the image file directly
    const fileUri = Platform.OS === 'ios' 
      ? photoUri.replace('file://', '') 
      : photoUri;
      
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
    
    console.log('Sending request to enhanced metadata endpoint...');
    
    // Make the API request
    const response = await fetch(API_CONFIG.getUrl(API_CONFIG.ENDPOINTS.EXTRACT_ENHANCED_METADATA), {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
      },
      body: formData,
    });
    
    // No temp file to clean up
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Enhanced metadata API error (${response.status}):`, errorText);
      throw new Error(`API Error: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('Enhanced metadata response:', result);
    
    if (result.success && result.metadata) {
      return result.metadata as EnhancedMetadata;
    }
    
    throw new Error('Invalid response format');
    
  } catch (error) {
    console.error('Error extracting enhanced metadata:', error);
    return null;
  }
};

/**
 * Extract enhanced metadata from a Firebase Storage URL
 * This is a fallback method if direct file upload fails
 */
export const extractEnhancedMetadataFromUrl = async (
  photoUrl: string,
  mealName?: string,
  restaurantName?: string,
  cuisineContext?: string
): Promise<EnhancedMetadata | null> => {
  try {
    console.log('Extracting enhanced metadata from URL:', photoUrl);
    
    // For URL-based extraction, we might need to implement a different endpoint
    // For now, download the image and use the regular method
    return extractEnhancedMetadata(photoUrl, mealName, restaurantName, cuisineContext);
    
  } catch (error) {
    console.error('Error extracting enhanced metadata from URL:', error);
    return null;
  }
};