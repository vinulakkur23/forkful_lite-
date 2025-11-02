/**
 * Rating Statements Service
 * Handles fast extraction of 6 rating statements for immediate display
 * Includes retry logic for production reliability
 */
import ImageResizer from 'react-native-image-resizer';

const BASE_URL = 'https://dishitout-imageinhancer.onrender.com';

/**
 * Retry helper with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (error.message?.includes('400') || error.message?.includes('401')) {
        throw error;
      }
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`⏱️ RatingStatements retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

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
 * @param mealName - The name of the dish
 * @param isDescriptive - Whether this is a descriptive name (low confidence) vs specific dish name
 */
export const extractRatingStatements = async (
  mealName: string,
  isDescriptive: boolean = false
): Promise<RatingStatementsData | null> => {
  console.log('🚨 RatingStatementsService: FUNCTION CALLED - extractRatingStatements (text-only)');
  console.log('🚨 RatingStatementsService: Parameters received:', { mealName, isDescriptive });

  try {
    console.log('🚀 RatingStatementsService: Starting rating statements extraction (no image)');
    console.log('🍽️ RatingStatementsService: Meal name:', mealName);
    console.log('🔍 RatingStatementsService: Is descriptive name:', isDescriptive);

    if (!mealName || mealName.trim().length === 0) {
      console.error('❌ RatingStatementsService: No meal name provided');
      return null;
    }

    // No image compression needed - text-only request
    // Create FormData for text-only request
    const formData = new FormData();

    // Add meal name (required for text-only mode)
    formData.append('meal_name', mealName);

    // Add descriptive flag to help backend adjust prompt
    formData.append('is_descriptive', isDescriptive ? 'true' : 'false');
    
    console.log('🌐 RatingStatementsService: Making API call to extract-rating-statements');
    console.log('🌐 RatingStatementsService: URL:', `${BASE_URL}/extract-rating-statements`);

    // CRITICAL: Add timeout to prevent indefinite hangs from backend cold starts
    // 90 seconds to allow for Render free tier cold starts (can take 60+ seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error('⏱️ RatingStatementsService: Request timed out after 90 seconds');
      controller.abort();
    }, 90000); // 90 second timeout

    let response;
    try {
      response = await fetch(`${BASE_URL}/extract-rating-statements`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        // Don't set Content-Type manually - let fetch set it with proper boundary
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('Rating statements extraction timed out after 90 seconds');
      }
      throw fetchError;
    }

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