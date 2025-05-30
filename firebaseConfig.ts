import { firebase } from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Your Firebase configuration - replace with your actual Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBw89gPw8CjF__uelKgPbvxB-JrK91tOvw",
  authDomain: "mealratingapp.firebaseapp.com",
  projectId: "mealratingapp",
  storageBucket: "mealratingapp.appspot.com",
  messagingSenderId: "476812977799",
  appId: "1:476812977799:web:7f1c18d1be5b424706fa22",
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
  webClientId: '476812977799-7dmlpm8g3plslrsftesst7op6ipm71a4.apps.googleusercontent.com', // Get this from Firebase console
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