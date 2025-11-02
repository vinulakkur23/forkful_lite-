/**
 * API Retry Utility
 * Provides retry logic with exponential backoff for API calls
 */

interface RetryOptions {
  maxRetries?: number;        // Default: 3
  initialDelayMs?: number;    // Default: 1000 (1 second)
  maxDelayMs?: number;        // Default: 10000 (10 seconds)
  backoffMultiplier?: number; // Default: 2 (exponential)
  retryableErrors?: string[]; // Errors that should trigger retry (default: timeout, network, 5xx)
}

/**
 * Execute an async function with retry logic and exponential backoff
 *
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @param context - Context string for logging (e.g., "DishIdentification")
 * @returns The result of the function or throws after all retries exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
  context: string = 'API'
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    retryableErrors = ['timeout', 'network', 'ECONNRESET', 'ETIMEDOUT', '5']
  } = options;

  let lastError: any;
  let currentDelay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 [${context}] Attempt ${attempt + 1}/${maxRetries + 1}`);
      const result = await fn();

      if (attempt > 0) {
        console.log(`✅ [${context}] Succeeded on attempt ${attempt + 1}`);
      }

      return result;
    } catch (error: any) {
      lastError = error;

      // Check if error is retryable
      const errorString = String(error.message || error).toLowerCase();
      const isRetryable = retryableErrors.some(retryErr =>
        errorString.includes(retryErr.toLowerCase())
      );

      // If we've exhausted retries or error is not retryable, throw
      if (attempt === maxRetries || !isRetryable) {
        if (!isRetryable) {
          console.error(`❌ [${context}] Non-retryable error:`, error.message || error);
        } else {
          console.error(`❌ [${context}] All ${maxRetries + 1} attempts failed`);
        }
        throw error;
      }

      // Log retry attempt
      console.warn(`⚠️ [${context}] Attempt ${attempt + 1} failed: ${error.message || error}`);
      console.log(`⏳ [${context}] Retrying in ${currentDelay}ms...`);

      // Wait before next retry
      await new Promise(resolve => setTimeout(resolve, currentDelay));

      // Increase delay for next attempt (exponential backoff)
      currentDelay = Math.min(currentDelay * backoffMultiplier, maxDelayMs);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Check if an error is a timeout error
 */
export function isTimeoutError(error: any): boolean {
  const errorString = String(error.message || error).toLowerCase();
  return errorString.includes('timeout') ||
         errorString.includes('timed out') ||
         errorString.includes('etimedout');
}

/**
 * Check if an error is a network error
 */
export function isNetworkError(error: any): boolean {
  const errorString = String(error.message || error).toLowerCase();
  return errorString.includes('network') ||
         errorString.includes('econnreset') ||
         errorString.includes('connection') ||
         errorString.includes('fetch failed');
}

/**
 * Check if an error is a server error (5xx)
 */
export function isServerError(error: any): boolean {
  const errorString = String(error.message || error).toLowerCase();
  return errorString.includes('500') ||
         errorString.includes('502') ||
         errorString.includes('503') ||
         errorString.includes('504');
}
