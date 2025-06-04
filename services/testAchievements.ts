import { firestore } from '../firebaseConfig';
import { Achievement, UserAchievement } from '../types/achievements';

// This file contains test functions to help with testing the achievements system

// Function to check Manu Lakkur's stamps
export const checkManuLakkurStamps = async (): Promise<void> => {
  try {
    console.log('🔍 Searching for Manu Lakkur...');
    
    // Search for Manu Lakkur in users collection
    const usersSnapshot = await firestore()
      .collection('users')
      .where('displayName', '>=', 'Manu Lakkur')
      .where('displayName', '<=', 'Manu Lakkur\uf8ff')
      .get();
    
    console.log(`Found ${usersSnapshot.size} users matching "Manu Lakkur"`);
    
    if (usersSnapshot.empty) {
      console.log('❌ No user found with displayName "Manu Lakkur"');
      
      // Try searching all users with partial name match
      console.log('🔄 Searching all users for partial match...');
      const allUsersSnapshot = await firestore()
        .collection('users')
        .limit(50)
        .get();
      
      console.log(`📊 Total users in database: ${allUsersSnapshot.size}`);
      
      const matchingUsers: any[] = [];
      allUsersSnapshot.docs.forEach(doc => {
        const userData = doc.data();
        const searchTerm = 'manu';
        
        const possibleNames = [
          userData.displayName,
          userData.name,
          userData.fullName,
          userData.userName,
          userData.username,
          userData.email?.split('@')[0]
        ].filter(Boolean);
        
        const matchingName = possibleNames.find(name => 
          name?.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        if (matchingName) {
          matchingUsers.push({
            userId: doc.id,
            displayName: userData.displayName,
            email: userData.email,
            matchingField: matchingName
          });
        }
      });
      
      console.log(`Found ${matchingUsers.length} users with "manu" in their name:`);
      matchingUsers.forEach(user => {
        console.log(`  - ${user.displayName} (${user.email}) [ID: ${user.userId}]`);
      });
      
      if (matchingUsers.length > 0) {
        // Check stamps for the first matching user
        const targetUser = matchingUsers[0];
        console.log(`\n🎯 Checking stamps for ${targetUser.displayName}...`);
        await checkUserStamps(targetUser.userId);
      }
      
      return;
    }
    
    // Found user with exact match
    const userData = usersSnapshot.docs[0].data();
    const userId = usersSnapshot.docs[0].id;
    
    console.log(`✅ Found user: ${userData.displayName} (${userData.email}) [ID: ${userId}]`);
    
    await checkUserStamps(userId);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

const checkUserStamps = async (userId: string): Promise<void> => {
  try {
    console.log(`\n🏆 Checking stamps for user ID: ${userId}`);
    
    // Check achievements in the user's subcollection
    const achievementsSnapshot = await firestore()
      .collection('users')
      .doc(userId)
      .collection('achievements')
      .get();
    
    console.log(`📝 Stamps found: ${achievementsSnapshot.size}`);
    
    if (achievementsSnapshot.empty) {
      console.log('❌ No stamps found for this user');
    } else {
      console.log('\n📋 Stamps details:');
      achievementsSnapshot.docs.forEach((doc, index) => {
        const achievementData = doc.data();
        console.log(`  ${index + 1}. ${achievementData.achievementId} (earned: ${achievementData.earnedAt?.toDate?.() || 'unknown'})`);
      });
    }
    
    // Also check old format in userAchievements collection
    const oldFormatSnapshot = await firestore()
      .collection('userAchievements')
      .where('userId', '==', userId)
      .get();
    
    if (!oldFormatSnapshot.empty) {
      console.log(`\n📝 Old format stamps found: ${oldFormatSnapshot.size}`);
      oldFormatSnapshot.docs.forEach((doc, index) => {
        const achievementData = doc.data();
        console.log(`  ${index + 1}. ${achievementData.achievementId} (earned: ${achievementData.earnedAt?.toDate?.() || 'unknown'})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error checking stamps:', error);
  }
};

// Add test user achievements to the user's account
export const addTestUserAchievements = async (userId: string): Promise<boolean> => {
  try {
    // Check if the user already has any achievements
    const existingSnapshot = await firestore()
      .collection('userAchievements')
      .where('userId', '==', userId)
      .get();
    
    // If they already have achievements, don't add test ones
    if (!existingSnapshot.empty) {
      console.log('User already has achievements, skipping test data');
      return false;
    }
    
    // Otherwise, add the test achievements
    const batch = firestore().batch();
    
    // First Bite achievement (first post)
    const firstBiteRef = firestore().collection('userAchievements').doc();
    batch.set(firstBiteRef, {
      userId,
      achievementId: 'first_bite',
      earnedAt: firestore.FieldValue.serverTimestamp(),
      mealEntryId: 'test-meal-id'
    });
    
    // Success!
    await batch.commit();
    console.log('Added test achievements for user', userId);
    return true;
  } catch (error) {
    console.error('Error adding test achievements:', error);
    return false;
  }
};

// Reset all achievements for testing
export const resetUserAchievements = async (userId: string): Promise<boolean> => {
  try {
    const snapshot = await firestore()
      .collection('userAchievements')
      .where('userId', '==', userId)
      .get();
    
    if (snapshot.empty) {
      console.log('No achievements to reset');
      return true;
    }
    
    const batch = firestore().batch();
    snapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log('Reset all achievements for user', userId);
    return true;
  } catch (error) {
    console.error('Error resetting achievements:', error);
    return false;
  }
};