/**
 * Dish Identification Service
 * Handles identification of dish names from photos using backend AI
 */

import { withRetry } from './apiRetryUtil';

const BASE_URL = 'https://dishitout-imageinhancer.onrender.com';

export interface DishIdentificationData {
  dish_name: string;                 // Specific or descriptive dish name
  description: string;                // Brief description of main ingredients
  confidence_level: number;           // 0.0-1.0
  is_descriptive: boolean;            // True if descriptive name vs specific dish
  identification_timestamp: string;
  identification_version: string;
  identification_model: string;
  error?: string;                     // Present if identification failed
}

export interface DishIdentificationResponse {
  success: boolean;
  data: DishIdentificationData;
  message: string;
  performance?: {
    total_time_seconds: number;
    api_time_seconds: number;
  };
}

/**
 * Identify the dish name and ingredients from a food photo
 *
 * This is optimized for fast identification when users take photos at restaurants.
 * If the dish cannot be specifically identified, returns a descriptive name instead.
 *
 * @param imageUri - URI to the image file
 * @returns Dish identification data or null if failed
 */
export const identifyDishFromPhoto = async (
  imageUri: string
): Promise<DishIdentificationData | null> => {
  console.log('🚨 DishIdentificationService: FUNCTION CALLED - identifyDishFromPhoto');
  console.log('🚨 DishIdentificationService: Image URI:', imageUri);

  try {
    console.log('🚀 DishIdentificationService: Starting dish identification');

    if (!imageUri || imageUri.trim().length === 0) {
      console.error('❌ DishIdentificationService: No image URI provided');
      return null;
    }

    // Wrap the API call with retry logic
    return await withRetry(
      async () => {
        // Create FormData with image
        const formData = new FormData();

        formData.append('image', {
          uri: imageUri,
          type: 'image/jpeg',
          name: 'food_photo.jpg',
        } as any);

        console.log('🌐 DishIdentificationService: Making API call to identify-dish-from-photo');
        console.log('🌐 DishIdentificationService: URL:', `${BASE_URL}/identify-dish-from-photo`);

        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout

        try {
          const response = await fetch(`${BASE_URL}/identify-dish-from-photo`, {
            method: 'POST',
            body: formData,
            signal: controller.signal,
            // Don't set Content-Type manually - let fetch set it with proper boundary
          });

          clearTimeout(timeoutId);

          console.log('📡 DishIdentificationService: Response status:', response.status);

          if (!response.ok) {
            console.error('❌ DishIdentificationService: HTTP error:', response.status, response.statusText);
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result: DishIdentificationResponse = await response.json();

          // Log the raw response to debug
          console.log('🔍 DishIdentificationService RAW response:', JSON.stringify(result, null, 2));

          if (result.success && result.data) {
            console.log('DishIdentificationService: Successfully identified dish:', {
              dish_name: result.data.dish_name,
              confidence: result.data.confidence_level,
              is_descriptive: result.data.is_descriptive,
              description: result.data.description,
              performance: result.performance
            });

            // Log performance metrics if available
            if (result.performance) {
              console.log(`DishIdentificationService PERFORMANCE: Total: ${result.performance.total_time_seconds}s, API: ${result.performance.api_time_seconds}s`);
            }

            return result.data;
          } else {
            console.error('DishIdentificationService: API returned success=false');
            throw new Error('API returned success=false');
          }
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            throw new Error('Dish identification request timed out after 90 seconds');
          }
          throw fetchError;
        }
      },
      {
        maxRetries: 2, // Try 3 times total
        initialDelayMs: 2000, // 2 second initial delay
        maxDelayMs: 8000, // Max 8 second delay
      },
      'DishIdentification'
    );

  } catch (error) {
    console.error('🚨 DishIdentificationService: CRITICAL ERROR identifying dish:', error);
    console.error('🚨 DishIdentificationService: Error type:', typeof error);
    console.error('🚨 DishIdentificationService: Error stringified:', JSON.stringify(error));
    console.error('🚨 DishIdentificationService: Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    return null;
  }
};

/**
 * Helper function to get a user-friendly dish name
 * Returns the dish name or "your dish" if identification failed
 */
export const getFriendlyDishName = (identificationData: DishIdentificationData | null): string => {
  if (!identificationData || !identificationData.dish_name) {
    return 'your dish';
  }
  return identificationData.dish_name;
};

/**
 * Helper function to check if identification has high confidence
 */
export const hasHighConfidence = (identificationData: DishIdentificationData | null): boolean => {
  if (!identificationData) return false;
  return identificationData.confidence_level >= 0.7;
};
