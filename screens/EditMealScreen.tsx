import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, SafeAreaView, ScrollView, Platform, Keyboard
} from 'react-native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import EmojiRating from '../components/EmojiRating';
import MultiPhotoGallery, { PhotoItem } from '../components/MultiPhotoGallery';
import { saveUserChallenge } from '../services/userChallengesService';
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
  
  // State for quick rating statements inline expansion
  const [showQuickRatingsExpansion, setShowQuickRatingsExpansion] = useState<boolean>(false);
  const [quickRatings, setQuickRatings] = useState<{ [key: string]: number }>({});
  const [currentStatementIndex, setCurrentStatementIndex] = useState<number>(0);
  const [pressedEmojiId, setPressedEmojiId] = useState<number | null>(null);
  const [showIngredientHistory, setShowIngredientHistory] = useState<boolean>(false);
  const [showRestaurantHistory, setShowRestaurantHistory] = useState<boolean>(false);
  
  // Double-click detection for emoji rating
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  const [lastClickedRating, setLastClickedRating] = useState<number>(0);
  
  // State to track if facts are being loaded
  const [factsLoading, setFactsLoading] = useState<boolean>(false);
  
  // State for pixel art data from Firestore
  const [pixelArtUrl, setPixelArtUrl] = useState<string | null>(null);
  const [pixelArtData, setPixelArtData] = useState<string | null>(null);
  
  // Photo management state - will be populated when fresh data is loaded
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState<boolean>(false);
  
  // Ref for scroll view
  const scrollViewRef = useRef<any>(null);
  const textInputRef = useRef<any>(null);
  
  // Function to fetch fresh meal data from Firestore (used for initial load)
  const fetchFreshMealData = async () => {
    try {
      console.log('EditMealScreen - Fetching fresh meal data for ID:', mealId);
      const mealDoc = await firestore().collection('mealEntries').doc(mealId).get();
      
      if (!mealDoc.exists) {
        console.log('EditMealScreen - Meal not found, navigating back silently');
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
        hasEnhancedFacts: !!freshMealData.enhanced_facts,
        allFields: Object.keys(freshMealData)
      });
      
      // Process fresh meal data
      processFreshMealData(freshMealData);
      
    } catch (error) {
      console.error('EditMealScreen - Error fetching fresh meal data:', error);
      // Remove alert - this can happen when returning from deletion
      console.log('Silenced error alert for meal data fetch');
    }
  };

  // Helper function to process meal data (shared between fetchFreshMealData and listener)
  const processFreshMealData = (freshMealData: any, isFromListener: boolean = false) => {
    // Check if facts are present, and update loading state accordingly
    const hasEnhancedFacts = !!freshMealData.enhanced_facts?.food_facts;
    const shouldShowFactsLoading = freshMealData.quick_criteria_result && !hasEnhancedFacts;
    
    if (shouldShowFactsLoading !== factsLoading) {
      setFactsLoading(shouldShowFactsLoading);
      if (shouldShowFactsLoading) {
        console.log('EditMealScreen - Facts loading started...');
      } else if (hasEnhancedFacts) {
        console.log('EditMealScreen - Facts loading completed!');
      }
    }
    
    // IMPORTANT: Set fresh data directly to state to avoid stale data issues
    setMeal(freshMealData);
    
    // Only update rating and thoughts if this is NOT from the listener
    // or if they haven't been locally modified (to preserve user's unsaved changes)
    if (!isFromListener) {
      // Initial load - set everything from database
      setRating(freshMealData.rating || 0);
      
      // Set thoughts
      if (freshMealData.comments?.thoughts) {
        setThoughts(freshMealData.comments.thoughts);
      } else if (freshMealData.comments?.liked || freshMealData.comments?.disliked) {
        const liked = freshMealData.comments?.liked || '';
        const disliked = freshMealData.comments?.disliked || '';
        if (liked && disliked) {
          setThoughts(`${liked}\n\n${disliked}`);
        } else {
          setThoughts(liked || disliked);
        }
      } else {
        setThoughts('');
      }
    }
    // If from listener, only update rating/thoughts if they match what's in the database
    // (i.e., user hasn't made local changes)
    else {
      // Don't overwrite local rating if user has changed it
      if (rating === meal.rating) {
        setRating(freshMealData.rating || 0);
      }
      
      // Don't overwrite local thoughts if user has changed them
      const currentDbThoughts = meal.comments?.thoughts || '';
      if (thoughts === currentDbThoughts) {
        if (freshMealData.comments?.thoughts) {
          setThoughts(freshMealData.comments.thoughts);
        }
      }
    }
    
    // Always update quick ratings from Firestore (these are saved immediately)
    if (freshMealData.quick_ratings) {
      setQuickRatings(freshMealData.quick_ratings);
      console.log('EditMealScreen - Loaded quick ratings:', freshMealData.quick_ratings);
    }
    
    // Load pixel art data from Firestore
    if (freshMealData.pixel_art_url) {
      setPixelArtUrl(freshMealData.pixel_art_url);
      console.log('EditMealScreen - Loaded pixel art URL from Firestore');
    }
    if (freshMealData.pixel_art_data) {
      setPixelArtData(freshMealData.pixel_art_data);
      console.log('EditMealScreen - Loaded pixel art data from Firestore');
    }
    
    // Set photos from fresh data
    if (freshMealData.photos && Array.isArray(freshMealData.photos)) {
      console.log('EditMealScreen - Setting photos from fresh data:', freshMealData.photos.length);
      setPhotos(freshMealData.photos);
    } else if (freshMealData.photoUrl) {
      console.log('EditMealScreen - Converting single photoUrl to photos array');
      setPhotos([{
        url: freshMealData.photoUrl,
        isFlagship: true,
        order: 0,
        uploadedAt: freshMealData.createdAt
      }]);
    } else {
      setPhotos([]);
    }

    // Only reset expansion state when NOT from listener or when expansion is not active
    // This prevents the listener from interfering with active quick rating sessions
    if (!isFromListener || !showQuickRatingsExpansion) {
      setCurrentStatementIndex(0);
      setShowQuickRatingsExpansion(false);
      // Don't reset quickRatings here - they should persist from Firestore data loaded above
    }
  };
  
  // Set up Firestore listener to watch for enhanced_facts updates
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    
    const setupFirestoreListener = () => {
      console.log('EditMealScreen - Setting up Firestore listener for meal:', mealId);
      
      unsubscribe = firestore()
        .collection('mealEntries')
        .doc(mealId)
        .onSnapshot(
          (documentSnapshot) => {
            if (documentSnapshot.exists) {
              const freshMealData = { id: documentSnapshot.id, ...documentSnapshot.data() };
              
              // Skip processing if quick ratings expansion is active to prevent interference
              if (showQuickRatingsExpansion) {
                console.log('EditMealScreen - Skipping listener update while quick ratings expansion is active');
                return;
              }
              
              // Log when enhanced_facts becomes available
              if (freshMealData.enhanced_facts && !meal.enhanced_facts) {
                console.log('EditMealScreen - Enhanced facts now available! Updating UI...');
              }
              
              // Process the fresh data (this will update the UI with new facts)
              processFreshMealData(freshMealData, true);
            }
          },
          (error) => {
            console.error('EditMealScreen - Firestore listener error:', error);
          }
        );
    };
    
    // Set up the listener immediately
    setupFirestoreListener();
    
    // Cleanup function
    return () => {
      if (unsubscribe) {
        console.log('EditMealScreen - Cleaning up Firestore listener');
        unsubscribe();
      }
    };
  }, [mealId, showQuickRatingsExpansion]); // Added showQuickRatingsExpansion dependency
  
  // Handle processed photo returned from CropScreen
  const handleProcessedPhotoReturn = useCallback(async (processedImageUri: string, editingPhotoIndex?: number) => {
    try {
      setUploadingPhoto(true);
      
      // Upload the processed photo to storage
      const downloadURL = await uploadPhotoToStorage(processedImageUri);
      
      if (editingPhotoIndex !== undefined && editingPhotoIndex >= 0) {
        // REPLACE existing photo at specific index
        console.log('EditMealScreen: Replacing photo at index', editingPhotoIndex, 'with:', downloadURL);
        
        setPhotos(prev => {
          const updatedPhotos = [...prev];
          if (editingPhotoIndex < updatedPhotos.length) {
            // Keep the same isFlagship status and order, just update URL and timestamp
            updatedPhotos[editingPhotoIndex] = {
              ...updatedPhotos[editingPhotoIndex],
              url: downloadURL,
              uploadedAt: new Date()
            };
          }
          return updatedPhotos;
        });
        
        console.log('EditMealScreen: Successfully replaced photo at index', editingPhotoIndex);
      } else {
        // ADD new photo (existing behavior)
        const newPhoto: PhotoItem = {
          url: downloadURL,
          isFlagship: photos.length === 0, // First photo becomes flagship
          order: photos.length,
          uploadedAt: new Date()
        };
        
        setPhotos(prev => [...prev, newPhoto]);
        console.log('EditMealScreen: Added new processed photo to meal:', downloadURL);
      }
      
    } catch (error) {
      console.error('Error processing photo:', error);
      Alert.alert('Error', 'Failed to process photo. Please try again.');
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
        console.log('EditMealScreen: Editing photo index:', params.editingPhotoIndex);
        handleProcessedPhotoReturn(params.processedPhotoUri, params.editingPhotoIndex);
        
        // Clear the parameters to prevent reprocessing
        navigation.setParams({ 
          processedPhotoUri: undefined,
          editingPhotoIndex: undefined 
        });
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

  // IMPORTANT: This effect is intentionally minimal to prevent stale data issues
  // All criteria, photos, and metadata are loaded fresh from Firestore by fetchFreshMealData()
  useEffect(() => {
    console.log('EditMealScreen - Meal prop received, all data will be loaded fresh from Firestore');
    // DO NOT load criteria, photos, or metadata from props here - they will be stale
    // fetchFreshMealData() handles all data loading properly
  }, [meal.id]); // Only depend on meal ID
  
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
    Keyboard.dismiss();
    
    const currentTime = Date.now();
    const timeDiff = currentTime - lastClickTime;
    
    // Check for double-click (within 500ms and same rating)
    if (timeDiff < 500 && selectedRating === lastClickedRating && selectedRating === rating) {
      console.log('EditMealScreen - Double-click detected, opening quick ratings expansion');
      handleOpenQuickRatings();
    } else {
      // Single click - just set the rating
      setRating(selectedRating);
    }
    
    // Update click tracking
    setLastClickTime(currentTime);
    setLastClickedRating(selectedRating);
  };

  // Handle quick ratings overlay
  const handleOpenQuickRatings = (): void => {
    Keyboard.dismiss();
    
    // Get statements from either new or old data structure
    const statements = meal.dish_rating_criteria?.rating_criteria || meal.quick_criteria_result?.rating_statements;
    
    if (statements && statements.length > 0) {
      // Find the first unrated statement
      let nextUnratedIndex = 0;
      for (let i = 0; i < statements.length; i++) {
        if (!quickRatings[statements[i]]) {
          nextUnratedIndex = i;
          break;
        }
      }
      
      console.log('EditMealScreen - Opening quick ratings at index:', nextUnratedIndex, 'Total rated:', Object.keys(quickRatings).length);
      setCurrentStatementIndex(nextUnratedIndex);
      setShowQuickRatingsExpansion(true);
    } else {
      Alert.alert('No Rating Statements', 'No rating statements are available for this meal.');
    }
  };

  const handleQuickRating = async (rating: number): Promise<void> => {
    // Get statements from either new or old data structure
    const statements = meal.dish_rating_criteria?.rating_criteria || meal.quick_criteria_result?.rating_statements;
    if (!statements) return;
    
    // Show press feedback briefly
    setPressedEmojiId(rating);
    
    // Brief delay to show the press feedback
    setTimeout(async () => {
      const currentStatement = statements[currentStatementIndex];
      
      // Save the rating for this statement
      const updatedRatings = {
        ...quickRatings,
        [currentStatement]: rating
      };
      setQuickRatings(updatedRatings);
      
      // Save to Firestore immediately
      try {
        await firestore().collection('mealEntries').doc(mealId).update({
          quick_ratings: updatedRatings
        });
        console.log('Quick rating saved to Firestore:', { statement: currentStatement, rating });
      } catch (error) {
        console.error('Error saving quick rating:', error);
      }
      
      // Reset press feedback
      setPressedEmojiId(null);
      
      // Move to next statement or show ingredient history
      if (currentStatementIndex < statements.length - 1) {
        setCurrentStatementIndex(currentStatementIndex + 1);
      } else {
        // All statements rated, show ingredient history if available
        if (meal.dish_insights?.restaurant_fact || meal.enhanced_facts?.food_facts?.ingredient_history) {
          setShowQuickRatingsExpansion(false);
          setShowIngredientHistory(true);
        } else {
          // No ingredient history, just close
          setShowQuickRatingsExpansion(false);
          setCurrentStatementIndex(0);
        }
      }
    }, 150); // 150ms delay for visual feedback
  };

  const handleCloseQuickRatings = (): void => {
    setShowQuickRatingsExpansion(false);
    setCurrentStatementIndex(0);
  };

  const handleCloseIngredientHistory = (): void => {
    setShowIngredientHistory(false);
    setCurrentStatementIndex(0);
  };

  const handleCloseRestaurantHistory = (): void => {
    setShowRestaurantHistory(false);
    // Navigate to meal detail after closing restaurant history
    navigation.navigate('MealDetail', { 
      mealId: mealId,
      justEdited: true,
      // Pass through navigation context
      previousScreen: route.params?.previousScreen,
      previousTabIndex: route.params?.previousTabIndex,
      passportUserId: route.params?.passportUserId,
      passportUserName: route.params?.passportUserName,
      passportUserPhoto: route.params?.passportUserPhoto
    });
  };

  // Helper function to render text with bold formatting
  const renderTextWithBold = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const boldText = part.slice(2, -2);
        return <Text key={index} style={styles.boldText}>{boldText}</Text>;
      }
      return <Text key={index}>{part}</Text>;
    });
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
      // Compress image before upload - improved quality settings
      const compressedImage = await ImageResizer.createResizedImage(
        imageUri,
        1200, // Increased from 800 for better quality
        1200, // Increased from 800 for better quality
        'JPEG',
        90, // Increased from 85 to 90 for better quality
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

  const handlePhotoPress = async (index: number, photo: PhotoItem) => {
    console.log('Photo pressed:', index, photo.url);
    
    try {
      setUploadingPhoto(true);
      
      // Download the Firebase Storage image to local device first
      console.log('Downloading image for cropping:', photo.url);
      
      // Use ImageResizer to download and create a local copy
      const localImage = await ImageResizer.createResizedImage(
        photo.url,
        2000, // Max width - keep high resolution for editing
        2000, // Max height
        'JPEG',
        100,  // Full quality
        0,    // No rotation
        undefined, // Let it generate temp path
        false, // Don't keep metadata (can cause issues)
        {
          mode: 'contain',
          onlyScaleDown: false // Allow downloading
        }
      );
      
      console.log('Image downloaded to local path:', localImage.uri);
      
      // Navigate directly to CropScreen with local file path
      navigation.navigate('Crop', {
        photo: {
          uri: localImage.uri, // Use local file path
          width: localImage.width,
          height: localImage.height,
          originalUri: photo.url, // Keep reference to original
          fromGallery: true
        },
        location: null,
        photoSource: 'edit',
        _navigationKey: `edit_photo_${Date.now()}`,
        // Parameters to indicate this is editing an existing meal photo
        isAddingToExistingMeal: true,
        existingMealId: mealId,
        returnToEditMeal: true,
        // Pass the photo index to replace instead of add
        editingPhotoIndex: index
      });
      
    } catch (error) {
      console.error('Error downloading image for crop:', error);
      Alert.alert('Error', 'Failed to download image for editing. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
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
    
    console.log('EditMealScreen - Change detection:', {
      ratingChanged: rating !== meal.rating,
      thoughtsChanged: thoughts !== originalThoughts,
      photosChanged,
      originalPhotosCount: originalPhotos.length,
      currentPhotosCount: photos.length
    });
    
    if (rating === meal.rating && thoughts === originalThoughts && !photosChanged) {
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

      // Handle challenge generation asynchronously - don't block the save
      const handlePendingChallenge = async () => {
        try {
          const pendingChallenge = (global as any).pendingChallenge;
          const pendingChallengePromise = (global as any).pendingChallengePromise;
          
          if (pendingChallenge) {
            // Challenge is already ready, award it immediately
            console.log('EditMealScreen: Found ready challenge, awarding it:', pendingChallenge.recommended_dish_name);
            
            // Import services
            const { saveUserChallenge } = await import('../services/userChallengesService');
            const challengeNotificationService = (await import('../services/challengeNotificationService')).default;
            
            // Save the challenge to Firebase
            const success = await saveUserChallenge(pendingChallenge);
            if (success) {
              console.log('EditMealScreen: Challenge saved and awarded:', pendingChallenge.recommended_dish_name);
              // Show challenge notification
              challengeNotificationService.showChallenge(pendingChallenge);
            } else {
              console.error('EditMealScreen: Failed to save challenge to Firebase');
            }
            
            // Clear the pending challenge
            (global as any).pendingChallenge = null;
            (global as any).pendingChallengePromise = null;
          } else if (pendingChallengePromise) {
            // Challenge is still generating, wait for it IN THE BACKGROUND
            console.log('EditMealScreen: Challenge still generating, will award when ready...');
            
            // Don't await - let it run in background
            pendingChallengePromise.then(async (challenge) => {
              if (challenge) {
                console.log('EditMealScreen: Challenge completed in background:', challenge.recommended_dish_name);
                
                // Import services
                const { saveUserChallenge } = await import('../services/userChallengesService');
                const challengeNotificationService = (await import('../services/challengeNotificationService')).default;
                
                // Save and show the challenge
                const success = await saveUserChallenge(challenge);
                if (success) {
                  console.log('EditMealScreen: Background challenge saved and awarded:', challenge.recommended_dish_name);
                  challengeNotificationService.showChallenge(challenge);
                }
              }
            }).catch(error => {
              console.error('EditMealScreen: Background challenge generation failed:', error);
            }).finally(() => {
              // Clear the pending challenge promise
              (global as any).pendingChallenge = null;
              (global as any).pendingChallengePromise = null;
            });
          } else {
            console.log('EditMealScreen: No pending challenge found for edited meal (this is normal - challenges are only generated for new meals)');
            // DO NOT generate challenges for edited meals - they should already have one from when they were created
          }
        } catch (error) {
          console.error('EditMealScreen: Error handling pending challenge:', error);
        }
      };
      
      // Start handling the challenge asynchronously (don't await)
      handlePendingChallenge();

      // Show restaurant history overlay or go to meal detail
      if (meal.dish_insights?.dish_history || meal.enhanced_facts?.food_facts?.restaurant_history) {
        setShowRestaurantHistory(true);
      } else {
        // No restaurant history, go straight to meal detail
        navigation.navigate('MealDetail', { 
          mealId: mealId,
          justEdited: true,
          // Pass through navigation context
          previousScreen: route.params?.previousScreen,
          previousTabIndex: route.params?.previousTabIndex,
          passportUserId: route.params?.passportUserId,
          passportUserName: route.params?.passportUserName,
          passportUserPhoto: route.params?.passportUserPhoto
        });
      }
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
        ref={scrollViewRef}
        style={styles.container}
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        enableResetScrollToCoords={false}
        keyboardOpeningTime={0}
        extraScrollHeight={100}
        extraHeight={130}
      >
        {/* Meal photos */}
        <View style={styles.photosSection}>
          <MultiPhotoGallery
            photos={photos}
            onAddPhoto={handleAddPhoto}
            onRemovePhoto={handleRemovePhoto}
            onSetFlagship={handleSetFlagship}
            onPhotoPress={handlePhotoPress}
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
          {/* Rating Section - shows either main rating or detailed expansion */}
          <View style={styles.ratingSection}>
            {!showQuickRatingsExpansion ? (
              // Main Rating Mode
              <>
                <View style={styles.sectionTitleContainer}>
                  <Text style={styles.sectionTitle}>How was your meal?</Text>
                  <Text style={styles.sectionSubtitle}></Text>
                </View>
                <EmojiRating 
                  rating={rating} 
                  onRatingChange={handleRating}
                  size={40}
                  style={styles.interactiveRating}
                />
                
                {/* Rating Description and Ask Me More button */}
                {rating > 0 && (
                  <>
                    <View style={styles.ratingDescriptionContainer}>
                      <Text style={styles.ratingDescription}>
                        {EMOJI_DESCRIPTIONS[rating as keyof typeof EMOJI_DESCRIPTIONS]}
                      </Text>
                    </View>
                    {(meal.dish_rating_criteria?.rating_criteria || meal.quick_criteria_result?.rating_statements) && (
                      <TouchableOpacity 
                        style={styles.askMeMoreButton}
                        onPress={handleOpenQuickRatings}
                      >
                        <Text style={styles.askMeMoreButtonText}>Ask Me More!</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </>
            ) : (
              // Detailed Rating Mode - same styling as main rating
              (meal.dish_rating_criteria?.rating_criteria || meal.quick_criteria_result?.rating_statements) && (
                <>
                  <Text style={styles.ratingStatementText}>
                    <Text style={styles.optionalPrefix}>(Optional) </Text>
                    {renderTextWithBold(
                      (meal.dish_rating_criteria?.rating_criteria || meal.quick_criteria_result?.rating_statements)?.[currentStatementIndex] || ''
                    )}
                  </Text>
                  <EmojiRating 
                    rating={quickRatings[(meal.dish_rating_criteria?.rating_criteria || meal.quick_criteria_result?.rating_statements)?.[currentStatementIndex] || ''] || 0}
                    onRatingChange={handleQuickRating}
                    size={40}
                    style={styles.interactiveRating}
                    maxEmojis={3}
                  />
                  
                  {/* Navigation controls */}
                  <View style={styles.quickRatingNavigation}>
                    <TouchableOpacity 
                      style={[styles.navButton, currentStatementIndex === 0 && styles.navButtonDisabled]}
                      onPress={() => currentStatementIndex > 0 && setCurrentStatementIndex(currentStatementIndex - 1)}
                      disabled={currentStatementIndex === 0}
                    >
                      <Text style={[styles.navButtonText, currentStatementIndex === 0 && styles.navButtonTextDisabled]}>← Back</Text>
                    </TouchableOpacity>
                    
                    <Text style={styles.navProgress}>
                      {currentStatementIndex + 1} of {(meal.dish_rating_criteria?.rating_criteria || meal.quick_criteria_result?.rating_statements)?.length || 0}
                    </Text>
                    
                    <TouchableOpacity 
                      style={styles.navButton}
                      onPress={() => {
                        const statements = meal.dish_rating_criteria?.rating_criteria || meal.quick_criteria_result?.rating_statements;
                        if (statements && currentStatementIndex < statements.length - 1) {
                          setCurrentStatementIndex(currentStatementIndex + 1);
                        } else {
                          // Last statement - close the expansion
                          handleCloseQuickRatings();
                        }
                      }}
                    >
                      <Text style={styles.navButtonText}>
                        {currentStatementIndex === ((meal.dish_rating_criteria?.rating_criteria || meal.quick_criteria_result?.rating_statements)?.length || 0) - 1 
                          ? 'Skip' 
                          : 'Skip →'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )
            )}
          </View>

          {/* Comments Section */}
          <View style={styles.commentsSection}>
            <TextInput
              ref={textInputRef}
              key={`thoughts-${mealId}`}
              style={styles.commentInput}
              placeholder="What did you enjoy about this meal? What could be better?"
              placeholderTextColor="#999"
              multiline={true}
              blurOnSubmit={false}
              value={thoughts}
              onChangeText={setThoughts}
              maxLength={600}
              onFocus={() => {
                // Scroll to show the text input with some extra space
                setTimeout(() => {
                  if (textInputRef.current) {
                    textInputRef.current.measureInWindow((x, y, width, height) => {
                      // Calculate the position to scroll to
                      const scrollToY = y - 100; // Offset to show some content above
                      if (scrollViewRef.current && scrollViewRef.current.scrollToPosition) {
                        scrollViewRef.current.scrollToPosition(0, scrollToY, true);
                      }
                    });
                  }
                }, 300);
              }}
            />
            <Text style={styles.helperText}>
              Sharing will help others find your review helpful and allow us to give you better recommendations.
            </Text>
          </View>

          {/* Dish City History */}
          {(meal.dish_insights?.cultural_insight || meal.enhanced_facts?.food_facts?.dish_city_history) && (
            <View style={styles.cityHistorySection}>
              <Text style={styles.cityHistoryTitle}>Fun Fact!</Text>
              <Text style={styles.cityHistoryText}>
                {renderTextWithBold(
                  meal.dish_insights?.cultural_insight || 
                  meal.enhanced_facts?.food_facts?.dish_city_history || 
                  'Delicious!'
                )}
              </Text>
            </View>
          )}
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
            style={[styles.saveButton, (rating === 0 || photos.length === 0) && styles.disabledButton]}
            disabled={rating === 0 || photos.length === 0}
            onPress={saveMeal}
          >
            <Text style={styles.buttonText}>Save Changes</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>


      {/* Ingredient History Overlay */}
      {showIngredientHistory && (meal.dish_insights?.restaurant_fact || meal.enhanced_facts?.food_facts?.ingredient_history) && (
        <View style={styles.overlayContainer}>
          <View style={styles.overlayContent}>
            <View style={styles.overlayHeader}>
              <TouchableOpacity onPress={handleCloseIngredientHistory} style={styles.overlayCloseButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.factContainer}>
              <Text style={styles.factTitle}>Fun Fact!</Text>
              <Text style={styles.factText}>
                {renderTextWithBold(
                  meal.dish_insights?.restaurant_fact || 
                  meal.enhanced_facts?.food_facts?.ingredient_history || 
                  'Great choice!'
                )}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Restaurant History Success Overlay */}
      {showRestaurantHistory && (meal.dish_insights?.dish_history || meal.enhanced_facts?.food_facts?.restaurant_history) && (
        <TouchableOpacity 
          style={styles.overlayContainer}
          activeOpacity={1}
          onPress={handleCloseRestaurantHistory}
        >
          <TouchableOpacity 
            style={styles.overlayContent}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.factContainer}>
              <Text style={styles.successTitle}>Your rating has been saved!</Text>
              
              {/* Display pixel art emoji if available */}
              {(pixelArtUrl || pixelArtData) && (
                <View style={styles.pixelArtContainer}>
                  <Image 
                    source={{ uri: pixelArtUrl || `data:image/png;base64,${pixelArtData}` }} 
                    style={styles.pixelArtEmoji}
                    resizeMode="contain"
                    onError={(error) => {
                      console.error('❌ Pixel art failed to load in EditMealScreen');
                    }}
                  />
                </View>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      )}
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
  ratingSection: {
    marginBottom: 20,
  },
  criteriaSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18, // Increased from 16 to 18 for larger font
    fontWeight: '600',
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10, // Total spacing for both title and subtitle
  },
  ratingStatementText: {
    fontSize: 15, // Font size for rating statements
    fontWeight: '400', // Reduced font weight
    marginBottom: 10,
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#1a2b49',
    fontStyle: 'italic',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    marginLeft: 8, // Space from the main title
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
    marginTop: 20,
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
  // Overlay Styles
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  overlayContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 24,
    marginHorizontal: 12,
    maxWidth: '95%',
    minWidth: '80%',
  },
  overlayHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 10,
  },
  overlayCloseButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#666',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  statementContainer: {
    marginBottom: 30,
    paddingHorizontal: 8,
  },
  statementText: {
    fontSize: 16,
    color: '#1a2b49',
    textAlign: 'center',
    lineHeight: 24,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  customEmojiRating: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  boldText: {
    fontWeight: 'bold',
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  // City History Styles
  cityHistorySection: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 8,
    marginTop: 15,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#FFC008',
  },
  cityHistoryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a2b49',
    marginBottom: 8,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  cityHistoryText: {
    fontSize: 14,
    color: '#1a2b49',
    lineHeight: 20,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    fontStyle: 'italic',
  },
  // Fact Overlay Styles
  factContainer: {
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingTop: 0,
  },
  factTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    textAlign: 'center',
    marginBottom: 12,
    marginTop: -8,
  },
  factText: {
    fontSize: 15,
    color: '#1a2b49',
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  successTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    textAlign: 'center',
    marginBottom: 12,
  },
  // Simple inline close button styles
  inlineCloseButton: {
    // No additional styling needed - uses text styling
  },
  inlineCloseText: {
    color: '#1a2b49',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  // Pixel art styles
  pixelArtContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  pixelArtEmoji: {
    width: 40,
    height: 40,
  },
  // Ask Me More button styles
  askMeMoreButton: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#1a2b49',
    borderRadius: 20,
    marginTop: 20,
  },
  askMeMoreButtonText: {
    color: '#1a2b49',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  // Optional prefix and navigation styles
  optionalPrefix: {
    color: '#999',
    fontSize: 13,
    fontStyle: 'italic',
  },
  quickRatingNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 8,
  },
  navButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f0f2f5',
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  navButtonTextDisabled: {
    color: '#999',
  },
  navProgress: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
});

export default EditMealScreen;