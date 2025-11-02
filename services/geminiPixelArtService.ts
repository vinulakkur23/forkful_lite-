/**
 * Pixel Art Service
 * Handles generation of pixel-art icons from dish names using GPT-Image-1
 * Includes retry logic for production reliability
 */

const BASE_URL = 'https://dishitout-imageinhancer.onrender.com';

/**
 * Retry a function with exponential backoff
 * Commercial apps use this pattern for network reliability
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry on certain errors
      if (error.message?.includes('400') || error.message?.includes('401')) {
        throw error; // Bad request or auth error - don't retry
      }

      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
        console.log(`⏱️ Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

export interface PixelArtData {
  image_data: string; // Base64 encoded pixel art image
  mime_type: string;
  dish_name: string;
  prompt_used?: string;
  generation_timestamp: string;
  service: string;
  model?: string;
}

export interface PixelArtResponse {
  success: boolean;
  image_data?: string;
  mime_type?: string;
  dish_name?: string;
  error?: string;
  performance?: {
    total_time_seconds: number;
    api_time_seconds: number;
    read_time_seconds: number;
  };
}

/**
 * Generate a pixel-art icon from a dish name with optional meal image
 *
 * @param dishName - Name of the dish for context
 * @param imageUri - Optional URI to the meal photo (for image-based pixel art)
 */
export const generatePixelArtIcon = async (
  dishName: string,
  imageUri?: string
): Promise<PixelArtData | null> => {
  // Wrap in retry logic for production reliability
  return retryWithBackoff(async () => {
    console.log('🚨 PixelArtService: Generating pixel art for dish:', dishName);
    console.log('🚨 PixelArtService: Image provided:', !!imageUri);

    // Create FormData with dish name and optional image
    const formData = new FormData();
    formData.append('dish_name', dishName);

    // Add image if provided (for Nano Banana multimodal generation)
    if (imageUri) {
      console.log('🚨 PixelArtService: Adding meal photo to request');
      formData.append('image', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'meal_photo.jpg',
      } as any);
    }
    
    console.log('🚨 PixelArtService: Making API call to generate-pixel-art-icon');

    // Add timeout for production reliability (60 seconds - pixel art can take time)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error('⏱️ PixelArtService: Request timed out after 60 seconds');
      controller.abort();
    }, 60000);

    let response;
    try {
      response = await fetch(`${BASE_URL}/generate-pixel-art-icon`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        // Don't set Content-Type manually - let fetch set it with proper boundary
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('Pixel art generation timed out after 60 seconds');
      }
      throw fetchError;
    }

    console.log('🚨 PixelArtService: Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ PixelArtService: HTTP error:', response.status, response.statusText);
      console.error('❌ PixelArtService: Error body:', errorText);
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }
    
    const result: PixelArtResponse = await response.json();
    
    console.log('🔍 PixelArtService RAW response:', JSON.stringify(result, null, 2));
    
    // Debug the specific fields
    console.log('🔍 PixelArtService DEBUG - success:', result.success);
    console.log('🔍 PixelArtService DEBUG - has image_data:', !!result.image_data);
    console.log('🔍 PixelArtService DEBUG - image_data length:', result.image_data?.length || 0);
    console.log('🔍 PixelArtService DEBUG - error field:', result.error);
    
    if (result.success && result.image_data) {
      console.log('✅ PixelArtService: Successfully generated pixel art:', {
        dish: result.dish_name,
        mime_type: result.mime_type,
        image_size: result.image_data?.length || 0,
        performance: result.performance
      });
      
      return {
        image_data: result.image_data,
        mime_type: result.mime_type || 'image/png',
        dish_name: result.dish_name || dishName || 'Unknown dish',
        prompt_used: result.prompt_used,
        generation_timestamp: result.generation_timestamp || new Date().toISOString(),
        service: 'gemini_pixel_art',
        model: result.model
      };
    } else {
      console.error('❌ PixelArtService: API returned success=false or no image data');
      console.error('❌ PixelArtService: Error field:', result.error || 'No error message provided');
      console.error('❌ PixelArtService: Full response:', JSON.stringify(result, null, 2));
      throw new Error(`Pixel art API returned success=false: ${result.error || 'Unknown error'}`);
    }
  }, 3, 2000) // 3 retries, starting with 2 second delay
  .catch(error => {
    console.error('🚨 PixelArtService: Error generating pixel art after retries:', error);
    return null;
  });
};

/**
 * Convert base64 image data to a data URI that can be used in Image components
 */
export const createImageDataUri = (imageData: string, mimeType: string = 'image/png'): string => {
  return `data:${mimeType};base64,${imageData}`;
};