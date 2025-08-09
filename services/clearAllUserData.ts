import { auth, firestore } from '../firebaseConfig';

export const clearAllUserData = async () => {
  try {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      console.log('No user logged in');
      return { success: false, message: 'No user logged in' };
    }

    const userId = currentUser.uid;
    console.log(`Clearing all data for user: ${userId}`);

    let totalDeleted = 0;
    const deletePromises = [];

    // === CLEAR STAMPS/ACHIEVEMENTS ===
    console.log('🏆 Clearing stamps/achievements...');
    
    // Clear achievements from NEW format: users/{userId}/achievements subcollection
    const newFormatRef = firestore()
      .collection('users')
      .doc(userId)
      .collection('achievements');

    const newFormatSnapshot = await newFormatRef.get();
    
    // Also clear achievements from OLD format: userAchievements flat collection
    const oldFormatRef = firestore().collection('userAchievements');
    const oldFormatSnapshot = await oldFormatRef.where('userId', '==', userId).get();

    const totalAchievements = newFormatSnapshot.size + oldFormatSnapshot.size;
    console.log(`Found ${totalAchievements} stamps to clear`);

    // Add achievement deletion promises
    deletePromises.push(
      ...newFormatSnapshot.docs.map(doc => {
        console.log(`  - Deleting stamp: ${doc.id}`);
        return doc.ref.delete();
      }),
      ...oldFormatSnapshot.docs.map(doc => {
        console.log(`  - Deleting old format stamp: ${doc.id}`);
        return doc.ref.delete();
      })
    );

    totalDeleted += totalAchievements;

    // === CLEAR CHALLENGES ===
    console.log('🍽️ Clearing challenges...');
    
    const challengesRef = firestore()
      .collection('users')
      .doc(userId)
      .collection('challenges');

    const challengesSnapshot = await challengesRef.get();
    console.log(`Found ${challengesSnapshot.size} challenges to clear`);

    // Add challenge deletion promises
    deletePromises.push(
      ...challengesSnapshot.docs.map(doc => {
        console.log(`  - Deleting challenge: ${doc.id} (${doc.data().recommended_dish_name || 'Unknown'})`);
        return doc.ref.delete();
      })
    );

    totalDeleted += challengesSnapshot.size;

    // === CLEAR CITY DATA ===
    console.log('🌎 Clearing city data...');
    
    // Get user document to check for uniqueCities
    const userDocRef = firestore().collection('users').doc(userId);
    const userDoc = await userDocRef.get();
    const userData = userDoc.data();
    const uniqueCities = userData?.uniqueCities || [];

    console.log(`Found ${uniqueCities.length} cities in user profile: ${uniqueCities.join(', ')}`);

    // Clear the uniqueCities array from user profile
    if (uniqueCities.length > 0) {
      deletePromises.push(
        userDocRef.update({
          uniqueCities: []
        })
      );
      console.log('  - Clearing uniqueCities array from user profile');
    }

    // Note: We're not deleting from cityImages collection as those might be shared
    // across users. Only clearing the user's personal city list.

    // === EXECUTE ALL DELETIONS ===
    if (deletePromises.length === 0) {
      console.log('No data found to clear');
      return { success: true, message: 'No data found to clear' };
    }

    console.log(`Executing ${deletePromises.length} deletion operations...`);
    await Promise.all(deletePromises);

    const summary = `Successfully cleared ${totalAchievements} stamps, ${challengesSnapshot.size} challenges, and ${uniqueCities.length} cities`;
    console.log('✅ All data cleared successfully');
    console.log(summary);
    
    return { 
      success: true, 
      message: summary,
      details: {
        stamps: totalAchievements,
        challenges: challengesSnapshot.size,
        cities: uniqueCities.length,
        totalOperations: deletePromises.length
      }
    };

  } catch (error) {
    console.error('Error clearing all user data:', error);
    return { 
      success: false, 
      message: `Error clearing data: ${error.message}` 
    };
  }
};

// Function to run the comprehensive clear operation
export const runClearAllUserData = async () => {
  console.log('🧹 Starting comprehensive data clearing process...');
  const result = await clearAllUserData();
  
  if (result.success) {
    console.log('✅', result.message);
    if (result.details) {
      console.log('📊 Details:', result.details);
    }
  } else {
    console.log('❌', result.message);
  }
  
  return result;
};