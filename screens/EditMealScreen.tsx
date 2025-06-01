import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, SafeAreaView, ScrollView, Platform
} from 'react-native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import InteractiveStarRating from '../components/InteractiveStarRating';
import { RootStackParamList, TabParamList } from '../App';
import { firebase, auth, firestore } from '../firebaseConfig';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

// Navigation types
type EditMealScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'EditMeal'>,
  StackNavigationProp<RootStackParamList>
>;

type EditMealScreenRouteProp = RouteProp<TabParamList, 'EditMeal'>;

type Props = {
  navigation: EditMealScreenNavigationProp;
  route: EditMealScreenRouteProp;
};

const EditMealScreen: React.FC<Props> = ({ route, navigation }) => {
  // Get meal ID and data from route params
  const { mealId, meal } = route.params;

  // State for editable fields
  const [rating, setRating] = useState<number>(meal.rating || 0);
  const [likedComment, setLikedComment] = useState<string>(meal.comments?.liked || '');
  const [dislikedComment, setDislikedComment] = useState<string>(meal.comments?.disliked || '');
  const [loading, setLoading] = useState<boolean>(false);
  const [imageError, setImageError] = useState<boolean>(false);
  
  // Track if there are unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  // Ensure the user is the owner of this meal
  useEffect(() => {
    const currentUser = auth().currentUser;
    if (!currentUser || currentUser.uid !== meal.userId) {
      Alert.alert(
        "Not Authorized",
        "You don't have permission to edit this meal.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    }
  }, []);
  
  // Update hasUnsavedChanges when any editable field changes
  useEffect(() => {
    const isRatingChanged = rating !== meal.rating;
    const isLikedChanged = likedComment !== (meal.comments?.liked || '');
    const isDislikedChanged = dislikedComment !== (meal.comments?.disliked || '');
    
    setHasUnsavedChanges(isRatingChanged || isLikedChanged || isDislikedChanged);
  }, [rating, likedComment, dislikedComment, meal]);

  const handleRating = (selectedRating: number): void => {
    setRating(selectedRating);
  };

  // Handle image load error
  const handleImageError = () => {
    console.log('Failed to load image in EditMealScreen');
    setImageError(true);
  };
  
  // Show confirmation dialog when attempting to leave with unsaved changes
  const handleBackPress = () => {
    if (hasUnsavedChanges) {
      Alert.alert(
        "Unsaved Changes",
        "You have unsaved changes. Are you sure you want to discard them?",
        [
          { text: "Stay", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: () => navigation.goBack() }
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  // Save edited meal data
  const saveMeal = async () => {
    // Validate rating
    if (rating === 0) {
      Alert.alert("Error", "Please select a rating before saving.");
      return;
    }
    
    // Check if anything has actually changed
    if (rating === meal.rating && 
        likedComment === (meal.comments?.liked || '') &&
        dislikedComment === (meal.comments?.disliked || '')) {
      Alert.alert(
        "No Changes",
        "You haven't made any changes to this meal.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
      return;
    }
    try {
      setLoading(true);
      
      // Verify user is owner
      const currentUser = auth().currentUser;
      if (!currentUser || currentUser.uid !== meal.userId) {
        Alert.alert("Error", "You don't have permission to edit this meal.");
        setLoading(false);
        return;
      }

      // Prepare update data
      const updateData: any = {
        rating,
        comments: {
          liked: likedComment,
          disliked: dislikedComment
        },
        updatedAt: firestore.FieldValue.serverTimestamp()
      };
      
      // If the current user has a displayName and this meal shows "Anonymous User", update it
      if (currentUser.displayName && (meal.userName === 'Anonymous User' || !meal.userName)) {
        updateData.userName = currentUser.displayName;
        console.log("Updating userName to:", currentUser.displayName);
      }
      
      // Similarly update userPhoto if available
      if (currentUser.photoURL && !meal.userPhoto) {
        updateData.userPhoto = currentUser.photoURL;
        console.log("Updating userPhoto");
      }
      
      // Update the meal data in Firestore
      await firestore().collection('mealEntries').doc(mealId).update(updateData);

      // Success notification
      Alert.alert(
        "Success",
        "Your meal rating has been updated.",
        [{ 
          text: "OK", 
          onPress: () => navigation.navigate('MealDetail', { 
            mealId: mealId,
            justEdited: true 
          }) 
        }]
      );
    } catch (error) {
      console.error('Error updating meal:', error);
      Alert.alert("Error", "Failed to update meal. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Show loading state
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff6b6b" />
        <Text style={styles.loadingText}>Updating meal...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header with title */}
      <View style={styles.headerSection}>
        <TouchableOpacity 
          style={styles.backButtonHeader}
          onPress={handleBackPress}
        >
          <Image
            source={require('../assets/icons/back-icon.png')}
            style={styles.headerButtonIcon}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Meal</Text>
        <View style={styles.headerRightButton} />
      </View>

      <KeyboardAwareScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
      >
        {/* Meal image */}
        <View style={styles.imageCard}>
          <View style={styles.imageContainer}>
            {meal.photoUrl && !imageError ? (
              <Image
                source={{ uri: meal.photoUrl }}
                style={styles.image}
                resizeMode="cover"
                onError={handleImageError}
              />
            ) : (
              <View style={styles.noImageContainer}>
                <Icon name="no-photography" size={64} color="#ccc" />
                <Text style={styles.noImageText}>No image available</Text>
              </View>
            )}
          </View>
        </View>

        {/* Meal details */}
        <View style={styles.detailsCard}>
          <Text style={styles.mealName}>{meal.meal || 'Untitled Meal'}</Text>

          {meal.restaurant && (
            <View style={styles.infoRow}>
              <Image
                source={require('../assets/icons/restaurant-icon.png')}
                style={styles.restaurantIcon}
              />
              <Text style={styles.restaurantName}>{meal.restaurant}</Text>
            </View>
          )}

          {/* Rating Section */}
          <View style={styles.ratingSection}>
            <Text style={styles.sectionTitle}>Rating:</Text>
            <InteractiveStarRating 
              rating={rating} 
              onRatingChange={handleRating}
              starSize={36}
              spacing={8}
              style={styles.interactiveRating}
            />
          </View>

          {/* Comments Section */}
          <View style={styles.commentsSection}>
            <Text style={styles.sectionTitle}>What was Good:</Text>
            <TextInput
              style={styles.commentInput}
              placeholder="What did you enjoy about this meal..."
              placeholderTextColor="#999"
              multiline={true}
              value={likedComment}
              onChangeText={setLikedComment}
              maxLength={300}
            />

            <Text style={styles.sectionTitle}>What could be Better:</Text>
            <TextInput
              style={styles.commentInput}
              placeholder="What could be improved..."
              placeholderTextColor="#999"
              multiline={true}
              value={dislikedComment}
              onChangeText={setDislikedComment}
              maxLength={300}
            />
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleBackPress}
          >
            <Icon name="close" size={18} color="white" />
            <Text style={styles.buttonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveButton, rating === 0 && styles.disabledButton]}
            disabled={rating === 0}
            onPress={saveMeal}
          >
            <Icon name="check" size={18} color="white" />
            <Text style={styles.buttonText}>Save Changes</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#FAF9F6',
  },
  backButtonHeader: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  headerRightButton: {
    width: 44,
  },
  headerButtonIcon: {
    width: 24,
    height: 24,
    tintColor: '#1a2b49',
    resizeMode: 'contain',
  },
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAF9F6',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  imageCard: {
    backgroundColor: '#FAF3E0',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  imageContainer: {
    width: '100%',
    height: 240,
    backgroundColor: '#FAF3E0',
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
  detailsCard: {
    padding: 20,
    backgroundColor: '#FAF3E0',
    marginBottom: 15,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  mealName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 15,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    color: '#1a2b49',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  restaurantIcon: {
    width: 18,
    height: 18,
    tintColor: '#666',
    resizeMode: 'contain',
    marginRight: 8,
  },
  restaurantName: {
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  ratingSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  interactiveRating: {
    marginTop: 5,
    marginBottom: 5,
  },
  commentsSection: {
    marginTop: 10,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    minHeight: 100,
    backgroundColor: 'white',
    textAlignVertical: 'top',
    fontSize: 15,
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    borderLeftWidth: 3,
    borderLeftColor: '#FFC008',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
    marginBottom: Platform.OS === 'ios' ? 20 : 5,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffc008',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    flex: 1,
    marginLeft: 10,
  },
  disabledButton: {
    opacity: 0.6,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff6b6b',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  buttonText: {
    color: 'white',
    marginLeft: 8,
    fontWeight: '600',
    fontSize: 16,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
});

export default EditMealScreen;