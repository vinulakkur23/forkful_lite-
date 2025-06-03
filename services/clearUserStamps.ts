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

    // Get reference to user's achievements collection
    const achievementsRef = firestore()
      .collection('users')
      .doc(userId)
      .collection('achievements');

    // Get all achievements
    const snapshot = await achievementsRef.get();
    
    if (snapshot.empty) {
      console.log('No stamps found to clear');
      return { success: true, message: 'No stamps found to clear' };
    }

    console.log(`Found ${snapshot.size} stamps to clear`);

    // Delete each achievement
    const deletePromises = snapshot.docs.map(doc => {
      console.log(`Deleting stamp: ${doc.id}`);
      return doc.ref.delete();
    });

    await Promise.all(deletePromises);

    console.log('All stamps cleared successfully');
    return { 
      success: true, 
      message: `Successfully cleared ${snapshot.size} stamps`,
      clearedCount: snapshot.size
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