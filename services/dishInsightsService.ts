/**
 * Dish Insights Service
 * Handles extraction of historical and cultural insights about a dish and restaurant
 * Calls backend API which uses Claude
 */

const BASE_URL = 'https://dishitout-imageinhancer.onrender.com';

export interface DishInsightsData {
  dish_history: string;         // Short history of the dish (< 35 words)
  restaurant_fact: string;       // Cool fact about the restaurant (< 35 words)
  cultural_insight: string;      // Random interesting cultural/culinary/historical fact (< 35 words)
  dish_name: string;
  restaurant_name?: string;
  extraction_timestamp: string;
  extraction_version: string;
  extraction_model: string;
}

export interface DishInsightsResponse {
  success: boolean;
  data: DishInsightsData;
  message: string;
  performance?: {
    total_time_seconds: number;
    api_time_seconds: number;
  };
}

/**
 * Extract 3 insights about a dish and restaurant:
 * 1. Short history of the dish
 * 2. Cool fact about the restaurant
 * 3. Random interesting cultural/culinary/historical fact
 * Each insight is less than 35 words
 */
export const extractDishInsights = async (
  dishName: string,
  restaurantName?: string,
  city?: string
): Promise<DishInsightsData | null> => {
  console.log('🚨 DishInsightsService: FUNCTION CALLED - extractDishInsights');
  console.log('🚨 DishInsightsService: Parameters received:', { dishName, restaurantName, city });
  
  try {
    console.log('🚀 DishInsightsService: Starting insights extraction');
    console.log('🍽️ DishInsightsService: Dish name:', dishName);
    
    if (!dishName || dishName.trim().length === 0) {
      console.error('❌ DishInsightsService: No dish name provided');
      return null;
    }
    
    // Create FormData for request
    const formData = new FormData();
    
    // Add dish name (required)
    formData.append('dish_name', dishName);
    
    // Add optional restaurant name
    if (restaurantName) {
      formData.append('restaurant_name', restaurantName);
    }
    
    // Add optional city for more localized insights
    if (city) {
      formData.append('city', city);
    }
    
    console.log('🌐 DishInsightsService: Making API call to extract-dish-insights');
    console.log('🌐 DishInsightsService: URL:', `${BASE_URL}/extract-dish-insights`);
    
    const response = await fetch(`${BASE_URL}/extract-dish-insights`, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type manually - let fetch set it with proper boundary
    });
    
    console.log('📡 DishInsightsService: Response status:', response.status);
    
    if (!response.ok) {
      console.error('❌ DishInsightsService: HTTP error:', response.status, response.statusText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result: DishInsightsResponse = await response.json();
    
    // Log the raw response to debug
    console.log('🔍 DishInsightsService RAW response:', JSON.stringify(result, null, 2));
    
    if (result.success && result.data) {
      console.log('DishInsightsService: Successfully extracted insights:', {
        dish: result.data.dish_name,
        restaurant: result.data.restaurant_name,
        has_history: !!result.data.dish_history,
        has_restaurant_fact: !!result.data.restaurant_fact,
        has_cultural_insight: !!result.data.cultural_insight,
        performance: result.performance
      });
      
      // Log performance metrics if available
      if (result.performance) {
        console.log(`DishInsightsService PERFORMANCE: Total: ${result.performance.total_time_seconds}s, API: ${result.performance.api_time_seconds}s`);
      }
      
      // Log word counts to ensure they're under 35 words
      console.log('DishInsightsService: Word counts:', {
        dish_history: result.data.dish_history?.split(' ').length || 0,
        restaurant_fact: result.data.restaurant_fact?.split(' ').length || 0,
        cultural_insight: result.data.cultural_insight?.split(' ').length || 0
      });
      
      return result.data;
    } else {
      console.error('DishInsightsService: API returned success=false');
      return null;
    }
    
  } catch (error) {
    console.error('🚨 DishInsightsService: CRITICAL ERROR extracting insights:', error);
    console.error('🚨 DishInsightsService: Error type:', typeof error);
    console.error('🚨 DishInsightsService: Error stringified:', JSON.stringify(error));
    console.error('🚨 DishInsightsService: Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    return null;
  }
};

/**
 * Helper function to get just the dish history
 */
export const getDishHistory = async (dishName: string): Promise<string | null> => {
  const insights = await extractDishInsights(dishName);
  return insights?.dish_history || null;
};

/**
 * Helper function to get just the restaurant fact
 */
export const getRestaurantFact = async (
  dishName: string, 
  restaurantName: string
): Promise<string | null> => {
  const insights = await extractDishInsights(dishName, restaurantName);
  return insights?.restaurant_fact || null;
};

/**
 * Helper function to get just the cultural insight
 */
export const getCulturalInsight = async (dishName: string): Promise<string | null> => {
  const insights = await extractDishInsights(dishName);
  return insights?.cultural_insight || null;
};