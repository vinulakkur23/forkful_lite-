import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Share, Alert, ActivityIndicator, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../App';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import { utils } from '@react-native-firebase/app';

type ResultScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Result'>;
type ResultScreenRouteProp = RouteProp<RootStackParamList, 'Result'>;
type Props = {
  navigation: ResultScreenNavigationProp;
  route: ResultScreenRouteProp;
};

const ResultScreen: React.FC<Props> = ({ route, navigation }) => {
  const { photo, location, rating, restaurant, meal } = route.params;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    // If user is logged in, save data automatically
    const user = auth().currentUser;
    if (user) {
      saveToFirebase();
    }
  }, []);

// VERSION 1 uploadImageToFirebase
//  const uploadImageToFirebase = async (): Promise<string> => {
//    const user = auth().currentUser;
//    if (!user) throw new Error('User not logged in');
//
//    // Extract the image uri and create a filename
//    let imageUri = photo.uri;
//
//    // Firebase storage path
//    const timestamp = new Date().getTime();
//    const filename = `meal_${user.uid}_${timestamp}.jpg`;
//    const storageRef = storage().ref(`meals/${user.uid}/${filename}`);
//
//    // Determine image path based on whether it's a remote URL or local file
//    let uploadUri = imageUri;
//    if (Platform.OS === 'ios' && imageUri.startsWith('file://')) {
//      uploadUri = imageUri.substring(7);
//    }
//
//    try {
//      // Upload the image
//      await storageRef.putFile(uploadUri);
//
//      // Get the download URL
//      const url = await storageRef.getDownloadURL();
//      return url;
//    } catch (error) {
//      console.error('Error uploading image:', error);
//      throw error;
//    }
//  };
    
// VERSION 2 uploadImageToFirebase
//    const uploadImageToFirebase = async (): Promise<string> => {
//      const user = auth().currentUser;
//      if (!user) throw new Error('User not logged in');
//
//      try {
//        // Extract the image uri and create a filename
//        let imageUri = photo.uri;
//        console.log("Original image URI:", imageUri);
//
//        // Firebase storage path
//        const timestamp = new Date().getTime();
//        const filename = `meal_${user.uid}_${timestamp}.jpg`;
//        const storageRef = storage().ref(`meals/${user.uid}/${filename}`);
//        
//        // Handle the file path correctly based on platform
//        let uploadUri = imageUri;
//        if (Platform.OS === 'ios') {
//          // Remove the file:// prefix for iOS
//          uploadUri = imageUri.replace('file://', '');
//          console.log("iOS adjusted URI:", uploadUri);
//        }
//        
//        console.log("About to upload file from:", uploadUri);
//        
//        // Make sure the file exists before uploading
//        // Upload the image using the correct URI
//        await storageRef.putFile(uploadUri);
//        console.log("File uploaded successfully");
//        
//        // Get the download URL
//        const url = await storageRef.getDownloadURL();
//        console.log("Download URL obtained:", url);
//        return url;
//      } catch (error) {
//        console.error('Error uploading image:', error);
//        console.error('Error details:', JSON.stringify(error, null, 2));
//        throw error;
//      }
//    };
    
