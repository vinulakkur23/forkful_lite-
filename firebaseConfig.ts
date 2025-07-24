import { firebase } from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Your Firebase configuration - Explorer project config
const firebaseConfig = {
  apiKey: "AIzaSyC1DaoxD2IKXUuxb0YRGXn_TfZhz1eNGUc",
  authDomain: "dishitout-explorer.firebaseapp.com",
  projectId: "dishitout-explorer",
  storageBucket: "dishitout-explorer.firebasestorage.app",
  messagingSenderId: "498038344155",
  appId: "1:498038344155:ios:c7ba5226fe3e7d53883ffe",
  measurementId: "G-1D131XEPV1"
};

// Initialize Firebase if it's not already initialized
if (!firebase.apps.length) {
  console.log("Initializing Firebase from firebaseConfig.ts");
  firebase.initializeApp(firebaseConfig);
} else {
  console.log("Firebase already initialized, using existing app");
}

// Re-export Firebase storage to ensure it's using the right app
const firebaseStorage = firebase.app().storage();

// Configure Google Sign-In
GoogleSignin.configure({
  webClientId: '498038344155-52mk6j6dhpnq8m9nu9ski5psn185anie.apps.googleusercontent.com', // Get this from Firebase console
});

// Setup Firestore
const db = firestore();
db.settings({
  persistence: true,  // Enable offline data persistence
});

export {
  firebase,
  auth,
  firestore,
  storage,
  firebaseStorage, // Export the explicitly initialized storage
  db,
  GoogleSignin
};