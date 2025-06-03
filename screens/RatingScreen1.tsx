import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Platform
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import { CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import { RootStackParamList, TabParamList } from '../App';
import RNFS from 'react-native-fs';

// Extend the TabParamList to include suggestionData in the RatingScreen1 screen params
declare module '../App' {
  interface TabParamList {
    RatingScreen1: {
      photo: {
        uri: string;
        width?: number;
        height?: number;
      };
      location?: {
        latitude: number;
        longitude: number;
        source: string;
        priority?: number;
      } | null;
      suggestionData?: any;
      _uniqueKey: string;
    };
  }
}

// Update the navigation prop type to use composite navigation
type RatingScreen1NavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'RatingScreen1'>,
  StackNavigationProp<RootStackParamList>
>;

type RatingScreen1RouteProp = RouteProp<TabParamList, 'RatingScreen1'>;

type Props = {
  navigation: RatingScreen1NavigationProp;
  route: RatingScreen1RouteProp;
};

const RatingScreen1: React.FC<Props> = ({ route, navigation }) => {
  const { photo, photoSource } = route.params;

  // Pre-load star images using useMemo to prevent memory issues
  const starImages = useMemo(() => ({
    filled: require('../assets/stars/star-filled.png'),
    empty: require('../assets/stars/star-empty.png')
  }), []);

  // Initialize location with priority information
  const initializeLocation = useCallback(() => {
    if (!route.params.location) return null;

    // Add priority based on source
    const loc = {...route.params.location};

    // Set priority based on source (lower number = higher priority)
    if (loc.source === 'restaurant_selection') {
      loc.priority = 1; // Highest priority
    } else if (loc.source === 'exif') {
      loc.priority = 2; // Second priority
    } else {
      loc.priority = 3; // Lowest priority (device location)
    }

    console.log(`Initialized location with source ${loc.source}, priority ${loc.priority}`);
    return loc;
  }, [route.params.location]);

  // Use state to manage location so we can update it when restaurant is selected
  const [location, setLocation] = useState(initializeLocation());
  const [rating, setRating] = useState<number>(0);
  const [imageError, setImageError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [screenKey, setScreenKey] = useState(Date.now()); // Used to force re-render when needed

  // Comments for both liked and disliked
  const [likedComment, setLikedComment] = useState<string>('');
  const [dislikedComment, setDislikedComment] = useState<string>('');

  // Add validation on component mount
  useEffect(() => {
    if (!photo || !photo.uri) {
      console.error("Invalid photo object in RatingScreen1:", photo);
      Alert.alert(
        "Error",
        "Invalid photo data received. Please try again.",
        [
          {
            text: "OK",
            onPress: () => navigation.goBack()
          }
        ]
      );
      return;
    }

    // Log location data for debugging
    console.log("Initial location data in RatingScreen1:", JSON.stringify(location));
    
    // Cleanup function for temporary resources
    return () => {
      // Clean up temporary images if they're in the temp directory
      if (photo && photo.uri && (
          photo.uri.includes(RNFS.TemporaryDirectoryPath) || 
          photo.uri.includes(RNFS.CachesDirectoryPath)
      )) {
        RNFS.exists(photo.uri)
          .then(exists => {
            if (exists) {
              RNFS.unlink(photo.uri)
                .then(() => console.log('Temp file deleted from RatingScreen1:', photo.uri))
                .catch(e => console.error('Error deleting temp file:', e));
            }
          })
          .catch(err => console.error('Error checking file existence:', err));
      }
    };
  }, []);
  
  // Use useFocusEffect to refresh UI elements when the screen regains focus
  useFocusEffect(
    useCallback(() => {
      console.log("RatingScreen1 gained focus - refreshing UI elements");
      
      // Force re-render of stars and other UI components by updating screenKey
      setScreenKey(Date.now());
      
      return () => {
        // Clean up when screen loses focus
        console.log("RatingScreen1 lost focus");
      };
    }, [])
  );

  // Add effect to log when location changes
  useEffect(() => {
    console.log("Location updated in RatingScreen1:", JSON.stringify(location));
  }, [location]);
  
  const handleRating = (selectedRating: number): void => {
    setRating(selectedRating);
  };

  // Handle return key press in text inputs
  const handleSubmitEditing = (): void => {
    // Dismiss keyboard/focus
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      const currentlyFocusedInput = TextInput.State?.currentlyFocusedInput?.();
      if (currentlyFocusedInput) {
        currentlyFocusedInput.blur();
      }
    }
  };

  const continueToMealDetails = async (): Promise<void> => {
    let newFilePath = '';
    try {
      // Show loading indication
      setIsProcessing(true);

      // Generate a unique session ID for this result flow
      const sessionId = route.params._uniqueKey || `rating_session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      console.log(`Continuing session ${sessionId} to RatingScreen2`);

      // Create a clean copy of the image without query parameters for passing to next screen
      const timestamp = Date.now();
      const fileExt = 'jpg'; // Default to jpg

      // Create a path for the new clean image file
      const newFilename = `rating2_image_${timestamp}.${fileExt}`;

      // Determine the temp directory path based on platform
      const dirPath = Platform.OS === 'ios'
        ? `${RNFS.TemporaryDirectoryPath}/`
        : `${RNFS.CachesDirectoryPath}/`;

      newFilePath = `${dirPath}${newFilename}`;
      console.log('Creating clean image for RatingScreen2 at:', newFilePath);

      // If the photo is already in the temp directory, avoid copying it again
      if (photo.uri === newFilePath) {
        console.log('Using existing file, no need to copy');
      } else {
        // First check if the target file already exists, and delete it if it does
        try {
          const exists = await RNFS.exists(newFilePath);
          if (exists) {
            await RNFS.unlink(newFilePath);
            console.log('Deleted existing file before copying');
          }
        } catch (e) {
          console.warn('Error checking/deleting existing file:', e);
        }
        
        // Copy the current image file to new location
        await RNFS.copyFile(photo.uri, newFilePath);
        console.log('File copied successfully for RatingScreen2');
      }

      // Create a fresh photo object to avoid any reference issues
      const freshPhoto = {
        uri: newFilePath,
        width: photo.width,
        height: photo.height,
        sessionId: sessionId, // Add session ID for tracking
        originalUri: photo.uri // Track the original URI for cleanup
      };

      console.log(`Navigating to RatingScreen2 with fresh image: ${freshPhoto.uri}`);

      // No need to format comments as we're using single text fields

      // Ensure data is ready before navigation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Navigate to RatingScreen2 with all collected data
      navigation.navigate('RatingScreen2', {
        photo: freshPhoto,
        location: location,
        rating: rating,
        likedComment: likedComment.trim(),
        dislikedComment: dislikedComment.trim(),
        suggestionData: route.params.suggestionData, // Pass along any suggestion data
        _uniqueKey: sessionId // This helps React Navigation identify this as a new navigation
      });
      
      // Log if we're passing prefetched meal suggestions
      if (route.params.suggestionData && 
          (route.params.suggestionData.suggested_meals || route.params.suggestionData.menu_items)) {
        console.log("Passing prefetched meal suggestions to RatingScreen2:", 
          route.params.suggestionData.suggested_meals?.length || 0, "meal suggestions,",
          route.params.suggestionData.menu_items?.length || 0, "menu items");
      }
    } catch (error) {
      console.error('Error preparing data for RatingScreen2:', error);
      
      // Clean up the file if we were in the middle of creating it
      if (newFilePath) {
        try {
          const exists = await RNFS.exists(newFilePath);
          if (exists) {
            await RNFS.unlink(newFilePath);
            console.log('Cleaned up partially created file after error');
          }
        } catch (e) {
          console.warn('Error cleaning up file after error:', e);
        }
      }
      
      Alert.alert('Error', 'Failed to continue to meal details. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Handle image load error
  const handleImageError = () => {
    console.log('Image failed to load in RatingScreen1');
    setImageError(true);
  };

  // Quick continue function for "Eat Now, Edit Later" - sets 3 stars and continues
  const handleEatNowEditLater = async (): Promise<void> => {
    try {
      setIsProcessing(true);
      
      // Set rating to 3 stars
      setRating(3);
      
      // Generate a unique session ID for this result flow
      const sessionId = route.params._uniqueKey || `rating_session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      console.log(`Quick continue session ${sessionId} to RatingScreen2 with 3 stars`);

      // Create a clean copy of the image without query parameters for passing to next screen
      const timestamp = Date.now();
      const fileExt = 'jpg'; // Default to jpg

      // Create a path for the new clean image file
      const newFilename = `rating2_image_${timestamp}.${fileExt}`;

      // Determine the temp directory path based on platform
      const dirPath = Platform.OS === 'ios'
        ? `${RNFS.TemporaryDirectoryPath}/`
        : `${RNFS.CachesDirectoryPath}/`;

      const newFilePath = `${dirPath}${newFilename}`;
      console.log('Creating clean image for RatingScreen2 at:', newFilePath);

      // If the photo is already in the temp directory, avoid copying it again
      if (photo.uri !== newFilePath) {
        // First check if the target file already exists, and delete it if it does
        try {
          const exists = await RNFS.exists(newFilePath);
          if (exists) {
            await RNFS.unlink(newFilePath);
          }
        } catch (e) {
          console.warn('Error checking/deleting existing file:', e);
        }
        
        // Copy the current image file to new location
        await RNFS.copyFile(photo.uri, newFilePath);
        console.log('File copied successfully for RatingScreen2');
      }

      // Create a fresh photo object to avoid any reference issues
      const freshPhoto = {
        uri: newFilePath,
        width: photo.width,
        height: photo.height,
        sessionId: sessionId,
        originalUri: photo.uri
      };

      console.log(`Quick navigating to RatingScreen2 with 3 stars and fresh image: ${freshPhoto.uri}`);

      // Navigate to RatingScreen2 with 3-star rating and empty comments
      navigation.navigate('RatingScreen2', {
        photo: freshPhoto,
        location: location,
        rating: 3, // Always 3 stars for quick continue
        likedComment: '', // Empty comments for quick continue
        dislikedComment: '',
        suggestionData: route.params.suggestionData,
        _uniqueKey: sessionId
      });
      
    } catch (error) {
      console.error('Error in quick continue:', error);
      Alert.alert('Error', 'Failed to continue. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };
  
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        extraScrollHeight={100}
        extraHeight={120}
      >
        <View style={styles.contentContainer}>
          {/* Image Container at the top */}
          <View style={styles.imageContainer}>
            {!imageError && photo && photo.uri ? (
              <Image
                source={{ uri: photo.uri }}
                style={styles.image}
                resizeMode="contain"
                onError={handleImageError}
              />
            ) : (
              <View style={styles.errorImageContainer}>
                <MaterialIcon name="broken-image" size={64} color="#ccc" />
                <Text style={styles.errorImageText}>Failed to load image</Text>
              </View>
            )}

            {/* Processing overlay */}
            {isProcessing && (
              <View style={styles.processingOverlay}>
                <ActivityIndicator size="large" color="white" />
                <Text style={styles.processingText}>Processing...</Text>
              </View>
            )}
          </View>

          {/* Rating Section */}
          <View style={styles.ratingSection}>
            <View style={styles.ratingContainer} key={`stars-container-${screenKey}`}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={`star-${star}-${screenKey}`}
                  onPress={() => handleRating(star)}
                  style={styles.starTouchable}
                  activeOpacity={0.7}
                >
                  <Image
                    source={star <= rating ? starImages.filled : starImages.empty}
                    style={styles.star}
                    resizeMode="contain"
                    // Force clear any cached rendering that might be stale
                    key={`star-img-${star}-${rating}-${screenKey}`}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Comments Section */}
          <View style={styles.commentsContainer}>
            {/* Liked Comments Section */}
            <View style={styles.commentSection}>
              <Text style={styles.commentTitle}>What did you like about this dish?</Text>
              <Text style={styles.commentSubtitle}>(This will help us give you better meal recommendations)</Text>
              <TextInput
                style={styles.commentInput}
                placeholder="Tell us what you liked about this meal..."
                placeholderTextColor="#999"
                multiline={true}
                blurOnSubmit={true}
                returnKeyType="done"
                autoCapitalize="sentences"
                onSubmitEditing={handleSubmitEditing}
                onChangeText={setLikedComment}
                value={likedComment}
                maxLength={300}
                numberOfLines={4}
              />
            </View>

            {/* Disliked Comments Section */}
            <View style={styles.commentSection}>
              <Text style={styles.commentTitle}>What could be better?</Text>
              <TextInput
                style={styles.commentInput}
                placeholder="Tell us what could be improved..."
                placeholderTextColor="#999"
                multiline={true}
                blurOnSubmit={true}
                returnKeyType="done"
                autoCapitalize="sentences"
                onSubmitEditing={handleSubmitEditing}
                onChangeText={setDislikedComment}
                value={dislikedComment}
                maxLength={300}
                numberOfLines={4}
              />
            </View>
          </View>

          {/* Show "Eat Now, Edit Later" button only for camera photos */}
          {photoSource === 'camera' && (
            <TouchableOpacity
              style={styles.eatNowButton}
              onPress={handleEatNowEditLater}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="#1a2b49" />
              ) : (
                <Text style={styles.eatNowButtonText}>Eat Now, Edit Later</Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.continueButton,
              { backgroundColor: rating > 0 ? '#ffc008' : '#cccccc' }
            ]}
            onPress={continueToMealDetails}
            disabled={rating === 0 || isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.continueButtonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6', // Light off-white color matching HomeScreen
  },
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  contentContainer: {
    padding: 15,
    alignItems: 'center',
    backgroundColor: '#FAF9F6', // Light off-white background
  },
  imageContainer: {
    width: '100%',
    height: 180,
    borderRadius: 12, // Matching card radius from HomeScreen
    overflow: 'hidden',
    backgroundColor: '#FAF3E0', // Card background color from HomeScreen
    marginBottom: 10,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
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
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: {
    color: 'white',
    marginTop: 10,
    fontSize: 16,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  ratingSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  ratingTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1a2b49', // Updated to match text color in HomeScreen
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  ratingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 10,
  },
  starTouchable: {
    padding: 5,
    marginHorizontal: 5,
  },
  star: {
    width: 40,
    height: 40,
  },
  commentsContainer: {
    width: '100%',
    marginVertical: 5,
  },
  commentSection: {
    width: '100%',
    marginBottom: 12,
  },
  commentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a2b49', // Updated text color
    marginBottom: 4,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  commentSubtitle: {
    fontSize: 12,
    color: '#1a2b49', // Updated text color
    marginBottom: 10,
    fontStyle: 'italic',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  bulletContainer: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  bullet: {
    fontSize: 18,
    marginRight: 8,
    color: '#666',
    lineHeight: 35,
    width: 15,
  },
  bulletInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 8,
    minHeight: 40,
    fontSize: 14,
    backgroundColor: 'white',
    color: '#333',
    textAlignVertical: 'top',
  },
  commentInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 10,
    minHeight: 80,
    fontSize: 14,
    backgroundColor: 'white',
    color: '#1a2b49',
    textAlignVertical: 'top',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  eatNowButton: {
    width: '100%',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 15,
    marginBottom: 5,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#1a2b49',
  },
  eatNowButtonText: {
    color: '#1a2b49',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  continueButton: {
    width: '100%',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  continueButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
});

export default RatingScreen1;