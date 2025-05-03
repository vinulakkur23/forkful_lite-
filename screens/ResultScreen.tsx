import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Share, Alert, ActivityIndicator, Platform } from 'react-native';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import { CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, TabParamList } from '../App';
import { getAuth } from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';

type ResultScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Result'>,
  StackNavigationProp<RootStackParamList>
>;

type ResultScreenRouteProp = RouteProp<TabParamList, 'Result'>;

type Props = {
  navigation: ResultScreenNavigationProp;
  route: ResultScreenRouteProp;
};

const ResultScreen: React.FC<Props> = ({ route, navigation }) => {
  const { photo, location, rating, restaurant, meal } = route.params;
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
    
    // Reset states when a new instance is detected
    setSaving(false);
    setSaved(false);
    setPhotoUrl(null);
    
    // If user is logged in, save data automatically
    const auth = getAuth();
    const user = auth.currentUser;
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
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) throw new Error('User not logged in');

    try {
      // Check if photo is defined and has a uri property
      if (!photo || !photo.uri) {
        console.error("Photo object is invalid:", photo);
        throw new Error('Invalid photo object');
      }

      // Extract and normalize the image uri
      let imageUri = photo.uri;
      console.log("Original image URI:", imageUri);
      
      // Create a storage reference with a unique filename
      const timestamp = new Date().getTime();
      const filename = `meal_${user.uid}_${timestamp}.jpg`;
      const storageRef = storage().ref(`meals/${user.uid}/${filename}`);
      
      let downloadUrl = '';
      
      // First try the blob approach as it works more consistently
      try {
        console.log("Trying blob upload method");
        
        // For blob uploads, we need the full URI
        const response = await fetch(imageUri);
        const blob = await response.blob();
        
        await storageRef.put(blob);
        console.log("Blob upload completed successfully");
        
        // Get the download URL
        downloadUrl = await storageRef.getDownloadURL();
      } catch (blobError) {
        console.error("Blob upload failed:", blobError);
        
        // Fall back to direct upload if blob fails
        // Try to normalize URI based on platform
        if (Platform.OS === 'ios' && imageUri.startsWith('file://')) {
          imageUri = imageUri.replace('file://', '');
        } else if (Platform.OS === 'android' && !imageUri.startsWith('file://')) {
          imageUri = `file://${imageUri}`;
        }
        
        console.log("Normalized image URI for direct upload:", imageUri);
        
        const task = storageRef.putFile(imageUri);
        
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
      }
      
      console.log("Download URL obtained:", downloadUrl);
      return downloadUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  };

  const saveToFirebase = async (): Promise<void> => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
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

      // Upload image to Firebase Storage
      console.log("Starting image upload to Firebase Storage...");
      const imageUrl = await uploadImageToFirebase();
      console.log("Image uploaded successfully:", imageUrl);
      setPhotoUrl(imageUrl);

      // Save meal data to Firestore
      const mealData = {
        userId: user.uid,
        photoUrl: imageUrl,
        rating,
        restaurant: restaurant || '',
        meal: meal || '',
        location,
        createdAt: firestore.FieldValue.serverTimestamp(),
        sessionId
      };

      console.log("Attempting to save to Firestore with data:", JSON.stringify({
        ...mealData,
        createdAt: 'Timestamp object'
      }));
      
      const docRef = await firestore().collection('mealEntries').add(mealData);
      
      setSaved(true);
      console.log(`Meal saved with ID: ${docRef.id} (session: ${sessionId})`);
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
      await Share.share({
        message: `I rated my ${meal || 'meal'} ${rating} stars${restaurant ? ` at ${restaurant}` : ''}!`,
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
            <View style={styles.starsContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <FontAwesome
                  key={star}
                  name={star <= rating ? 'star' : 'star-o'}
                  size={20}
                  color={star <= rating ? '#FFD700' : '#BDC3C7'}
                  style={styles.star}
                />
              ))}
            </View>
          </View>

          {restaurant && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Restaurant:</Text>
              <Text style={styles.infoValue}>{restaurant}</Text>
              <MaterialIcon name="restaurant" size={16} color="#666" style={{marginLeft: 5}} />
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
              {location ?
                `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` :
                'Location data not available'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.buttonsContainer}>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <FontAwesome name="share-alt" size={20} color="white" />
          <Text style={styles.buttonText}>Share</Text>
        </TouchableOpacity>

        {getAuth().currentUser ? (
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
