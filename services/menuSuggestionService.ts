// services/menuSuggestionService.ts
import { API_CONFIG } from '../config/api';

/**
 * Interface for menu suggestion response
 */
interface MenuSuggestionResponse {
  menu_items?: string[];
  suggested_meals?: string[];  // Will contain multiple suggestions
  error?: string;
}

/**
 * Fetches menu items and suggested meals for a restaurant
 * 
 * This service connects to the Dishitout_ImageEnhancer backend to get menu suggestions
 * and meal identification for a given restaurant and food image.
 * 
 * @param restaurantName - The name of the restaurant
 * @param imageUri - Optional URI of the food image to analyze
 * @param location - Optional location data to help with restaurant search
 * @returns Promise with menu items and suggested meals
 */
export const getMenuSuggestionsForRestaurant = async (
  restaurantName: string,
  imageUri?: string,
  location?: { latitude: number; longitude: number } | null
): Promise<MenuSuggestionResponse> => {
  try {
    console.log(`Fetching menu and meal suggestions for restaurant: ${restaurantName}`);
    
    // Create form data for the request
    const formData = new FormData();
    
    // Add the restaurant name (required parameter)
    formData.append('restaurant', restaurantName);
    
    // Add the image file to form data if available
    if (imageUri) {
      formData.append('image', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'food_image.jpg'
      });
      console.log(`Including image in request: ${imageUri}`);
    }
    
    // Add location data if available - the API requires latitude and longitude
    if (location) {
      formData.append('latitude', String(location.latitude));
      formData.append('longitude', String(location.longitude));
      console.log(`Including location: ${location.latitude}, ${location.longitude}`);
    } else {
      // Use default coordinates if no location available (this is required by the API)
      // Using default coordinates for San Francisco
      formData.append('latitude', '37.7749');
      formData.append('longitude', '-122.4194');
      console.log('Using default coordinates since no location provided');
    }
    
    // Use the suggest-meal-for-restaurant endpoint
    const suggestUrl = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SUGGEST_MEAL_FOR_RESTAURANT}`;
    console.log(`Making API request to: ${suggestUrl}`);
    
    // Make the API request with a timeout
    const response = await fetch(suggestUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json',
      },
      timeout: API_CONFIG.TIMEOUT,
    });
    
    // Check if the response is successful
    if (!response.ok) {
      console.error(`API error: ${response.status}`);
      const errorText = await response.text();
      
      // If the endpoint doesn't exist (404), try fallback to regular suggest-meal endpoint
      if (response.status === 404) {
        console.log('The suggest-meal-for-restaurant endpoint doesn\'t exist, trying fallback...');
        return await fallbackToSuggestMeal(restaurantName, imageUri, location);
      }
      
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }
    
    // Parse the JSON response
    const data = await response.json();
    
    // Process response to ensure we have an array of suggested meals
    // This approach leverages the Gemini API to get both menu items and food identification
    const processedResponse: MenuSuggestionResponse = {
      menu_items: data.menu_items || [],
      suggested_meals: [],
    };
    
    console.log(`Raw API response for ${restaurantName}:`, JSON.stringify(data));
    
    // Handle the case where we get a single suggestion vs. multiple
    if (data.suggested_meal) {
      // The suggested_meal may now be a comma-separated list of top 5 suggestions
      if (typeof data.suggested_meal === 'string' && data.suggested_meal.includes(',')) {
        // Split the comma-separated list and trim each item
        const mealSuggestions = data.suggested_meal
          .split(',')
          .map(item => item.trim())
          .filter(item => item.length > 0);
        
        console.log(`Found comma-separated meal suggestions: ${mealSuggestions.length} items`);
        
        // Use these as our suggested meals
        processedResponse.suggested_meals = mealSuggestions;
      } else {
        // If it's a single suggestion (old format), use it as the first in our array
        processedResponse.suggested_meals = [data.suggested_meal];
        
        // If we also have menu items, add top 4 menu items as additional suggestions
        if (data.menu_items && data.menu_items.length > 0) {
          // Add up to 4 menu items to the suggestions, avoiding duplicates
          const additionalSuggestions = data.menu_items
            .filter(item => item !== data.suggested_meal)
            .slice(0, 4);
            
          processedResponse.suggested_meals = [
            ...processedResponse.suggested_meals,
            ...additionalSuggestions
          ];
        }
      }
    } else if (data.menu_items && data.menu_items.length > 0) {
      // If no suggested meal but we have menu items, use the top 5 as suggestions
      // This happens when there's no image provided or AI couldn't identify the food
      processedResponse.suggested_meals = data.menu_items.slice(0, 5);
    }
    
    console.log(`Received ${processedResponse.menu_items?.length || 0} menu items and ${processedResponse.suggested_meals?.length || 0} meal suggestions`);
    
    return processedResponse;
  } catch (error) {
    console.error(`Error in getMenuSuggestionsForRestaurant for ${restaurantName}:`, error);
    return { 
      menu_items: [], 
      suggested_meals: [],
      error: error.message 
    };
  }
};

/**
 * Fallback function that uses the regular suggest-meal endpoint
 * to get meal suggestions when the restaurant-specific endpoint fails
 */
const fallbackToSuggestMeal = async (
  restaurantName: string,
  imageUri?: string,
  location?: { latitude: number; longitude: number } | null
): Promise<MenuSuggestionResponse> => {
  try {
    console.log(`Using fallback method to get suggestions for ${restaurantName}`);
    
    // Create form data for the fallback request
    const formData = new FormData();
    
    // Always include the restaurant name
    formData.append('restaurant', restaurantName);
    
    // Add the image if available
    if (imageUri) {
      formData.append('image', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'food_image.jpg'
      });
    }
    
    // Add location if available - the API requires latitude and longitude
    if (location) {
      formData.append('latitude', String(location.latitude));
      formData.append('longitude', String(location.longitude));
    } else {
      // Use default coordinates if no location available (this is required by the API)
      // Using default coordinates for San Francisco
      formData.append('latitude', '37.7749');
      formData.append('longitude', '-122.4194');
      console.log('Using default coordinates for fallback since no location provided');
    }
    
    // Use the regular suggest-meal endpoint as fallback
    const fallbackUrl = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SUGGEST_MEAL}`;
    console.log(`Making fallback API request to: ${fallbackUrl}`);
    
    // Make the fallback request
    const response = await fetch(fallbackUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json',
      },
      timeout: API_CONFIG.TIMEOUT,
    });
    
    if (!response.ok) {
      throw new Error(`Fallback API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Successfully got suggestions from fallback endpoint');
    
    // Process response similarly to the main function
    // This uses the Gemini API for menu generation and meal identification
    const processedResponse: MenuSuggestionResponse = {
      menu_items: data.menu_items || [],
      suggested_meals: [],
    };
    
    console.log(`Raw fallback API response for ${restaurantName}:`, JSON.stringify(data));
    
    if (data.suggested_meal) {
      // The suggested_meal may now be a comma-separated list of top 5 suggestions
      if (typeof data.suggested_meal === 'string' && data.suggested_meal.includes(',')) {
        // Split the comma-separated list and trim each item
        const mealSuggestions = data.suggested_meal
          .split(',')
          .map(item => item.trim())
          .filter(item => item.length > 0);
        
        console.log(`Found comma-separated meal suggestions in fallback: ${mealSuggestions.length} items`);
        
        // Use these as our suggested meals
        processedResponse.suggested_meals = mealSuggestions;
      } else {
        // If it's a single suggestion (old format), use it as the first in our array
        processedResponse.suggested_meals = [data.suggested_meal];
        
        // If we also have menu items, add them as additional suggestions
        if (data.menu_items && data.menu_items.length > 0) {
          // Add up to 4 menu items, avoiding duplicates
          const additionalSuggestions = data.menu_items
            .filter(item => item !== data.suggested_meal)
            .slice(0, 4);
            
          processedResponse.suggested_meals = [
            ...processedResponse.suggested_meals,
            ...additionalSuggestions
          ];
        }
      }
    } else if (data.menu_items && data.menu_items.length > 0) {
      // If no suggested meal but we have menu items, use the top 5
      processedResponse.suggested_meals = data.menu_items.slice(0, 5);
    }
    
    return processedResponse;
  } catch (error) {
    console.error('Error in fallback method:', error);
    return { 
      menu_items: [], 
      suggested_meals: [],
      error: error.message 
    };
  }
};