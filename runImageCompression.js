// Simple script to call the image compression function
const { initializeApp } = require('firebase-admin/app');
const { getFunctions } = require('firebase-admin/functions');

// Initialize Firebase Admin
initializeApp();

async function runImageCompression() {
  try {
    console.log('Starting image compression...');
    
    // Call the function directly
    const functions = getFunctions();
    const result = await functions.taskQueue('compressExistingImages').enqueue({});
    
    console.log('Image compression initiated:', result);
  } catch (error) {
    console.error('Error running image compression:', error);
  }
}

runImageCompression();