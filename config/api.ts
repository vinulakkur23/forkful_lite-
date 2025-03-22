// config/api.ts
/**
 * API configuration for the Meal Rating App.
 */

export const API_CONFIG = {
  // Base URL for API
  BASE_URL: 'https://dishitout-imageinhancer.onrender.com',
  
  // API endpoints
  ENDPOINTS: {
    EDIT_PHOTO: '/edit-photo',
    GO_BIG: '/go-big',
    HEALTH: '/health'
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
      // Production environment
      return 'https://your-production-api.onrender.com';
    }
  },
  
  // Get full URL for an endpoint
  getUrl(endpoint: string): string {
    return `${this.getBaseUrl()}${endpoint}`;
  }
};

export default API_CONFIG;
