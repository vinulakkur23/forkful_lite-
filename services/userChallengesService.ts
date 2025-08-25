/**
 * User Challenges Service
 * Manages storage and retrieval of user challenges in Firebase
 */

import { firestore, auth } from '../firebaseConfig';
import { DishChallenge } from './nextDishChallengeService';

export interface UserChallenge extends DishChallenge {
  completedAt?: string;
  completedWithMealId?: string;
  completedWithDish?: string;
}

/**
 * Save a new challenge for the current user
 */
export const saveUserChallenge = async (challenge: DishChallenge): Promise<boolean> => {
  try {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      console.error('No authenticated user to save challenge for');
      return false;
    }

    const challengeData: UserChallenge = {
      ...challenge,
      // Ensure status is active when first saved
      status: 'active'
    };

    await firestore()
      .collection('users')
      .doc(currentUser.uid)
      .collection('challenges')
      .doc(challenge.challenge_id)
      .set(challengeData);

    console.log('UserChallengesService: Challenge saved successfully:', challenge.challenge_id);
    return true;
  } catch (error) {
    console.error('UserChallengesService: Error saving challenge:', error);
    return false;
  }
};

/**
 * Get all challenges for the current user
 */
export const getUserChallenges = async (): Promise<UserChallenge[]> => {
  try {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      console.error('No authenticated user to get challenges for');
      return [];
    }

    const snapshot = await firestore()
      .collection('users')
      .doc(currentUser.uid)
      .collection('challenges')
      .orderBy('generated_timestamp', 'desc')
      .get();

    const challenges: UserChallenge[] = [];
    snapshot.forEach(doc => {
      const data = doc.data() as UserChallenge;
      challenges.push({ ...data, challenge_id: doc.id });
    });

    console.log('UserChallengesService: Retrieved', challenges.length, 'challenges');
    return challenges;
  } catch (error) {
    console.error('UserChallengesService: Error getting challenges:', error);
    return [];
  }
};

/**
 * Get active (uncompleted) challenges for the current user
 */
export const getActiveChallenges = async (): Promise<UserChallenge[]> => {
  try {
    const allChallenges = await getUserChallenges();
    return allChallenges.filter(challenge => challenge.status === 'active');
  } catch (error) {
    console.error('UserChallengesService: Error getting active challenges:', error);
    return [];
  }
};

/**
 * Get completed challenges for the current user
 */
export const getCompletedChallenges = async (): Promise<UserChallenge[]> => {
  try {
    const allChallenges = await getUserChallenges();
    return allChallenges.filter(challenge => challenge.status === 'completed');
  } catch (error) {
    console.error('UserChallengesService: Error getting completed challenges:', error);
    return [];
  }
};

/**
 * Mark a challenge as completed
 */
export const completeChallengeWithMeal = async (
  challengeId: string,
  mealId: string,
  dishName: string
): Promise<boolean> => {
  try {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      console.error('No authenticated user to complete challenge for');
      return false;
    }

    const updateData = {
      status: 'completed',
      completedAt: firestore.FieldValue.serverTimestamp(),
      completedWithMealId: mealId,
      completedWithDish: dishName
    };

    await firestore()
      .collection('users')
      .doc(currentUser.uid)
      .collection('challenges')
      .doc(challengeId)
      .update(updateData);

    console.log('UserChallengesService: Challenge completed:', challengeId);
    return true;
  } catch (error) {
    console.error('UserChallengesService: Error completing challenge:', error);
    return false;
  }
};

/**
 * Get a specific challenge by ID
 */
export const getChallengeById = async (challengeId: string): Promise<UserChallenge | null> => {
  try {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      console.error('No authenticated user to get challenge for');
      return null;
    }

    const doc = await firestore()
      .collection('users')
      .doc(currentUser.uid)
      .collection('challenges')
      .doc(challengeId)
      .get();

    if (doc.exists) {
      const data = doc.data() as UserChallenge;
      return { ...data, challenge_id: doc.id };
    }

    return null;
  } catch (error) {
    console.error('UserChallengesService: Error getting challenge by ID:', error);
    return null;
  }
};

/**
 * Delete a challenge (in case user wants to dismiss it)
 */
