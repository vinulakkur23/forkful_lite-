/**
 * Next Dish Challenge Service
 * Handles generation and completion checking of personalized dish challenges
 */

const BASE_URL = 'https://dishitout-imageinhancer.onrender.com';

export interface DishChallenge {
  recommended_dish_name: string;
  cuisine_type: string;
  why_this_dish: string;
  what_to_notice: string;
  skill_connection: string;
  new_experience: string;
  challenge_id: string;
  generated_timestamp: string;
  source_dish: {
    dish_specific: string;
    dish_general: string;
    criteria_count: number;
  };
  challenge_type: string;
  status: 'active' | 'completed';
  completion_criteria: {
    dish_name_match: string;
    cuisine_match: string;
    flexible_matching: boolean;
  };
  is_fallback?: boolean;
}

export interface ChallengeResponse {
  success: boolean;
  challenge: DishChallenge;
  message: string;
}

export interface ChallengeCompletionResponse {
  success: boolean;
  completed: boolean;
  challenge_id: string;
  message: string;
}

/**
 * Generate a new dish challenge based on user's recent meal experience
 */
export const generateNextDishChallenge = async (
  dishSpecific: string,
  dishGeneral: string,
  dishCriteria: Array<{ title: string; description: string }>,
  userCity?: string,
  previousChallenges?: string[]
): Promise<DishChallenge | null> => {
  try {
    console.log('NextDishChallengeService: Generating challenge for:', dishSpecific);
    
    // Create FormData
    const formData = new FormData();
    
    // Add required fields
    formData.append('dish_specific', dishSpecific);
    formData.append('dish_general', dishGeneral);
    formData.append('dish_criteria', JSON.stringify(dishCriteria));
    
    // Add optional context
    if (userCity) {
      formData.append('user_city', userCity);
    }
    if (previousChallenges && previousChallenges.length > 0) {
      formData.append('previous_challenges', JSON.stringify(previousChallenges));
    }
    
    console.log('NextDishChallengeService: Making API call to generate-next-dish-challenge');
    
    const response = await fetch(`${BASE_URL}/generate-next-dish-challenge`, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type manually - let fetch set it with proper boundary
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result: ChallengeResponse = await response.json();
    
    if (result.success && result.challenge) {
      console.log('NextDishChallengeService: Successfully generated challenge:', {
        dish: result.challenge.recommended_dish_name,
        cuisine: result.challenge.cuisine_type,
        id: result.challenge.challenge_id
      });
      return result.challenge;
    } else {
      console.error('NextDishChallengeService: API returned success=false');
      return null;
    }
    
  } catch (error) {
    console.error('NextDishChallengeService: Error generating challenge:', error);
    return null;
  }
};

/**
 * Check if a new meal completes an existing challenge
 */
export const checkChallengeCompletion = async (
  challenge: DishChallenge,
  newDishName: string,
  newCuisine?: string
): Promise<boolean> => {
  try {
    console.log('NextDishChallengeService: Checking completion for:', {
      challenge: challenge.recommended_dish_name,
      newDish: newDishName
    });
    
    // Create FormData
    const formData = new FormData();
    
    // Add required fields
    formData.append('challenge_data', JSON.stringify(challenge));
    formData.append('new_dish_name', newDishName);
    
    // Add optional cuisine
    if (newCuisine) {
      formData.append('new_cuisine', newCuisine);
    }
    
    console.log('NextDishChallengeService: Making API call to check-challenge-completion');
    
    const response = await fetch(`${BASE_URL}/check-challenge-completion`, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type manually - let fetch set it with proper boundary
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result: ChallengeCompletionResponse = await response.json();
    
    if (result.success) {
      console.log('NextDishChallengeService: Challenge completion checked:', {
        completed: result.completed,
        challengeId: result.challenge_id
      });
      return result.completed;
    } else {
      console.error('NextDishChallengeService: API returned success=false');
      return false;
    }
    
  } catch (error) {
    console.error('NextDishChallengeService: Error checking completion:', error);
    return false;
  }
};

/**
 * Generate a local challenge ID for temporary storage
 */
export const generateLocalChallengeId = (dishName: string): string => {
  const timestamp = Date.now();
  const hash = dishName.toLowerCase().replace(/\s+/g, '_');
  return `${hash}_${timestamp}`;
};

/**
 * Check if a challenge is expired (older than 30 days)
 */
export const isChallengeExpired = (challenge: DishChallenge): boolean => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const challengeDate = new Date(challenge.generated_timestamp);
  return challengeDate < thirtyDaysAgo;
};