import { firebase } from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Your Firebase configuration - Forkful Lite project config
const firebaseConfig = {
  apiKey: "AIzaSyCgus61osM-9Qu6Z05-KA-s070e99vFtUg",
  authDomain: "forkful-lite.firebaseapp.com",
  projectId: "forkful-lite",
  storageBucket: "forkful-lite.firebasestorage.app",
  messagingSenderId: "219668861569",
  appId: "1:219668861569:ios:b4c5f776e2bced10ffb380"
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
  webClientId: '219668861569-qm93jan5voigimfur98slrudb78r6uvp.apps.googleusercontent.com', // Get this from Firebase console
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