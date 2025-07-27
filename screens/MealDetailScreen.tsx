import React, { useState, useEffect, useCallback } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { View, Text, StyleSheet, Image, TouchableOpacity, ActivityIndicator, ScrollView, Alert, Share, SafeAreaView, Linking } from 'react-native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import EmojiDisplay from '../components/EmojiDisplay';
import MultiPhotoGallery, { PhotoItem } from '../components/MultiPhotoGallery';
import { RootStackParamList, TabParamList } from '../App';
// Import Firebase from our central config
import { firebase, auth, firestore, storage } from '../firebaseConfig';
// Import AI metadata service
import { processImageMetadata, AIMetadata } from '../services/aiMetadataService';
// Import API test
import { testMetadataApi } from '../services/apiTest';
// Import button icons
import { BUTTON_ICONS, hasCustomIcons } from '../config/buttonIcons';
// Import cheers service
import { toggleCheer, subscribeToCheersData } from '../services/cheersService';
// Import dish criteria service
import { DishCriteria } from '../services/dishCriteriaService';
// Import combined service types for testing
import { CombinedResponse } from '../services/combinedMetadataCriteriaService';

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
  const [hasUserCheered, setHasUserCheered] = useState(false);
  const [totalCheers, setTotalCheers] = useState(0);
  const [cheersLoading, setCheersLoading] = useState(false);
  const [dishCriteria, setDishCriteria] = useState<DishCriteria | null>(null);
  const [combinedResult, setCombinedResult] = useState<CombinedResponse | null>(null);
  const [criteriaRatings, setCriteriaRatings] = useState<{ [key: string]: number } | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  
  // Log the route params for debugging
  console.log("MealDetail Route params:", route.params);

  // Helper function to get color based on rating value (same as DynamicCriteriaRating)
  const getRatingColor = (rating: number) => {
    if (rating >= 8) return '#4CAF50'; // Green for excellent
    if (rating >= 6) return '#FFC107'; // Yellow for good
    if (rating >= 4) return '#FF9800'; // Orange for okay
    return '#F44336'; // Red for poor
  };
  console.log("Meal ID:", mealId);
  
  // Use the useIsFocused hook to detect when the screen comes into focus
  const isFocused = useIsFocused();
  
  // Function to process meal data and extract photos
  const processMealPhotos = (mealData: any): PhotoItem[] => {
    if (mealData.photos && Array.isArray(mealData.photos)) {
      // New format - meal has photos array
      return mealData.photos;
    } else if (mealData.photoUrl) {
      // Legacy format - convert single photo to array
      return [{
        url: mealData.photoUrl,
        isFlagship: true,
        order: 0,
        uploadedAt: mealData.createdAt
      }];
    }
    return [];
  };
  
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
      
      // Process and set photos
      const processedPhotos = processMealPhotos(mealData);
      setPhotos(processedPhotos);
      console.log('Processed photos for MealDetail:', processedPhotos);
      
      // Set dish criteria from saved meal data (no API calls needed)
      if (mealData.dish_criteria) {
        console.log('Using saved dish criteria from meal data');
        setDishCriteria(mealData.dish_criteria);
      } else {
        console.log('No dish criteria saved for this meal');
        setDishCriteria(null);
      }

      // TESTING: Set combined result from saved meal data
      if (mealData.combined_result) {
        console.log('🧪 Using saved combined result from meal data');
        setCombinedResult(mealData.combined_result);
      } else {
        console.log('🧪 No combined result saved for this meal');
        setCombinedResult(null);
      }

      // Load saved criteria ratings if available
      if (mealData.criteria_ratings) {
        console.log('📊 Loading saved criteria ratings:', mealData.criteria_ratings);
        setCriteriaRatings(mealData.criteria_ratings);
      } else {
        console.log('📊 No criteria ratings saved for this meal');
        setCriteriaRatings(null);
      }
      
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
  
  // Subscribe to cheers data
  useEffect(() => {
    if (!meal || !mealId) return;
    
    const unsubscribe = subscribeToCheersData(
      mealId,
      meal.userId,
      (cheersData) => {
        setHasUserCheered(cheersData.hasUserCheered);
        setTotalCheers(cheersData.totalCheers);
      }
    );
    
    return () => {
      unsubscribe();
    };
  }, [meal, mealId]);
  
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
            onPress: () => {
              // Use the same logic as goBack for consistency
              const passportUserId = route.params?.passportUserId;
              const passportUserName = route.params?.passportUserName;
              const passportUserPhoto = route.params?.passportUserPhoto;
              
              if (passportUserId) {
                navigation.navigate('FoodPassport', {
                  userId: passportUserId,
                  userName: passportUserName,
                  userPhoto: passportUserPhoto
                });
              } else {
                navigation.navigate('FoodPassport');
              }
            }
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

  // Show follow user coming soon message
  const showFollowMessage = () => {
    Alert.alert(
      "Coming Soon",
      "Soon you'll be able to follow and explore your friends' and favorite foodie's food passport."
    );
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

      // Call the AI service to process the image with context
      const metadata = await processImageMetadata(mealId, meal.photoUrl, {
        mealName: meal.meal || undefined,
        restaurantName: meal.restaurant || undefined,
        likedComments: meal.comments?.liked || undefined,
        dislikedComments: meal.comments?.disliked || undefined
      });

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
  
  // Handle cheers button press
  const handleCheer = async () => {
    // Don't allow cheering own meals
    if (meal.userId === auth().currentUser?.uid) {
      return;
    }
    
    setCheersLoading(true);
    try {
      const success = await toggleCheer(mealId);
      if (!success) {
        Alert.alert('Error', 'Failed to update cheer. Please try again.');
      }
    } catch (error) {
      console.error('Error toggling cheer:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setCheersLoading(false);
    }
  };

  // Handle meal title press to view on map
  const handleViewOnMap = () => {
    if (!meal.location || !meal.location.latitude || !meal.location.longitude) {
      Alert.alert('No Location', 'This meal doesn\'t have location information to show on the map.');
      return;
    }

    // Navigate to Home screen with map tab active and center on this meal's location
    navigation.navigate('MainTabs', {
      screen: 'Home',
      params: {
        initialTab: 'map', // Tell HomeScreen to show map tab
        centerOnLocation: {
          latitude: meal.location.latitude,
          longitude: meal.location.longitude,
          mealId: mealId // Pass meal ID to potentially highlight it
        }
      }
    });
  };

  // Handle restaurant press to open in Google Maps
  const handleRestaurantPress = async () => {
    if (!meal.restaurant) return;

    try {
      // Build search query with restaurant name and city if available
      let searchQuery = meal.restaurant;
      
      // Add city to search query if available
      if (meal.city) {
        searchQuery += `, ${meal.city}`;
      } else if (meal.location?.city) {
        searchQuery += `, ${meal.location.city}`;
      }
      
      const query = encodeURIComponent(searchQuery);
      
      // Try Google Maps app first
      const googleMapsUrl = `comgooglemaps://?q=${query}`;
      const canOpenGoogleMaps = await Linking.canOpenURL(googleMapsUrl);
      
      if (canOpenGoogleMaps) {
        await Linking.openURL(googleMapsUrl);
      } else {
        // Fallback to web browser with Google Maps
        const webUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
        const canOpenWeb = await Linking.canOpenURL(webUrl);
        
        if (canOpenWeb) {
          await Linking.openURL(webUrl);
        } else {
          Alert.alert('Error', 'Unable to open maps application');
        }
      }
    } catch (error) {
      console.error('Error opening maps:', error);
      Alert.alert('Error', 'Failed to open maps application');
    }
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
        {/* Map button in header - only show if meal has location */}
        {meal && meal.location && meal.location.latitude && meal.location.longitude ? (
          <TouchableOpacity 
            style={styles.headerRightButton}
            onPress={handleViewOnMap}
          >
            <Image
              source={require('../assets/icons/map-icon.png')}
              style={styles.headerMapIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerRightButton} />
        )}
      </View>

      <ScrollView style={styles.container}>
        {/* Meal photos gallery */}
        <View style={styles.photosSection}>
          <MultiPhotoGallery
            photos={photos}
            editable={false}
            maxPhotos={5}
          />
        </View>
      
      {/* Meal details */}
      <View style={styles.detailsContainer}>
        <View style={styles.titleRow}>
          <View style={styles.titleContent}>
            <View style={styles.mealInfoColumn}>
              <View style={styles.mealNameRow}>
                <Text style={styles.mealName}>{meal.meal || 'Untitled Meal'}</Text>
                {justEdited && (
                  <View style={styles.editedBadge}>
                    <Text style={styles.editedText}>Updated</Text>
                  </View>
                )}
              </View>
              <View style={styles.ratingContainer}>
                <EmojiDisplay rating={meal.rating} size={28} />
              </View>
              {meal.restaurant && (
                <TouchableOpacity 
                  style={styles.restaurantRow}
                  onPress={handleRestaurantPress}
                  activeOpacity={0.7}
                >
                  <Image
                    source={require('../assets/icons/restaurant-icon.png')}
                    style={styles.restaurantIcon}
                  />
                  <Text style={styles.restaurantName}>{meal.restaurant}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          
          <View style={styles.buttonColumn}>
            {/* Wishlist button */}
            <TouchableOpacity 
              style={styles.titleWishlistButton}
              onPress={toggleSaveMeal}
            >
              <Image
                source={isSaved 
                  ? require('../assets/icons/wishlist-active.png')
                  : require('../assets/icons/wishlist-inactive.png')}
                style={styles.titleWishlistIcon}
                resizeMode="contain"
              />
            </TouchableOpacity>
            
            {/* Cheers button - only show if not own meal */}
            {meal.userId !== auth().currentUser?.uid && (
              <TouchableOpacity 
                style={styles.titleCheersButton}
                onPress={handleCheer}
                disabled={cheersLoading}
              >
                <Image
                  source={hasUserCheered 
                    ? require('../assets/icons/cheers-active.png')
                    : require('../assets/icons/cheers-inactive.png')}
                  style={styles.titleCheersIcon}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            )}
            
            {/* Show cheers count if it's own meal */}
            {meal.userId === auth().currentUser?.uid && totalCheers > 0 && (
              <View style={styles.cheersCountContainer}>
                <Image
                  source={require('../assets/icons/cheers-active.png')}
                  style={[styles.cheersCountIcon, { tintColor: undefined }]} // Remove tint to preserve original colors
                  resizeMode="contain"
                />
                <Text style={styles.cheersCountText}>{totalCheers}</Text>
              </View>
            )}
          </View>
        </View>
        
        {/* User who posted this meal */}
        <TouchableOpacity 
          style={[styles.infoRow, {marginTop: 4, marginBottom: 4}]} 
          onPress={() => {
            // If it's the current user's meal, show the follow message
            // Otherwise, navigate to their profile
            if (meal.userId === auth().currentUser?.uid) {
              // Navigate to own passport
              navigation.navigate('FoodPassport');
            } else {
              // Navigate to other user's passport
              navigation.navigate('FoodPassport', { 
                userId: meal.userId,
                userName: meal.userName || 'Anonymous User',
                userPhoto: meal.userPhoto || null
              });
            }
          }}
        >
          <View style={styles.userIconContainer}>
            {meal.userPhoto ? (
              <Image 
                source={{uri: meal.userPhoto}} 
                style={styles.userAvatar}
              />
            ) : (
              <Icon name="person" size={16} color="#1a2b49" />
            )}
          </View>
          <Text style={styles.usernameText}>
            {meal.userName || 'Anonymous User'}
          </Text>
        </TouchableOpacity>
        
        {/* Comments section - handle both new thoughts format and legacy liked/disliked format */}
        {(meal.comments?.thoughts || meal.comments?.liked || meal.comments?.disliked) && (
          <View style={styles.feedbackSection}>
            {meal.comments?.thoughts ? (
              // New thoughts format
              <View style={[styles.feedbackItem, {marginBottom: 0}]}>
                <Text style={styles.feedbackLabel}>How was the Meal?</Text>
                <Text style={styles.feedbackText}>{meal.comments.thoughts}</Text>
              </View>
            ) : (
              // Legacy format - keep for backward compatibility
              <>
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
              </>
            )}
          </View>
        )}

        {/* AI Metadata Tags Section */}
        {meal.aiMetadata && (
          <View style={styles.metadataSection}>
            <View style={styles.metadataTagsContainer}>
              {meal.aiMetadata.cuisineType && meal.aiMetadata.cuisineType !== 'Unknown' && (
                <View style={styles.metadataTag}>
                  <Text style={styles.metadataTagText}>{meal.aiMetadata.cuisineType}</Text>
                </View>
              )}
              {meal.aiMetadata.foodType && meal.aiMetadata.foodType.length > 0 && 
               !meal.aiMetadata.foodType.includes('Unknown') && (
                <>
                  {Array.isArray(meal.aiMetadata.foodType) ? (
                    meal.aiMetadata.foodType.map((food, index) => (
                      <View key={`food-${index}`} style={styles.metadataTag}>
                        <Text style={styles.metadataTagText}>{food}</Text>
                      </View>
                    ))
                  ) : (
                    // Handle old data that might still be a string
                    <View style={styles.metadataTag}>
                      <Text style={styles.metadataTagText}>{meal.aiMetadata.foodType}</Text>
                    </View>
                  )}
                </>
              )}
              {meal.aiMetadata.mealType && meal.aiMetadata.mealType !== 'Unknown' && (
                <View style={styles.metadataTag}>
                  <Text style={styles.metadataTagText}>{meal.aiMetadata.mealType}</Text>
                </View>
              )}
              {meal.aiMetadata.primaryProtein && meal.aiMetadata.primaryProtein !== 'Unknown' && (
                <View style={styles.metadataTag}>
                  <Text style={styles.metadataTagText}>{meal.aiMetadata.primaryProtein}</Text>
                </View>
              )}
              {meal.aiMetadata.dietType && meal.aiMetadata.dietType !== 'Unknown' && (
                <View style={styles.metadataTag}>
                  <Text style={styles.metadataTagText}>{meal.aiMetadata.dietType}</Text>
                </View>
              )}
              {/* City tag */}
              {(meal.location?.city || meal.city) && (
                <View style={[styles.metadataTag, styles.cityTag]}>
                  <Text style={styles.metadataTagText}>{meal.location?.city || meal.city}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Enhanced Metadata Section - COMMENTED OUT, using combined metadata instead */}
        {/* 
        {meal.metadata_enriched && (
          <View style={[styles.metadataSection, styles.enhancedMetadataSection]}>
            <Text style={styles.enhancedMetadataTitle}>Enhanced Metadata (Testing)</Text>
            
            {/* Two-tier categorization */}
            {/*
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Specific Dish:</Text>
              <Text style={styles.metadataValue}>{meal.metadata_enriched.dish_specific}</Text>
            </View>
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>General Category:</Text>
              <Text style={styles.metadataValue}>{meal.metadata_enriched.dish_general}</Text>
            </View>
            
            {/* Cuisine and confidence */}
            {/*
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Cuisine:</Text>
              <Text style={styles.metadataValue}>
                {meal.metadata_enriched.cuisine_type} 
                {meal.metadata_enriched.confidence_score && 
                  ` (${Math.round(meal.metadata_enriched.confidence_score * 100)}% confident)`}
              </Text>
            </View>
            
            {/* Interesting ingredient - highlighted */}
            {/*
            {meal.metadata_enriched.interesting_ingredient && meal.metadata_enriched.interesting_ingredient !== 'Unknown' && (
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Star Ingredient:</Text>
                <Text style={[styles.metadataValue, styles.interestingIngredient]}>
                  ⭐ {meal.metadata_enriched.interesting_ingredient}
                </Text>
              </View>
            )}
            
            {/* Key ingredients */}
            {/*
            {meal.metadata_enriched.key_ingredients && meal.metadata_enriched.key_ingredients.length > 0 && (
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Ingredients:</Text>
                <Text style={styles.metadataValue}>
                  {meal.metadata_enriched.key_ingredients.join(', ')}
                </Text>
              </View>
            )}
            
            {/* Flavor profile */}
            {/*
            {meal.metadata_enriched.flavor_profile && meal.metadata_enriched.flavor_profile.length > 0 && (
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Flavors:</Text>
                <Text style={styles.metadataValue}>
                  {meal.metadata_enriched.flavor_profile.join(', ')}
                </Text>
              </View>
            )}
            
            {/* Dietary info */}
            {/*
            {meal.metadata_enriched.dietary_info && meal.metadata_enriched.dietary_info.length > 0 && (
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Dietary:</Text>
                <Text style={styles.metadataValue}>
                  {meal.metadata_enriched.dietary_info.join(', ')}
                </Text>
              </View>
            )}
            
            {/* Cooking method and presentation */}
            {/*
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Cooking Method:</Text>
              <Text style={styles.metadataValue}>{meal.metadata_enriched.cooking_method}</Text>
            </View>
            
            {/* Normalization info */}
            {/*
            {meal.metadata_enriched.matched_to_existing && (
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Normalized to:</Text>
                <Text style={styles.metadataValue}>
                  {meal.metadata_enriched.dish_specific_normalized}
                </Text>
              </View>
            )}
          </View>
        )}
        */}


        {/* AI Analysis Results - Updated for new service structure */}
        {(meal.quick_criteria_result || meal.enhanced_metadata_facts || combinedResult) && (
          <View style={[styles.metadataSection, styles.combinedTestSection]}>
            <Text style={styles.combinedTestTitle}>🤖 AI Analysis Results</Text>
            
            {/* Basic Dish Information - from quick criteria */}
            {meal.quick_criteria_result && (
              <>
                <Text style={styles.combinedTestSubtitle}>Dish Information:</Text>
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Dish Specific:</Text>
                  <Text style={styles.metadataValue}>{meal.quick_criteria_result.dish_specific}</Text>
                </View>
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Dish General:</Text>
                  <Text style={styles.metadataValue}>{meal.quick_criteria_result.dish_general}</Text>
                </View>
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Cuisine:</Text>
                  <Text style={styles.metadataValue}>{meal.quick_criteria_result.cuisine_type}</Text>
                </View>
              </>
            )}
            
            {/* Enhanced Metadata - from enhanced service */}
            {meal.enhanced_metadata_facts?.metadata && (
              <>
                <Text style={styles.combinedTestSubtitle}>Enhanced Metadata:</Text>
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Meal Type:</Text>
                  <Text style={styles.metadataValue}>{meal.enhanced_metadata_facts.metadata.meal_type}</Text>
                </View>
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Cooking Method:</Text>
                  <Text style={styles.metadataValue}>{meal.enhanced_metadata_facts.metadata.cooking_method}</Text>
                </View>
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Presentation:</Text>
                  <Text style={styles.metadataValue}>{meal.enhanced_metadata_facts.metadata.presentation_style}</Text>
                </View>
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Confidence:</Text>
                  <Text style={[styles.metadataValue, { color: meal.enhanced_metadata_facts.metadata.confidence_score >= 0.8 ? '#4CAF50' : meal.enhanced_metadata_facts.metadata.confidence_score >= 0.6 ? '#FF9800' : '#F44336' }]}>
                    {(meal.enhanced_metadata_facts.metadata.confidence_score * 100).toFixed(0)}%
                  </Text>
                </View>
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Key Ingredients:</Text>
                  <Text style={styles.metadataValue}>{meal.enhanced_metadata_facts.metadata.key_ingredients?.join(', ') || 'N/A'}</Text>
                </View>
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Flavor Profile:</Text>
                  <Text style={styles.metadataValue}>{meal.enhanced_metadata_facts.metadata.flavor_profile?.join(', ') || 'N/A'}</Text>
                </View>
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Dietary Info:</Text>
                  <Text style={styles.metadataValue}>{meal.enhanced_metadata_facts.metadata.dietary_info?.join(', ') || 'N/A'}</Text>
                </View>
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Special Ingredient:</Text>
                  <Text style={[styles.metadataValue, { fontStyle: 'italic' }]}>{meal.enhanced_metadata_facts.metadata.interesting_ingredient}</Text>
                </View>
              </>
            )}
            
            {/* Dish Criteria from Quick Service */}
            <Text style={styles.combinedTestSubtitle}>What to Look For 🍽️</Text>
            {(meal.quick_criteria_result?.dish_criteria || combinedResult?.dish_criteria?.criteria || []).map((criterion, index) => {
              const userRating = criteriaRatings?.[criterion.title];
              return (
                <View key={index} style={styles.criterionItem}>
                  <View style={styles.criterionHeader}>
                    <Text style={styles.criterionNumber}>{index + 1}.</Text>
                    <Text style={styles.criterionTitle}>{criterion.title}</Text>
                    {userRating && (
                      <View style={[styles.ratingBadge, { backgroundColor: getRatingColor(userRating) }]}>
                        <Text style={styles.ratingBadgeText}>{userRating}/10</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.criterionDescription}>{criterion.description}</Text>
                  {userRating && (
                    <Text style={styles.userRatingNote}>
                      Your rating: <Text style={{ color: getRatingColor(userRating), fontWeight: 'bold' }}>{userRating}/10</Text>
                    </Text>
                  )}
                </View>
              );
            })}
            
            {criteriaRatings && Object.keys(criteriaRatings).length > 0 && (
              <View style={styles.ratingSummary}>
                <Text style={styles.ratingSummaryTitle}>Your Detailed Rating Summary</Text>
                <View style={styles.averageRatingContainer}>
                  <Text style={styles.averageRatingLabel}>Average Score:</Text>
                  <Text style={[
                    styles.averageRatingValue,
                    { color: getRatingColor(Object.values(criteriaRatings).reduce((sum, rating) => sum + rating, 0) / Object.values(criteriaRatings).length) }
                  ]}>
                    {(Object.values(criteriaRatings).reduce((sum, rating) => sum + rating, 0) / Object.values(criteriaRatings).length).toFixed(1)}/10
                  </Text>
                </View>
              </View>
            )}
            
            <Text style={styles.criteriaFooter}>
              Use these indicators to mindfully appreciate your dining experience ✨
            </Text>
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
              <Text style={styles.buttonText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.editButton}
              onPress={() => navigation.navigate('EditMeal', { 
                mealId: mealId, 
                meal,
                // Pass navigation context so EditMeal can navigate back properly
                previousScreen: route.params?.previousScreen || 'FoodPassport',
                previousTabIndex: route.params?.previousTabIndex,
                passportUserId: route.params?.passportUserId,
                passportUserName: route.params?.passportUserName,
                passportUserPhoto: route.params?.passportUserPhoto
              })}
            >
              <Text style={styles.buttonText}>Edit</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDeleteMeal}
            >
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
  headerMapIcon: {
    width: 24,
    height: 24,
    // No tintColor - preserves original icon colors
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
    backgroundColor: '#fff',
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
    backgroundColor: '#fff',
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
  photosSection: {
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 10,
  },
  detailsContainer: {
    paddingTop: 16, // Reduced from 20 to tighten top spacing
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#fff',
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
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  titleContent: {
    flex: 1,
  },
  mealNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  mealName: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    color: '#1a2b49',
    flex: 1,
  },
  mapIcon: {
    marginLeft: 8,
    opacity: 0.7,
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
    marginTop: 8, // Add dynamic top margin
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
  restaurantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8, // Consistent spacing
  },
  externalLinkIcon: {
    marginLeft: 6,
    opacity: 0.7,
  },
  usernameText: {
    fontSize: 16,
    marginLeft: 8,
    color: '#1a2b49',
    textDecorationLine: 'underline',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  userIconContainer: {
    width: 24, 
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  userAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8, // Consistent spacing
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
    backgroundColor: '#FAF9F6',
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
    backgroundColor: '#fff',
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
    paddingTop: 10, // Reduced top padding to pull buttons higher
    alignItems: 'center', // Ensure vertical alignment
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent', // Changed to transparent background
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 5,
    flex: 1, // Make all buttons take equal space
    maxWidth: '30%', // Limit maximum width
    borderWidth: 1,
    borderColor: '#1a2b49', // Navy blue outline
  },
  buttonText: {
    color: '#1a2b49', // Navy blue text
    fontWeight: '600',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  buttonIcon: {
    width: 20,
    height: 20,
    tintColor: '#1a2b49', // Changed to navy blue
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
    backgroundColor: 'transparent', // Changed to transparent background
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 5,
    flex: 1, // Make all buttons take equal space
    maxWidth: '30%', // Limit maximum width
    borderWidth: 1,
    borderColor: '#1a2b49', // Navy blue outline
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent', // Changed to transparent background
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 5,
    flex: 1, // Make all buttons take equal space
    maxWidth: '30%', // Limit maximum width
    borderWidth: 1,
    borderColor: '#1a2b49', // Navy blue outline
  },
  wideShareButton: {
    width: '70%', // Make the button wider when it's the only one
    maxWidth: '70%', // Override the maxWidth constraint from shareButton
    paddingHorizontal: 40, // Increase horizontal padding
    paddingVertical: 15, // Make the button taller
    borderWidth: 1,
    borderColor: '#1a2b49', // Navy blue outline
  },
  singleButtonContainer: {
    width: '100%',
    alignItems: 'center', // Center the single button
    justifyContent: 'center',
  },
  // AI Metadata styles
  metadataSection: {
    marginTop: 20,
    marginBottom: 10,
  },
  metadataTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a2b49',
    marginBottom: 10,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  metadataTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  metadataTag: {
    backgroundColor: '#ffc008',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  cityTag: {
    backgroundColor: '#1a2b49', // Navy blue to match app theme
  },
  metadataTagText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  // Header cheers icon (moved from title area)
  headerCheersIcon: {
    width: 28, // Increased from 24
    height: 28, // Increased from 24
    // No tintColor - preserves original icon colors
  },
  // Title wishlist button (moved from header)
  titleWishlistButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'transparent',
    marginLeft: 0, // Remove left margin since it's in a column now
    marginRight: 0,
    marginTop: 0, // Remove negative margin for better alignment
  },
  titleWishlistIcon: {
    width: 28,
    height: 28,
    // No tintColor - preserves original icon colors
  },
  cheersCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffc008',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 0, // Remove left margin since it's in a column now
    marginTop: 6, // Slightly reduced space to match button spacing
  },
  cheersCountIcon: {
    width: 16,
    height: 16,
    // No tintColor - preserves original icon colors
    marginRight: 4,
  },
  cheersCountText: {
    color: '#1a2b49',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  // New styles for meal info layout
  mealInfoColumn: {
    flex: 1,
    flexDirection: 'column',
  },
  mealNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  // Button column for wishlist and cheers buttons
  buttonColumn: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginLeft: 16, // Add some space from the content
  },
  // Title cheers button (moved from header)
  titleCheersButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'transparent',
    marginTop: 8, // Space below wishlist button
  },
  titleCheersIcon: {
    width: 28,
    height: 28,
    // No tintColor - preserves original icon colors
  },
  // Enhanced metadata styles
  enhancedMetadataSection: {
    backgroundColor: '#f0f8ff', // Light blue background to distinguish from regular metadata
    borderRadius: 8,
    padding: 15,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#d0e7ff',
  },
  enhancedMetadataTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a2b49',
    marginBottom: 12,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  metadataRow: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  metadataLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a2b49',
    minWidth: 120,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  metadataValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  interestingIngredient: {
    fontWeight: 'bold',
    color: '#ff6b6b', // Bright color to make it stand out
    fontSize: 15, // Slightly larger
  },
  // Dish criteria styles
  dishCriteriaSection: {
    backgroundColor: '#f8fff8', // Very light green background for mindful eating theme
    borderRadius: 12,
    padding: 16,
    marginTop: 15,
    borderWidth: 1,
    borderColor: '#e0f2e0',
  },
  dishCriteriaTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d5016', // Dark green for mindful eating theme
    marginBottom: 4,
    textAlign: 'center',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  dishCriteriaSubtitle: {
    fontSize: 14,
    color: '#5a7c47',
    textAlign: 'center',
    marginBottom: 16,
    fontStyle: 'italic',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  criterionItem: {
    marginBottom: 12,
    paddingLeft: 8,
  },
  criterionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  ratingBadge: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    minWidth: 40,
    alignItems: 'center',
  },
  ratingBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  userRatingNote: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  ratingSummary: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#28a745',
  },
  ratingSummaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a2b49',
    marginBottom: 8,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  averageRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  averageRatingLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 8,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  averageRatingValue: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  criterionNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2d5016',
    marginRight: 8,
    minWidth: 20,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  criterionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2d5016',
    flex: 1,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  criterionDescription: {
    fontSize: 13,
    color: '#4a6741',
    lineHeight: 18,
    marginLeft: 28,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  criteriaFooter: {
    fontSize: 12,
    color: '#5a7c47',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  loadingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginTop: 10,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  // Combined test section styles
  combinedTestSection: {
    backgroundColor: '#fff8e1', // Light yellow background for testing
    borderRadius: 12,
    padding: 16,
    marginTop: 15,
    borderWidth: 2,
    borderColor: '#ffc107',
    borderStyle: 'dashed',
  },
  combinedTestTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f57f17', // Darker yellow/orange for testing
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  combinedTestSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef6c00',
    marginTop: 12,
    marginBottom: 8,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
});

export default MealDetailScreen;
