import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Share, Alert, ActivityIndicator, Platform, SafeAreaView, ScrollView } from 'react-native';
import ImageResizer from 'react-native-image-resizer';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import { CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, TabParamList } from '../App';
import EmojiDisplay from '../components/EmojiDisplay';
// Import Firebase from our central config
import { firebase, auth, firestore, storage, firebaseStorage } from '../firebaseConfig';
// Import AI metadata service
import { processImageMetadata } from '../services/aiMetadataService';
// Import enhanced metadata service - COMMENTED OUT, using combined service instead
// import { extractEnhancedMetadata } from '../services/enhancedMetadataService';
// Import dish criteria service
import { getDishCriteria, linkCriteriaToMeal } from '../services/dishCriteriaService';
// Import achievement service
import { checkAchievements } from '../services/achievementService';
import { Achievement } from '../types/achievements';
// Import enhanced metadata facts service
import { extractEnhancedMetadataFacts, EnhancedFactsData } from '../services/enhancedMetadataFactsService';
// Removed meal enhancement service - no longer used

type ResultScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Result'>,
  StackNavigationProp<RootStackParamList>
>;

type ResultScreenRouteProp = RouteProp<TabParamList, 'Result'>;

type Props = {
  navigation: ResultScreenNavigationProp;
  route: ResultScreenRouteProp;
};

// Define possible meal types
type MealType = "Restaurant" | "Homemade";

