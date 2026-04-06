import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, SafeAreaView, ScrollView, Platform, Keyboard, Modal, Animated,
  // @ts-ignore — exported but not in RN types
  unstable_batchedUpdates,
} from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import {
  startRecording,
  stopRecording,
  startPlayback,
  stopPlayback,
  transcribeVoiceNote,
  onRecordProgress,
  onPlaybackProgress,
  deleteRecording,
} from '../services/voiceNoteService';
import { ensureServerAwake } from '../config/api';
import { CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import EmojiRating from '../components/EmojiRating';
import EmojiDisplay from '../components/EmojiDisplay';
import MultiPhotoGallery, { PhotoItem } from '../components/MultiPhotoGallery';
import FoodFactsModal from '../components/FoodFactsModal';
import { saveUserChallenge } from '../services/userChallengesService';
import challengeNotificationService from '../services/challengeNotificationService';
import { RootStackParamList, TabParamList } from '../App';
import { firebase, auth, firestore, storage } from '../firebaseConfig';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import * as ImagePicker from 'react-native-image-picker';
import ImageResizer from 'react-native-image-resizer';
import Geolocation from '@react-native-community/geolocation';
import { getPhotoWithMetadata } from '../services/photoLibraryService';
// Import theme
import { colors, typography, spacing, shadows } from '../themes';

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
  const [rating, setRating] = useState<number>(meal?.rating || 0);
  const [thoughts, setThoughts] = useState<string>(() => {
    // Handle both new thoughts format and legacy liked/disliked format
    if (meal?.comments?.thoughts) {
      // New format - use thoughts directly
      return meal.comments.thoughts;
    } else {
      // Legacy format - combine liked and disliked comments
      const liked = meal?.comments?.liked || '';
      const disliked = meal?.comments?.disliked || '';
      
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
  
  // State for "What to Look For" chip toggles
  const [quickRatings, setQuickRatings] = useState<{ [key: string]: number | boolean }>({});
  const [showIngredientHistory, setShowIngredientHistory] = useState<boolean>(false);
  const [showRestaurantHistory, setShowRestaurantHistory] = useState<boolean>(false);
  const [showFoodFactsModal, setShowFoodFactsModal] = useState<boolean>(false);
  
  
  // State to track if facts are being loaded
  const [factsLoading, setFactsLoading] = useState<boolean>(false);

  // Voice recording state
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'transcribing' | 'recorded'>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingFilePath, setRecordingFilePath] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rawTranscript, setRawTranscript] = useState<string | null>(null);
  const [bulletPoints, setBulletPoints] = useState<string | null>(null);
  const [showBullets, setShowBullets] = useState(true); // true = bullets, false = raw transcript
  const [isTranscribing, setIsTranscribing] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  
  // State for pixel art data from Firestore
  const [pixelArtUrl, setPixelArtUrl] = useState<string | null>(null);
  const [pixelArtData, setPixelArtData] = useState<string | null>(null);
  const [pixelArtOptions, setPixelArtOptions] = useState<string[]>([]);
  const [selectedPixelArtIndex, setSelectedPixelArtIndex] = useState<number>(0);
  const [pressingIndex, setPressingIndex] = useState<number | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hapticIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jiggleAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const jiggleAnim = useRef(new Animated.Value(0)).current;
  
  // Photo management state - will be populated when fresh data is loaded
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState<boolean>(false);
  const [showPhotoSourceModal, setShowPhotoSourceModal] = useState<boolean>(false);
  const [photoLoading, setPhotoLoading] = useState<boolean>(false);

  // Ref to track current photos length (avoids stale closure in Firestore listener)
  const photosRef = useRef<PhotoItem[]>([]);

  // Success modal state (Path 1 vs Path 2)
  const [showEmojiAwardModal, setShowEmojiAwardModal] = useState<boolean>(false);
  const [showThankYouModal, setShowThankYouModal] = useState<boolean>(false);

  // Ref for scroll view
  const scrollViewRef = useRef<any>(null);
  const textInputRef = useRef<any>(null);

  // Keep photosRef in sync with photos state (avoids stale closure in listener)
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  // Safety timeout: stop showing photo loading after 30s if upload never completes
  useEffect(() => {
    if (photoLoading) {
      const timeout = setTimeout(() => {
        if (photosRef.current.length === 0) {
          console.log('EditMealScreen - Photo loading timeout, hiding spinner');
          setPhotoLoading(false);
        }
      }, 30000);
      return () => clearTimeout(timeout);
    }
  }, [photoLoading]);

  // Track whether the user has made any local edits (rating, thoughts, quick ratings).
  // Once true, the Firestore listener will only update non-user-editable fields
  // (like dish_insights, pixel_art, etc.) and never overwrite the user's changes.
  const hasLocalEdits = useRef(false);
  
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
    if (freshMealData.photos && Array.isArray(freshMealData.photos) && freshMealData.photos.length > 0) {
      console.log('EditMealScreen - Setting photos from fresh data:', freshMealData.photos.length);
      setPhotos(freshMealData.photos);
      setPhotoLoading(false);
    } else if (freshMealData.photoUrl) {
      console.log('EditMealScreen - Converting single photoUrl to photos array');
      setPhotos([{
        url: freshMealData.photoUrl,
        isFlagship: true,
        order: 0,
        uploadedAt: freshMealData.createdAt
      }]);
      setPhotoLoading(false);
    } else {
      // No photos yet — if this is a fresh meal, a background upload may be in progress
      setPhotos([]);
      // Show loading if this meal was just created (no photoUrl yet = upload in progress)
      if (freshMealData.meal && !freshMealData.photoUrl) {
        setPhotoLoading(true);
        console.log('EditMealScreen - No photo yet, showing loading (background upload likely in progress)');
      }
    }

    // Don't reset quickRatings here - they should persist from Firestore data loaded above
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

              // If user has made local edits, only update background-generated fields
              // (insights, pixel art, criteria, etc.) — never overwrite rating/thoughts.
              if (hasLocalEdits.current) {
                console.log('EditMealScreen - User has local edits, updating only background fields');
                // Batch all state updates to prevent Folly F14 hash map crash
                // (Firestore listeners fire outside React's event system)
                unstable_batchedUpdates(() => {
                  // Update the meal object for background fields only
                  setMeal((prev: any) => ({
                    ...prev,
                    photoUrl: freshMealData.photoUrl || prev.photoUrl,
                    dish_insights: freshMealData.dish_insights || prev.dish_insights,
                    dish_rating_criteria: freshMealData.dish_rating_criteria || prev.dish_rating_criteria,
                    pixel_art_url: freshMealData.pixel_art_url || prev.pixel_art_url,
                    enhanced_facts: freshMealData.enhanced_facts || prev.enhanced_facts,
                    rating_statements_result: freshMealData.rating_statements_result || prev.rating_statements_result,
                  }));
                  // Update photos if photoUrl arrived from background upload
                  // Use photosRef.current instead of photos to avoid stale closure
                  if (freshMealData.photoUrl && photosRef.current.length === 0) {
                    const newPhotos = [{
                      url: freshMealData.photoUrl,
                      isFlagship: true,
                      order: 0,
                    }];
                    setPhotos(newPhotos);
                    setPhotoLoading(false);
                    console.log('EditMealScreen - Photo arrived from background upload');
                  }
                  // Also handle photos array from Firestore
                  if (freshMealData.photos && Array.isArray(freshMealData.photos) && freshMealData.photos.length > 0 && photosRef.current.length === 0) {
                    setPhotos(freshMealData.photos);
                    setPhotoLoading(false);
                    console.log('EditMealScreen - Photos array arrived from background upload');
                  }
                  if (freshMealData.pixel_art_url && !pixelArtUrl) {
                    setPixelArtUrl(freshMealData.pixel_art_url);
                  }
                  if (freshMealData.pixel_art_options?.length > 0 && pixelArtOptions.length === 0) {
                    setPixelArtOptions(freshMealData.pixel_art_options);
                    // Auto-select first option if no pixel_art_url is set yet
                    if (!freshMealData.pixel_art_url) {
                      firestore().collection('mealEntries').doc(mealId).update({
                        pixel_art_url: freshMealData.pixel_art_options[0],
                      });
                      setPixelArtUrl(freshMealData.pixel_art_options[0]);
                      console.log('✅ Auto-selected first pixel art option as default');
                    }
                  }
                });
                return;
              }

              // Log when enhanced_facts becomes available
              if (freshMealData.enhanced_facts && !meal.enhanced_facts) {
                console.log('EditMealScreen - Enhanced facts now available! Updating UI...');
              }

              // Batch the full data processing too
              unstable_batchedUpdates(() => {
                processFreshMealData(freshMealData, true);
              });
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
  }, [mealId]);
  
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
    console.log('EditMealScreen - Meal ID received, all data will be loaded fresh from Firestore', mealId);
    // Reset all state when loading a new meal
    setQuickRatings({});

    // Reset voice recording state
    setVoiceState('idle');
    setRecordingSeconds(0);
    setRecordingFilePath(null);
    setIsPlaying(false);
    setIsTranscribing(false);
    setRawTranscript(null);
    setBulletPoints(null);
    setShowBullets(true);

    // Fetch fresh data for this meal
    fetchFreshMealData();
  }, [mealId]); // Depend on mealId from route params, not meal.id
  
  // Track if there are unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  // Ensure the user is the owner of this meal
  useEffect(() => {
    const currentUser = auth().currentUser;
    // Only check permission if userId is loaded from Firestore
    if (meal.userId && (!currentUser || currentUser.uid !== meal.userId)) {
      Alert.alert(
        "Not Authorized",
        "You don't have permission to edit this meal.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    }
  }, [meal.userId]); // Re-run when userId is loaded from Firestore
  
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
    hasLocalEdits.current = true;
    Keyboard.dismiss();
    ReactNativeHapticFeedback.trigger('impactLight', { enableVibrateFallback: false, ignoreAndroidSystemSettings: false });
    setRating(selectedRating);
  };

  // Helper function to get rating criteria from unified data structure
  // Both camera and gallery flows now save to dish_rating_criteria.rating_criteria
  const getRatingStatements = () => {
    return meal.dish_rating_criteria?.rating_criteria ||
           meal.quick_criteria_result?.rating_statements; // Backward compatibility with old field
  };

  // Handle quick ratings overlay
  // Old quick rating handlers removed — replaced by chip toggle in "What to Look For" section

  const handleCloseIngredientHistory = (): void => {
    setShowIngredientHistory(false);
  };

  const handleCloseRestaurantHistory = (): void => {
    setShowRestaurantHistory(false);
    // Navigate to FoodPassport after closing restaurant history
    const passportUserId = route.params?.passportUserId;
    const passportUserName = route.params?.passportUserName;
    const passportUserPhoto = route.params?.passportUserPhoto;
    const previousTabIndex = route.params?.previousTabIndex;

    if (passportUserId) {
      // Navigate back to the specific user's passport
      navigation.navigate('FoodPassport', {
        userId: passportUserId,
        userName: passportUserName,
        userPhoto: passportUserPhoto,
        tabIndex: previousTabIndex || 0
      });
    } else {
      // Navigate back to own passport
      navigation.navigate('FoodPassport', {
        tabIndex: previousTabIndex || 0
      });
    }
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

      // Include quick ratings if they exist
      if (quickRatings && Object.keys(quickRatings).length > 0) {
        updateData.quick_ratings = quickRatings;
        console.log('EditMealScreen - Including quick ratings in save:', quickRatings);
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

      // Refresh user counts to update unique restaurants, cuisines, cities
      const { refreshUserCounts } = await import('../services/countRefreshService');
      refreshUserCounts().catch(err => {
        console.error('Error refreshing user counts:', err);
        // Don't block the save if this fails
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

      // Always show pixel art selection modal after save
      console.log('Showing pixel art selection modal');

      setPixelArtUrl(null);
      setPixelArtData(null);
      setPixelArtOptions([]);
      setSelectedPixelArtIndex(0);

      try {
        const freshMealDoc = await firestore().collection('mealEntries').doc(route.params.mealId).get();
        const freshMealData = freshMealDoc.data();

        if (freshMealData?.pixel_art_options?.length > 0) {
          console.log(`✅ ${freshMealData.pixel_art_options.length} pixel art options found`);
          setPixelArtOptions(freshMealData.pixel_art_options);
        } else if (freshMealData?.pixel_art_url) {
          console.log('✅ Single pixel art URL found');
          setPixelArtUrl(freshMealData.pixel_art_url);
        } else if (freshMealData?.pixel_art_data) {
          console.log('✅ Pixel art data found');
          setPixelArtData(freshMealData.pixel_art_data);
        } else {
          console.log('⏳ Pixel art not ready yet for this meal');
        }
      } catch (error) {
        console.error('❌ Error loading pixel art:', error);
      }

      setShowEmojiAwardModal(true);
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

  // Long-press pixel art selection handlers
  // Voice recording handlers
  const handleStartRecording = async () => {
    try {
      ReactNativeHapticFeedback.trigger('impactLight', { enableVibrateFallback: false, ignoreAndroidSystemSettings: false });
      setRecordingSeconds(0);
      const filePath = await startRecording();
      setRecordingFilePath(filePath);
      setVoiceState('recording');

      // Start pulse animation
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulseAnimRef.current = pulse;
      pulse.start();

      // Track elapsed time
      onRecordProgress((seconds) => setRecordingSeconds(seconds));
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      Alert.alert('Error', 'Could not start recording. Please check microphone permissions.');
      setVoiceState('idle');
    }
  };

  const handleStopRecording = async () => {
    try {
      ReactNativeHapticFeedback.trigger('impactMedium', { enableVibrateFallback: false, ignoreAndroidSystemSettings: false });

      // Stop pulse animation
      if (pulseAnimRef.current) {
        pulseAnimRef.current.stop();
        pulseAnimRef.current = null;
      }
      pulseAnim.setValue(1);

      const filePath = await stopRecording();
      setRecordingFilePath(filePath);

      // Show playback/re-record immediately while transcribing in background
      setVoiceState('recorded');
      setIsTranscribing(true);
      setRawTranscript(null);
      setBulletPoints(null);

      // Transcribe in background
      ensureServerAwake();
      transcribeVoiceNote(filePath).then((result) => {
        setIsTranscribing(false);
        if (result) {
          setRawTranscript(result.transcript);
          setBulletPoints(result.bulletPoints || null);
          // Default to bullets if available, otherwise raw
          const text = (result.bulletPoints && showBullets) ? result.bulletPoints : result.transcript;
          const truncated = text.substring(0, 600);
          setThoughts(truncated);
          hasLocalEdits.current = true;
          ReactNativeHapticFeedback.trigger('notificationSuccess', { enableVibrateFallback: false, ignoreAndroidSystemSettings: false });
        } else {
          Alert.alert('Transcription Failed', 'Could not transcribe your recording. Please try again or type your thoughts.');
        }
      }).catch(() => {
        setIsTranscribing(false);
        Alert.alert('Transcription Failed', 'Could not transcribe your recording. Please try again or type your thoughts.');
      });
    } catch (error) {
      console.error('❌ Failed to stop recording:', error);
      setVoiceState('idle');
    }
  };

  const handlePlayback = async () => {
    if (!recordingFilePath) return;
    try {
      if (isPlaying) {
        await stopPlayback();
        setIsPlaying(false);
      } else {
        setIsPlaying(true);
        await startPlayback(recordingFilePath);
        onPlaybackProgress((current, duration) => {
          if (current >= duration && duration > 0) {
            setIsPlaying(false);
          }
        });
      }
    } catch (error) {
      console.error('❌ Playback error:', error);
      setIsPlaying(false);
    }
  };

  const handleReRecord = async () => {
    if (recordingFilePath) {
      await deleteRecording(recordingFilePath);
    }
    setRecordingFilePath(null);
    setVoiceState('idle');
    setIsPlaying(false);
    setIsTranscribing(false);
    setRawTranscript(null);
    setBulletPoints(null);
    setThoughts('');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Long-press pixel art selection handlers
  const handlePixelArtPressIn = (index: number) => {
    setPressingIndex(index);

    // Scale up to 1.3x
    Animated.timing(scaleAnim, {
      toValue: 1.3,
      duration: 2000,
      useNativeDriver: true,
    }).start();

    // Continuous jiggle while holding
    const jiggle = Animated.loop(
      Animated.sequence([
        Animated.timing(jiggleAnim, { toValue: 3, duration: 60, useNativeDriver: true }),
        Animated.timing(jiggleAnim, { toValue: -3, duration: 60, useNativeDriver: true }),
        Animated.timing(jiggleAnim, { toValue: 2, duration: 50, useNativeDriver: true }),
        Animated.timing(jiggleAnim, { toValue: -2, duration: 50, useNativeDriver: true }),
      ])
    );
    jiggleAnimRef.current = jiggle;
    jiggle.start();

    // Continuous light haptic ticks while holding
    hapticIntervalRef.current = setInterval(() => {
      ReactNativeHapticFeedback.trigger('selection', {
        enableVibrateFallback: false,
        ignoreAndroidSystemSettings: false,
      });
    }, 100);

    // After 2 seconds — selection complete
    pressTimerRef.current = setTimeout(async () => {
      // Stop jiggle and haptic
      if (jiggleAnimRef.current) jiggleAnimRef.current.stop();
      if (hapticIntervalRef.current) clearInterval(hapticIntervalRef.current);
      jiggleAnim.setValue(0);

      // Final confirmation haptic
      ReactNativeHapticFeedback.trigger('impactHeavy', {
        enableVibrateFallback: false,
        ignoreAndroidSystemSettings: false,
      });

      setSelectedPixelArtIndex(index);
      setPressingIndex(null);

      // Pop animation — scale up to 1.5x then settle back to 1.15x
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.5, duration: 120, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1.15, duration: 200, useNativeDriver: true }),
      ]).start();

      // Save selection
      const selectedUrl = pixelArtOptions[index];
      if (selectedUrl) {
        try {
          await firestore().collection('mealEntries').doc(route.params.mealId).update({
            pixel_art_url: selectedUrl,
            pixel_art_user_selected: true,
          });
          console.log('✅ Selected pixel art saved:', index + 1);
        } catch (e) {
          console.error('❌ Error saving pixel art selection:', e);
        }
      }

      // Dismiss shortly after pop completes
      scaleAnim.setValue(1);
      setShowEmojiAwardModal(false);
      navigation.navigate('FoodPassport', { tabIndex: 0 });
    }, 2000);
  };

  const handlePixelArtPressOut = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    if (hapticIntervalRef.current) {
      clearInterval(hapticIntervalRef.current);
      hapticIntervalRef.current = null;
    }
    if (jiggleAnimRef.current) {
      jiggleAnimRef.current.stop();
      jiggleAnimRef.current = null;
    }
    jiggleAnim.setValue(0);
    scaleAnim.setValue(1);
    setPressingIndex(null);
  };

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
        keyboardOpeningTime={0}
        extraScrollHeight={100}
        extraHeight={130}
      >
        {/* Meal photos */}
        <View style={styles.photosSection}>
          {photoLoading && photos.length === 0 ? (
            <View style={styles.photoLoadingContainer}>
              <ActivityIndicator size="large" color="#5B8A72" />
              <Text style={styles.photoLoadingText}>Loading photo...</Text>
            </View>
          ) : (
            <MultiPhotoGallery
              photos={photos}
              onAddPhoto={handleAddPhoto}
              onRemovePhoto={handleRemovePhoto}
              onSetFlagship={handleSetFlagship}
              onPhotoPress={handlePhotoPress}
              editable={true}
              maxPhotos={5}
            />
          )}
          {uploadingPhoto && (
            <View style={styles.uploadingOverlay}>
              <ActivityIndicator size="small" color="#5B8A72" />
              <Text style={styles.uploadingText}>Uploading photo...</Text>
            </View>
          )}
        </View>

        {/* Meal details */}
        <View style={styles.detailsCard}>
          {/* Rating Section */}
          <View style={styles.ratingSection}>
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
            {/* Voice Recording — above TextInput */}
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              {voiceState === 'idle' && (
                <TouchableOpacity
                  onPress={handleStartRecording}
                  style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderColor: '#5B8A72',
                    paddingVertical: 12,
                    paddingHorizontal: 25,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ fontSize: 15, color: '#5B8A72', fontWeight: '600', fontFamily: 'Inter' }}>
                    Record
                  </Text>
                </TouchableOpacity>
              )}

              {voiceState === 'recording' && (
                <TouchableOpacity
                  onPress={handleStopRecording}
                  style={{ alignItems: 'center' }}
                >
                  <Animated.View style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: '#C84B4B',
                    justifyContent: 'center',
                    alignItems: 'center',
                    transform: [{ scale: pulseAnim }],
                  }}>
                    <Icon name="stop" size={30} color="#FFFFFF" />
                  </Animated.View>
                  <Text style={{ marginTop: 8, fontSize: 14, color: '#C84B4B', fontWeight: '600', fontFamily: 'Inter' }}>
                    Recording {formatTime(recordingSeconds)}
                  </Text>
                  <Text style={{ marginTop: 2, fontSize: 12, color: '#999', fontFamily: 'Inter' }}>
                    Tap to stop
                  </Text>
                </TouchableOpacity>
              )}

              {voiceState === 'recorded' && recordingFilePath && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TouchableOpacity
                    onPress={handlePlayback}
                    style={{
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'transparent',
                      borderWidth: 2,
                      borderColor: '#5B8A72',
                      paddingVertical: 10,
                      paddingHorizontal: 20,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ fontSize: 14, color: '#5B8A72', fontWeight: '600', fontFamily: 'Inter' }}>
                      {isPlaying ? 'Pause' : 'Play'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleReRecord}
                    style={{
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'transparent',
                      borderWidth: 2,
                      borderColor: '#999',
                      paddingVertical: 10,
                      paddingHorizontal: 20,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ fontSize: 14, color: '#999', fontWeight: '600', fontFamily: 'Inter' }}>
                      Re-record
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* TextInput with transcribing overlay */}
            <View>
              <TextInput
                ref={textInputRef}
                key={`thoughts-${mealId}`}
                style={styles.commentInput}
                placeholder="Share your thoughts!"
                placeholderTextColor="#999"
                multiline={true}
                blurOnSubmit={false}
                value={thoughts}
                onChangeText={(text: string) => { hasLocalEdits.current = true; setThoughts(text); }}
                maxLength={600}
              />
              {isTranscribing && (
                <View style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: 'rgba(255,255,255,0.85)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderRadius: 8,
                }}>
                  <ActivityIndicator size="small" color="#5B8A72" />
                  <Text style={{ marginTop: 6, fontSize: 13, color: '#666', fontFamily: 'Inter' }}>
                    Transcribing...
                  </Text>
                </View>
              )}
            </View>

            {/* Bullets / Full text toggle — below TextInput */}
            {rawTranscript && bulletPoints && (
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 8 }}>
                <TouchableOpacity
                  onPress={() => {
                    const newShowBullets = !showBullets;
                    setShowBullets(newShowBullets);
                    const text = newShowBullets ? bulletPoints : rawTranscript;
                    setThoughts(text.substring(0, 600));
                    hasLocalEdits.current = true;
                  }}
                  style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderColor: '#D0D0D0',
                    paddingVertical: 6,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ fontSize: 13, color: '#5B8A72', fontWeight: '500', fontFamily: 'Inter' }}>
                    {showBullets ? 'Show full text' : 'Show bullet points'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* What to Look For — toggleable chips */}
            {getRatingStatements() && getRatingStatements()!.length > 0 && (
              <View style={styles.whatToLookForContainer}>
                <Text style={styles.whatToLookForTitle}>WHAT TO LOOK FOR</Text>
                <View style={styles.chipsContainer}>
                  {getRatingStatements()!.map((statement, index) => {
                    const isSelected = !!quickRatings[statement];
                    return (
                      <TouchableOpacity
                        key={index}
                        style={[styles.chip, isSelected && styles.chipSelected]}
                        onPress={() => {
                          hasLocalEdits.current = true;
                          ReactNativeHapticFeedback.trigger('impactLight', { enableVibrateFallback: false, ignoreAndroidSystemSettings: false });
                          setQuickRatings(prev => {
                            const next = { ...prev };
                            if (next[statement]) {
                              delete next[statement];
                            } else {
                              (next as any)[statement] = true;
                            }
                            return next;
                          });
                        }}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                          {statement}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

          {/* Dish City History — tap to see all food facts */}
          {(meal.dish_insights?.cultural_insight || meal.enhanced_facts?.food_facts?.dish_city_history) && (
            <TouchableOpacity
              style={styles.cityHistorySection}
              onPress={() => setShowFoodFactsModal(true)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={styles.cityHistoryTitle}>Fun Fact!</Text>
                <Text style={{ fontFamily: 'Inter', fontSize: 12, color: '#5B8A72', fontWeight: '500' }}>See all →</Text>
              </View>
              <Text style={styles.cityHistoryText}>
                {renderTextWithBold(
                  meal.dish_insights?.cultural_insight ||
                  meal.enhanced_facts?.food_facts?.dish_city_history ||
                  'Delicious!'
                )}
              </Text>
            </TouchableOpacity>
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
            style={[
              styles.saveButton,
              (rating === 0 || photos.length === 0) && styles.disabledButton,
            ]}
            disabled={rating === 0 || photos.length === 0}
            onPress={saveMeal}
          >
            {(pixelArtOptions.length === 0 && !pixelArtUrl && !pixelArtData && rating > 0 && photos.length > 0) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.buttonText}>Save (generating artwork...)</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>Save Changes</Text>
            )}
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

      {/* Food Facts Modal */}
      <FoodFactsModal
        visible={showFoodFactsModal}
        onClose={() => setShowFoodFactsModal(false)}
        dishName={meal.meal}
        dishInsights={meal.dish_insights}
        enhancedFacts={meal.enhanced_facts}
      />

      {/* Photo Source Modal - COMMENTED OUT (CAUSES MEMORY ISSUES) - KEEP FOR FUTURE USE */}
      {/*
      <Modal
        visible={showPhotoSourceModal}
        transparent={true}
        animationType="none"
        onRequestClose={() => setShowPhotoSourceModal(false)}
      >
        <TouchableOpacity 
          style={styles.photoSourceModalContainer}
          activeOpacity={1}
          onPress={() => setShowPhotoSourceModal(false)}
        >
          <View style={styles.photoSourceModalContent}>
            <TouchableOpacity
              style={styles.photoSourceOption}
              onPress={handleCameraSelection}
            >
              <Image
                source={require('../assets/icons/camera-active.png')}
                style={styles.photoSourceOptionImage}
                resizeMode="contain"
              />
              <Text style={styles.photoSourceOptionText}>Camera</Text>
            </TouchableOpacity>
            
            <View style={styles.modalSeparator} />
            
            <TouchableOpacity
              style={styles.photoSourceOption}
              onPress={handleGallerySelection}
            >
              <Image
                source={require('../assets/icons/upload-active.png')}
                style={styles.photoSourceOptionImage}
                resizeMode="contain"
              />
              <Text style={styles.photoSourceOptionText}>Upload</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      */}

      {/* Pixel Art Selection Modal */}
      <Modal
        visible={showEmojiAwardModal}
        transparent={true}
        animationType="none"
        onRequestClose={() => {
          // Auto-select first option on dismiss
          const fallbackUrl = pixelArtOptions[0] || pixelArtUrl;
          if (fallbackUrl) {
            firestore().collection('mealEntries').doc(route.params.mealId).update({
              pixel_art_url: fallbackUrl,
            });
          }
          setShowEmojiAwardModal(false);
          navigation.navigate('FoodPassport', { tabIndex: 0 });
        }}
      >
        <TouchableOpacity
          style={styles.emojiModalContainer}
          activeOpacity={1}
          onPress={() => {
            setShowEmojiAwardModal(false);
            navigation.navigate('FoodPassport', { tabIndex: 0 });
          }}
        >
          <TouchableOpacity activeOpacity={1} style={styles.emojiModalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.emojiModalTitle}>{meal.meal} Rated!</Text>

            {/* 3 pixel art options — hold to select */}
            {pixelArtOptions.length > 0 ? (
              <>
                <Text style={{ fontSize: 13, color: '#999', marginBottom: 14, textAlign: 'center' }}>
                  Hold to select
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12 }}>
                  {pixelArtOptions.map((url, index) => {
                    const isSelected = selectedPixelArtIndex === index;
                    const isPressing = pressingIndex === index;
                    const isFaded = !isPressing && !isSelected && pressingIndex !== null;
                    return (
                      <TouchableOpacity
                        key={index}
                        activeOpacity={1}
                        onPressIn={() => handlePixelArtPressIn(index)}
                        onPressOut={handlePixelArtPressOut}
                        style={{
                          borderRadius: 12,
                          padding: 3,
                        }}
                      >
                        <Animated.View style={{
                          transform: [
                            { scale: isPressing ? scaleAnim : (isSelected && pressingIndex === null ? 1.15 : 1) },
                            { translateX: isPressing ? jiggleAnim : 0 },
                          ],
                        }}>
                          <Image
                            source={{ uri: url }}
                            style={[
                              { width: 55, height: 55 },
                              isFaded && { opacity: 0.35 },
                            ]}
                            resizeMode="contain"
                          />
                        </Animated.View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : (pixelArtUrl || pixelArtData) ? (
              <View style={styles.emojiDisplay}>
                <Image
                  source={{ uri: pixelArtUrl || `data:image/png;base64,${pixelArtData}` }}
                  style={{ width: 60, height: 60 }}
                  resizeMode="contain"
                />
              </View>
            ) : (
              <View style={{ alignItems: 'center', justifyContent: 'center', width: 80, height: 80, alignSelf: 'center' }}>
                <ActivityIndicator size="large" color="#5B8A72" />
                <Text style={{ fontSize: 12, color: '#666', marginTop: 8, textAlign: 'center' }}>
                  Generating artwork...
                </Text>
              </View>
            )}

          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Thank You Modal (Path 2: Gallery) */}
      <Modal
        visible={showThankYouModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowThankYouModal(false);
          navigation.navigate('FoodPassport', { tabIndex: 0 });
        }}
      >
        <View style={styles.emojiModalContainer}>
          <View style={styles.emojiModalContent}>
            <Text style={styles.emojiModalTitle}>✅ Thank You!</Text>
            <Text style={styles.emojiModalText}>
              Your meal has been rated and saved.
            </Text>
            <TouchableOpacity
              style={styles.emojiModalButton}
              onPress={() => {
                setShowThankYouModal(false);
                navigation.navigate('FoodPassport', { tabIndex: 0 });
              }}
            >
              <Text style={styles.emojiModalButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.lightTan,
  },
  headerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.sm,
    backgroundColor: colors.lightTan,
  },
  backButtonHeader: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: spacing.borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    ...typography.h3,
    fontFamily: 'Inter',
    fontWeight: 'normal',
    color: colors.textPrimary,
  },
  headerRightButton: {
    width: 44,
  },
  headerButtonIcon: {
    width: 24,
    height: 24,
    tintColor: colors.textPrimary,
    resizeMode: 'contain',
  },
  container: {
    flex: 1,
    backgroundColor: colors.lightTan,
  },
  scrollContainer: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.lightTan,
  },
  loadingText: {
    ...typography.bodyLarge,
    marginTop: spacing.sm,
    textAlign: 'center',
    color: colors.textSecondary,
  },
  imageCard: {
    backgroundColor: colors.white,
    borderRadius: spacing.borderRadius.md,
    overflow: 'hidden',
    marginBottom: spacing.md,
    ...shadows.light,
  },
  photosSection: {
    marginBottom: 15,
    position: 'relative',
  },
  photoLoadingContainer: {
    aspectRatio: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#999',
    fontWeight: '500',
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
    color: '#1A1A1A',
    fontFamily: 'Inter',
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
    marginBottom: 8,
  },
  criteriaSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18, // Increased from 16 to 18 for larger font
    fontWeight: '600',
    color: '#1A1A1A',
    fontFamily: 'Inter',
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
    color: '#1A1A1A',
    fontFamily: 'Inter',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#1A1A1A',
    fontStyle: 'italic',
    fontFamily: 'Inter',
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
    color: '#1A1A1A',
    textAlign: 'center',
    fontStyle: 'italic',
    fontFamily: 'Inter',
  },
  commentsSection: {
    marginTop: 8,
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
    color: '#1A1A1A',
    fontFamily: 'Inter',
    borderLeftWidth: 3,
    borderLeftColor: '#5B8A72',
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    marginBottom: 20,
    fontStyle: 'italic',
    fontFamily: 'Inter',
  },
  whatToLookForContainer: {
    marginTop: 16,
    marginBottom: 8,
  },
  whatToLookForTitle: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    color: '#858585',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DEDEDE',
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  chipSelected: {
    backgroundColor: '#5B8A72',
    borderColor: '#5B8A72',
  },
  chipText: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: '#858585',
  },
  chipTextSelected: {
    color: '#fff',
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
    borderColor: '#5B8A72',
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
    borderColor: '#5B8A72',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  culturalInsightContainer: {
    backgroundColor: '#f0f8ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#4a90e2',
  },
  culturalInsightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  culturalInsightIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  culturalInsightTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    fontFamily: 'Inter',
  },
  culturalInsightText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#2c3e50',
    fontFamily: 'Inter',
  },
  buttonText: {
    color: '#1A1A1A',
    fontWeight: '600',
    fontSize: 16,
    fontFamily: 'Inter',
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
    fontFamily: 'Inter',
  },
  statementContainer: {
    marginBottom: 30,
    paddingHorizontal: 8,
  },
  statementText: {
    fontSize: 16,
    color: '#1A1A1A',
    textAlign: 'center',
    lineHeight: 24,
    fontFamily: 'Inter',
  },
  customEmojiRating: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  boldText: {
    fontWeight: 'bold',
    color: '#1A1A1A',
    fontFamily: 'Inter',
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
    borderLeftColor: '#5B8A72',
  },
  cityHistoryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
    fontFamily: 'Inter',
  },
  cityHistoryText: {
    fontSize: 14,
    color: '#1A1A1A',
    lineHeight: 20,
    fontFamily: 'Inter',
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
    color: '#1A1A1A',
    fontFamily: 'Inter',
    textAlign: 'center',
    marginBottom: 12,
    marginTop: -8,
  },
  factText: {
    fontSize: 15,
    color: '#1A1A1A',
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: 'Inter',
  },
  successTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
    fontFamily: 'Inter',
    textAlign: 'center',
    marginBottom: 12,
  },
  // Simple inline close button styles
  inlineCloseButton: {
    // No additional styling needed - uses text styling
  },
  inlineCloseText: {
    color: '#1A1A1A',
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
    borderColor: '#5B8A72',
    borderRadius: 20,
    marginTop: 20,
  },
  askMeMoreButtonText: {
    color: '#1A1A1A',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter',
  },
  belowRatingContainer: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
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
    color: '#1A1A1A',
    fontFamily: 'Inter',
  },
  navButtonTextDisabled: {
    color: '#999',
  },
  navProgress: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    fontFamily: 'Inter',
  },
  photoSourceModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoSourceModalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 8,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    width: 240,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  photoSourceOption: {
    alignItems: 'center',
    padding: 12,
    flex: 1,
  },
  photoSourceOptionImage: {
    width: 40,
    height: 40,
    tintColor: '#5B8A72',
  },
  photoSourceOptionText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    fontFamily: 'Inter',
  },
  modalSeparator: {
    width: 1,
    height: 50,
    backgroundColor: '#5B8A72',
    marginHorizontal: 8,
  },
  emojiModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 30,
    width: '80%',
    maxWidth: 350,
    alignItems: 'center',
  },
  emojiModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 20,
    fontFamily: 'Inter',
  },
  emojiDisplay: {
    marginVertical: 20,
  },
  emojiModalText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 25,
    fontFamily: 'Inter',
  },
  emojiModalButton: {
    backgroundColor: '#5B8A72',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 25,
  },
  emojiModalButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter',
  },
});

export default EditMealScreen;