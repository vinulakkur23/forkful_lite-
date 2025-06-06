import { auth, firestore } from '../firebaseConfig';

export const clearUserStamps = async () => {
  try {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      console.log('No user logged in');
      return { success: false, message: 'No user logged in' };
    }

    const userId = currentUser.uid;
    console.log(`Clearing stamps for user: ${userId}`);

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
    
    console.log(`New format achievements: ${newFormatSnapshot.size}`);
    console.log(`Old format achievements: ${oldFormatSnapshot.size}`);
    console.log(`Total achievements to clear: ${totalAchievements}`);
    
    if (totalAchievements === 0) {
      console.log('No stamps found to clear');
      return { success: true, message: 'No stamps found to clear' };
    }

    // Log each stamp being found
    console.log('New format stamps:');
    newFormatSnapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log(`  - ${doc.id}:`, data);
    });
    
    console.log('Old format stamps:');
    oldFormatSnapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log(`  - ${doc.id}:`, data);
    });

    // Delete achievements from both formats
    const deletePromises = [
      ...newFormatSnapshot.docs.map(doc => {
        console.log(`Deleting new format stamp: ${doc.id}`);
        return doc.ref.delete();
      }),
      ...oldFormatSnapshot.docs.map(doc => {
        console.log(`Deleting old format stamp: ${doc.id}`);
        return doc.ref.delete();
      })
    ];

    await Promise.all(deletePromises);

    console.log('All stamps cleared successfully');
    return { 
      success: true, 
      message: `Successfully cleared ${totalAchievements} stamps`,
      clearedCount: totalAchievements
    };

  } catch (error) {
    console.error('Error clearing stamps:', error);
    return { 
      success: false, 
      message: `Error clearing stamps: ${error.message}` 
    };
  }
};

// Function to run the clear stamps operation
export const runClearStamps = async () => {
  console.log('Starting stamp clearing process...');
  const result = await clearUserStamps();
  
  if (result.success) {
    console.log('✅', result.message);
  } else {
    console.log('❌', result.message);
  }
  
  return result;
};