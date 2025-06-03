// Test script to clear user stamps
// Run this with: npx ts-node services/testClearStamps.ts

import { initializeApp } from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import { clearUserStamps } from './clearUserStamps';

// Note: This is a test script meant to be run in a React Native environment
// You'll need to call this function from within your app

const testClearStamps = async () => {
  try {
    // Check if user is logged in
    const currentUser = auth().currentUser;
    
    if (!currentUser) {
      console.log('❌ No user is currently logged in');
      console.log('Please log in to the app first before running this test');
      return;
    }

    console.log(`📧 Current user: ${currentUser.email}`);
    console.log(`🆔 User ID: ${currentUser.uid}`);
    
    // Clear the stamps
    console.log('\n🧹 Clearing all stamps...');
    const result = await clearUserStamps();
    
    if (result.success) {
      console.log(`\n✅ ${result.message}`);
      if (result.clearedCount) {
        console.log(`📊 Total stamps cleared: ${result.clearedCount}`);
      }
    } else {
      console.log(`\n❌ Failed: ${result.message}`);
    }
    
  } catch (error) {
    console.error('❌ Error in test:', error);
  }
};

// Export the function so it can be called from the app
export { testClearStamps };