export const deleteChallenge = async (challengeId: string): Promise<boolean> => {
  try {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      console.error('No authenticated user to delete challenge for');
      return false;
    }

    await firestore()
      .collection('users')
      .doc(currentUser.uid)
      .collection('challenges')
      .doc(challengeId)
      .delete();

    console.log('UserChallengesService: Challenge deleted:', challengeId);
    return true;
  } catch (error) {
    console.error('UserChallengesService: Error deleting challenge:', error);
    return false;
  }
};

/**
 * Get previous challenge dish names for context in new challenge generation
 */
export const getPreviousChallengeNames = async (): Promise<string[]> => {
  try {
    const challenges = await getUserChallenges();
    return challenges.map(challenge => challenge.recommended_dish_name);
  } catch (error) {
    console.error('UserChallengesService: Error getting previous challenge names:', error);
    return [];
  }
};

/**
 * Check if user already has an active challenge for a specific dish
 */
export const hasActiveChallengeForDish = async (dishName: string): Promise<boolean> => {
  try {
    const activeChallenges = await getActiveChallenges();
    return activeChallenges.some(challenge => 
      challenge.recommended_dish_name.toLowerCase() === dishName.toLowerCase()
    );
  } catch (error) {
    console.error('UserChallengesService: Error checking for duplicate challenge:', error);
    return false;
  }
};

/**
 * Check if user has reached the maximum number of active challenges (6)
 */
export const hasReachedChallengeLimit = async (): Promise<boolean> => {
  try {
    const activeChallenges = await getActiveChallenges();
    const challengeCount = activeChallenges.length;
    console.log('UserChallengesService: User has', challengeCount, 'active challenges');
    return challengeCount >= 6;
  } catch (error) {
    console.error('UserChallengesService: Error checking challenge limit:', error);
    return false;
  }
};

/**
 * Subscribe to real-time updates for user challenges
 */
export const subscribeToUserChallenges = (
  onUpdate: (challenges: UserChallenge[]) => void,
  onError?: (error: Error) => void
) => {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    if (onError) onError(new Error('No authenticated user'));
    return () => {};
  }

  const unsubscribe = firestore()
    .collection('users')
    .doc(currentUser.uid)
    .collection('challenges')
    .orderBy('generated_timestamp', 'desc')
    .onSnapshot(
      (snapshot) => {
        const challenges: UserChallenge[] = [];
        snapshot.forEach(doc => {
          const data = doc.data() as UserChallenge;
          challenges.push({ ...data, challenge_id: doc.id });
        });
        onUpdate(challenges);
      },
      (error) => {
        console.error('UserChallengesService: Error in real-time subscription:', error);
        if (onError) onError(error);
      }
    );

  return unsubscribe;
};

/**
 * Check if a newly saved meal completes any active challenges
 * Returns the completed challenge if found, null otherwise
 */
export const checkIfMealCompletesAnyChallenge = async (
  mealId: string,
  dishName: string,
  cuisine?: string
): Promise<UserChallenge | null> => {
  try {
    console.log('UserChallengesService: Checking if meal completes any challenge:', {
      mealId,
      dishName,
      cuisine
    });

    // Get all active challenges
    const activeChallenges = await getActiveChallenges();
    
    if (activeChallenges.length === 0) {
      console.log('UserChallengesService: No active challenges to check');
      return null;
    }

    console.log(`UserChallengesService: Checking ${activeChallenges.length} active challenges`);

    // Import the challenge completion checker
    const { checkChallengeCompletion } = await import('./nextDishChallengeService');

    // Check each active challenge
    for (const challenge of activeChallenges) {
      console.log(`UserChallengesService: Checking challenge: ${challenge.recommended_dish_name}`);
      
      // Use the existing API-based fuzzy matching
      const isCompleted = await checkChallengeCompletion(
        challenge,
        dishName,
        cuisine
      );

      if (isCompleted) {
        console.log(`UserChallengesService: Challenge completed! ${challenge.recommended_dish_name}`);
        
        // Mark the challenge as completed
        const success = await completeChallengeWithMeal(
          challenge.challenge_id,
          mealId,
          dishName
        );

        if (success) {
          console.log('UserChallengesService: Challenge marked as completed in Firebase');
          
          // Show celebration notification
          const challengeNotificationService = (await import('./challengeNotificationService')).default;
          challengeNotificationService.showChallengeCompleted(challenge, dishName);
          
          return challenge;
        }
      }
    }

    console.log('UserChallengesService: No challenges completed by this meal');
    return null;
  } catch (error) {
    console.error('UserChallengesService: Error checking challenge completion:', error);
    return null;
  }
};