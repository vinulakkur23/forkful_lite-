import { auth, firestore } from '../firebaseConfig';

/**
 * Updates all meal entries for the current user to include their display name and photo
 * This is useful for migrating existing data after fixing the Google Sign-In profile update
 */
export async function updateUserMealsWithProfile() {
  try {
    const currentUser = auth().currentUser;
    
    if (!currentUser) {
      console.log('No user logged in, cannot update meals');
      return { success: false, error: 'No user logged in' };
    }
    
    if (!currentUser.displayName) {
      console.log('Current user has no display name, cannot update meals');
      return { success: false, error: 'User has no display name' };
    }
    
    console.log('Starting meal entries update for user:', currentUser.uid);
    console.log('Display name:', currentUser.displayName);
    console.log('Photo URL:', currentUser.photoURL);
    
    // Query all meals for the current user
    const mealsSnapshot = await firestore()
      .collection('mealEntries')
      .where('userId', '==', currentUser.uid)
      .get();
    
    console.log(`Found ${mealsSnapshot.size} meals to potentially update`);
    
    let updatedCount = 0;
    const updatePromises: Promise<void>[] = [];
    
    mealsSnapshot.forEach((doc) => {
      const mealData = doc.data();
      
      // Check if this meal needs updating
      const needsUserNameUpdate = !mealData.userName || mealData.userName === 'Anonymous User';
      const needsUserPhotoUpdate = currentUser.photoURL && !mealData.userPhoto;
      
      if (needsUserNameUpdate || needsUserPhotoUpdate) {
        const updateData: any = {};
        
        if (needsUserNameUpdate) {
          updateData.userName = currentUser.displayName;
        }
        
        if (needsUserPhotoUpdate) {
          updateData.userPhoto = currentUser.photoURL;
        }
        
        console.log(`Updating meal ${doc.id} with:`, updateData);
        
        const updatePromise = firestore()
          .collection('mealEntries')
          .doc(doc.id)
          .update(updateData)
          .then(() => {
            updatedCount++;
          });
        
        updatePromises.push(updatePromise);
      }
    });
    
    // Wait for all updates to complete
    await Promise.all(updatePromises);
    
    console.log(`Successfully updated ${updatedCount} meal entries`);
    
    return {
      success: true,
      totalMeals: mealsSnapshot.size,
      updatedMeals: updatedCount
    };
  } catch (error) {
    console.error('Error updating user meals with profile:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check if the current user's meals need profile migration
 */
export async function checkIfMigrationNeeded(): Promise<boolean> {
  try {
    const currentUser = auth().currentUser;
    
    if (!currentUser || !currentUser.displayName) {
      return false;
    }
    
    // Query meals that might need updating
    const needsUpdateSnapshot = await firestore()
      .collection('mealEntries')
      .where('userId', '==', currentUser.uid)
      .where('userName', 'in', ['Anonymous User', ''])
      .limit(1)
      .get();
    
    return !needsUpdateSnapshot.empty;
  } catch (error) {
    console.error('Error checking migration status:', error);
    return false;
  }
}