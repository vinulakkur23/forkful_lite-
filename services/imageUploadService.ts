/**
 * Image Upload Service
 * Shared service for uploading images to Firebase Storage
 */

import { firebase, auth, storage } from '../firebaseConfig';
import RNFS from 'react-native-fs';

/**
 * Upload an image to Firebase Storage
 * @param imageUri - Local URI of the image to upload
 * @param userId - User ID for organizing storage
 * @returns Download URL of the uploaded image
 */
export const uploadImageToFirebase = async (imageUri: string, userId: string): Promise<string> => {
  try {
    console.log('📤 Uploading image to Firebase Storage...');

    // Check authentication first
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('User not authenticated');
    }

    // Refresh auth token to ensure we have valid credentials
    try {
      await currentUser.reload();
      await currentUser.getIdToken(true); // Force refresh
      console.log('✅ Auth token refreshed successfully');
    } catch (authError) {
      console.error('❌ Auth token refresh failed:', authError);
      throw new Error('Authentication failed - please log in again');
    }

    // Generate unique filename
    const timestamp = new Date().getTime();
    const randomString = Math.random().toString(36).substring(7);
    const filename = `meal_${userId}_${timestamp}_${randomString}.jpg`;

    // Create storage reference
    const storageRef = storage().ref(`meal_photos/${userId}/${filename}`);

    console.log('📤 Uploading to path:', `meal_photos/${userId}/${filename}`);

    // Read the file as base64 (more reliable than putFile for some platforms)
    const base64Data = await RNFS.readFile(imageUri, 'base64');
    const dataUrl = `data:image/jpeg;base64,${base64Data}`;

    // Upload using putString with data URL
    await storageRef.putString(dataUrl, 'data_url');

    // Get download URL
    const downloadURL = await storageRef.getDownloadURL();
    console.log('✅ Image uploaded successfully:', downloadURL);

    return downloadURL;
  } catch (error) {
    console.error('❌ Error uploading image to Firebase:', error);
    throw error;
  }
};
