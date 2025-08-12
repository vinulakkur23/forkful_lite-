/**
 * Quick Criteria Service
 * Handles fast extraction of dish criteria for immediate display
 */

const BASE_URL = 'https://dishitout-imageinhancer.onrender.com';

export interface QuickCriteriaData {
  dish_specific: string; // Now provided as placeholder by Claude
  dish_general: string; // Now provided as placeholder by Claude  
  cuisine_type: string; // Now provided as placeholder by Claude
  dish_criteria: Array<{
    name?: string; // Claude uses "name" instead of "title"
    title?: string; // Keep for backward compatibility
    what_to_look_for?: string; // Claude's detailed format
    insight?: string; // Claude's detailed format  
    test?: string; // Claude's detailed format
    description?: string; // Keep for backward compatibility
  }>;
  dish_history?: string;
  extraction_timestamp: string;
  extraction_version: string;
  dish_key: string;
  llm_provider?: string; // Added: "gemini" or "openai"
  extraction_model?: string; // Added: specific model used
}

export interface QuickCriteriaResponse {
  success: boolean;
  data: QuickCriteriaData;
  message: string;
  provider?: string; // Added: current LLM provider
  performance?: {    // Added: performance metrics
    total_time_seconds: number;
    api_time_seconds: number;
    read_time_seconds: number;
  };
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
      // Don't set Content-Type manually - let fetch set it with proper boundary
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result: QuickCriteriaResponse = await response.json();
    
    // Log the raw response to debug
    console.log('🔍 QuickCriteriaService RAW response:', JSON.stringify(result, null, 2));
    
    if (result.success && result.data) {
      console.log('QuickCriteriaService: Successfully extracted quick criteria:', {
        dish: result.data.dish_specific,
        criteria_count: result.data.dish_criteria?.length || 0,
        provider: result.provider,
        performance: result.performance,
        first_criterion: result.data.dish_criteria?.[0]?.name
      });
      
      // Log performance metrics if available
      if (result.performance) {
        console.log(`QuickCriteriaService PERFORMANCE: Total: ${result.performance.total_time_seconds}s, API: ${result.performance.api_time_seconds}s, Read: ${result.performance.read_time_seconds}s`);
      }
      
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

/**
 * Warmup the backend service to reduce cold start delays
 * Call this when the app starts or when user navigates to camera
 */
export const warmupQuickCriteriaService = async (): Promise<boolean> => {
  try {
    console.log('QuickCriteriaService: Warming up backend...');
    
    const response = await fetch(`${BASE_URL}/warmup`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.warn(`QuickCriteriaService: Warmup failed with status ${response.status}`);
      return false;
    }
    
    const result = await response.json();
    console.log('QuickCriteriaService: Backend warmed up successfully:', {
      status: result.status,
      warmup_time: result.warmup_time_seconds,
      provider: result.services?.quick_criteria?.provider
    });
    
    return result.status === 'ready';
  } catch (error) {
    console.error('QuickCriteriaService: Warmup error:', error);
    return false;
  }
};