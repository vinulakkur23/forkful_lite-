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
    EXTRACT_ENHANCED_METADATA: '/extract-enhanced-metadata',
    EXTRACT_DISH_CRITERIA: '/extract-dish-criteria',
    // Meal enhancement endpoints
    MEAL_ENHANCEMENT_HAIKU: '/meal-enhancement/haiku',
    MEAL_ENHANCEMENT_RESTAURANT: '/meal-enhancement/restaurant-history',
    MEAL_ENHANCEMENT_FOOD: '/meal-enhancement/food-history',
    MEAL_ENHANCEMENT_PHOTO_RATING: '/meal-enhancement/photo-rating',
    MEAL_ENHANCEMENT_PHOTO_SCORE: '/meal-enhancement/photo-score',
    MEAL_ENHANCEMENT_RANDOM: '/meal-enhancement/random',
    ENHANCE_PHOTO: '/enhance-photo'
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

// ─── Server Warmup ───────────────────────────────────────────────────────────
// Render free tier spins down after 15 min of inactivity. Cold starts take
// 15-30s while all AI services initialize. This utility sends a lightweight
// ping to /health to wake the server *before* the real API calls fire.
//
// Usage:  await ensureServerAwake()   — call once before a batch of API calls.
// It's idempotent: rapid concurrent calls share the same in-flight promise.

let warmupPromise: Promise<boolean> | null = null;
let lastSuccessfulPing = 0;
const WARM_WINDOW_MS = 3 * 60 * 1000; // consider server warm for 3 minutes

/**
 * Pings the backend /health endpoint to wake it up if needed.
 * Returns true if the server responded, false if the ping failed
 * (callers should still attempt their real request — the server
 * may finish booting by then).
 *
 * Concurrent calls share the same in-flight ping. If the server
 * responded within the last 3 minutes, returns immediately.
 */
export async function ensureServerAwake(): Promise<boolean> {
  // If we pinged recently, server is still warm
  if (Date.now() - lastSuccessfulPing < WARM_WINDOW_MS) {
    return true;
  }

  // Deduplicate concurrent warmup calls
  if (warmupPromise) {
    return warmupPromise;
  }

  warmupPromise = (async () => {
    try {
      console.log('🏓 Warmup: pinging server to wake Render instance...');
      const controller = new AbortController();
      // 45s timeout — enough for Render cold start but won't block forever
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const response = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        lastSuccessfulPing = Date.now();
        console.log('✅ Warmup: server is awake');
        return true;
      }
      console.warn('⚠️ Warmup: server responded with', response.status);
      return false;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.warn('⚠️ Warmup: ping timed out (45s) — server may still be booting');
      } else {
        console.warn('⚠️ Warmup: ping failed —', error.message);
      }
      return false;
    } finally {
      warmupPromise = null;
    }
  })();

  return warmupPromise;
}
