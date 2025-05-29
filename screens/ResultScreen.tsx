import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Share, Alert, ActivityIndicator, Platform, SafeAreaView, ScrollView } from 'react-native';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import { CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, TabParamList } from '../App';
import StarRating from '../components/StarRating';
import AchievementNotification from '../components/AchievementNotification';
// Import Firebase from our central config
import { firebase, auth, firestore, storage } from '../firebaseConfig';
// Import AI metadata service
import { processImageMetadata } from '../services/aiMetadataService';
// Import achievement service
import { checkAchievements } from '../services/achievementService';
import { Achievement } from '../types/achievements';

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
  const [unlockedAchievements, setUnlockedAchievements] = useState<Achievement[]>([]);
  const [currentAchievement, setCurrentAchievement] = useState<Achievement | null>(null);
  const [mealId, setMealId] = useState<string | null>(null);
  
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
            const cityParts = city.split(' ');
            if (cityParts.length > 1) {
              // If city contains spaces, take only the first part (likely the actual city name)
              city = cityParts[0];
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
            
            // If second part has spaces (like "Portland OR"), take just the city name
            if (secondPart.includes(' ')) {
              cityInfo = secondPart.split(' ')[0];
            } else {
              cityInfo = secondPart; // Use the whole part if no spaces
            }
            
            console.log("Extracted city from restaurant name:", cityInfo);
          }
        }
        
        // Extra logging for debugging
        console.log("Final city info to be saved:", cityInfo);
        
        // Save meal data to Firestore, ensuring location data is preserved
        const mealData = {
          userId: user.uid,
          photoUrl: imageUrl,
          rating,
          restaurant: restaurant || '',
          meal: meal || '',
          mealType: mealType || 'Restaurant', // Include the meal type
          // Store city as a top-level field for easier access and querying
          city: cityInfo ? cityInfo.trim() : '',
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
                : 'Device location',
            // Always include city in location object for compatibility
            // If location already has city info, use that; otherwise use the extracted cityInfo
            city: location.city ? location.city.trim() : (cityInfo ? cityInfo.trim() : '')
          } : null,
          createdAt: firestore.FieldValue.serverTimestamp(),
          sessionId,
          platform: Platform.OS,
          appVersion: '1.0.0' // Add app version for debugging
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
        
        // Check for achievements
        // We need to create the full meal object for achievement checking
        const mealEntry = {
          id: docRef.id,
          userId: user.uid,
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
          createdAt: new Date().getTime()
        };
        
        // Check for achievements
        checkAchievements(mealEntry)
          .then(achievements => {
            if (achievements.length > 0) {
              console.log(`Unlocked ${achievements.length} achievements:`, 
                achievements.map(a => a.name).join(', '));
              
              // Store the unlocked achievements
              setUnlockedAchievements(achievements);
              
              // Show the first achievement notification
              if (achievements.length > 0) {
                setCurrentAchievement(achievements[0]);
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

  // Handle image load error
  const handleImageError = () => {
    console.log('Image failed to load in ResultScreen');
    setImageError(true);
  };
  
  // Handle achievement notification dismissal 
  const handleDismissAchievement = () => {
    // If there are more achievements to show, show the next one
    if (unlockedAchievements.length > 0) {
      const nextAchievements = [...unlockedAchievements];
      const nextAchievement = nextAchievements.shift();
      
      setUnlockedAchievements(nextAchievements);
      setCurrentAchievement(nextAchievements.length > 0 ? nextAchievements[0] : null);
    } else {
      // No more achievements to show
      setCurrentAchievement(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {currentAchievement && (
        <AchievementNotification
          achievement={currentAchievement}
          onDismiss={handleDismissAchievement}
        />
      )}
      
      {/* Header with title */}
      <View style={styles.headerSection}>
        <Text style={styles.headerTitle}>Rating Saved</Text>
      </View>

      <ScrollView style={styles.container}>
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

        {/* Meal details */}
        <View style={styles.detailsCard}>
          <Text style={styles.mealName}>{meal || 'Untitled Meal'}</Text>
          
          <View style={styles.ratingContainer}>
            <StarRating rating={rating} starSize={22} />
          </View>

          {mealType === "Restaurant" && restaurant && (
            <View style={styles.restaurantRow}>
              <Image
                source={require('../assets/icons/restaurant-icon.png')}
                style={styles.restaurantIcon}
              />
              <Text style={styles.restaurantName}>{restaurant}</Text>
            </View>
          )}

          {mealType === "Homemade" && (
            <View style={styles.restaurantRow}>
              <MaterialIcon name="home" size={18} color="#1a2b49" style={styles.infoIcon} />
              <Text style={styles.restaurantName}>Homemade</Text>
            </View>
          )}

          <View style={styles.locationRow}>
            {location && location?.city && (
              <View style={styles.cityContainer}>
                <MaterialIcon name="location-on" size={18} color="#1a2b49" style={styles.infoIcon} />
                <Text style={styles.cityText}>
                  {location.city || ''}
                </Text>
              </View>
            )}
            
            <Text style={styles.dateText}>
              {new Date().toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </Text>
          </View>

          {/* Liked and Didn't Like sections */}
          {(likedComment || dislikedComment) && (
            <View style={styles.feedbackSection}>
              {likedComment && (
                <View style={styles.feedbackCard}>
                  <Text style={styles.feedbackTitle}>What was Good:</Text>
                  <Text style={styles.feedbackText}>{likedComment.trim()}</Text>
                </View>
              )}
              
              {dislikedComment && (
                <View style={styles.feedbackCard}>
                  <Text style={styles.feedbackTitle}>What could be Better:</Text>
                  <Text style={styles.feedbackText}>{dislikedComment.trim()}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShare}
        >
          <MaterialIcon name="share" size={18} color="white" />
          <Text style={styles.buttonText}>Share</Text>
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  headerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#FAF9F6',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginVertical: 20,
    textAlign: 'center',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    color: '#1a2b49',
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
    marginBottom: 20,
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
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 30 : 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffc008',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 12,
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
});

export default ResultScreen;
