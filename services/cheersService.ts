import { firebase, firestore, auth } from '../firebaseConfig';

interface Cheer {
  userId: string;
  cheeredAt: firebase.firestore.Timestamp | firebase.firestore.FieldValue;
}

interface CheersData {
  totalCheers: number;
  hasUserCheered: boolean;
}

/**
 * Add a cheer to a meal entry
 * Users can only cheer once per meal
 */
export const addCheer = async (mealId: string): Promise<boolean> => {
  try {
    const userId = auth().currentUser?.uid;
    if (!userId) {
      console.error('User not authenticated');
      return false;
    }

    // Reference to the cheers subcollection
    const cheerRef = firestore()
      .collection('mealEntries')
      .doc(mealId)
      .collection('cheers')
      .doc(userId);

    // Check if user has already cheered
    const cheerDoc = await cheerRef.get();
    if (cheerDoc.exists) {
      console.log('User has already cheered this meal');
      return false;
    }

    // Add the cheer
    await cheerRef.set({
      userId,
      cheeredAt: firestore.FieldValue.serverTimestamp()
    });

    // Update the meal entry's cheer count
    await firestore()
      .collection('mealEntries')
      .doc(mealId)
      .update({
        cheersCount: firestore.FieldValue.increment(1)
      });

    console.log('Cheer added successfully');
    return true;
  } catch (error) {
    console.error('Error adding cheer:', error);
    return false;
  }
};

/**
 * Remove a cheer from a meal entry
 * This is for toggling off a cheer
 */
export const removeCheer = async (mealId: string): Promise<boolean> => {
  try {
    const userId = auth().currentUser?.uid;
    if (!userId) {
      console.error('User not authenticated');
      return false;
    }

    // Reference to the cheer document
    const cheerRef = firestore()
      .collection('mealEntries')
      .doc(mealId)
      .collection('cheers')
      .doc(userId);

    // Check if the cheer exists
    const cheerDoc = await cheerRef.get();
    if (!cheerDoc.exists) {
      console.log('No cheer to remove');
      return false;
    }

    // Delete the cheer
    await cheerRef.delete();

    // Update the meal entry's cheer count
    await firestore()
      .collection('mealEntries')
      .doc(mealId)
      .update({
        cheersCount: firestore.FieldValue.increment(-1)
      });

    console.log('Cheer removed successfully');
    return true;
  } catch (error) {
    console.error('Error removing cheer:', error);
    return false;
  }
};

/**
 * Get cheers data for a meal
 * Returns total count and whether current user has cheered
 * Only returns total count if the meal belongs to the current user
 */
export const getCheersData = async (mealId: string, mealOwnerId: string): Promise<CheersData> => {
  try {
    const userId = auth().currentUser?.uid;
    if (!userId) {
      return { totalCheers: 0, hasUserCheered: false };
    }

    // Check if current user has cheered
    const userCheerRef = firestore()
      .collection('mealEntries')
      .doc(mealId)
      .collection('cheers')
      .doc(userId);
    
    const userCheerDoc = await userCheerRef.get();
    const hasUserCheered = userCheerDoc.exists;

    // Get total cheers count only if the current user owns the meal
    let totalCheers = 0;
    if (userId === mealOwnerId) {
      const mealDoc = await firestore()
        .collection('mealEntries')
        .doc(mealId)
        .get();
      
      totalCheers = mealDoc.data()?.cheersCount || 0;
    }

    return {
      totalCheers,
      hasUserCheered
    };
  } catch (error) {
    console.error('Error getting cheers data:', error);
    return { totalCheers: 0, hasUserCheered: false };
  }
};

/**
 * Toggle cheer for a meal
 * Adds if not cheered, removes if already cheered
 */
export const toggleCheer = async (mealId: string): Promise<boolean> => {
  try {
    const userId = auth().currentUser?.uid;
    if (!userId) {
      console.error('User not authenticated');
      return false;
    }

    // Check current cheer status
    const cheerRef = firestore()
      .collection('mealEntries')
      .doc(mealId)
      .collection('cheers')
      .doc(userId);
    
    const cheerDoc = await cheerRef.get();
    
    if (cheerDoc.exists) {
      // User has cheered, so remove it
      return await removeCheer(mealId);
    } else {
      // User hasn't cheered, so add it
      return await addCheer(mealId);
    }
  } catch (error) {
    console.error('Error toggling cheer:', error);
    return false;
  }
};

/**
 * Listen to cheers data changes for a meal
 * Returns an unsubscribe function
 */
export const subscribeToCheersData = (
  mealId: string, 
  mealOwnerId: string,
  onUpdate: (data: CheersData) => void
): (() => void) => {
  const userId = auth().currentUser?.uid;
  if (!userId) {
    console.log('No authenticated user for cheers subscription');
    return () => {};
  }

  // Subscribe to the user's cheer status
  const userCheerRef = firestore()
    .collection('mealEntries')
    .doc(mealId)
    .collection('cheers')
    .doc(userId);

  // Subscribe to the meal document for total count (only if owner)
  let mealUnsubscribe: (() => void) | null = null;
  
  if (userId === mealOwnerId) {
    const mealRef = firestore()
      .collection('mealEntries')
      .doc(mealId);
    
    mealUnsubscribe = mealRef.onSnapshot(
      mealSnapshot => {
        const cheersCount = mealSnapshot.data()?.cheersCount || 0;
        
        // Also check user's cheer status
        userCheerRef.get().then(userCheerDoc => {
          onUpdate({
            totalCheers: cheersCount,
            hasUserCheered: userCheerDoc.exists
          });
        });
      },
      error => {
        console.error('Error in meal cheers subscription:', error);
      }
    );
  } else {
    // Not the owner, only subscribe to user's cheer status
    const userCheerUnsubscribe = userCheerRef.onSnapshot(
      snapshot => {
        onUpdate({
          totalCheers: 0, // Don't show count to non-owners
          hasUserCheered: snapshot.exists
        });
      },
      error => {
        console.error('Error in user cheer subscription:', error);
      }
    );
    
    return userCheerUnsubscribe;
  }

  // Return combined unsubscribe function
  return () => {
    if (mealUnsubscribe) {
      mealUnsubscribe();
    }
  };
};

/**
 * Get total cheers count for a user across all their meals
 */
export const getTotalCheersForUser = async (userId: string): Promise<number> => {
  try {
    // Get all meal entries for the user
    const mealEntriesSnapshot = await firestore()
      .collection('mealEntries')
      .where('userId', '==', userId)
      .get();

    let totalCheers = 0;
    
    // Sum up cheers count from all meals
    mealEntriesSnapshot.forEach(doc => {
      const mealData = doc.data();
      totalCheers += mealData.cheersCount || 0;
    });

    return totalCheers;
  } catch (error) {
    console.error('Error getting total cheers for user:', error);
    return 0;
  }
};

export default {
  addCheer,
  removeCheer,
  getCheersData,
  toggleCheer,
  subscribeToCheersData,
  getTotalCheersForUser
};