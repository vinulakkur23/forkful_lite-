/**
 * Quick Criteria Service
 * Handles fast extraction of dish criteria for immediate display
 */

const BASE_URL = 'https://dishitout-imageinhancer.onrender.com';

export interface QuickCriteriaData {
  dish_specific: string;
  dish_general: string;
  cuisine_type: string;
  dish_criteria: Array<{
    title: string;
    description: string;
  }>;
  dish_history: string;
  extraction_timestamp: string;
  extraction_version: string;
  dish_key: string;
}

export interface QuickCriteriaResponse {
  success: boolean;
  data: QuickCriteriaData;
  message: string;
}

/**
 * Extract quick dish criteria for immediate display in RatingScreen2
 */
export const extractQuickCriteria = async (
  imageUri: string,
  mealName?: string,
  restaurant?: string
): Promise<QuickCriteriaData | null> => {
  try {
    console.log('QuickCriteriaService: Starting quick criteria extraction');
    
    // Create FormData
    const formData = new FormData();
    
    // Add the image
    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'meal.jpg',
    } as any);
    
    // Add optional context
    if (mealName) {
      formData.append('meal_name', mealName);
    }
    if (restaurant) {
      formData.append('restaurant_name', restaurant);
    }
    
    console.log('QuickCriteriaService: Making API call to extract-quick-criteria');
    
    const response = await fetch(`${BASE_URL}/extract-quick-criteria`, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result: QuickCriteriaResponse = await response.json();
    
    if (result.success && result.data) {
      console.log('QuickCriteriaService: Successfully extracted quick criteria:', {
        dish: result.data.dish_specific,
        criteria_count: result.data.dish_criteria?.length || 0
      });
      return result.data;
    } else {
      console.error('QuickCriteriaService: API returned success=false');
      return null;
    }
    
  } catch (error) {
    console.error('QuickCriteriaService: Error extracting quick criteria:', error);
    return null;
  }
};