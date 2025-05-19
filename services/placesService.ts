/**
 * Direct Google Places API integration for restaurant suggestions
 * This service bypasses the backend server and directly calls Google Places API
 */

// Import the Google Maps API configuration
import { GOOGLE_MAPS_API_KEY, PLACES_CONFIG } from '../config/googleMapsConfig';

// Interface for location data
export interface LocationData {
  latitude: number;
  longitude: number;
  source?: string;
  priority?: number;
}

// Restaurant interface that matches what the app expects
export interface Restaurant {
  id: string;
  name: string;
  vicinity: string; // Address
  rating?: number;
  user_ratings_total?: number;
  formatted_address?: string;
  geometry?: {
    location: {
      lat: number;
      lng: number;
    }
  };
}

/**
 * Searches for nearby restaurants based on location
 * 
 * @param location - The location to search around
 * @param radius - Search radius in meters (default: 1000)
 * @returns Promise with an array of restaurant results
 */
export const searchNearbyRestaurants = async (
  location: LocationData,
  radius: number = 1000
): Promise<Restaurant[]> => {
  try {
    console.log(`Searching for restaurants near ${location.latitude}, ${location.longitude}`);
    
    // Prepare the URL for Google Places API nearby search
    // Add a random parameter to prevent caching issues
    const cacheBuster = `cb_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location.latitude},${location.longitude}&radius=${radius}&type=restaurant&key=${GOOGLE_MAPS_API_KEY}&_=${cacheBuster}`;
    
    console.log(`Making direct request to Google Places API: ${url.replace(GOOGLE_MAPS_API_KEY, 'API_KEY_HIDDEN')}`);
    
    // Make the API request
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Places API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`Places API returned status: ${data.status}`);
    }
    
    // Map Google Places results to our Restaurant interface
    const restaurants: Restaurant[] = (data.results || []).map((place: any) => ({
      id: place.place_id,
      name: place.name,
      vicinity: place.vicinity,
      rating: place.rating,
      user_ratings_total: place.user_ratings_total,
      geometry: place.geometry,
      formatted_address: place.formatted_address || place.vicinity
    }));
    
    console.log(`Found ${restaurants.length} restaurants nearby`);
    
    // Debug first result if available
    if (restaurants.length > 0) {
      console.log('First restaurant:', {
        name: restaurants[0].name,
        address: restaurants[0].vicinity,
        hasLocation: !!restaurants[0].geometry
      });
    }
    
    return restaurants;
  } catch (error) {
    console.error('Error searching for nearby restaurants:', error);
    return [];
  }
};

/**
 * Searches for restaurants by text query with autocomplete
 * 
 * @param query - The search text
 * @param location - Optional location to bias results
 * @returns Promise with an array of restaurant results
 */
export const searchRestaurantsByText = async (
  query: string,
  location?: LocationData
): Promise<Restaurant[]> => {
  try {
    if (!query || query.length < 2) {
      return [];
    }
    
    console.log(`Searching for restaurants with query: "${query}"`);
    
    // Base URL for Places autocomplete
    // Add cache-busting parameter to prevent caching issues
    const cacheBuster = `cb_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=establishment&key=${GOOGLE_MAPS_API_KEY}&_=${cacheBuster}`;
    
    // Add location bias if available
    if (location) {
      url += `&location=${location.latitude},${location.longitude}&radius=50000`;
    }
    
    console.log(`Making autocomplete request to Google Places API: ${url.replace(GOOGLE_MAPS_API_KEY, 'API_KEY_HIDDEN')}`);
    
    // Make the API request
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Places API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`Places API returned status: ${data.status}`);
    }
    
    // For autocomplete, we need to get details for each place to match our Restaurant interface
    const restaurants: Restaurant[] = [];
    
    // Process only the first 5 predictions to avoid too many API calls
    const predictions = (data.predictions || []).slice(0, 5);
    
    // For each prediction, fetch the details
    for (const prediction of predictions) {
      // Only process restaurant predictions
      if (prediction.types && 
          (prediction.types.includes('restaurant') || 
           prediction.types.includes('food') ||
           prediction.types.includes('cafe'))) {
        
        try {
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${prediction.place_id}&fields=place_id,name,vicinity,formatted_address,rating,user_ratings_total,geometry&key=${GOOGLE_MAPS_API_KEY}`;
          
          const detailsResponse = await fetch(detailsUrl);
          const detailsData = await detailsResponse.json();
          
          if (detailsData.status === 'OK' && detailsData.result) {
            const place = detailsData.result;
            
            restaurants.push({
              id: place.place_id,
              name: place.name,
              vicinity: place.vicinity || place.formatted_address,
              formatted_address: place.formatted_address,
              rating: place.rating,
              user_ratings_total: place.user_ratings_total,
              geometry: place.geometry
            });
          }
        } catch (detailsError) {
          console.error(`Error fetching details for place ${prediction.place_id}:`, detailsError);
        }
      }
    }
    
    console.log(`Found ${restaurants.length} restaurants matching "${query}"`);
    return restaurants;
  } catch (error) {
    console.error('Error searching for restaurants by text:', error);
    return [];
  }
};

/**
 * Extract city from a restaurant's address
 * 
 * @param restaurant - The restaurant object
 * @returns The extracted city name
 */
export const extractCityFromRestaurant = (restaurant: Restaurant): string => {
  if (!restaurant) return '';
  
  const address = restaurant.vicinity || restaurant.formatted_address;
  if (!address) return '';
  
  // Try to extract city from address
  const addressParts = address.split(',').map(part => part.trim());
  
  // City is typically the second component in a comma-separated address
  if (addressParts.length > 1) {
    const secondPart = addressParts[1];
    
    // If second part has spaces (like "Portland OR"), take just the city name
    if (secondPart.includes(' ')) {
      return secondPart.split(' ')[0];
    }
    return secondPart;
  }
  
  return '';
};