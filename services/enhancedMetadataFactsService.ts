/**
 * Enhanced Metadata Facts Service
 * Handles detailed metadata extraction and food facts generation
 */

const BASE_URL = 'https://dishitout-imageinhancer.onrender.com';

export interface EnhancedMetadata {
  meal_type: string;
  cooking_method: string;
  presentation_style: string;
  confidence_score: number;
  key_ingredients: string[];
  interesting_ingredient: string;
  flavor_profile: string[];
  dietary_info: string[];
}

export interface FoodFacts {
  ingredient_history: string;
  dish_city_history: string;
  restaurant_history: string;
}

export interface EnhancedFactsData {
  metadata: EnhancedMetadata;
  food_facts: FoodFacts;
  extraction_info: {
    timestamp: string;
    version: string;
    dish_context: {
      dish_specific: string;
      dish_general: string;
      cuisine_type: string;
    };
  };
}

export interface EnhancedFactsResponse {
  success: boolean;
  metadata: EnhancedMetadata;
  food_facts: FoodFacts;
  extraction_info: any;
  message: string;
}

/**
 * Extract enhanced metadata and food facts for detailed display in ResultScreen
 */
export const extractEnhancedMetadataFacts = async (
  imageUri: string,
  dishSpecific: string,
  dishGeneral: string,
  cuisineType: string,
  mealName?: string,
  restaurant?: string,
  city?: string
): Promise<EnhancedFactsData | null> => {
  try {
    console.log('EnhancedMetadataFactsService: Starting enhanced metadata and facts extraction');
    
    // Create FormData
    const formData = new FormData();
    
    // Add the image
    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'meal.jpg',
    } as any);
    
    // Add required dish context from quick criteria
    formData.append('dish_specific', dishSpecific);
    formData.append('dish_general', dishGeneral);
    formData.append('cuisine_type', cuisineType);
    
    // Add optional context
    if (mealName) {
      formData.append('meal_name', mealName);
    }
    if (restaurant) {
      formData.append('restaurant_name', restaurant);
    }
    if (city) {
      formData.append('city', city);
    }
    
    console.log('EnhancedMetadataFactsService: Making API call to extract-enhanced-metadata-facts');
    
    const response = await fetch(`${BASE_URL}/extract-enhanced-metadata-facts`, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result: EnhancedFactsResponse = await response.json();
    
    if (result.success && result.metadata && result.food_facts) {
      console.log('EnhancedMetadataFactsService: Successfully extracted enhanced metadata and facts');
      return {
        metadata: result.metadata,
        food_facts: result.food_facts,
        extraction_info: result.extraction_info
      };
    } else {
      console.error('EnhancedMetadataFactsService: API returned success=false');
      return null;
    }
    
  } catch (error) {
    console.error('EnhancedMetadataFactsService: Error extracting enhanced metadata and facts:', error);
    return null;
  }
};