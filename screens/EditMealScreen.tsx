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
import EmojiRating from '../components/EmojiRating';
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

  // Emoji rating descriptions
  const EMOJI_DESCRIPTIONS = {
    1: "Not a tasty meal.",
    2: "Ok, but I won't be getting it again.",
    3: "Tasty food. I enjoyed it!",
    4: "Very tasty. I'd order this again if I come back.",
    5: "Delicious. I plan to make a trip back just for this.",
    6: "One of the best things I've ever eaten."
  };

  // State for editable fields
  const [rating, setRating] = useState<number>(meal.rating || 0);
  const [thoughts, setThoughts] = useState<string>(() => {
    // Handle both new thoughts format and legacy liked/disliked format
    if (meal.comments?.thoughts) {
      // New format - use thoughts directly
      return meal.comments.thoughts;
    } else {
      // Legacy format - combine liked and disliked comments
      const liked = meal.comments?.liked || '';
      const disliked = meal.comments?.disliked || '';
      
      if (liked && disliked) {
        return `${liked}\n\n${disliked}`;
      } else if (liked) {
        return liked;
      } else if (disliked) {
        return disliked;
      }
    }
    return '';
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [imageError, setImageError] = useState<boolean>(false);
  
  // Debug: Log the initial values
  useEffect(() => {
    console.log('EditMealScreen - Initial meal data:', {
      rating: meal.rating,
      thoughtsNew: meal.comments?.thoughts,
      thoughtsLegacyLiked: meal.comments?.liked,
      thoughtsLegacyDisliked: meal.comments?.disliked,
      hasComments: !!meal.comments,
      allKeys: Object.keys(meal)
    });
  }, []);

  // Update state if meal data changes (e.g., if screen is reused)
  useEffect(() => {
    console.log('EditMealScreen - Meal data changed, updating state');
    setRating(meal.rating || 0);
    
    // Handle both new thoughts format and legacy liked/disliked format
    if (meal.comments?.thoughts) {
      // New format - use thoughts directly
      setThoughts(meal.comments.thoughts);
    } else {
      // Legacy format - combine liked and disliked comments
      const liked = meal.comments?.liked || '';
      const disliked = meal.comments?.disliked || '';
      
      if (liked && disliked) {
        setThoughts(`${liked}\n\n${disliked}`);
      } else if (liked) {
        setThoughts(liked);
      } else if (disliked) {
        setThoughts(disliked);
      } else {
        setThoughts('');
      }
    }
  }, [meal.rating, meal.comments?.thoughts, meal.comments?.liked, meal.comments?.disliked]);
  
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
    const originalThoughts = (() => {
      // Handle both new thoughts format and legacy liked/disliked format
      if (meal.comments?.thoughts) {
        // New format - use thoughts directly
        return meal.comments.thoughts;
      } else {
        // Legacy format - combine liked and disliked comments
        const liked = meal.comments?.liked || '';
        const disliked = meal.comments?.disliked || '';
        
        if (liked && disliked) {
          return `${liked}\n\n${disliked}`;
        } else if (liked) {
          return liked;
        } else if (disliked) {
          return disliked;
        }
      }
      return '';
    })();
    const isThoughtsChanged = thoughts !== originalThoughts;
    
    setHasUnsavedChanges(isRatingChanged || isThoughtsChanged);
  }, [rating, thoughts, meal]);

  const handleRating = (selectedRating: number): void => {
    setRating(selectedRating);
  };

  // Handle image load error
  const handleImageError = () => {
    console.log('Failed to load image in EditMealScreen');
    setImageError(true);
  };
  
  // Navigate back to the correct screen
  const goBack = () => {
    const previousScreen = route.params?.previousScreen;
    const previousTabIndex = route.params?.previousTabIndex;
    const passportUserId = route.params?.passportUserId;
    const passportUserName = route.params?.passportUserName;
    const passportUserPhoto = route.params?.passportUserPhoto;
    
    if (previousScreen === 'FoodPassport') {
      if (passportUserId) {
        // Navigate back to the specific user's passport
        navigation.navigate('FoodPassport', {
          userId: passportUserId,
          userName: passportUserName,
          userPhoto: passportUserPhoto,
          tabIndex: previousTabIndex
        });
      } else {
        // Navigate back to own passport
        navigation.navigate('FoodPassport', {
          tabIndex: previousTabIndex
        });
      }
    } else if (previousScreen === 'Home') {
      // Navigate back to Home with the correct tab index
      navigation.navigate('Home', { tabIndex: previousTabIndex });
    } else if (previousScreen) {
      navigation.navigate(previousScreen);
    } else {
      navigation.goBack();
    }
  };

  // Show confirmation dialog when attempting to leave with unsaved changes
  const handleBackPress = () => {
    if (hasUnsavedChanges) {
      Alert.alert(
        "Unsaved Changes",
        "You have unsaved changes. Are you sure you want to discard them?",
        [
          { text: "Stay", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: () => goBack() }
        ]
      );
    } else {
      goBack();
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
    const originalThoughts = (() => {
      // Handle both new thoughts format and legacy liked/disliked format
      if (meal.comments?.thoughts) {
        // New format - use thoughts directly
        return meal.comments.thoughts;
      } else {
        // Legacy format - combine liked and disliked comments
        const liked = meal.comments?.liked || '';
        const disliked = meal.comments?.disliked || '';
        
        if (liked && disliked) {
          return `${liked}\n\n${disliked}`;
        } else if (liked) {
          return liked;
        } else if (disliked) {
          return disliked;
        }
      }
      return '';
    })();
    
    if (rating === meal.rating && thoughts === originalThoughts) {
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
          thoughts: thoughts
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
            justEdited: true,
            // Pass through navigation context
            previousScreen: route.params?.previousScreen,
            previousTabIndex: route.params?.previousTabIndex,
            passportUserId: route.params?.passportUserId,
            passportUserName: route.params?.passportUserName,
            passportUserPhoto: route.params?.passportUserPhoto
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
            <EmojiRating 
              rating={rating} 
              onRatingChange={handleRating}
              size={40}
              style={styles.interactiveRating}
            />
            
            {/* Rating Description */}
            {rating > 0 && (
              <View style={styles.ratingDescriptionContainer}>
                <Text style={styles.ratingDescription}>
                  {EMOJI_DESCRIPTIONS[rating as keyof typeof EMOJI_DESCRIPTIONS]}
                </Text>
              </View>
            )}
          </View>

          {/* Comments Section */}
          <View style={styles.commentsSection}>
            <Text style={styles.sectionTitle}>How was your Meal?</Text>
            <Text style={styles.sectionSubtitle}>Sharing will help us understand your tastes and personalize dish recommendations.</Text>
            <TextInput
              key={`thoughts-${mealId}`}
              style={styles.commentInput}
              placeholder="What did you enjoy about this meal? What could be better?"
              placeholderTextColor="#999"
              multiline={true}
              value={thoughts}
              onChangeText={setThoughts}
              maxLength={600}
            />
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleBackPress}
          >
            <Text style={styles.buttonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveButton, rating === 0 && styles.disabledButton]}
            disabled={rating === 0}
            onPress={saveMeal}
          >
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
    marginBottom: 4,
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#1a2b49',
    marginBottom: 10,
    fontStyle: 'italic',
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
  ratingDescriptionContainer: {
    marginTop: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  ratingDescription: {
    fontSize: 12,
    color: '#1a2b49',
    textAlign: 'center',
    fontStyle: 'italic',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
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
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#1a2b49',
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
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#1a2b49',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  buttonText: {
    color: '#1a2b49',
    fontWeight: '600',
    fontSize: 16,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
});

export default EditMealScreen;