/**
 * Rating Statements Service
 * Handles fast extraction of 6 rating statements for immediate display
 */
import ImageResizer from 'react-native-image-resizer';

const BASE_URL = 'https://dishitout-imageinhancer.onrender.com';

export interface RatingStatementsData {
  rating_statements: string[]; // 6 specific rating statements
  extraction_timestamp: string;
  extraction_version: string;
  extraction_model: string;
  dish_name: string;
}

export interface RatingStatementsResponse {
  success: boolean;
  data: RatingStatementsData;
  message: string;
  performance?: {
    total_time_seconds: number;
    api_time_seconds: number;
    read_time_seconds: number;
  };
}

/**
 * Extract 6 rating statements for immediate display in ResultScreen
 * OPTIMIZED: Works with dish name only, no image processing needed
 */
export const extractRatingStatements = async (
  mealName: string
): Promise<RatingStatementsData | null> => {
  console.log('🚨 RatingStatementsService: FUNCTION CALLED - extractRatingStatements (text-only)');
  console.log('🚨 RatingStatementsService: Parameters received:', { mealName });
  
  try {
    console.log('🚀 RatingStatementsService: Starting rating statements extraction (no image)');
    console.log('🍽️ RatingStatementsService: Meal name:', mealName);
    
    if (!mealName || mealName.trim().length === 0) {
      console.error('❌ RatingStatementsService: No meal name provided');
      return null;
    }
    
    // No image compression needed - text-only request
    // Create FormData for text-only request
    const formData = new FormData();
    
    // Add meal name (required for text-only mode)
    formData.append('meal_name', mealName);
    
    console.log('🌐 RatingStatementsService: Making API call to extract-rating-statements');
    console.log('🌐 RatingStatementsService: URL:', `${BASE_URL}/extract-rating-statements`);
    
    const response = await fetch(`${BASE_URL}/extract-rating-statements`, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type manually - let fetch set it with proper boundary
    });
    
    console.log('📡 RatingStatementsService: Response status:', response.status);
    
    if (!response.ok) {
      console.error('❌ RatingStatementsService: HTTP error:', response.status, response.statusText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result: RatingStatementsResponse = await response.json();
    
    // Log the raw response to debug
    console.log('🔍 RatingStatementsService RAW response:', JSON.stringify(result, null, 2));
    
    if (result.success && result.data) {
      console.log('RatingStatementsService: Successfully extracted rating statements:', {
        dish: result.data.dish_name,
        statements_count: result.data.rating_statements?.length || 0,
        performance: result.performance,
        first_statement: result.data.rating_statements?.[0]
      });
      
      // Log performance metrics if available
      if (result.performance) {
        console.log(`RatingStatementsService PERFORMANCE: Total: ${result.performance.total_time_seconds}s, API: ${result.performance.api_time_seconds}s, Read: ${result.performance.read_time_seconds}s`);
      }
      
      return result.data;
    } else {
      console.error('RatingStatementsService: API returned success=false');
      return null;
    }
    
  } catch (error) {
    console.error('🚨 RatingStatementsService: CRITICAL ERROR extracting rating statements:', error);
    console.error('🚨 RatingStatementsService: Error type:', typeof error);
    console.error('🚨 RatingStatementsService: Error stringified:', JSON.stringify(error));
    console.error('🚨 RatingStatementsService: Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    return null;
  }
};