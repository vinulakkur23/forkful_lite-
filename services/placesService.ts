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
  radius: number = 100 // Changed default to 100 meters for a better range of nearby restaurants
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
    console.log(`🚀 searchRestaurantsByText called with query: "${query}", location: ${location ? 'YES' : 'NO'}`);
    
    if (!query || query.length < 2) {
      console.log(`❌ Query too short: "${query}" (length: ${query?.length || 0})`);
      return [];
    }
    
    console.log(`✅ Searching for restaurants with query: "${query}"`);
    
    // Base URL for Places autocomplete
    // Add cache-busting parameter to prevent caching issues
    const cacheBuster = `cb_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=establishment&key=${GOOGLE_MAPS_API_KEY}&_=${cacheBuster}`;
    
    // Add location bias if available
    if (location) {
      url += `&location=${location.latitude},${location.longitude}&radius=50000`;
      console.log(`📍 Added location bias: ${location.latitude}, ${location.longitude}`);
    }
    
    console.log(`🌐 Making autocomplete request to Google Places API: ${url.replace(GOOGLE_MAPS_API_KEY, 'API_KEY_HIDDEN')}`);
    
    // Make the API request
    const response = await fetch(url);
    
    console.log(`📡 API Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      console.error(`❌ Places API error: ${response.status} ${response.statusText}`);
      throw new Error(`Places API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`📦 API Response data:`, JSON.stringify(data, null, 2));
    
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error(`❌ Places API returned status: ${data.status}`);
      throw new Error(`Places API returned status: ${data.status}`);
    }
    
    // For autocomplete, use prediction data directly to avoid multiple API calls
    // We'll fetch detailed place info only when user actually selects a restaurant
    const restaurants: Restaurant[] = [];
    
    // Process only the first 5 predictions
    const predictions = (data.predictions || []).slice(0, 5);
    
    // Convert predictions to Restaurant objects using available data
    for (const prediction of predictions) {
      // Only process restaurant predictions
      if (prediction.types && 
          (prediction.types.includes('restaurant') || 
           prediction.types.includes('food') ||
           prediction.types.includes('cafe'))) {
        
        // Use the prediction data directly - much faster than individual API calls
        restaurants.push({
          id: prediction.place_id,
          name: prediction.structured_formatting?.main_text || prediction.description.split(',')[0],
          vicinity: prediction.structured_formatting?.secondary_text || prediction.description,
          formatted_address: prediction.description,
          // We'll fetch detailed info (rating, geometry) only when user selects this restaurant
        });
      }
    }
    
    console.log(`🎉 Found ${restaurants.length} restaurants matching "${query}"`);
    if (restaurants.length > 0) {
      console.log(`📋 First restaurant: ${restaurants[0].name} - ${restaurants[0].vicinity}`);
    }
    return restaurants;
  } catch (error) {
    console.error('❌ Error searching for restaurants by text:', error);
    return [];
  }
};

/**
 * Fetches detailed information for a specific place by place_id
 * This is used when user selects a restaurant to get full details including geometry
 * 
 * @param placeId - The Google Places place_id
 * @returns Promise with detailed restaurant information
 */
export const getPlaceDetails = async (placeId: string): Promise<Restaurant | null> => {
  try {
    console.log(`Fetching place details for: ${placeId}`);
    
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=place_id,name,vicinity,formatted_address,rating,user_ratings_total,geometry&key=${GOOGLE_MAPS_API_KEY}`;
    
    const response = await fetch(detailsUrl);
    
    if (!response.ok) {
      throw new Error(`Place Details API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status !== 'OK') {
      throw new Error(`Place Details API returned status: ${data.status}`);
    }
    
    if (!data.result) {
      return null;
    }
    
    const place = data.result;
    
    const restaurant: Restaurant = {
      id: place.place_id,
      name: place.name,
      vicinity: place.vicinity || place.formatted_address,
      formatted_address: place.formatted_address,
      rating: place.rating,
      user_ratings_total: place.user_ratings_total,
      geometry: place.geometry
    };
    
    console.log(`Got place details for: ${restaurant.name}`);
    return restaurant;
  } catch (error) {
    console.error('Error fetching place details:', error);
    return null;
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