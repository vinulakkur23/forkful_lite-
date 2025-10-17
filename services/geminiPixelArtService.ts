/**
 * Pixel Art Service
 * Handles generation of pixel-art icons from dish names using GPT-Image-1
 */

const BASE_URL = 'https://dishitout-imageinhancer.onrender.com';

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
  try {
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
    
    const response = await fetch(`${BASE_URL}/generate-pixel-art-icon`, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type manually - let fetch set it with proper boundary
    });
    
    console.log('🚨 PixelArtService: Response status:', response.status);
    
    if (!response.ok) {
      console.error('❌ PixelArtService: HTTP error:', response.status, response.statusText);
      throw new Error(`HTTP error! status: ${response.status}`);
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
      return null;
    }
    
  } catch (error) {
    console.error('🚨 PixelArtService: Error generating pixel art:', error);
    return null;
  }
};

/**
 * Convert base64 image data to a data URI that can be used in Image components
 */
export const createImageDataUri = (imageData: string, mimeType: string = 'image/png'): string => {
  return `data:${mimeType};base64,${imageData}`;
};