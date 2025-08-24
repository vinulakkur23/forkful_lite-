/**
 * Dish Rating Criteria Service
 * Handles extraction of 5 rating criteria for evaluating a good version of a dish
 * Calls backend API which uses Claude
 */

const BASE_URL = 'https://dishitout-imageinhancer.onrender.com';

export interface DishRatingCriteriaData {
  rating_criteria: string[]; // 5 specific rating criteria
  dish_name: string;
  extraction_timestamp: string;
  extraction_version: string;
  extraction_model: string;
}

export interface DishRatingCriteriaResponse {
  success: boolean;
  data: DishRatingCriteriaData;
  message: string;
  performance?: {
    total_time_seconds: number;
    api_time_seconds: number;
  };
}

/**
 * Extract 5 rating criteria for evaluating a good version of a dish
 * Only requires dish name (no image needed)
 */
export const extractDishRatingCriteria = async (
  dishName: string
): Promise<DishRatingCriteriaData | null> => {
  console.log('🚨 DishRatingCriteriaService: FUNCTION CALLED - extractDishRatingCriteria');
  console.log('🚨 DishRatingCriteriaService: Parameters received:', { dishName });
  
  try {
    console.log('🚀 DishRatingCriteriaService: Starting rating criteria extraction');
    console.log('🍽️ DishRatingCriteriaService: Dish name:', dishName);
    
    if (!dishName || dishName.trim().length === 0) {
      console.error('❌ DishRatingCriteriaService: No dish name provided');
      return null;
    }
    
    // Create FormData for text-only request
    const formData = new FormData();
    
    // Add dish name (required)
    formData.append('dish_name', dishName);
    
    console.log('🌐 DishRatingCriteriaService: Making API call to extract-dish-rating-criteria');
    console.log('🌐 DishRatingCriteriaService: URL:', `${BASE_URL}/extract-dish-rating-criteria`);
    
    const response = await fetch(`${BASE_URL}/extract-dish-rating-criteria`, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type manually - let fetch set it with proper boundary
    });
    
    console.log('📡 DishRatingCriteriaService: Response status:', response.status);
    
    if (!response.ok) {
      console.error('❌ DishRatingCriteriaService: HTTP error:', response.status, response.statusText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result: DishRatingCriteriaResponse = await response.json();
    
    // Log the raw response to debug
    console.log('🔍 DishRatingCriteriaService RAW response:', JSON.stringify(result, null, 2));
    
    if (result.success && result.data) {
      console.log('DishRatingCriteriaService: Successfully extracted rating criteria:', {
        dish: result.data.dish_name,
        criteria_count: result.data.rating_criteria?.length || 0,
        performance: result.performance,
        first_criterion: result.data.rating_criteria?.[0]
      });
      
      // Log performance metrics if available
      if (result.performance) {
        console.log(`DishRatingCriteriaService PERFORMANCE: Total: ${result.performance.total_time_seconds}s, API: ${result.performance.api_time_seconds}s`);
      }
      
      return result.data;
    } else {
      console.error('DishRatingCriteriaService: API returned success=false');
      return null;
    }
    
  } catch (error) {
    console.error('🚨 DishRatingCriteriaService: CRITICAL ERROR extracting rating criteria:', error);
    console.error('🚨 DishRatingCriteriaService: Error type:', typeof error);
    console.error('🚨 DishRatingCriteriaService: Error stringified:', JSON.stringify(error));
    console.error('🚨 DishRatingCriteriaService: Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    return null;
  }
};