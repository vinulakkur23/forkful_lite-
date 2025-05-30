import React, { useState, useEffect, useCallback } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { View, Text, StyleSheet, Image, TouchableOpacity, ActivityIndicator, ScrollView, Alert, Share, SafeAreaView } from 'react-native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import StarRating from '../components/StarRating';
import { RootStackParamList, TabParamList } from '../App';
// Import Firebase from our central config
import { firebase, auth, firestore, storage } from '../firebaseConfig';
// Import AI metadata service
import { processImageMetadata, AIMetadata } from '../services/aiMetadataService';
// Import API test
import { testMetadataApi } from '../services/apiTest';
// Import button icons
import { BUTTON_ICONS, hasCustomIcons } from '../config/buttonIcons';

// Update the navigation prop type to use composite navigation
type MealDetailScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'MealDetail'>,
  StackNavigationProp<RootStackParamList>
>;

type MealDetailScreenRouteProp = RouteProp<TabParamList, 'MealDetail'>;

type Props = {
  navigation: MealDetailScreenNavigationProp;
  route: MealDetailScreenRouteProp;
};

const MealDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  // Extract the mealId from route params
  const { mealId } = route.params;
  
  // State to hold the meal data once loaded
  const [meal, setMeal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [processingMetadata, setProcessingMetadata] = useState(false);
  const [justEdited, setJustEdited] = useState(false); // Track if meal was just edited
  const [isSaved, setIsSaved] = useState(false); // Track if meal is saved by current user
  
  // Log the route params for debugging
  console.log("MealDetail Route params:", route.params);
  console.log("Meal ID:", mealId);
  
  // Use the useIsFocused hook to detect when the screen comes into focus
  const isFocused = useIsFocused();
  
  // Create a fetchMealDetails function that can be called when needed
  const fetchMealDetails = useCallback(async () => {
    try {
      setLoading(true);
      
      if (!mealId) {
        setError('No meal ID provided');
        setLoading(false);
        return;
      }
      
      // Get the meal document from Firestore
      console.log("Fetching meal document with ID:", mealId);
      const mealDoc = await firestore().collection('mealEntries').doc(mealId).get();
      
      if (!mealDoc.exists) {
        console.log("Meal document not found");
        setError('Meal not found');
        setLoading(false);
        return;
      }
      
      const mealData = mealDoc.data();
      // Log full meal data for debugging
      console.log("Meal data retrieved:", JSON.stringify(mealData, null, 2));
      
      // Check if location and city exists
      if (mealData.location) {
        console.log("Location data:", JSON.stringify(mealData.location, null, 2));
      }
      
      // Check for city data
      console.log("City data check:", {
        topLevelCity: mealData.city,
        locationCity: mealData.location?.city,
        hasTopLevelCity: !!mealData.city,
        hasLocationCity: !!(mealData.location && mealData.location.city)
      });
      
      setMeal(mealData);
    } catch (err) {
      console.error('Error fetching meal details:', err);
      setError('Failed to load meal details');
    } finally {
      setLoading(false);
    }
  }, [mealId]);
  
  // Fetch the meal data when the component mounts or when returning to this screen
  useEffect(() => {
    if (isFocused) {
      // Re-fetch meal details when the screen comes into focus
      fetchMealDetails();
      
      // Check if we're coming back from the edit screen
      const prevScreen = route.params?.previousScreen;
      const comeFromEdit = route.params?.justEdited;
      
      if (comeFromEdit) {
        setJustEdited(true);
        // Automatically hide the edited indicator after 3 seconds
        setTimeout(() => {
          setJustEdited(false);
        }, 3000);
      }
      
      // Check if this meal is saved by the current user
      checkIfMealIsSaved();
    }
  }, [isFocused, fetchMealDetails, route.params?.justEdited]);
  
  // Initial data fetch on mount - only runs once
  useEffect(() => {
    fetchMealDetails();
  }, []);
  
  // Handle image load error
  const handleImageError = () => {
    console.log('Failed to load image in MealDetailScreen');
    setImageError(true);
  };
    
  const handleDeleteMeal = () => {
    // Show confirmation dialog first
    Alert.alert(
      "Delete Entry",
      "Are you sure you want to delete this meal from your Food Passport?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: deleteMealEntry
        }
      ]
    );
  };

  // Handle delete meal
  const deleteMealEntry = async () => {
    try {
      // Start loading state
      setLoading(true);

      // Check if user is owner of this meal entry
      // Use the imported auth function
      const user = auth().currentUser;

      if (!user || !meal || user.uid !== meal.userId) {
        Alert.alert("Error", "You don't have permission to delete this entry");
        setLoading(false);
        return;
      }

      // First, if there's a photo URL, delete the image from Firebase Storage
      if (meal.photoUrl) {
        try {
          // Extract the file path from the URL
          const storageRef = storage().refFromURL(meal.photoUrl);
          await storageRef.delete();
          console.log('Image deleted from storage');
        } catch (storageError) {
          console.error('Error deleting image:', storageError);
          // Continue with deleting the record even if image deletion fails
        }
      }

      // Delete the record from Firestore
      await firestore().collection('mealEntries').doc(mealId).delete();
      console.log('Meal entry deleted from Firestore');

      // Navigate back to the Food Passport with a success message
      Alert.alert(
        "Deleted",
        "The meal has been removed from your Food Passport",
        [
          {
            text: "OK",
            onPress: () => navigation.navigate('FoodPassport')
          }
        ]
      );
    } catch (error) {
      console.error('Error deleting meal:', error);
      Alert.alert('Error', 'Failed to delete meal entry');
      setLoading(false);
    }
  };
  
  // Check if meal is saved by current user
  const checkIfMealIsSaved = async () => {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser || !mealId) return;
      
      const savedMealsRef = firestore()
        .collection('users')
        .doc(currentUser.uid)
        .collection('savedMeals');
      
      const savedMealDoc = await savedMealsRef.doc(mealId).get();
      
      setIsSaved(savedMealDoc.exists);
    } catch (error) {
      console.error('Error checking if meal is saved:', error);
    }
  };
  
  // Toggle save/unsave meal
  const toggleSaveMeal = async () => {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser || !meal) {
        Alert.alert('Error', 'You need to be logged in to save meals');
        return;
      }
      
      const savedMealsRef = firestore()
        .collection('users')
        .doc(currentUser.uid)
        .collection('savedMeals');
      
      if (isSaved) {
        // Unsave the meal
        await savedMealsRef.doc(mealId).delete();
        setIsSaved(false);
        Alert.alert('Success', 'Meal removed from your saved collection');
      } else {
        // Save the meal - store only the reference to avoid duplication
        await savedMealsRef.doc(mealId).set({
          mealId: mealId,
          savedAt: firestore.FieldValue.serverTimestamp(),
          // Include minimal meal data for quick reference
          mealName: meal.meal || 'Untitled Meal',
          restaurant: meal.restaurant || '',
          photoUrl: meal.photoUrl || '',
          rating: meal.rating || 0
        });
        setIsSaved(true);
        Alert.alert('Success', 'Meal saved to your collection');
      }
    } catch (error) {
      console.error('Error toggling saved meal:', error);
      Alert.alert('Error', 'Failed to update saved meal status');
    }
  };
  
  // Share the meal
  const handleShare = async () => {
    try {
      await Share.share({
        message: `I rated ${meal.meal || 'my meal'} ${meal.rating} stars${meal.restaurant ? ` at ${meal.restaurant}` : ''}!`,
        url: meal.photoUrl
      });
    } catch (error) {
      console.log('Sharing error:', error);
    }
  };

  // Process or update meal metadata using AI
  const handleProcessMetadata = async () => {
    try {
      if (!meal || !meal.photoUrl) {
        Alert.alert('Error', 'No meal photo available for processing');
        return;
      }

      setProcessingMetadata(true);
      Alert.alert('Processing', 'Analyzing your meal photo with AI. This may take a moment...');

      // Call the AI service to process the image
      const metadata = await processImageMetadata(mealId, meal.photoUrl);

      // Update the local state with the new metadata
      setMeal({
        ...meal,
        aiMetadata: metadata
      });

      Alert.alert('Success', 'Meal metadata has been updated successfully!');
    } catch (error) {
      console.error('Error processing metadata:', error);
      Alert.alert('Error', 'Failed to process meal metadata');
    } finally {
      setProcessingMetadata(false);
    }
  };

  // Test the API directly
  const handleTestApi = async () => {
    try {
      if (!meal || !meal.photoUrl) {
        Alert.alert('Error', 'No meal photo available for testing');
        return;
      }

      Alert.alert(
        'Test API Directly',
        'This will test the API connection directly using your meal image. Continue?',
        [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Test',
            onPress: async () => {
              setProcessingMetadata(true);
              try {
                // Call the API test function
                await testMetadataApi(meal.photoUrl);
              } finally {
                setProcessingMetadata(false);
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error testing API:', error);
      Alert.alert('Error', 'Failed to test API');
    }
  };
  
  // Navigate back to the correct screen
  const goBack = () => {
    const previousScreen = route.params?.previousScreen;
    if (previousScreen) {
      navigation.navigate(previousScreen);
    } else {
      navigation.goBack();
    }
  };
  
  // Show loading state
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff6b6b" />
        <Text style={styles.loadingText}>Loading meal details...</Text>
      </View>
    );
  }
  
  // Show error state
  if (error || !meal) {
    return (
      <View style={styles.errorContainer}>
        <Icon name="error" size={64} color="#ff6b6b" />
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorMessage}>{error || 'Failed to load meal'}</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goBack}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  // Format date
  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown date';
    
    try {
      // Firestore timestamp to JS Date
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (err) {
      console.error("Date formatting error:", err);
      return 'Unknown date';
    }
  };
  
  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header with back button and title */}
      <View style={styles.headerSection}>
        <TouchableOpacity 
          style={styles.backButtonHeader}
          onPress={goBack}
        >
          <Image
            source={require('../assets/icons/back-icon.png')}
            style={styles.headerButtonIcon}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meal Details</Text>
        <TouchableOpacity 
          style={styles.headerRightButton}
          onPress={toggleSaveMeal}
        >
          <Image
            source={isSaved 
              ? require('../assets/icons/wishlist-active.png')
              : require('../assets/icons/wishlist-inactive.png')}
            style={styles.wishlistIcon}
            resizeMode="contain"
          />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container}>
        {/* Meal image card */}
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
      <View style={styles.detailsContainer}>
        <View style={styles.titleRow}>
          <Text style={styles.mealName}>{meal.meal || 'Untitled Meal'}</Text>
          {justEdited && (
            <View style={styles.editedBadge}>
              <Text style={styles.editedText}>Updated</Text>
            </View>
          )}
        </View>
        
        <View style={styles.ratingContainer}>
          <StarRating rating={meal.rating} starSize={22} />
        </View>
        
        {meal.restaurant && (
          <View style={styles.infoRow}>
            <Image
              source={require('../assets/icons/restaurant-icon.png')}
              style={styles.restaurantIcon}
            />
            <Text style={styles.restaurantName}>{meal.restaurant}</Text>
          </View>
        )}
        
        {/* Liked and Didn't Like sections */}
        {(meal.comments?.liked || meal.comments?.disliked) && (
          <View style={styles.feedbackSection}>
            {meal.comments?.liked && (
              <View style={[styles.feedbackItem, !meal.comments?.disliked && {marginBottom: 0}]}>
                <Text style={styles.feedbackLabel}>What was Good:</Text>
                <Text style={styles.feedbackText}>{meal.comments.liked}</Text>
              </View>
            )}
            
            {meal.comments?.disliked && (
              <View style={[styles.feedbackItem, {marginBottom: 0}]}>
                <Text style={styles.feedbackLabel}>What could be Better:</Text>
                <Text style={styles.feedbackText}>{meal.comments.disliked}</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.bottomRow}>
          {meal.location && (meal.location?.city || meal.city) && (
            <View style={styles.cityContainer}>
              <Image
                source={require('../assets/icons/city-icon.png')}
                style={styles.cityIcon}
              />
              <Text style={styles.cityText}>
                {meal.location?.city || meal.city || ''}
              </Text>
            </View>
          )}
          
          <Text style={styles.dateText}>
            {formatDate(meal.createdAt)}
          </Text>
        </View>
      </View>
      
      {/* Action buttons */}

      {/* Debug View for Location - Commented out for production but kept for future troubleshooting
      <View style={styles.debugContainer}>
        <Text style={styles.debugTitle}>Location Debug Info:</Text>
        <View>
          {meal.location ? (
            <>
              <Text>Latitude: {meal.location.latitude}</Text>
              <Text>Longitude: {meal.location.longitude}</Text>
              <Text>Source: {meal.location.source}</Text>
              <Text>City (location object): {meal.location.city || 'Not set'}</Text>
            </>
          ) : (
            <Text>No location object data</Text>
          )}
          <Text>City (top-level): {meal.city || 'Not set'}</Text>
          <Text>Restaurant: {meal.restaurant || 'Not set'}</Text>
          <Text>City from Restaurant: {
            meal.restaurant && meal.restaurant.includes(',') ? 
              meal.restaurant.split(',')[1].trim().split(' ')[0] : 'Not extractable'
          }</Text>
          <Text>Feedback Debug:</Text>
          <Text>Liked: {meal.comments?.liked || 'Not set'}</Text>
          <Text>Didn't Like: {meal.comments?.disliked || 'Not set'}</Text>
          <Text>All meal keys: {Object.keys(meal).join(', ')}</Text>
          <Text>Full data: {JSON.stringify({
            city: meal.city,
            locationCity: meal.location?.city,
            restaurant: meal.restaurant,
            locationSource: meal.location?.source,
          })}</Text>
        </View>
      </View>
      */}
      
      <View style={styles.actionsContainer}>
        {meal.userId === auth().currentUser?.uid ? (
          // If user is the owner, show all buttons with equal sizing and spacing
          <>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShare}
            >
              {hasCustomIcons.SHARE ? (
                <Image source={BUTTON_ICONS.SHARE} style={styles.buttonIcon} />
              ) : (
                <Icon name="share" size={20} color="white" />
              )}
              <Text style={styles.buttonText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.editButton}
              onPress={() => navigation.navigate('EditMeal', { mealId: mealId, meal })}
            >
              {hasCustomIcons.EDIT ? (
                <Image source={BUTTON_ICONS.EDIT} style={styles.buttonIcon} />
              ) : (
                <Icon name="edit" size={20} color="white" />
              )}
              <Text style={styles.buttonText}>Edit</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDeleteMeal}
            >
              {hasCustomIcons.DELETE ? (
                <Image source={BUTTON_ICONS.DELETE} style={styles.buttonIcon} />
              ) : (
                <Icon name="delete" size={20} color="white" />
              )}
              <Text style={styles.buttonText}>Delete</Text>
            </TouchableOpacity>
          </>
        ) : (
          // If not the owner, only show a centered, wider Share button
          <View style={styles.singleButtonContainer}>
            <TouchableOpacity
              style={[styles.shareButton, styles.wideShareButton]}
              onPress={handleShare}
            >
              {hasCustomIcons.SHARE ? (
                <Image source={BUTTON_ICONS.SHARE} style={styles.buttonIcon} />
              ) : (
                <Icon name="share" size={20} color="white" />
              )}
              <Text style={styles.buttonText}>Share</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  debugContainer: {
    padding: 15,
    margin: 10,
    backgroundColor: '#f0f8ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#add8e6',
  },
  debugTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#4682b4',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
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
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  headerButtonIcon: {
    width: 24,
    height: 24,
    tintColor: '#1a2b49',
    resizeMode: 'contain',
  },
  wishlistIcon: {
    width: 28,
    height: 28,
    resizeMode: 'contain',
  },
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FAF9F6',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ff6b6b',
    marginTop: 10,
    marginBottom: 10,
  },
  errorMessage: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 30,
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#ff6b6b',
    borderRadius: 5,
  },
  backButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  imageCard: {
    backgroundColor: '#FAF3E0',
    borderRadius: 12,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  imageContainer: {
    width: '100%',
    height: 320,
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
  detailsContainer: {
    padding: 20,
    backgroundColor: '#FAF3E0',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  mealName: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    color: '#1a2b49',
    flex: 1,
    marginRight: 10,
  },
  editedBadge: {
    backgroundColor: '#ffc008',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  editedText: {
    color: '#1a2b49',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  restaurantIcon: {
    width: 18,
    height: 18,
    tintColor: '#666',
    resizeMode: 'contain',
  },
  cityIcon: {
    width: 18,
    height: 18,
    tintColor: '#666',
    resizeMode: 'contain',
  },
  restaurantName: {
    fontSize: 16,
    marginLeft: 8,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: -3,
  },
  ratingLabel: {
    fontSize: 16,
    marginRight: 10,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  starsContainer: {
    flexDirection: 'row',
  },
  star: {
    marginRight: 5,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  locationTextContainer: {
    marginLeft: 8,
    flex: 1,
  },
  locationText: {
    fontSize: 14,
    color: '#666',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  cityText: {
    fontSize: 14,
    color: '#999',
    marginLeft: 5,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  cityLabel: {
    fontWeight: 'bold',
  },
  locationSource: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginTop: 2,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  feedbackSection: {
    marginTop: 12,
    marginBottom: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 15,
    borderLeftWidth: 3,
    borderLeftColor: '#FFC008',
  },
  feedbackItem: {
    marginBottom: 12,
  },
  feedbackLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a2b49',
    marginBottom: 4,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  feedbackText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 20,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  cityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 14,
    color: '#999',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  // Metadata styles
  metadataContainer: {
    padding: 20,
    backgroundColor: '#FAF3E0',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  metadataTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  metadataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  metadataItem: {
    width: '48%',
    marginBottom: 15,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#ff6b6b',
  },
  metadataLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  metadataValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  metadataButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  metadataButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4a6fa5',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 5,
    flex: 1,
    marginRight: 10,
  },
  apiTestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2ecc71',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 5,
    flex: 1,
  },
  disabledButton: {
    opacity: 0.6,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-evenly', // Changed from space-around to space-evenly
    padding: 20,
    alignItems: 'center', // Ensure vertical alignment
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFC008', // Changed to orange color used for stars
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 5,
    flex: 1, // Make all buttons take equal space
    maxWidth: '30%', // Limit maximum width
  },
  buttonText: {
    color: 'white',
    marginLeft: 8,
    fontWeight: '600',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  buttonIcon: {
    width: 20,
    height: 20,
    tintColor: 'white', // Makes the icon white
    resizeMode: 'contain',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff6b6b',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFC008', // Changed to orange color used for stars
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 5,
    flex: 1, // Make all buttons take equal space
    maxWidth: '30%', // Limit maximum width
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFC008', // Changed to orange color used for stars
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 5,
    flex: 1, // Make all buttons take equal space
    maxWidth: '30%', // Limit maximum width
  },
  wideShareButton: {
    width: '70%', // Make the button wider when it's the only one
    maxWidth: '70%', // Override the maxWidth constraint from shareButton
    paddingHorizontal: 40, // Increase horizontal padding
    paddingVertical: 15, // Make the button taller
  },
  singleButtonContainer: {
    width: '100%',
    alignItems: 'center', // Center the single button
    justifyContent: 'center',
  },
});

export default MealDetailScreen;
