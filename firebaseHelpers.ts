import { Platform } from 'react-native';
import auth from '@react-native-firebase/auth';
import storage from '@react-native-firebase/storage';
import firestore from '@react-native-firebase/firestore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// User authentication helpers
export const signInWithGoogle = async () => {
  try {
    // Check if device supports Google Play services
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // Get the user ID token
    const { idToken } = await GoogleSignin.signIn();

    // Create a Google credential with the token
    const googleCredential = auth.GoogleAuthProvider.credential(idToken);

    // Sign-in with credential
    return auth().signInWithCredential(googleCredential);
  } catch (error) {
    console.error('Google Sign-In error:', error);
    throw error;
  }
};

export const signOut = async () => {
  try {
    await GoogleSignin.revokeAccess();
    await GoogleSignin.signOut();
    await auth().signOut();
  } catch (error) {
    console.error('Sign out error:', error);
    throw error;
  }
};

// Storage helpers
export const uploadImage = async (uri: string, path: string): Promise<string> => {
  try {
    // Fix for iOS file:// paths
    let uploadUri = uri;
    if (Platform.OS === 'ios' && uri.startsWith('file://')) {
      uploadUri = uri.substring(7);
    }

    // Create a storage reference
    const storageRef = storage().ref(path);

    // Upload the file
    await storageRef.putFile(uploadUri);

    // Get download URL
    const url = await storageRef.getDownloadURL();

    return url;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
};

// Firestore helpers
export const saveMealEntry = async (mealData: {
  photoUri: string;
  rating: number;
  restaurant?: string;
  meal?: string;
  location?: { latitude: number; longitude: number } | null;
  mealType?: string;
  comments?: { liked: string; disliked: string };
}) => {
  try {
    const user = auth().currentUser;
    if (!user) throw new Error('User not authenticated');

    // Generate a unique image filename
    const timestamp = new Date().getTime();
    const imagePath = `meals/${user.uid}/${timestamp}.jpg`;

    // Upload the image to Firebase Storage
    const photoUrl = await uploadImage(mealData.photoUri, imagePath);

    // Generate date metadata from current timestamp
    const mealDate = new Date(timestamp);
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][mealDate.getDay()];
    const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][mealDate.getMonth()];
    const year = mealDate.getFullYear();

    // Extract location metadata if available
    let locationMetadata = null;
    if (mealData.location) {
      locationMetadata = {
        latitude: mealData.location.latitude,
        longitude: mealData.location.longitude,
        source: mealData.location.source || 'unknown',
      };
    }

    // Save the meal data to Firestore
    const firestoreData = {
      userId: user.uid,
      photoUrl,
      rating: mealData.rating,
      restaurant: mealData.restaurant || '',
      meal: mealData.meal || '',
      location: mealData.location,
      mealType: mealData.mealType || '',
      comments: mealData.comments || { liked: '', disliked: '' },
      createdAt: firestore.FieldValue.serverTimestamp(),

      // Add new metadata fields
      dateMetadata: {
        dayOfWeek,
        month,
        year,
        timestamp
      },

      // Initialize AI metadata as empty - will be filled by backend service
      aiMetadata: {
        cuisineType: 'Unknown',
        foodType: 'Unknown',
        mealType: 'Unknown',
        primaryProtein: 'Unknown',
        dietType: 'Unknown',
        eatingMethod: 'Unknown',
        setting: 'Unknown',
        platingStyle: 'Unknown',
        beverageType: 'Unknown'
      }
    };

    // Add to 'mealEntries' collection
    const docRef = await firestore().collection('mealEntries').add(firestoreData);

    return {
      id: docRef.id,
      ...firestoreData
    };
  } catch (error) {
    console.error('Error saving meal entry:', error);
    throw error;
  }
};

export const getMealEntries = async () => {
  try {
    const user = auth().currentUser;
    if (!user) throw new Error('User not authenticated');

    const querySnapshot = await firestore()
      .collection('mealEntries')
      .where('userId', '==', user.uid)
      .orderBy('createdAt', 'desc')
      .get();

    const meals: any[] = [];

    querySnapshot.forEach((doc) => {
      meals.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return meals;
  } catch (error) {
    console.error('Error fetching meal entries:', error);
    throw error;
  }
};

export const deleteMealEntry = async (mealId: string) => {
  try {
    const user = auth().currentUser;
    if (!user) throw new Error('User not authenticated');

    // Get the document first to get the image URL
    const docRef = await firestore().collection('mealEntries').doc(mealId).get();

    if (!docRef.exists) throw new Error('Meal entry not found');

    const data = docRef.data();

    // Verify the current user owns this meal entry
    if (data?.userId !== user.uid) {
      throw new Error('You do not have permission to delete this meal entry');
    }

    // Delete the image from storage if it exists
    if (data?.photoUrl) {
      try {
        const storageRef = storage().refFromURL(data.photoUrl);
        await storageRef.delete();
      } catch (storageError) {
        console.error('Error deleting image from storage:', storageError);
        // Continue with document deletion even if image deletion fails
      }
    }

    // Delete the document from Firestore
    await firestore().collection('mealEntries').doc(mealId).delete();

    return true;
  } catch (error) {
    console.error('Error deleting meal entry:', error);
    throw error;
  }
};