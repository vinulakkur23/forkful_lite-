/**
 * Emoji Service
 * Handles generation of custom food emojis using Recraft API
 */

const BASE_URL = 'https://dishitout-imageinhancer.onrender.com';

export interface EmojiGenerationData {
  emoji_url: string;
  dish_name: string;
  prompt_used?: string;
  style_config?: any;
  generation_timestamp: string;
  service: string;
}

export interface EmojiGenerationResponse {
  success: boolean;
  emoji_url?: string;
  dish_name: string;
  error?: string;
  fallback_emoji?: string;
  performance?: {
    total_time_seconds: number;
    api_time_seconds: number;
  };
}

/**
 * Generate a custom emoji for a food dish
 */
export const generateDishEmoji = async (
  dishName: string,
  customColors?: Array<{rgb: [number, number, number]}>
): Promise<EmojiGenerationData | null> => {
  try {
    console.log('🚨 EmojiService: Generating emoji for dish:', dishName);
    
    // Create FormData
    const formData = new FormData();
    formData.append('dish_name', dishName);
    
    // Add custom colors if provided
    if (customColors) {
      formData.append('custom_colors', JSON.stringify(customColors));
      console.log('🚨 EmojiService: Using custom colors:', customColors);
    }
    
    console.log('🚨 EmojiService: Making API call to generate-dish-emoji');
    
    const response = await fetch(`${BASE_URL}/generate-dish-emoji`, {
      method: 'POST',
      body: formData,
    });
    
    console.log('🚨 EmojiService: Response status:', response.status);
    
    if (!response.ok) {
      console.error('❌ EmojiService: HTTP error:', response.status, response.statusText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result: EmojiGenerationResponse = await response.json();
    
    console.log('🔍 EmojiService RAW response:', JSON.stringify(result, null, 2));
    
    if (result.success && result.emoji_url) {
      console.log('✅ EmojiService: Successfully generated emoji:', {
        dish: result.dish_name,
        emoji_url: result.emoji_url,
        performance: result.performance
      });
      
      return {
        emoji_url: result.emoji_url,
        dish_name: result.dish_name,
        prompt_used: result.prompt_used,
        style_config: result.style_config,
        generation_timestamp: result.generation_timestamp || new Date().toISOString(),
        service: result.service || 'recraft_v3'
      };
    } else {
      console.error('❌ EmojiService: API returned success=false or no emoji_url');
      console.error('❌ EmojiService: Error:', result.error);
      console.error('❌ EmojiService: Fallback emoji:', result.fallback_emoji);
      return null;
    }
    
  } catch (error) {
    console.error('🚨 EmojiService: Error generating emoji:', error);
    return null;
  }
};

/**
 * Test function to generate a Rigatoni Bolognese emoji
 */
export const testRigatoniBologneseEmoji = async (): Promise<EmojiGenerationData | null> => {
  console.log('🚨 EmojiService: Testing Rigatoni Bolognese emoji generation...');
  
  // Custom Italian colors (red, white, green)
  const italianColors = [
    { rgb: [220, 20, 60] as [number, number, number] },   // Crimson red
    { rgb: [255, 255, 255] as [number, number, number] }, // White
    { rgb: [34, 139, 34] as [number, number, number] },   // Forest green
    { rgb: [255, 215, 0] as [number, number, number] },   // Gold for pasta
    { rgb: [139, 69, 19] as [number, number, number] }    // Brown for meat
  ];
  
  return await generateDishEmoji('rigatoni bolognese', italianColors);
};

/**
 * Generate emoji with food-appropriate colors
 */
export const generateDishEmojiWithFoodColors = async (dishName: string): Promise<EmojiGenerationData | null> => {
  // Default appetizing food colors
  const foodColors = [
    { rgb: [255, 165, 0] as [number, number, number] },   // Orange (appetizing)
    { rgb: [255, 69, 0] as [number, number, number] },    // Red-orange (vibrant)
    { rgb: [255, 215, 0] as [number, number, number] },   // Gold (rich)
    { rgb: [139, 69, 19] as [number, number, number] },   // Brown (earthy)
    { rgb: [34, 139, 34] as [number, number, number] },   // Green (fresh)
    { rgb: [255, 255, 255] as [number, number, number] }  // White (clean)
  ];
  
  return await generateDishEmoji(dishName, foodColors);
};