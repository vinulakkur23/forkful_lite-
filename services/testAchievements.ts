import { firestore } from '../firebaseConfig';
import { Achievement, UserAchievement } from '../types/achievements';

// This file contains test functions to help with testing the achievements system

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