// VERSION 3 uploadImageToFirebase
    const uploadImageToFirebase = async (): Promise<string> => {
      const user = auth().currentUser;
      if (!user) throw new Error('User not logged in');

      try {
        // Extract the image uri
        const imageUri = photo.uri;
        console.log("Original image URI:", imageUri);

        // Create a storage reference
        const timestamp = new Date().getTime();
        const filename = `meal_${user.uid}_${timestamp}.jpg`;
        const storageRef = storage().ref(`meals/${user.uid}/${filename}`);
        
        // Approach 1: Use the built-in uploadFile method with a more careful URI handling
        // For iOS, make sure to handle the file:// prefix correctly
        let uploadUri = imageUri;
        console.log("Attempting to upload from:", uploadUri);
        
        // Try a direct upload first
        try {
          // First, try uploading directly
          const task = storageRef.putFile(uploadUri);
          
          // Monitor the upload progress (optional)
          task.on('state_changed', taskSnapshot => {
            console.log(`${taskSnapshot.bytesTransferred} transferred out of ${taskSnapshot.totalBytes}`);
          });
          
          // Wait for the upload to complete
          await task;
          console.log("Direct upload completed successfully");
        } catch (error) {
          console.error("Direct upload failed:", error);
          
          // If direct upload fails, try an alternative approach
          // Fetch the image data as a blob
          console.log("Trying alternative upload method...");
          const response = await fetch(imageUri);
          const blob = await response.blob();
          
          // Upload the blob
          await storageRef.put(blob);
          console.log("Alternative upload completed successfully");
        }
        
        // Get the download URL
        const url = await storageRef.getDownloadURL();
        console.log("Download URL obtained:", url);
        return url;
      } catch (error) {
        console.error('Error uploading image:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        
        // Show more specific error message
        if (error.code === 'storage/object-not-found') {
          console.error('The specified file does not exist at the given path');
        }
        
        throw error;
      }
    };

//  VERSION 1 SAVETOFIREBASE
//  const saveToFirebase = async (): Promise<void> => {
//    const user = auth().currentUser;
//    if (!user) {
//      Alert.alert(
//        'Not Logged In',
//        'Would you like to log in to save this meal to your food passport?',
//        [
//          { text: 'Not Now', style: 'cancel' },
//          { text: 'Log In', onPress: () => navigation.navigate('Login') }
//        ]
//      );
//      return;
//    }
//
//    try {
//      setSaving(true);
//
//      // Upload image to Firebase Storage
//      const imageUrl = await uploadImageToFirebase();
//      setPhotoUrl(imageUrl);
//
//      // Save meal data to Firestore
//      const mealData = {
//        userId: user.uid,
//        photoUrl: imageUrl,
//        rating,
//        restaurant: restaurant || '',
//        meal: meal || '',
//        location,
//        createdAt: firestore.FieldValue.serverTimestamp()
//      };
//
//      const docRef = await firestore().collection('mealEntries').add(mealData);
//
//      setSaved(true);
//      console.log('Meal saved with ID:', docRef.id);
//    } catch (error) {
//      console.error('Error saving meal to Firebase:', error);
//      Alert.alert('Error', 'Failed to save your meal. Please try again.');
//    } finally {
//      setSaving(false);
//    }
//  };
    
// VERSION 2 SAVETOFIREBASE
    const saveToFirebase = async (): Promise<void> => {
      const user = auth().currentUser;
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

      try {
        setSaving(true);

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
          createdAt: firestore.FieldValue.serverTimestamp()
        };

        console.log("Attempting to save to Firestore with data:", JSON.stringify(mealData));
        const docRef = await firestore().collection('mealEntries').add(mealData);
        
        setSaved(true);
        console.log('Meal saved with ID:', docRef.id);
      } catch (error) {
        console.error('Error saving meal to Firebase:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        
        // Check if error is related to Firestore
        if (error.code && error.code.includes('firestore')) {
          console.error('Firestore-specific error:', error.code);
        }
        
        // Check if error is related to Storage
        if (error.code && error.code.includes('storage')) {
          console.error('Storage-specific error:', error.code);
        }
        
        Alert.alert('Error', `Failed to save your meal: ${error.message || 'Unknown error'}`);
      } finally {
        setSaving(false);
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

  const goHome = (): void => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  };

  const viewPassport = (): void => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'FoodPassport' }],
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Rating Has Been Saved!</Text>

      <View style={styles.resultCard}>
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: photo.uri }}
            style={styles.image}
            resizeMode="cover"
          />
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
                <Icon
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
          <Icon name="share-alt" size={20} color="white" />
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
          <Icon name="home" size={20} color="white" />
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
