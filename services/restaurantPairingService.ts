/**
 * Restaurant Pairing Service
 * Handles getting dessert and drink pairing recommendations for dishes at specific restaurants
 */
import ImageResizer from 'react-native-image-resizer';

const BASE_URL = 'https://dishitout-imageinhancer.onrender.com';

// Dessert interfaces
export interface DessertRecommendation {
  name: string;
  why_recommended: string;
  source?: string;
}

export interface DessertData {
  dessert: DessertRecommendation;
  generation_timestamp: string;
  service_version: string;
  model: string;
  search_enabled?: boolean;
  processing_time_seconds?: number;
}

export interface DessertResponse {
  success: boolean;
  data: DessertData;
  processing_time_seconds: number;
}

// Drink pairing interfaces
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

export interface DrinkPairingResponse {
  success: boolean;
  data: DrinkPairingData;
  processing_time_seconds: number;
}

// Combined data for convenience
export interface CombinedPairingData {
  dessert: DessertData | null;
  drinks: DrinkPairingData | null;
}

/**
 * Get drink pairing recommendations for a dish at a specific restaurant
 */
export const getDrinkPairings = async (
  imageUri: string, // Kept for backward compatibility but not used
  dishName: string,
  restaurantName: string,
  restaurantLocation?: string
): Promise<DrinkPairingData | null> => {
  console.log('🚨 RestaurantPairingService: FUNCTION CALLED - getDrinkPairings');
  console.log('🚨 RestaurantPairingService: Parameters:', { 
    // imageUri, // Commented out - not using image for faster processing
    dishName, 
    restaurantName, 
    restaurantLocation 
  });
  
  try {
    console.log('🚀 RestaurantPairingService: Starting drink pairing recommendations (meal name only - no image)');
    
    // COMMENTED OUT FOR FASTER PROCESSING - Can be reverted if needed
    // // Compress image for faster upload and processing
    // console.log('RestaurantPairingService: Compressing image for speed...');
    // const compressedImage = await ImageResizer.createResizedImage(
    //   imageUri,
    //   512, // Medium size for good image context
    //   512, // Medium size for good image context
    //   'JPEG',
    //   70,  // Good quality for image analysis
    //   0,   // No rotation
    //   undefined, // Output path (will be generated)
    //   false, // Keep metadata
    //   {
    //     mode: 'contain',
    //     onlyScaleDown: true
    //   }
    // );
    // 
    // console.log('✅ RestaurantPairingService: Image compressed successfully');
    
    // Create FormData
    const formData = new FormData();
    
    // COMMENTED OUT - Not sending image for faster processing
    // // Add the compressed image
    // formData.append('image', {
    //   uri: compressedImage.uri,
    //   type: 'image/jpeg',
    //   name: 'dish.jpg',
    // } as any);
    
    // Add required dish and restaurant information
    formData.append('dish_name', dishName);
    formData.append('restaurant_name', restaurantName);
    
    // Add optional restaurant location
    if (restaurantLocation) {
      formData.append('restaurant_location', restaurantLocation);
    }
    
    console.log('🌐 RestaurantPairingService: Making API call to get-restaurant-pairings');
    
    const response = await fetch(`${BASE_URL}/get-restaurant-pairings`, {
      method: 'POST',
      body: formData,
    });
    
    console.log('📡 RestaurantPairingService: Response status:', response.status);
    
    if (!response.ok) {
      console.error('❌ RestaurantPairingService: HTTP error:', response.status, response.statusText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result: DrinkPairingResponse = await response.json();
    
    console.log('🔍 RestaurantPairingService: Drink pairings received');
    
    if (result.success && result.data) {
      console.log('RestaurantPairingService: Successfully got drink pairing recommendations:', {
        beer: result.data.beer_pairing.style,
        wine: result.data.wine_pairing.style,
      });
      
      return result.data;
    } else {
      console.error('RestaurantPairingService: API returned success=false for drinks');
      return null;
    }
    
  } catch (error) {
    console.error('🚨 RestaurantPairingService: CRITICAL ERROR getting drink pairings:', error);
    return null;
  }
};

/**
 * Get dessert recommendation for a specific restaurant
 */
export const getRestaurantDessert = async (
  restaurantName: string,
  restaurantLocation?: string,
  dishContext?: string
): Promise<DessertData | null> => {
  console.log('🚨 RestaurantPairingService: FUNCTION CALLED - getRestaurantDessert');
  console.log('🚨 RestaurantPairingService: Parameters:', { 
    restaurantName, 
    restaurantLocation,
    dishContext
  });
  
  try {
    console.log('🚀 RestaurantPairingService: Getting dessert recommendation');
    
    // Create FormData (no image needed for dessert)
    const formData = new FormData();
    
    // Add restaurant information
    formData.append('restaurant_name', restaurantName);
    
    // Add optional location and context
    if (restaurantLocation) {
      formData.append('restaurant_location', restaurantLocation);
    }
    if (dishContext) {
      formData.append('dish_context', dishContext);
    }
    
    console.log('🌐 RestaurantPairingService: Making API call to get-restaurant-dessert');
    
    const response = await fetch(`${BASE_URL}/get-restaurant-dessert`, {
      method: 'POST',
      body: formData,
    });
    
    console.log('📡 RestaurantPairingService: Response status:', response.status);
    
    if (!response.ok) {
      console.error('❌ RestaurantPairingService: HTTP error:', response.status, response.statusText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result: DessertResponse = await response.json();
    
    console.log('🔍 RestaurantPairingService: Dessert recommendation received');
    
    if (result.success && result.data) {
      console.log('RestaurantPairingService: Successfully got dessert recommendation:', {
        dessert: result.data.dessert.name,
        source: result.data.dessert.source || 'AI recommendation'
      });
      
      return result.data;
    } else {
      console.error('RestaurantPairingService: API returned success=false for dessert');
      return null;
    }
    
  } catch (error) {
    console.error('🚨 RestaurantPairingService: CRITICAL ERROR getting dessert:', error);
    return null;
  }
};

/**
 * Get both drink pairings and dessert recommendation (convenience function)
 */
export const getAllPairings = async (
  imageUri: string,
  dishName: string,
  restaurantName: string,
  restaurantLocation?: string
): Promise<CombinedPairingData> => {
  console.log('🚨 RestaurantPairingService: Getting ALL pairings (drinks + dessert)');
  
  // Call both services in parallel for better performance
  const [drinkData, dessertData] = await Promise.all([
    getDrinkPairings(imageUri, dishName, restaurantName, restaurantLocation),
    getRestaurantDessert(restaurantName, restaurantLocation, dishName)
  ]);
  
  return {
    dessert: dessertData,
    drinks: drinkData
  };
};