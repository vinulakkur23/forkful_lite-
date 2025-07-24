// dishCriteriaService.ts - Service for extracting and caching dish criteria
import { API_CONFIG } from '../config/api';
import { firestore } from '../firebaseConfig';

/**
 * Interface for individual dish criterion
 */
export interface DishCriterion {
  title: string;        // e.g., "Crisp, Shatter-like Exterior"
  description: string;  // 1-2 sentence description of what to look for
}

/**
 * Interface for complete dish criteria data
 */
export interface DishCriteria {
  dish_key: string;
  dish_specific: string;     // e.g., "Croissant"
  dish_general: string;      // e.g., "Pastry" 
  cuisine_type?: string;     // e.g., "French"
  criteria: DishCriterion[]; // Array of 5 criteria
  created_at: string;
  version: string;
  source: 'ai_generated' | 'fallback';
  usage_count?: number;
  last_used?: string;
}

/**
 * Generate a unique key for caching dish criteria
 */
function generateDishKey(dishSpecific: string, cuisineType?: string): string {
  const keyString = dishSpecific.toLowerCase().trim() + 
    (cuisineType ? `_${cuisineType.toLowerCase().trim()}` : '');
  
  // Simple hash function for React Native
  let hash = 0;
  for (let i = 0; i < keyString.length; i++) {
    const char = keyString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).substring(0, 12);
}

/**
 * Check if dish criteria exists in Firestore cache
 */
export const getCachedDishCriteria = async (
  dishSpecific: string, 
  cuisineType?: string
): Promise<DishCriteria | null> => {
  try {
    const dishKey = generateDishKey(dishSpecific, cuisineType);
    console.log(`Checking cache for dish criteria: ${dishKey}`);
    
    const doc = await firestore()
      .collection('dishCriteria')
      .doc(dishKey)
      .get();
    
    if (doc.exists) {
      const data = doc.data() as DishCriteria;
      console.log(`Found cached criteria for: ${dishSpecific}`);
      
      // Update usage statistics
      try {
        await firestore()
          .collection('dishCriteria')
          .doc(dishKey)
          .update({
            usage_count: (data.usage_count || 0) + 1,
            last_used: new Date().toISOString()
          });
      } catch (updateError) {
        console.log('Could not update usage stats:', updateError);
      }
      
      return data;
    }
    
    return null;
  } catch (error) {
    console.error('Error checking cached dish criteria:', error);
    return null;
  }
};

/**
 * Cache dish criteria to Firestore
 */
const cacheDishCriteria = async (criteriaData: DishCriteria): Promise<void> => {
  try {
    const dishKey = criteriaData.dish_key;
    console.log(`Caching criteria for dish_key: ${dishKey}`);
    
    // Add caching metadata
    const cacheData = {
      ...criteriaData,
      cached_at: new Date().toISOString(),
      usage_count: 1,
      last_used: new Date().toISOString()
    };
    
    await firestore()
      .collection('dishCriteria')
      .doc(dishKey)
      .set(cacheData);
    
    console.log(`Successfully cached criteria for: ${criteriaData.dish_specific}`);
  } catch (error) {
    console.error('Error caching dish criteria:', error);
    // Don't throw - caching failure shouldn't break the feature
  }
};

/**
 * Extract dish criteria from API
 */
const extractAndCacheDishCriteria = async (
  dishSpecific: string,
  dishGeneral?: string,
  cuisineType?: string
): Promise<DishCriteria | null> => {
  try {
    console.log(`Extracting criteria for: ${dishSpecific}`);
    
    // Prepare form data for API call
    const formData = new FormData();
    formData.append('dish_specific', dishSpecific);
    if (dishGeneral) {
      formData.append('dish_general', dishGeneral);
    }
    if (cuisineType) {
      formData.append('cuisine_type', cuisineType);
    }
    
    // Call the backend API
    const response = await fetch(`${API_CONFIG.getBaseUrl()}/extract-dish-criteria`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
      },
      body: formData,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API error extracting dish criteria: ${errorText}`);
      throw new Error(`API Error: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.dish_criteria) {
      const criteriaData = result.dish_criteria as DishCriteria;
      console.log(`Criteria received for: ${dishSpecific} (key: ${criteriaData.dish_key})`);
      return criteriaData;
    }
    
    throw new Error('Invalid API response format');
    
  } catch (error) {
    console.error('Error extracting dish criteria:', error);
    return null;
  }
};

/**
 * Get dish criteria - for now, always calls API (caching will be added later)
 */
export const getDishCriteria = async (
  dishSpecific: string,
  dishGeneral?: string,
  cuisineType?: string
): Promise<DishCriteria | null> => {
  try {
    // First, check cache
    const cachedCriteria = await getCachedDishCriteria(dishSpecific, cuisineType);
    if (cachedCriteria) {
      console.log(`Using cached criteria for: ${dishSpecific}`);
      return cachedCriteria;
    }
    
    // Not in cache, call API to generate
    console.log(`Generating new criteria for: ${dishSpecific}`);
    const newCriteria = await extractAndCacheDishCriteria(dishSpecific, dishGeneral, cuisineType);
    
    // Cache the result if successful
    if (newCriteria) {
      await cacheDishCriteria(newCriteria);
    }
    
    return newCriteria;
    
  } catch (error) {
    console.error('Error getting dish criteria:', error);
    return null;
  }
};

/**
 * Save dish criteria key reference to a meal entry
 */
export const linkCriteriaToMeal = async (
  mealId: string, 
  criteriaData: DishCriteria
): Promise<void> => {
  try {
    await firestore()
      .collection('mealEntries')
      .doc(mealId)
      .update({
        dish_criteria_key: criteriaData.dish_key,
        dish_criteria_generated_at: new Date().toISOString()
      });
    
    console.log(`Linked criteria to meal: ${mealId} -> ${criteriaData.dish_key}`);
  } catch (error) {
    console.error('Error linking criteria to meal:', error);
    throw error;
  }
};

/**
 * Get dish criteria for a specific meal
 * For now, regenerates criteria based on enhanced metadata
 */
export const getMealDishCriteria = async (mealId: string): Promise<DishCriteria | null> => {
  try {
    // Get the meal to find the enhanced metadata
    const mealDoc = await firestore()
      .collection('mealEntries')
      .doc(mealId)
      .get();
    
    if (!mealDoc.exists) {
      throw new Error('Meal not found');
    }
    
    const mealData = mealDoc.data();
    const enhancedMetadata = mealData?.metadata_enriched;
    
    if (!enhancedMetadata) {
      console.log(`No enhanced metadata found for meal: ${mealId}`);
      return null;
    }
    
    // Generate criteria based on enhanced metadata
    return await getDishCriteria(
      enhancedMetadata.dish_specific,
      enhancedMetadata.dish_general,
      enhancedMetadata.cuisine_type
    );
    
  } catch (error) {
    console.error('Error getting meal dish criteria:', error);
    return null;
  }
};