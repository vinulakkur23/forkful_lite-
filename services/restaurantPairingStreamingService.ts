/**
 * Restaurant Pairing Streaming Service
 * Handles streaming drink pairing recommendations for faster perceived performance
 */
import ImageResizer from 'react-native-image-resizer';

const BASE_URL = 'https://dishitout-imageinhancer.onrender.com';

// Same interfaces as regular service
export interface DrinkPairing {
  style: string;
  pairing_reason: string;
}

export interface DrinkPairingData {
  beer_pairing: DrinkPairing;
  wine_pairing: DrinkPairing;
  generation_timestamp: string;
  service_version: string;
  model: string;
  processing_time_seconds?: number;
}

export interface StreamingUpdate {
  type: 'beer_style' | 'beer_reason' | 'wine_style' | 'wine_reason' | 'complete' | 'error';
  content?: string;
  data?: DrinkPairingData;
}

/**
 * Stream drink pairing recommendations with progressive updates
 */
export const streamDrinkPairings = async (
  imageUri: string,
  dishName: string,
  restaurantName: string,
  restaurantLocation: string | undefined,
  onUpdate: (update: StreamingUpdate) => void
): Promise<DrinkPairingData | null> => {
  console.log('🚨 StreamingService: Starting streaming drink pairings');
  
  try {
    // Compress image for faster upload
    const compressedImage = await ImageResizer.createResizedImage(
      imageUri,
      512,
      512,
      'JPEG',
      70,
      0,
      undefined,
      false,
      {
        mode: 'contain',
        onlyScaleDown: true
      }
    );
    
    // Create FormData
    const formData = new FormData();
    formData.append('image', {
      uri: compressedImage.uri,
      type: 'image/jpeg',
      name: 'dish.jpg',
    } as any);
    formData.append('dish_name', dishName);
    formData.append('restaurant_name', restaurantName);
    if (restaurantLocation) {
      formData.append('restaurant_location', restaurantLocation);
    }
    
    console.log('🌐 StreamingService: Starting SSE connection');
    
    // Make the streaming request
    const response = await fetch(`${BASE_URL}/get-restaurant-pairings-stream`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    if (!reader) {
      throw new Error('No response body reader available');
    }
    
    let finalData: DrinkPairingData | null = null;
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete SSE messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6); // Remove 'data: ' prefix
          
          if (data === '[DONE]') {
            console.log('🚨 StreamingService: Stream complete');
            return finalData;
          }
          
          try {
            const parsed = JSON.parse(data);
            console.log('🚨 StreamingService: Received update:', parsed.type);
            
            // Call the update callback
            onUpdate(parsed);
            
            // Store final data if complete
            if (parsed.type === 'complete' && parsed.data) {
              finalData = parsed.data;
            }
          } catch (e) {
            console.error('🚨 StreamingService: Error parsing SSE data:', e);
          }
        }
      }
    }
    
    return finalData;
    
  } catch (error) {
    console.error('🚨 StreamingService: Error streaming drink pairings:', error);
    return null;
  }
};