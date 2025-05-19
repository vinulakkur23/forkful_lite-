/**
 * Google Maps & Places API configuration for the Meal Rating App
 */

// Google Maps API key
// IMPORTANT: In a production app, store this securely - consider using environment variables
// and secure key management. Never commit API keys directly to source control.
export const GOOGLE_MAPS_API_KEY = 'AIzaSyAC3ibPKbYQFvv47fwTG9QqwUS5GYZhxFI';

// Places API configuration
export const PLACES_CONFIG = {
  // Default search radius for nearby places (in meters)
  DEFAULT_RADIUS: 15,
  
  // Max number of results to return for auto-complete
  MAX_AUTOCOMPLETE_RESULTS: 5,
  
  // Place types to search for
  RESTAURANT_TYPES: ['restaurant', 'meal_takeaway', 'cafe', 'bakery', 'bar', 'food'],
  
  // Fields to request for place details
  PLACE_FIELDS: 'place_id,name,vicinity,formatted_address,rating,user_ratings_total,geometry',
  
  // Minimum length of text before triggering autocomplete search
  MIN_QUERY_LENGTH: 2,
  
  // Timeout for search requests (in milliseconds)
  SEARCH_TIMEOUT: 10000
};

export default PLACES_CONFIG;