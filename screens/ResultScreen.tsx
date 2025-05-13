import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Share, Alert, ActivityIndicator, Platform } from 'react-native';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import { CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, TabParamList } from '../App';
import StarRating from '../components/StarRating';
// Import Firebase from our central config
import { firebase, auth, firestore, storage } from '../firebaseConfig';
// Import AI metadata service
import { processImageMetadata } from '../services/aiMetadataService';

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
    likedComment = '',
    dislikedComment = ''
  } = route.params;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  
  // Generate a unique instance key for this specific navigation
  const instanceKey = `${photo?.uri || ''}`;

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
    
    // If user is logged in, save data automatically
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
  }, [instanceKey]); // Using instanceKey ensures this runs for each unique navigation

  const uploadImageToFirebase = async (): Promise<string> => {
    // Get current user directly from auth module
    const user = auth().currentUser;
    if (!user) throw new Error('User not logged in');

    // Force user token refresh to ensure we have the latest authentication token
    const idToken = await user.getIdToken(true); // true forces a refresh
    console.log("Refreshed ID token obtained:", idToken ? "Success" : "Failed");

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
        app: storage().app.name
      });

      // Verify the storage bucket is correctly formatted (should be projectId.appspot.com)
      if (!storageBucket || !storageBucket.includes('appspot.com')) {
        console.warn("Storage bucket appears to be misconfigured:", storageBucket);
      }

      // Create storage reference with explicit app reference to ensure correct initialization
      const storageRef = storage().ref(`meals/${user.uid}/${filename}`);
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
      } else if (Platform.OS === 'android') {
        // Android sometimes needs file:// removed
        if (imageUri.startsWith('file://')) {
          imageUri = imageUri.replace('file://', '');
        }
      }

      console.log("Normalized image URI for upload:", imageUri);

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

        // Try direct upload with metadata
        const task = storageRef.putFile(imageUri, metadata);

        // Add progress monitoring
        task.on('state_changed',
          taskSnapshot => {
            const progress = (taskSnapshot.bytesTransferred / taskSnapshot.totalBytes) * 100;
            console.log(`Upload progress: ${progress.toFixed(2)}%`);
          },
          error => {
            console.error("Upload error:", error.code, error.message);
            throw error;
          }
        );

        await task;
        console.log("Direct upload completed successfully");

        // Get the download URL
        downloadUrl = await storageRef.getDownloadURL();
      } catch (uploadError) {
        console.error("Direct upload failed:", uploadError);
        // More detailed error information
        if (uploadError.code === 'storage/unauthorized') {
          console.error("Firebase Storage Rules may be restricting access. Check your Firebase Console > Storage > Rules");
        }
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
      // If user exists, force token refresh to ensure we have the latest credentials
      if (user) {
        await user.getIdToken(true);  // Force token refresh
      }
    } catch (tokenError) {
      console.error("Failed to refresh token:", tokenError);
      // Continue anyway, the upload will likely fail but with more specific error
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

        // Save meal data to Firestore, ensuring location data is preserved
        const mealData = {
          userId: user.uid,
          photoUrl: imageUrl,
          rating,
          restaurant: restaurant || '',
          meal: meal || '',
          mealType: mealType || 'Restaurant', // Include the meal type
          // Include user comments about what they liked and didn't like
          // Save comments with proper formatting
          comments: {
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
                : 'Device location'
          } : null,
          createdAt: firestore.FieldValue.serverTimestamp(),
          sessionId,
          platform: Platform.OS,
          appVersion: '1.0.0' // Add app version for debugging
        };

        console.log("Attempting to save to Firestore with data:", JSON.stringify({
          ...mealData,
          createdAt: 'Timestamp object'
        }));

        const docRef = await firestore().collection('mealEntries').add(mealData);

        setSaved(true);
        console.log(`Meal saved with ID: ${docRef.id} (session: ${sessionId})`);

        // Process image metadata in the background - don't wait for it to complete
        setTimeout(() => {
          processImageMetadata(docRef.id, imageUrl)
            .then(metadata => {
              console.log("AI metadata processed successfully:", metadata);
            })
            .catch(metadataError => {
              console.error("Error processing AI metadata:", metadataError);
              // Don't show an error to the user - this happens in the background
            });
        }, 1000);
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

  // Handle image load error
  const handleImageError = () => {
    console.log('Image failed to load in ResultScreen');
    setImageError(true);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Rating Has Been Saved!</Text>

      <View style={styles.resultCard}>
        <View style={styles.imageContainer}>
          {!imageError && photo && photo.uri ? (
            <Image
              source={{ uri: photo.uri }}
              style={styles.image}
              resizeMode="cover"
              onError={handleImageError}
            />
          ) : (
            <View style={styles.errorImageContainer}>
              <MaterialIcon name="broken-image" size={64} color="#ccc" />
              <Text style={styles.errorImageText}>Image not available</Text>
            </View>
          )}
          {saving && (
            <View style={styles.savingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.savingText}>Saving your meal...</Text>
            </View>
          )}
        </View>

        <View style={styles.infoContainer}>
          <View style={styles.ratingContainer}>
            <Text style={styles.ratingLabel}>Your Rating:</Text>
            <StarRating rating={rating} starSize={20} />
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Type:</Text>
            <Text style={styles.infoValue}>{mealType || "Restaurant"}</Text>
            <MaterialIcon
              name={mealType === "Homemade" ? "home" : "restaurant"}
              size={16}
              color="#666"
              style={{marginLeft: 5}}
            />
          </View>

          {mealType === "Restaurant" && restaurant && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Restaurant:</Text>
              <View style={styles.restaurantInfoContainer}>
                <Text style={styles.infoValue}>{restaurant}</Text>
                <MaterialIcon name="restaurant" size={16} color="#666" style={{marginLeft: 5}} />

                {/* Show additional restaurants if multiple were selected */}
                {location && location.selectedRestaurants && location.selectedRestaurants.length > 1 && (
                  <View style={styles.additionalRestaurants}>
                    <Text style={styles.additionalRestaurantsLabel}>
                      +{location.selectedRestaurants.length - 1} more options
                    </Text>
                    <View style={styles.additionalRestaurantsList}>
                      {location.selectedRestaurants.slice(1).map((name, index) => (
                        <Text key={index} style={styles.additionalRestaurantName}>• {name}</Text>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}

          {meal && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Meal:</Text>
              <Text style={styles.infoValue}>{meal}</Text>
            </View>
          )}

          <View style={styles.locationContainer}>
            <Text style={styles.locationLabel}>Location:</Text>
            <Text style={styles.locationText}>
              {location ? (
                <>
                  {location.source === 'restaurant_selection'
                    ? `Location from restaurant: ${restaurant}`
                    : location.source === 'exif'
                      ? 'Location from photo metadata (EXIF)'
                      : 'Using your current location'}
                </>
              ) : (
                'Location data not available'
              )}
            </Text>
          </View>

          {/* Show user comments if provided */}
          {(likedComment || dislikedComment) && (
            <View style={styles.commentsContainer}>
              {likedComment && (
                <View style={styles.commentSection}>
                  <Text style={styles.commentSectionTitle}>What you liked:</Text>
                  <View style={styles.commentItem}>
                    <Text style={styles.commentText}>{likedComment.trim()}</Text>
                  </View>
                </View>
              )}

              {dislikedComment && (
                <View style={styles.commentSection}>
                  <Text style={styles.commentSectionTitle}>What you didn't like:</Text>
                  <View style={styles.commentItem}>
                    <Text style={styles.commentText}>{dislikedComment.trim()}</Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      </View>

      <View style={styles.buttonsContainer}>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <FontAwesome name="share-alt" size={20} color="white" />
          <Text style={styles.buttonText}>Share</Text>
        </TouchableOpacity>

        {auth().currentUser ? (
          <TouchableOpacity style={styles.passportButton} onPress={viewPassport}>
            <MaterialIcon name="menu-book" size={20} color="white" />
            <Text style={styles.buttonText}>Food Passport</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: saved ? '#4CAF50' : '#3498db' }]}
            onPress={saveToFirebase}
            disabled={saving || saved}
          >
            {saving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <MaterialIcon name={saved ? "check" : "save"} size={20} color="white" />
                <Text style={styles.buttonText}>{saved ? 'Saved' : 'Save to Passport'}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.homeButton} onPress={goHome}>
          <FontAwesome name="home" size={20} color="white" />
          <Text style={styles.buttonText}>New Rating</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginVertical: 20,
    textAlign: 'center',
  },
  resultCard: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 15,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageContainer: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#eee',
    marginBottom: 15,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  errorImageContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  errorImageText: {
    marginTop: 10,
    color: '#999',
    fontSize: 16,
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
  infoContainer: {
    marginBottom: 10,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 10,
  },
  starsContainer: {
    flexDirection: 'row',
  },
  star: {
    marginRight: 5,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'center',
  },
  infoLabel: {
    fontWeight: '600',
    marginRight: 10,
  },
  infoValue: {
    flex: 1,
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
  locationContainer: {
    marginBottom: 10,
  },
  locationLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  locationText: {
    fontSize: 14,
    color: '#666',
  },
  locationSource: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
  },
  // Comments display styles
  commentsContainer: {
    width: '100%',
    marginTop: 10,
    marginBottom: 5,
  },
  commentSection: {
    marginBottom: 12,
  },
  commentSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#444',
    marginBottom: 6,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 5,
    paddingHorizontal: 5,
  },
  commentBullet: {
    fontSize: 16,
    marginRight: 8,
    color: '#666',
  },
  commentText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 18,
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 30,
    flexWrap: 'wrap',
  },
  shareButton: {
    backgroundColor: '#3498db',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 10,
    flex: 1,
    marginRight: 10,
    marginBottom: 10,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 10,
    flex: 1,
    marginRight: 10,
    marginBottom: 10,
  },
  passportButton: {
    backgroundColor: '#9C27B0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 10,
    flex: 1,
    marginRight: 10,
    marginBottom: 10,
  },
  homeButton: {
    backgroundColor: '#ff6b6b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 10,
    flex: 1,
    marginBottom: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
});

export default ResultScreen;
