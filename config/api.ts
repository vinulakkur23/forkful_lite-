// config/api.ts
/**
 * API configuration for the Meal Rating App.
 */

export const API_BASE_URL = 'https://dishitout-imageinhancer.onrender.com';

export const API_CONFIG = {
  // Base URL for API
  BASE_URL: API_BASE_URL,

  // API endpoints
  ENDPOINTS: {
    EDIT_PHOTO: '/edit-photo',
    GO_BIG: '/go-big',
    HEALTH: '/health',
    SUGGEST_MEAL: '/suggest-meal',
    SUGGEST_MEAL_FOR_RESTAURANT: '/suggest-meal-for-restaurant',
    EXTRACT_METADATA: '/extract-meal-metadata',
    EXTRACT_METADATA_FROM_URL: '/extract-meal-metadata-from-url',
    // Meal enhancement endpoints
    MEAL_ENHANCEMENT_HAIKU: '/meal-enhancement/haiku',
    MEAL_ENHANCEMENT_RESTAURANT: '/meal-enhancement/restaurant-history',
    MEAL_ENHANCEMENT_FOOD: '/meal-enhancement/food-history',
    MEAL_ENHANCEMENT_PHOTO_RATING: '/meal-enhancement/photo-rating',
    MEAL_ENHANCEMENT_PHOTO_SCORE: '/meal-enhancement/photo-score',
    MEAL_ENHANCEMENT_RANDOM: '/meal-enhancement/random'
  },
  
  // Timeout for API requests in milliseconds
  TIMEOUT: 60000, // 60 seconds for AI processing
  
  // Should be updated to your production API URL before deploying
  getBaseUrl(): string {
    if (__DEV__) {
      // Development environment
      // Note: When testing on a physical device, localhost won't work
      // You'll need to use your computer's local IP address instead
      return this.BASE_URL;
    } else {
      // Production environment - use the same Render URL
      return 'https://dishitout-imageinhancer.onrender.com';
    }
  },
  
  // Get full URL for an endpoint
  getUrl(endpoint: string): string {
    return `${this.getBaseUrl()}${endpoint}`;
  }
};

export default API_CONFIG;