const ResultScreen: React.FC<Props> = ({ route, navigation }) => {
  const {
    photo,
    location,
    rating,
    restaurant,
    meal,
    mealType = "Restaurant",
    thoughts = '',
    // Keep for backward compatibility
    likedComment = '',
    dislikedComment = '',
    // New: Enhanced metadata and dish criteria
    enhancedMetadata,
    dishCriteria,
    // Combined result for backward compatibility
    combinedResult,
    // NEW: Quick criteria result from fast service
    quickCriteriaResult
  } = route.params;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [mealId, setMealId] = useState<string | null>(null);
  // Enhanced metadata facts state
  const [enhancedFacts, setEnhancedFacts] = useState<EnhancedFactsData | null>(null);
  const [enhancedFactsLoading, setEnhancedFactsLoading] = useState(false);
  // Remove meal enhancement states - no longer used
  
  // Generate a unique instance key for this specific navigation
  const instanceKey = `${photo?.uri || ''}`;

  // Initialization effect - runs only once per instance
  useEffect(() => {
    console.log("ResultScreen mounted with key:", instanceKey);

    // Validate the photo object
    if (!photo || !photo.uri) {
      console.error("Invalid photo object in ResultScreen:", photo);
      Alert.alert(
        "Error",
        "Invalid photo data received. Please try again.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
      return;
    }

    // Log photo information for debugging
    console.log("Photo received in ResultScreen:", {
      uri: photo.uri,
      hasWidth: !!photo.width,
      hasHeight: !!photo.height
    });

    // Log location information for debugging
    console.log("Location received in ResultScreen:", location ? {
      latitude: location.latitude,
      longitude: location.longitude,
      source: location.source || 'unknown'
    } : 'No location data');
    
    // Reset states when a new instance is detected
    setSaving(false);
    setSaved(false);
    setPhotoUrl(null);
    
    // If user is logged in, save data automatically (only once per instance)
    const user = auth().currentUser;
    if (user) {
      // Small delay to ensure component renders first
      setTimeout(() => {
        console.log("Triggering save to Firebase");
        saveToFirebase();
      }, 100);
    }
    
    return () => {
      console.log("ResultScreen with key unmounting:", instanceKey);
    };
  }, [instanceKey]); // Only depend on instanceKey for initialization
  
  // Enhanced facts loading effect - separate from initialization
  useEffect(() => {
    // Load enhanced metadata facts if we have quick criteria data
    if (quickCriteriaResult && !enhancedFacts && !enhancedFactsLoading) {
      loadEnhancedMetadataFacts();
    }
  }, [quickCriteriaResult, enhancedFacts, enhancedFactsLoading]);

  // Load enhanced metadata facts for detailed information
  const loadEnhancedMetadataFacts = async () => {
    if (!quickCriteriaResult || !photo?.uri) {
      console.log("Cannot load enhanced facts - missing quick criteria or photo");
      return;
    }
    
    console.log("Loading enhanced metadata and facts...");
    setEnhancedFactsLoading(true);
    
    try {
      // Extract city from location or restaurant
      let city = '';
      if (location && location.city) {
        city = location.city;
      } else if (restaurant) {
        const restaurantParts = restaurant.split(',');
        if (restaurantParts.length > 1) {
          city = restaurantParts[1].trim();
        }
      }
      
      const result = await extractEnhancedMetadataFacts(
        photo.uri,
        quickCriteriaResult.dish_specific,
        quickCriteriaResult.dish_general,
        quickCriteriaResult.cuisine_type,
        meal,
        restaurant,
        city
      );
      
      if (result) {
        console.log("Enhanced metadata and facts loaded successfully");
        setEnhancedFacts(result);
        
        // Update Firebase with enhanced facts if we have a meal ID
        if (mealId && saved) {
          updateMealWithEnhancedFacts(mealId, result);
        }
      } else {
        console.log("Failed to load enhanced metadata and facts");
      }
    } catch (error) {
      console.error("Error loading enhanced metadata and facts:", error);
    } finally {
      setEnhancedFactsLoading(false);
    }
  };

  // Update Firebase meal with enhanced metadata facts
  const updateMealWithEnhancedFacts = async (mealId: string, facts: EnhancedFactsData) => {
    try {
      console.log("Updating meal with enhanced metadata and facts...");
      await firestore().collection('mealEntries').doc(mealId).update({
        enhanced_metadata_facts: facts,
        enhanced_facts_updated_at: firestore.FieldValue.serverTimestamp()
      });
      console.log("Successfully updated meal with enhanced facts");
    } catch (error) {
      console.error("Error updating meal with enhanced facts:", error);
    }
  };

  // Removed loadMealEnhancement function - no longer using meal enhancement service

  const uploadImageToFirebase = async (): Promise<string> => {
    // Get current user directly from auth module
    const user = auth().currentUser;
    if (!user) throw new Error('User not logged in');

    try {
      // Force user token refresh to ensure we have the latest authentication token
      // Using a more robust approach to token refresh
      console.log("Attempting to refresh Firebase ID token");
      
      // First try to re-authenticate the user
      await auth().currentUser?.reload();
      
      // Then get a fresh token
      const idToken = await user.getIdToken(true); // true forces a refresh
      console.log("Refreshed ID token obtained successfully");
      
      // Verify Firebase app is properly initialized
      console.log("Checking Firebase app initialization:", {
        appName: firebase.app().name,
        appOptions: firebase.app().options ? "Configured" : "Missing",
      });
    } catch (tokenError) {
      console.error("Error refreshing token:", tokenError);
      
      // Log more detailed error information
      if (tokenError instanceof Error) {
        console.error("Token error details:", {
          message: tokenError.message,
          stack: tokenError.stack,
          name: tokenError.name
        });
      }
      
      // Rather than silently continuing, try to sign out and sign back in for critical errors
      if (tokenError.message?.includes('auth/requires-recent-login')) {
        console.log("Authentication requires re-login. Redirecting to login screen.");
        Alert.alert(
          "Session Expired",
          "Your login session has expired. Please sign in again.",
          [{ text: "OK", onPress: () => {
            auth().signOut().then(() => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            });
          }}]
        );
        throw new Error('Authentication requires re-login');
      }
      
      // Continue anyway - the existing token might still be valid
      console.log("Continuing with existing token despite refresh error");
    }

    // Debug authentication state
    console.log("Current auth user:", {
      uid: user.uid,
      email: user.email,
      isAnonymous: user.isAnonymous,
      emailVerified: user.emailVerified,
      providerData: user.providerData?.length || 0
    });

    try {
      // Check if photo is defined and has a uri property
      if (!photo || !photo.uri) {
        console.error("Photo object is invalid:", photo);
        throw new Error('Invalid photo object');
      }

      // Extract and normalize the image uri
      // Remove any query parameters that might have been added (like session ID)
      let imageUri = photo.uri.split('?')[0];
      console.log("Original image URI:", photo.uri);
      console.log("Cleaned image URI (no query params):", imageUri);

      // Create a storage reference with a unique filename
      const timestamp = new Date().getTime();
      const filename = `meal_${user.uid}_${timestamp}.jpg`;

      // Debug Firebase Storage configuration
      const storageBucket = storage().app.options.storageBucket;
      console.log("Firebase Storage config:", {
        bucket: storageBucket,
        app: storage().app.name,
        appId: storage().app.options.appId || 'unknown',
        projectId: storage().app.options.projectId || 'unknown'
      });

      // Verify the storage bucket is correctly formatted (should be projectId.appspot.com)
      if (!storageBucket || !storageBucket.includes('appspot.com')) {
        console.warn("Storage bucket appears to be misconfigured:", storageBucket);
      }
      
      // Attempt to reinitialize Firebase to ensure proper configuration
      if (!firebase.apps.length) {
        console.log("No Firebase apps found, initializing...");
        try {
          firebase.initializeApp({
            apiKey: "AIzaSyC1DaoxD2IKXUuxb0YRGXn_TfZhz1eNGUc",
            authDomain: "dishitout-explorer.firebaseapp.com",
            projectId: "dishitout-explorer",
            storageBucket: "dishitout-explorer.firebasestorage.app",
            messagingSenderId: "498038344155",
            appId: "1:498038344155:ios:c7ba5226fe3e7d53883ffe",
            measurementId: "G-1D131XEPV1"
          });
          console.log("Firebase initialized successfully");
        } catch (initError) {
          console.warn("Firebase already initialized, continuing with existing app");
        }
      }

      // Create storage reference with explicit app reference to ensure correct initialization
      console.log("Creating storage reference for path:", `meals/${user.uid}/${filename}`);
      
      // Try using the explicitly initialized storage reference
      let storageRef;
      try {
        console.log("Using explicitly initialized firebaseStorage reference");
        storageRef = firebaseStorage.ref(`meals/${user.uid}/${filename}`);
      } catch (storageRefError) {
        console.error("Error using firebaseStorage, falling back to storage():", storageRefError);
        storageRef = storage().ref(`meals/${user.uid}/${filename}`);
      }
      console.log("Storage reference path:", `meals/${user.uid}/${filename}`);

      let downloadUrl = '';

      // Skip blob approach and directly use putFile which is more reliable
      console.log("Using direct file upload method");

      // Try to normalize URI based on platform
      if (Platform.OS === 'ios') {
        // Make sure we have file:// prefix for iOS
        if (!imageUri.startsWith('file://')) {
          imageUri = `file://${imageUri}`;
        }
        
        // For iOS, sometimes we need to remove the file:// prefix
        // Try both approaches (with and without file://)
        console.log("On iOS, checking if URI needs modification");
        try {
          // Check if the file exists at the given path
          const testPath = imageUri.replace('file://', '');
          console.log("Testing alternate iOS path format:", testPath);
        } catch (e) {
          console.log("Error testing alternate path:", e);
        }
      } else if (Platform.OS === 'android') {
        // Android sometimes needs file:// removed
        if (imageUri.startsWith('file://')) {
          imageUri = imageUri.replace('file://', '');
        }
      }

      console.log("Normalized image URI for upload:", imageUri);
      
      // Check if auth token is available and valid
      try {
        const currentToken = await user.getIdToken(false); // Don't force refresh here
        console.log("Current auth token available:", currentToken ? "Yes" : "No");
        
        if (!currentToken) {
          console.warn("No valid auth token available, attempting to refresh");
          // Wait for a fresh token
          await user.getIdToken(true);
        }
      } catch (tokenCheckError) {
        console.error("Error checking token:", tokenCheckError);
      }

      try {
        // Add additional metadata to help with debugging
        const metadata = {
          contentType: 'image/jpeg',
          customMetadata: {
            userId: user.uid,
            timestamp: timestamp.toString(),
            platform: Platform.OS
          }
        };

        // Try direct upload with metadata - wrap in a retry mechanism
        let uploadAttempts = 0;
        const maxAttempts = 3;
        let uploadError = null;
        
        while (uploadAttempts < maxAttempts) {
          uploadAttempts++;
          console.log(`Upload attempt ${uploadAttempts} of ${maxAttempts}`);
          
          try {
            // Create a new task for each attempt
            const task = storageRef.putFile(imageUri, metadata);
            
            // Add progress monitoring
            task.on('state_changed',
              taskSnapshot => {
                const progress = (taskSnapshot.bytesTransferred / taskSnapshot.totalBytes) * 100;
                console.log(`Upload progress: ${progress.toFixed(2)}%`);
              },
              error => {
                console.error(`Upload error on attempt ${uploadAttempts}:`, error.code, error.message);
                uploadError = error;
                
                // Log detailed error information
                console.error("Upload error details:", {
                  code: error.code,
                  message: error.message,
                  serverResponse: error.serverResponse || 'No server response',
                  stack: error.stack || 'No stack trace'
                });
              }
            );
            
            // Wait for task to complete
            await task;
            console.log(`Direct upload completed successfully on attempt ${uploadAttempts}`);
            
            // Get the download URL
            downloadUrl = await storageRef.getDownloadURL();
            
            // If we got here, upload was successful
            uploadError = null;
            break;
          } catch (error) {
            console.error(`Upload attempt ${uploadAttempts} failed:`, error);
            uploadError = error;
            
            // Wait a short time before retrying
            if (uploadAttempts < maxAttempts) {
              console.log(`Waiting before retry attempt ${uploadAttempts + 1}...`);
              await new Promise(resolve => setTimeout(resolve, 1000 * uploadAttempts));
            }
          }
        }
        
        // If we exhausted all retry attempts and still have an error, throw it
        if (uploadError) {
          console.error(`All ${maxAttempts} upload attempts failed. Last error:`, uploadError);
          throw uploadError;
        }
        
        console.log("Successfully obtained download URL after upload");
      } catch (uploadError) {
        console.error("Direct upload failed:", uploadError);
        // More detailed error information for specific error codes
        if (uploadError.code === 'storage/unauthorized') {
          console.error("Firebase Storage Rules are preventing the upload. Check Firebase Console > Storage > Rules");
          
          // Show a more helpful alert to the user with options
          Alert.alert(
            "Authorization Error",
            "You don't have permission to upload images. This may be due to Firebase Storage security rules or an expired session.",
            [
              {
                text: "Try Again Later",
                style: "cancel"
              },
              {
                text: "Sign Out & Sign In Again",
                onPress: async () => {
                  try {
                    // Sign out the user
                    await auth().signOut();
                    // Navigate to login screen
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'Login' }],
                    });
                  } catch (signOutError) {
                    console.error("Error signing out:", signOutError);
                    Alert.alert("Error", "Failed to sign out. Please restart the app and try again.");
                  }
                }
              }
            ]
          );
        } else if (uploadError.code === 'storage/quota-exceeded') {
          console.error("Storage quota exceeded error");
          Alert.alert("Storage Limit", "The app's storage quota has been exceeded. Please contact support.");
        } else if (uploadError.code === 'storage/retry-limit-exceeded') {
          console.error("Upload retry limit exceeded");
          Alert.alert("Upload Failed", "The upload failed after multiple attempts. Please check your internet connection and try again.");
        } else if (uploadError.code === 'storage/invalid-argument') {
          console.error("Invalid file format or argument");
          Alert.alert("Invalid Image", "The selected image is invalid or corrupted. Please try a different image.");
        } else if (uploadError.code === 'storage/canceled') {
          console.error("Upload was canceled");
          Alert.alert("Upload Canceled", "The image upload was canceled. Please try again.");
        } else {
          console.error("Unhandled storage error code:", uploadError.code);
        }
        
        // Include detailed error logs for debugging
        console.error("Full upload error details:", {
          code: uploadError.code || "unknown",
          message: uploadError.message || "No message",
          name: uploadError.name || "No name",
          stack: uploadError.stack || "No stack trace",
          serverResponse: uploadError.serverResponse || "No server response",
          info: uploadError.info || "No additional info"
        });
        
        throw uploadError;
      }

      console.log("Download URL obtained:", downloadUrl);
      return downloadUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  };

  const saveToFirebase = async (): Promise<void> => {
    // Get current user from the imported auth function
    const user = auth().currentUser;

    try {
      // If user exists, use the more robust token refresh approach
      if (user) {
        console.log("Refreshing user session before saving to Firebase");
        
        // Reload the user to ensure we have the latest auth state
        await auth().currentUser?.reload();
        
        // Force token refresh to ensure we have the latest credentials
        const idToken = await user.getIdToken(true);
        
        console.log("User session refreshed successfully before saving");
        
        // Verify user is properly authenticated
        if (user.uid) {
          console.log("Current user is authenticated with UID:", user.uid);
        } else {
          console.warn("User appears to be authenticated but has no UID");
        }
      }
    } catch (tokenError) {
      console.error("Failed to refresh token:", tokenError);
      
      // Log more detailed error information
      if (tokenError instanceof Error) {
        console.error("Token refresh error details:", {
          message: tokenError.message,
          stack: tokenError.stack,
          name: tokenError.name
        });
      }
      
      // Check for specific auth errors that require re-login
      if (tokenError.message?.includes('auth/requires-recent-login') || 
          tokenError.message?.includes('auth/user-token-expired')) {
        console.log("Authentication requires re-login. Redirecting to login screen.");
        Alert.alert(
          "Session Expired",
          "Your login session has expired. Please sign in again to continue.",
          [{ text: "OK", onPress: () => {
            auth().signOut().then(() => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            });
          }}]
        );
        return; // Stop the save process
      }
      
      // For other errors, try to continue, but warn the user
      Alert.alert(
        "Authentication Warning",
        "There might be issues with your current session. If you experience problems, please try logging out and back in.",
        [{ text: "Continue Anyway" }]
      );
    }

    // Debug authentication state
    console.log("Authentication state in saveToFirebase:", {
      currentUser: user ? {
        uid: user.uid,
        email: user.email,
        isAnonymous: user.isAnonymous,
        emailVerified: user.emailVerified,
        providerCount: user.providerData?.length || 0
      } : null
    });

    if (!user) {
      console.log("No authenticated user found");
      Alert.alert(
        'Not Logged In',
        'Would you like to log in to save this meal to your food passport?',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Log In', onPress: () => navigation.navigate('Login') }
        ]
      );
      return;
    }

    // If already in the process of saving, don't attempt again
    if (saving) {
      console.log("Save already in progress, skipping");
      return;
    }

    try {
      setSaving(true);
      console.log("Setting saving state to true");

      // Generate a unique session ID for this upload
      const sessionId = Math.random().toString(36).substring(2, 15);
      console.log(`Starting new upload session: ${sessionId}`);

      // Log critical Firebase config info for debugging
      console.log("Firebase config:", {
        storageBucket: storage().app.options.storageBucket,
        appId: storage().app.options.appId,
        projectId: storage().app.options.projectId
      });

      try {
        // Upload image to Firebase Storage
        console.log("Starting image upload to Firebase Storage...");
        const imageUrl = await uploadImageToFirebase();
        console.log("Image uploaded successfully:", imageUrl);
        setPhotoUrl(imageUrl);

        // Extract city from location or restaurant field
        let city = '';
        
        // First, check if location already has city info (from restaurant selection in RatingScreen2)
        if (location && location.city) {
          city = location.city;
          console.log(`Using city from location: ${city}`);
        }
        // If no city in location, try to extract from restaurant name
        else if (restaurant) {
          // Try comma pattern: "Restaurant Name, City"
          const restaurantParts = restaurant.split(',');
          if (restaurantParts.length > 1) {
            city = restaurantParts[1].trim();
            console.log(`Extracted city from restaurant name: ${city}`);
            
            // Further clean up city by removing state/zip if present
            // E.g., "Portland, OR 97201" -> "Portland"
            // But preserve multi-word city names like "New Brunswick"
            const cityParts = city.split(' ');
            if (cityParts.length > 1) {
              // Check if last part is a 2-letter state code
              const lastPart = cityParts[cityParts.length - 1];
              if (lastPart.length === 2 && lastPart.toUpperCase() === lastPart) {
                // Remove state code but keep the rest of the city name
                city = cityParts.slice(0, -1).join(' ');
              }
              // Otherwise keep the full city name
            }
          }
        }
        
        // Determine city information
        let cityInfo = '';
        
        // First check if location already has city data
        if (location && location.city) {
          cityInfo = location.city;
          console.log("Using city from location object:", cityInfo);
        } 
        // Next try to extract from restaurant name if provided
        else if (restaurant) {
          const restaurantParts = restaurant.split(',');
          if (restaurantParts.length > 1) {
            const secondPart = restaurantParts[1].trim();
            
            // Keep the full city name (including multi-word cities like "New York")
            // Only remove state codes if they're clearly at the end
            const words = secondPart.split(' ');
            if (words.length > 1 && words[words.length - 1].length === 2 && words[words.length - 1].toUpperCase() === words[words.length - 1]) {
              // Last word is likely a state code (2 uppercase letters), remove it
              cityInfo = words.slice(0, -1).join(' ');
            } else {
              cityInfo = secondPart; // Use the whole part
            }
            
            console.log("Extracted city from restaurant name:", cityInfo);
          }
        }
        
        // Extra logging for debugging
        console.log("Final city info to be saved:", cityInfo);
        
        // Use default photo score since we're no longer using photo enhancement
        const finalPhotoScore = 5; // Default photo score
        
        // Save meal data to Firestore, ensuring location data is preserved
        const mealData = {
          userId: user.uid,
          // Add user name and photo from the authenticated user
          userName: user.displayName || 'Anonymous User',
          userPhoto: user.photoURL || null,
          photoUrl: imageUrl,
          rating,
          restaurant: restaurant || '',
          meal: meal || '',
          mealType: mealType || 'Restaurant', // Include the meal type
          // Store city as a top-level field for easier access and querying
          city: cityInfo ? cityInfo.trim() : '',
          // Include user comments/thoughts about the meal
          comments: thoughts ? {
            thoughts: thoughts
          } : {
            // Fallback to old format for backward compatibility
            liked: likedComment || '',
            disliked: dislikedComment || ''
          },
          // Preserve the location source if available
          location: location ? {
            latitude: location.latitude,
            longitude: location.longitude,
            // Keep the source if it exists ('exif', 'device', 'restaurant_selection', etc.)
            source: location.source || 'unknown',
            // Add a human-readable description of the location source for debugging
            sourceDescription: location.source === 'exif'
              ? 'Photo metadata (EXIF)'
              : location.source === 'restaurant_selection'
                ? `Selected restaurant: ${restaurant}`
                : 'Device location',
            // Always include city in location object for compatibility
            // If location already has city info, use that; otherwise use the extracted cityInfo
            city: location.city ? location.city.trim() : (cityInfo ? cityInfo.trim() : '')
          } : null,
          createdAt: firestore.FieldValue.serverTimestamp(),
          sessionId,
          platform: Platform.OS,
          appVersion: '1.0.0', // Add app version for debugging
          photoScore: finalPhotoScore, // Always save the photo quality score
          // Add enhanced metadata if available (legacy)
          metadata_enriched: enhancedMetadata || null,
          // Add dish criteria if available  
          dish_criteria: dishCriteria || null,
          // Add combined result for backward compatibility
          combined_result: combinedResult || null,
          // NEW: Add quick criteria result from fast service
          quick_criteria_result: quickCriteriaResult || null,
          // NEW: Add enhanced metadata facts (will be updated when loaded)
          enhanced_metadata_facts: enhancedFacts || null
        };
        
        // Final log of what's being saved to database
        console.log("Saving city data:", {
          topLevelCity: mealData.city,
          locationCity: mealData.location ? mealData.location.city : null
        });

        console.log("Attempting to save to Firestore with data:", JSON.stringify({
          ...mealData,
          createdAt: 'Timestamp object'
        }));

        const docRef = await firestore().collection('mealEntries').add(mealData);

        setSaved(true);
        console.log(`Meal saved with ID: ${docRef.id} (session: ${sessionId})`);
        
        // Store the meal ID so we can use it for achievement checking
        setMealId(docRef.id);

        // Process both regular and enhanced metadata in parallel
        console.log("Starting metadata processing and achievement check flow...");
        
        // Enhanced metadata extraction is now handled by combined service in RatingScreen2
        // This separate extraction is no longer needed since we pass combinedResult from RatingScreen2
        
        /* COMMENTED OUT - Using combined service instead
        extractEnhancedMetadata(photo.uri, meal, restaurant, undefined)
          .then(async (enhancedMetadata) => {
            if (enhancedMetadata) {
              console.log("Enhanced metadata extracted successfully:", enhancedMetadata);
              // Update the document with enhanced metadata
              try {
                await firestore().collection('mealEntries').doc(docRef.id).update({
                  metadata_enriched: enhancedMetadata
                });
                console.log("Enhanced metadata saved to Firestore");
                
                // Extract dish criteria based on enhanced metadata
                console.log("Extracting dish criteria for mindful eating...");
                const dishCriteria = await getDishCriteria(
                  enhancedMetadata.dish_specific,
                  enhancedMetadata.dish_general,
                  enhancedMetadata.cuisine_type
                );
                
                if (dishCriteria) {
                  console.log("Dish criteria extracted successfully:", dishCriteria);
                  // Link criteria to the meal
                  await linkCriteriaToMeal(docRef.id, dishCriteria);
                  console.log("Dish criteria linked to meal");
                } else {
                  console.log("No dish criteria could be generated");
                }
                
              } catch (error) {
                console.error("Error saving enhanced metadata or dish criteria:", error);
              }
            }
          })
          .catch(error => {
            console.error("Error extracting enhanced metadata:", error);
          });
        */
        
        // Process regular metadata
        processImageMetadata(docRef.id, imageUrl, {
          mealName: meal || undefined,
          restaurantName: restaurant || undefined,
          thoughts: thoughts || undefined,
          // Keep for backward compatibility
          likedComments: likedComment || undefined,
          dislikedComments: dislikedComment || undefined
        })
          .then(metadata => {
            console.log("AI metadata processed successfully:", metadata);
            
            // Now that we have metadata, create a complete meal entry with it
            const mealEntry = {
              id: docRef.id,
              userId: user.uid,
              // Include user name and photo for consistency
              userName: user.displayName || 'Anonymous User',
              userPhoto: user.photoURL || null,
              photoUrl: imageUrl,
              rating,
              restaurant: restaurant || '',
              meal: meal || '',
              mealType: mealType || 'Restaurant',
              // Include top-level city field for consistency with saved data
              city: cityInfo || '',
              comments: {
                liked: likedComment || '',
                disliked: dislikedComment || ''
              },
              location: location ? {
                latitude: location.latitude,
                longitude: location.longitude,
                source: location.source || 'unknown',
                city: (location.city || cityInfo || '')
              } : null,
              createdAt: new Date().getTime(),
              // IMPORTANT: Include the AI metadata in the achievement check
              aiMetadata: metadata
            };
            
            console.log("Checking achievements with complete metadata...");
            
            // Check for achievements with the metadata included
            return checkAchievements(mealEntry);
          })
          .then(achievements => {
            if (achievements && achievements.length > 0) {
              console.log(`Unlocked ${achievements.length} achievements:`, 
                achievements.map(a => a.name).join(', '));
              
              // Don't set local state - let the global notification handle it
              // The checkAchievements function already emits global notifications
            } else {
              console.log("No achievements unlocked for this meal");
            }
          })
          .catch(error => {
            console.error("Error in metadata/achievement flow:", error);
            
            // Still try to check achievements even if metadata processing failed
            const basicMealEntry = {
              id: docRef.id,
              userId: user.uid,
              photoUrl: imageUrl,
              rating,
              restaurant: restaurant || '',
              meal: meal || '',
              mealType: mealType || 'Restaurant',
              city: cityInfo || '',
              comments: {
                liked: likedComment || '',
                disliked: dislikedComment || ''
              },
              location: location ? {
                latitude: location.latitude,
                longitude: location.longitude,
                source: location.source || 'unknown',
                city: (location.city || cityInfo || '')
              } : null,
              createdAt: new Date().getTime()
              // No aiMetadata here, but non-metadata achievements might still trigger
            };
            
            console.log("Trying fallback achievement check without metadata...");
            return checkAchievements(basicMealEntry);
          })
          .then(fallbackAchievements => {
            // Handle any achievements from fallback check
            if (fallbackAchievements && fallbackAchievements.length > 0) {
              console.log(`Unlocked ${fallbackAchievements.length} achievements from fallback check:`, 
                fallbackAchievements.map(a => a.name).join(', '));
              
              // Store the unlocked achievements
              setUnlockedAchievements(fallbackAchievements);
              
              // Show the first achievement notification
              if (fallbackAchievements.length > 0) {
                setCurrentAchievement(fallbackAchievements[0]);
              }
            }
          })
          .catch(achievementError => {
            console.error("Error checking achievements:", achievementError);
          });
      } catch (storageError) {
        console.error("Storage or Firestore error:", storageError);

        // More detailed error handling based on the error code
        if (storageError.code === 'storage/unauthorized') {
          console.error("Firebase Storage Rules are preventing the upload. Please check your Firebase Console > Storage > Rules");
          Alert.alert(
            'Authorization Error',
            'You don\'t have permission to upload images. This may be due to Firebase Storage security rules.',
            [
              {
                text: 'Try Again',
                onPress: () => {
                  // Force fresh login to get new tokens
                  auth().signOut().then(() => {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'Login' }],
                    });
                  });
                }
              }
            ]
          );
        } else if (storageError.code === 'storage/quota-exceeded') {
          Alert.alert('Storage Limit', 'Your Firebase Storage quota has been exceeded.');
        } else if (storageError.code === 'storage/invalid-argument') {
          Alert.alert('Invalid File', 'The selected image is invalid or corrupted.');
        } else {
          // Generic error
          Alert.alert('Error', `Failed to save your meal: ${storageError.message || 'Unknown error'}`);
        }

        throw storageError; // Re-throw to be caught by the outer catch
      }
    } catch (error) {
      console.error('Error saving meal to Firebase:', error);
      Alert.alert('Error', `Failed to save your meal: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setSaved(false);
    } finally {
      setSaving(false);
      console.log("Setting saving state to false");
    }
  };

  const handleShare = async (): Promise<void> => {
    try {
      // Create share message based on meal type
      const shareMessage = mealType === "Homemade"
        ? `I rated my homemade ${meal || 'meal'} ${rating} stars!`
        : `I rated my ${meal || 'meal'} ${rating} stars${restaurant ? ` at ${restaurant}` : ''}!`;

      await Share.share({
        message: shareMessage,
        url: photoUrl || photo.uri
      });
    } catch (error) {
      console.log('Sharing error:', error);
    }
  };

  // Updated navigation methods with clean reset
  const goHome = (): void => {
    // Navigate to the Home tab with a reset to ensure clean state
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs', params: { screen: 'Home' } }],
    });
  };

  const viewPassport = (): void => {
    // Navigate to the FoodPassport tab with a reset to ensure clean state
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs', params: { screen: 'FoodPassport' } }],
    });
  };

  const goToFoodPassport = (): void => {
    // Navigate to the FoodPassport tab
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs', params: { screen: 'FoodPassport' } }],
    });
  };

  // Handle image load error
  const handleImageError = () => {
    console.log('Image failed to load in ResultScreen');
    setImageError(true);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Meal image card */}
        <View style={styles.imageCard}>
          <View style={styles.imageContainer}>
          {!imageError && photo && photo.uri ? (
            <Image
              source={{ uri: photo.uri }}
              style={styles.image}
              resizeMode="cover"
              onError={handleImageError}
            />
          ) : (
            <View style={styles.noImageContainer}>
              <MaterialIcon name="no-photography" size={64} color="#ccc" />
              <Text style={styles.noImageText}>No image available</Text>
            </View>
          )}
          {saving && (
            <View style={styles.savingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.savingText}>Saving your meal...</Text>
            </View>
          )}
          </View>
        </View>


        {/* Dish Criteria Section - from quick criteria service */}
        {quickCriteriaResult && quickCriteriaResult.dish_criteria && quickCriteriaResult.dish_criteria.length > 0 && (
          <View style={styles.dishCriteriaCard}>
            <Text style={styles.dishCriteriaTitle}>What to Look For 🍽️</Text>
            {quickCriteriaResult.dish_criteria.map((criterion, index) => (
              <View key={index} style={styles.criterionItem}>
                <Text style={styles.criterionTitle}>{criterion.title}</Text>
                <Text style={styles.criterionDescription}>{criterion.description}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Dish History Section - from quick criteria service */}
        {quickCriteriaResult && quickCriteriaResult.dish_history && (
          <View style={styles.dishHistoryCard}>
            <Text style={styles.dishHistoryTitle}>About This Dish 📖</Text>
            <Text style={styles.dishHistoryText}>{quickCriteriaResult.dish_history}</Text>
          </View>
        )}

        {/* Action buttons - now part of scrollable content */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.shareButton}
            onPress={handleShare}
          >
            <Text style={styles.shareButtonText}>Share Review</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.foodPassportButton}
            onPress={goToFoodPassport}
          >
            <Text style={styles.foodPassportButtonText}>Food Passport</Text>
          </TouchableOpacity>

          {!auth().currentUser && (
            <TouchableOpacity
              style={[styles.saveButton, saving || saved ? styles.disabledButton : {}]}
              onPress={saveToFirebase}
              disabled={saving || saved}
            >
              {saving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <MaterialIcon name={saved ? "check" : "save"} size={18} color="white" />
                  <Text style={styles.buttonText}>{saved ? 'Saved' : 'Save'}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF9F6',
    position: 'relative', // Make sure relative positioning is set for absolute children
  },
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20, // Add top padding since we removed the title
    paddingBottom: 30, // Extra padding at bottom
  },
  imageCard: {
    backgroundColor: '#FAF3E0',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  imageContainer: {
    width: '100%',
    height: 320, // Increased height to match MealDetailScreen
    backgroundColor: '#FAF3E0', // Card background color
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  noImageContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  noImageText: {
    marginTop: 10,
    color: '#999',
    fontSize: 16,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  savingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  savingText: {
    color: 'white',
    marginTop: 10,
    fontSize: 16,
  },
  detailsCard: {
    backgroundColor: '#FAF3E0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10, // Reduced from 20
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  mealName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    color: '#1a2b49',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  restaurantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoIcon: {
    marginRight: 8,
  },
  starsContainer: {
    flexDirection: 'row',
  },
  star: {
    marginRight: 5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  restaurantIcon: {
    width: 18,
    height: 18,
    tintColor: '#1a2b49',
    marginRight: 8,
    resizeMode: 'contain',
  },
  restaurantName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  infoLabel: {
    fontWeight: '600',
    marginRight: 10,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    color: '#1a2b49',
  },
  infoValue: {
    flex: 1,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    color: '#1a2b49',
  },
  restaurantInfoContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  additionalRestaurants: {
    width: '100%',
    marginTop: 5,
  },
  additionalRestaurantsLabel: {
    fontSize: 13,
    color: '#ff6b6b',
    fontWeight: '500',
  },
  additionalRestaurantsList: {
    marginTop: 2,
    paddingLeft: 5,
  },
  additionalRestaurantName: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  locationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  cityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cityIcon: {
    width: 18,
    height: 18,
    tintColor: '#666',
    resizeMode: 'contain',
  },
  cityText: {
    fontSize: 14,
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  dateText: {
    fontSize: 14,
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  feedbackSection: {
    marginTop: 8,
  },
  feedbackCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#ffc008',
  },
  feedbackTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  feedbackText: {
    fontSize: 14,
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  actionsContainer: {
    marginTop: 10, // Reduced from 20
    marginBottom: 10,
    gap: 12, // Space between buttons
  },
  shareButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#1a2b49',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 12,
    width: '100%',
  },
  foodPassportButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#1a2b49',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 12,
    width: '100%',
  },
  foodPassportButtonText: {
    color: '#1a2b49',
    fontWeight: '600',
    fontSize: 16,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffc008',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 12,
    marginLeft: 10,
  },
  passportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffc008',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  homeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff6b6b',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#1a2b49',
    marginLeft: 8,
    fontWeight: '600',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  shareButtonText: {
    color: '#1a2b49',
    fontWeight: '600',
    fontSize: 16,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  // Dish criteria section styles
  dishCriteriaCard: {
    backgroundColor: '#f0f8f0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  dishCriteriaTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d5016',
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  criterionItem: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  criterionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2d5016',
    marginBottom: 4,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  criterionDescription: {
    fontSize: 13,
    color: '#4a5d4a',
    lineHeight: 18,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  // Dish history section styles
  dishHistoryCard: {
    backgroundColor: '#f0f4ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  dishHistoryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a365d',
    marginBottom: 12,
    textAlign: 'center',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  dishHistoryText: {
    fontSize: 14,
    color: '#2d3748',
    lineHeight: 20,
    textAlign: 'left',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
});

export default ResultScreen;
