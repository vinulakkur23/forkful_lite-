import React, { useState, useEffect, useCallback } from 'react';
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
import MultiPhotoGallery, { PhotoItem } from '../components/MultiPhotoGallery';
import DynamicCriteriaRating from '../components/DynamicCriteriaRating';
import { DishCriterion } from '../services/dishCriteriaService';
import { generateNextDishChallenge } from '../services/nextDishChallengeService';
import { saveUserChallenge, hasActiveChallengeForDish, getPreviousChallengeNames } from '../services/userChallengesService';
import challengeNotificationService from '../services/challengeNotificationService';
import { RootStackParamList, TabParamList } from '../App';
import { firebase, auth, firestore, storage } from '../firebaseConfig';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import * as ImagePicker from 'react-native-image-picker';
import ImageResizer from 'react-native-image-resizer';
import Geolocation from '@react-native-community/geolocation';

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
  const { mealId, meal: initialMeal } = route.params;
  
  // State for the current meal data (will be refreshed from Firestore)
  const [meal, setMeal] = useState(initialMeal);

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
  
  // State for dish criteria and detailed ratings
  const [dishCriteria, setDishCriteria] = useState<DishCriterion[]>([]);
  const [criteriaRatings, setCriteriaRatings] = useState<{ [key: string]: number }>({});
  
  // Photo management state - will be populated when fresh data is loaded
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState<boolean>(false);
  
  // Function to fetch fresh meal data from Firestore
  const fetchFreshMealData = async () => {
    try {
      console.log('EditMealScreen - Fetching fresh meal data for ID:', mealId);
      const mealDoc = await firestore().collection('mealEntries').doc(mealId).get();
      
      if (!mealDoc.exists) {
        Alert.alert('Error', 'Meal not found');
        navigation.goBack();
        return;
      }
      
      const freshMealData = { id: mealDoc.id, ...mealDoc.data() };
      console.log('EditMealScreen - Fresh meal data fetched:', {
        id: freshMealData.id,
        hasPhotos: !!freshMealData.photos,
        photosCount: freshMealData.photos?.length || 0,
        hasPhotoUrl: !!freshMealData.photoUrl,
        hasDishCriteria: !!freshMealData.dish_criteria,
        hasCriteriaArray: !!freshMealData.dish_criteria?.criteria,
        dishCriteriaLength: freshMealData.dish_criteria?.criteria?.length || 0,
        hasCombinedResult: !!freshMealData.combined_result,
        hasCombinedCriteria: !!freshMealData.combined_result?.dish_criteria?.criteria,
        combinedCriteriaLength: freshMealData.combined_result?.dish_criteria?.criteria?.length || 0,
        allFields: Object.keys(freshMealData)
      });
      
      setMeal(freshMealData);
    } catch (error) {
      console.error('EditMealScreen - Error fetching fresh meal data:', error);
      Alert.alert('Error', 'Failed to load meal data');
    }
  };
  
  // Fetch fresh data on mount
  useEffect(() => {
    fetchFreshMealData();
  }, [mealId]);
  
  // Handle processed photo returned from CropScreen
  const handleProcessedPhotoReturn = useCallback(async (processedImageUri: string) => {
    try {
      setUploadingPhoto(true);
      
      // Upload the processed photo to storage
      const downloadURL = await uploadPhotoToStorage(processedImageUri);
      
      // Add to photos array
      const newPhoto: PhotoItem = {
        url: downloadURL,
        isFlagship: photos.length === 0, // First photo becomes flagship
        order: photos.length,
        uploadedAt: new Date()
      };
      
      setPhotos(prev => [...prev, newPhoto]);
      
      console.log('EditMealScreen: Added processed photo to meal:', downloadURL);
      
    } catch (error) {
      console.error('Error adding processed photo:', error);
      Alert.alert('Error', 'Failed to add photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  }, [photos.length]);
  
  // Check if we're returning from CropScreen with a processed photo
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // Check if there's a processed photo waiting for us
      const params = route.params as any;
      if (params?.processedPhotoUri) {
        console.log('EditMealScreen: Received processed photo from CropScreen:', params.processedPhotoUri);
        handleProcessedPhotoReturn(params.processedPhotoUri);
        
        // Clear the parameter to prevent reprocessing
        navigation.setParams({ processedPhotoUri: undefined });
      }
    });

    return unsubscribe;
  }, [navigation, route.params, handleProcessedPhotoReturn]);
  
  // Debug: Log the initial values
  useEffect(() => {
    console.log('EditMealScreen - Initial meal data:', {
      rating: meal.rating,
      thoughtsNew: meal.comments?.thoughts,
      thoughtsLegacyLiked: meal.comments?.liked,
      thoughtsLegacyDisliked: meal.comments?.disliked,
      hasComments: !!meal.comments,
      hasDishCriteria: !!meal.dish_criteria,
      dishCriteriaLength: meal.dish_criteria?.length || 0,
      dishCriteriaData: meal.dish_criteria,
      allKeys: Object.keys(meal)
    });
  }, []);

  // Update state if meal data changes (e.g., if screen is reused)
  useEffect(() => {
    console.log('EditMealScreen - Meal data changed, updating state');
    setRating(meal.rating || 0);
    
    // Update photos from meal data
    if (meal.photos && Array.isArray(meal.photos)) {
      // New format - meal has photos array
      console.log('EditMealScreen - Loading photos from meal.photos:', meal.photos);
      setPhotos(meal.photos);
    } else if (meal.photoUrl) {
      // Legacy format - convert single photo to array
      console.log('EditMealScreen - Converting single photoUrl to photos array:', meal.photoUrl);
      setPhotos([{
        url: meal.photoUrl,
        isFlagship: true,
        order: 0,
        uploadedAt: meal.createdAt
      }]);
    } else {
      console.log('EditMealScreen - No photos found in meal data');
      setPhotos([]);
    }
    
    // Load dish criteria and ratings from combined service (preferred) or fallback to separate service
    console.log('EditMealScreen - Checking for dish criteria in meal:', {
      hasCombinedResult: !!meal.combined_result,
      hasCombinedCriteria: !!meal.combined_result?.dish_criteria?.criteria,
      combinedCriteriaLength: meal.combined_result?.dish_criteria?.criteria?.length || 0,
      hasSeparateCriteria: !!meal.dish_criteria?.criteria,
      separateCriteriaLength: meal.dish_criteria?.criteria?.length || 0
    });
    
    // Try to find criteria in the following priority order:
    // 1. Converted criteria from quick service (saved by ResultScreen)
    // 2. Combined service criteria (legacy)
    // 3. Quick criteria result (raw format, needs conversion)
    let criteriaToUse = null;
    
    // First check for converted criteria saved by ResultScreen
    if (meal.dish_criteria?.criteria && Array.isArray(meal.dish_criteria.criteria)) {
      console.log('EditMealScreen - Using converted criteria from dish_criteria:', meal.dish_criteria.criteria);
      criteriaToUse = meal.dish_criteria.criteria;
    } 
    // Fallback to combined service format
    else if (meal.combined_result?.dish_criteria?.criteria && Array.isArray(meal.combined_result.dish_criteria.criteria)) {
      console.log('EditMealScreen - Using criteria from combined service:', meal.combined_result.dish_criteria.criteria);
      criteriaToUse = meal.combined_result.dish_criteria.criteria;
    }
    // If we have raw quick criteria result, convert it
    else if (meal.quick_criteria_result?.dish_criteria && Array.isArray(meal.quick_criteria_result.dish_criteria)) {
      console.log('EditMealScreen - Converting raw quick criteria result:', meal.quick_criteria_result.dish_criteria);
      criteriaToUse = meal.quick_criteria_result.dish_criteria.map(criterion => ({
        title: criterion.name || 'Quality Aspect',
        description: `${criterion.what_to_look_for || ''} ${criterion.insight || ''}`.trim()
      }));
    }
    
    if (criteriaToUse) {
      setDishCriteria(criteriaToUse);
      
      // Load existing criteria ratings if available
      if (meal.criteria_ratings) {
        console.log('EditMealScreen - Loading existing criteria ratings:', meal.criteria_ratings);
        setCriteriaRatings(meal.criteria_ratings);
      } else {
        // Initialize with default ratings if no previous ratings exist
        const defaultRatings: { [key: string]: number } = {};
        criteriaToUse.forEach((criterion: DishCriterion) => {
          defaultRatings[criterion.title] = 5; // Default to 5/10
        });
        console.log('EditMealScreen - Created default ratings:', defaultRatings);
        setCriteriaRatings(defaultRatings);
      }
    } else {
      console.log('EditMealScreen - No dish criteria found in meal data');
      setDishCriteria([]);
      setCriteriaRatings({});
    }
    
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
  }, [meal.id, meal.rating, meal.photoUrl, meal.photos, meal.dish_criteria, meal.criteria_ratings, meal.comments?.thoughts, meal.comments?.liked, meal.comments?.disliked]);
  
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
    
    // Check if criteria ratings have changed
    const originalCriteriaRatings = meal.criteria_ratings || {};
    const isCriteriaRatingsChanged = JSON.stringify(criteriaRatings) !== JSON.stringify(originalCriteriaRatings);
    
    setHasUnsavedChanges(isRatingChanged || isThoughtsChanged || isCriteriaRatingsChanged);
  }, [rating, thoughts, criteriaRatings, meal]);

  const handleRating = (selectedRating: number): void => {
    setRating(selectedRating);
  };

  const handleCriteriaRatingsChange = (ratings: { [key: string]: number }): void => {
    setCriteriaRatings(ratings);
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

  // Photo upload and management functions
  const uploadPhotoToStorage = async (imageUri: string): Promise<string> => {
    try {
      // Compress image before upload
      const compressedImage = await ImageResizer.createResizedImage(
        imageUri,
        800,
        800,
        'JPEG',
        85,
        0,
        undefined,
        false,
        {
          mode: 'contain',
          onlyScaleDown: true,
        }
      );

      // Create unique filename
      const timestamp = Date.now();
      const filename = `meals/${meal.userId}/${mealId}/photo_${timestamp}.jpg`;
      
      // Upload to Firebase Storage
      const reference = storage().ref(filename);
      await reference.putFile(compressedImage.uri);
      
      // Get download URL
      const downloadURL = await reference.getDownloadURL();
      return downloadURL;
    } catch (error) {
      console.error('Error uploading photo:', error);
      throw error;
    }
  };

  const handleAddPhoto = () => {
    if (photos.length >= 5) {
      Alert.alert('Limit Reached', 'You can add up to 5 photos per meal.');
      return;
    }

    const options = {
      mediaType: 'photo' as const,
      includeBase64: false,
      maxHeight: 2000,
      maxWidth: 2000,
      quality: 0.8,
    };

    Alert.alert(
      'Add Photo',
      'Choose photo source',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Camera', 
          onPress: () => {
            ImagePicker.launchCamera(options, handleImagePickerResponse);
          }
        },
        { 
          text: 'Gallery', 
          onPress: () => {
            ImagePicker.launchImageLibrary(options, handleImagePickerResponse);
          }
        }
      ]
    );
  };

  const handleImagePickerResponse = async (response: any) => {
    if (response.didCancel || response.errorCode || !response.assets?.[0]) {
      return;
    }

    const asset = response.assets[0];
    if (!asset.uri) {
      Alert.alert('Error', 'Failed to get image data');
      return;
    }

    // Create photo object for CropScreen
    const photoObject = {
      uri: asset.uri,
      width: asset.width || 1000,
      height: asset.height || 1000
    };

    // Get current location for the crop screen
    Geolocation.getCurrentPosition(
      position => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          source: 'device'
        };

        // Navigate to CropScreen for editing before adding to meal
        navigation.navigate('Crop', {
          photo: photoObject,
          location: location,
          photoSource: 'gallery',
          _navigationKey: `add_photo_${Date.now()}`,
          // New parameters to indicate this is adding to existing meal
          isAddingToExistingMeal: true,
          existingMealId: mealId,
          returnToEditMeal: true
        });
      },
      error => {
        console.log('Location error:', error);
        
        // Navigate without location info
        navigation.navigate('Crop', {
          photo: photoObject,
          location: null,
          photoSource: 'gallery',
          _navigationKey: `add_photo_${Date.now()}`,
          // New parameters to indicate this is adding to existing meal
          isAddingToExistingMeal: true,
          existingMealId: mealId,
          returnToEditMeal: true
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  const handleRemovePhoto = (index: number) => {
    const photoToRemove = photos[index];
    
    if (photoToRemove.isFlagship && photos.length > 1) {
      Alert.alert('Error', 'Cannot remove flagship photo. Set another photo as flagship first.');
      return;
    }

    setPhotos(prev => {
      const newPhotos = prev.filter((_, i) => i !== index);
      // Reorder remaining photos
      return newPhotos.map((photo, i) => ({ ...photo, order: i }));
    });
  };

  const handleSetFlagship = (index: number) => {
    setPhotos(prev => prev.map((photo, i) => ({
      ...photo,
      isFlagship: i === index
    })));
  };

  // Generate a challenge for the user based on their meal experience
  const generateChallengeForMeal = async (mealData: any) => {
    try {
      // Check if we have the necessary data for challenge generation
      const hasQuickCriteria = mealData.quick_criteria_result?.dish_criteria;
      const hasCombinedCriteria = mealData.combined_result?.dish_criteria?.criteria;
      
      if (!hasQuickCriteria && !hasCombinedCriteria) {
        console.log('EditMealScreen: No criteria data available for challenge generation');
        return;
      }

      // Extract dish information
      let dishSpecific, dishGeneral, criteria;
      
      if (hasQuickCriteria) {
        // Use new service data
        dishSpecific = mealData.quick_criteria_result.dish_specific;
        dishGeneral = mealData.quick_criteria_result.dish_general;
        criteria = mealData.quick_criteria_result.dish_criteria;
      } else if (hasCombinedCriteria) {
        // Use old combined service data
        dishSpecific = mealData.combined_result.dish_specific || mealData.meal || 'Unknown Dish';
        dishGeneral = mealData.combined_result.dish_general || 'Food';
        criteria = mealData.combined_result.dish_criteria.criteria;
      }

      // Check if user already has an active challenge for this dish
      const hasExistingChallenge = await hasActiveChallengeForDish(dishSpecific);
      if (hasExistingChallenge) {
        console.log('EditMealScreen: User already has an active challenge for this dish');
        return;
      }

      // Get user's city for context (if available)
      let userCity = undefined;
      if (mealData.city) {
        userCity = mealData.city;
      } else if (mealData.location?.city) {
        userCity = mealData.location.city;
      }

      // Get previous challenges for context
      const previousChallenges = await getPreviousChallengeNames();

      console.log('EditMealScreen: Generating challenge for:', {
        dishSpecific,
        dishGeneral,
        criteriaCount: criteria?.length,
        userCity,
        previousChallengesCount: previousChallenges.length
      });

      // Generate the challenge
      const challenge = await generateNextDishChallenge(
        dishSpecific,
        dishGeneral,
        criteria,
        userCity,
        previousChallenges
      );

      if (challenge) {
        // Save the challenge to Firebase
        const success = await saveUserChallenge(challenge);
        if (success) {
          console.log('EditMealScreen: Challenge generated and saved:', challenge.recommended_dish_name);
          // Show challenge notification
          challengeNotificationService.showChallenge(challenge);
        } else {
          console.error('EditMealScreen: Failed to save challenge to Firebase');
        }
      } else {
        console.error('EditMealScreen: Failed to generate challenge');
      }
    } catch (error) {
      console.error('EditMealScreen: Error generating challenge:', error);
      // Don't show error to user - this is a background operation
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
    
    // Check if photos have changed
    const originalPhotos = (() => {
      if (meal.photos && Array.isArray(meal.photos)) {
        return meal.photos;
      } else if (meal.photoUrl) {
        return [{
          url: meal.photoUrl,
          isFlagship: true,
          order: 0,
          uploadedAt: meal.createdAt
        }];
      }
      return [];
    })();
    
    const photosChanged = JSON.stringify(photos) !== JSON.stringify(originalPhotos);
    
    // Check if criteria ratings have changed
    const originalCriteriaRatings = meal.criteria_ratings || {};
    const criteriaRatingsChanged = JSON.stringify(criteriaRatings) !== JSON.stringify(originalCriteriaRatings);
    
    console.log('EditMealScreen - Change detection:', {
      ratingChanged: rating !== meal.rating,
      thoughtsChanged: thoughts !== originalThoughts,
      photosChanged,
      criteriaRatingsChanged,
      originalPhotosCount: originalPhotos.length,
      currentPhotosCount: photos.length,
      hasCriteria: dishCriteria.length > 0
    });
    
    if (rating === meal.rating && thoughts === originalThoughts && !photosChanged && !criteriaRatingsChanged) {
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
      const flagshipPhoto = photos.find(p => p.isFlagship);
      const updateData: any = {
        rating,
        comments: {
          thoughts: thoughts
        },
        photos: photos, // Store full photos array
        photoUrl: flagshipPhoto?.url || photos[0]?.url || meal.photoUrl, // Maintain backward compatibility
        updatedAt: firestore.FieldValue.serverTimestamp()
      };
      
      // Add criteria ratings if there are criteria
      if (dishCriteria.length > 0 && Object.keys(criteriaRatings).length > 0) {
        updateData.criteria_ratings = criteriaRatings;
        console.log('EditMealScreen - Including criteria ratings in save:', criteriaRatings);
      }
      
      // Debug logging
      console.log('EditMealScreen - Saving meal with data:', {
        mealId,
        photosCount: photos.length,
        photos: photos.map(p => ({ url: p.url, isFlagship: p.isFlagship, order: p.order })),
        flagshipPhotoUrl: flagshipPhoto?.url,
        rawPhotosArray: photos,
        updateDataPhotos: updateData.photos
      });
      
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
      
      // Verify the data was saved by reading it back
      const verifyDoc = await firestore().collection('mealEntries').doc(mealId).get();
      const verifyData = verifyDoc.data();
      console.log('EditMealScreen - Verification after save:', {
        mealId,
        hasPhotos: !!verifyData?.photos,
        photosLength: verifyData?.photos?.length,
        photosArray: verifyData?.photos
      });

      // Generate a challenge based on this meal experience (background operation)
      if (verifyData) {
        generateChallengeForMeal(verifyData).catch(error => {
          console.error('EditMealScreen: Background challenge generation failed:', error);
        });
      }

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
        <Text style={styles.headerTitle}>Rate and Edit</Text>
        <View style={styles.headerRightButton} />
      </View>

      <KeyboardAwareScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
      >
        {/* Meal photos */}
        <View style={styles.photosSection}>
          <MultiPhotoGallery
            photos={photos}
            onAddPhoto={handleAddPhoto}
            onRemovePhoto={handleRemovePhoto}
            onSetFlagship={handleSetFlagship}
            editable={true}
            maxPhotos={5}
          />
          {uploadingPhoto && (
            <View style={styles.uploadingOverlay}>
              <ActivityIndicator size="small" color="#ffc008" />
              <Text style={styles.uploadingText}>Uploading photo...</Text>
            </View>
          )}
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

          {/* Overall Rating Section */}
          <View style={styles.ratingSection}>
            <Text style={styles.sectionTitle}>Overall Rating:</Text>
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

          {/* Dynamic Criteria Rating Section */}
          {console.log('EditMealScreen - Render check:', { 
            dishCriteriaLength: dishCriteria.length, 
            criteriaRatingsKeys: Object.keys(criteriaRatings),
            shouldRender: dishCriteria.length > 0 
          })}
          {dishCriteria.length > 0 && (
            <View style={styles.criteriaSection}>
              {console.log('EditMealScreen - Rendering DynamicCriteriaRating with:', { 
                criteria: dishCriteria, 
                initialRatings: criteriaRatings 
              })}
              <DynamicCriteriaRating 
                criteria={dishCriteria}
                initialRatings={criteriaRatings}
                onRatingsChange={handleCriteriaRatingsChange}
              />
            </View>
          )}
          {/* Comments Section */}
          <View style={styles.commentsSection}>
            <Text style={styles.sectionTitle}>Dish it out! Let's hear your thoughts.</Text>
            <TextInput
              key={`thoughts-${mealId}`}
              style={styles.commentInput}
              placeholder="What did you enjoy about this meal? What could be better?"
              placeholderTextColor="#999"
              multiline={true}
              blurOnSubmit={false}
              value={thoughts}
              onChangeText={setThoughts}
              maxLength={600}
            />
            <Text style={styles.helperText}>
              Sharing will help others find your review helpful and allow us to give you better recommendations.
            </Text>
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
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  photosSection: {
    marginBottom: 15,
    position: 'relative',
  },
  uploadingOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  uploadingText: {
    marginLeft: 8,
    fontSize: 12,
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  detailsCard: {
    padding: 20,
    backgroundColor: '#fff',
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
  criteriaSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18, // Increased from 16 to 18 for larger font
    fontWeight: '600',
    marginBottom: 10, // Increased from 4 to 10 for better spacing
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
    marginBottom: 8, // Reduced from 20 to 8 to make room for helper text
    minHeight: 160, // Increased from 100 to 160 for bigger text box
    backgroundColor: 'white',
    textAlignVertical: 'top',
    fontSize: 15,
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    borderLeftWidth: 3,
    borderLeftColor: '#FFC008',
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    marginBottom: 20,
    fontStyle: 'italic',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
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