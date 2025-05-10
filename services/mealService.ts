// services/mealService.ts
import { API_CONFIG } from '../config/api';

// Interface for suggestion response
interface SuggestionResponse {
  restaurants?: Array<{
    id: string;
    name: string;
    vicinity: string;
    rating?: number;
    user_ratings_total?: number;
  }>;
  menu_items?: string[];
  suggested_meal?: string;
}

/**
 * Fetches restaurant and meal suggestions based on image and location
 * 
 * @param imageUri - The URI of the food image
 * @param location - The user's current location (latitude/longitude)
 * @returns A promise that resolves to restaurant suggestions, menu items, and meal name
 */
export const getMealSuggestions = async (
  imageUri: string, 
  location: { latitude: number; longitude: number } | null
): Promise<SuggestionResponse> => {
  try {
    console.log(`Fetching meal suggestions for image: ${imageUri}`);
    
    // Check if we have valid inputs
    if (!imageUri) {
      console.error('No image URI provided for meal suggestions');
      return {};
    }
    
    // Create form data for the image upload
    const formData = new FormData();
    
    // Add the image file to the form data
    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg', // Assuming jpeg format
      name: 'food_image.jpg'
    });
    
    // Add location data if available
    if (location) {
      formData.append('latitude', String(location.latitude));
      formData.append('longitude', String(location.longitude));
    }
    
    // Construct the API URL
    const suggestUrl = `${API_CONFIG.BASE_URL}/suggest-meal`;
    console.log(`Making API request to: ${suggestUrl}`);
    
    // Make the API request
    const response = await fetch(suggestUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json',
        // Do not set Content-Type when using FormData with file upload
      },
      timeout: API_CONFIG.TIMEOUT,
    });
    
    // Check if the response is successful
    if (!response.ok) {
      console.error(`API error: ${response.status}`);
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }
    
    // Parse the JSON response
    const data: SuggestionResponse = await response.json();
    
    console.log(`Received suggestions from API: ${data.restaurants?.length || 0} restaurants, ${data.menu_items?.length || 0} menu items`);
    
    return data;
  } catch (error) {
    console.error('Error in getMealSuggestions:', error);
    // Return empty result on error rather than throwing
    return {};
  }
};

/**
 * Fetches meal suggestions for a specific restaurant
 * 
 * @param restaurantName - The name of the restaurant
 * @param imageUri - The URI of the food image (optional)
 * @param location - The user's current location (optional)
 * @returns A promise that resolves to menu items and a suggested meal
 */
export const getMealSuggestionsForRestaurant = async (
  restaurantName: string,
  imageUri?: string,
  location?: { latitude: number; longitude: number } | null
): Promise<SuggestionResponse> => {
  try {
    console.log(`Fetching meal suggestions for restaurant: ${restaurantName}`);
    
    // Check if we have valid inputs
    if (!restaurantName) {
      console.error('No restaurant name provided');
      return {};
    }
    
    // Create form data for the request
    const formData = new FormData();
    
    // Add the restaurant name
    formData.append('restaurant', restaurantName);
    
    // Add the image file to the form data if available
    if (imageUri) {
      formData.append('image', {
        uri: imageUri,
        type: 'image/jpeg', // Assuming jpeg format
        name: 'food_image.jpg'
      });
    }
    
    // Add location data if available
    if (location) {
      formData.append('latitude', String(location.latitude));
      formData.append('longitude', String(location.longitude));
    }
    
    // Construct the API URL
    const suggestUrl = `${API_CONFIG.BASE_URL}/suggest-meal-for-restaurant`;
    console.log(`Making API request to: ${suggestUrl}`);
    
    // Make the API request
    const response = await fetch(suggestUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json',
        // Do not set Content-Type when using FormData with file upload
      },
      timeout: API_CONFIG.TIMEOUT,
    });
    
    // Check if the response is successful
    if (!response.ok) {
      console.error(`API error: ${response.status}`);
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }
    
    // Parse the JSON response
    const data: SuggestionResponse = await response.json();
    
    console.log(`Received restaurant-specific suggestions: ${data.menu_items?.length || 0} menu items`);
    
    return data;
  } catch (error) {
    console.error(`Error in getMealSuggestionsForRestaurant for ${restaurantName}:`, error);

    // Log more detailed error information to help with debugging
    if (error.response) {
      console.error('Response error data:', error.response.data);
      console.error('Response error status:', error.response.status);
    } else if (error.request) {
      console.error('Request error:', error.request);
    }

    // Check if this is a 404 error, which would indicate the endpoint doesn't exist
    if (error.message && error.message.includes('404')) {
      console.error('The /suggest-meal-for-restaurant endpoint might not exist on the server!');

      // Try fallback to the regular suggest-meal endpoint if the specific one doesn't exist
      try {
        console.log('Falling back to regular /suggest-meal endpoint...');

        // Create new form data with restaurant as a parameter
        const fallbackFormData = new FormData();
        fallbackFormData.append('restaurant', restaurantName);

        // Add location data if available
        if (location) {
          fallbackFormData.append('latitude', String(location.latitude));
          fallbackFormData.append('longitude', String(location.longitude));
        }

        // Make request to the regular endpoint
        const fallbackResponse = await fetch(`${API_CONFIG.BASE_URL}/suggest-meal`, {
          method: 'POST',
          body: fallbackFormData,
          headers: {
            'Accept': 'application/json',
          },
          timeout: API_CONFIG.TIMEOUT,
        });

        if (!fallbackResponse.ok) {
          throw new Error(`Fallback API error: ${fallbackResponse.status}`);
        }

        const fallbackData = await fallbackResponse.json();
        console.log('Successfully got meal suggestions from fallback endpoint');

        return fallbackData;
      } catch (fallbackError) {
        console.error('Even fallback API request failed:', fallbackError);
      }
    }

    // Return empty result on error rather than throwing
    return {};
  }
};