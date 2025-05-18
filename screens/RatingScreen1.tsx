import React, { useState, useEffect } from 'react';
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
import { RouteProp } from '@react-navigation/native';
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
  const { photo } = route.params;

  // Initialize location with priority information
  const initializeLocation = () => {
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
  };

  // Use state to manage location so we can update it when restaurant is selected
  const [location, setLocation] = useState(initializeLocation());
  const [rating, setRating] = useState<number>(0);
  const [imageError, setImageError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Comment sections with multiple text fields per section
  const [likedComment1, setLikedComment1] = useState<string>('');
  const [likedComment2, setLikedComment2] = useState<string>('');
  const [dislikedComment1, setDislikedComment1] = useState<string>('');
  const [dislikedComment2, setDislikedComment2] = useState<string>('');

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
  }, []);

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
    try {
      // Show loading indication
      setIsProcessing(true);

      // Generate a unique session ID for this result flow
      const sessionId = route.params._uniqueKey || Math.random().toString(36).substring(2, 15);
      console.log(`Continuing session ${sessionId} to RatingScreen2`);

      // Create a clean copy of the image without query parameters for passing to next screen
      const timestamp = new Date().getTime();
      const fileExt = 'jpg'; // Default to jpg

      // Create a path for the new clean image file
      const newFilename = `rating2_image_${timestamp}.${fileExt}`;

      // Determine the temp directory path based on platform
      const dirPath = Platform.OS === 'ios'
        ? `${RNFS.TemporaryDirectoryPath}/`
        : `${RNFS.CachesDirectoryPath}/`;

      const newFilePath = `${dirPath}${newFilename}`;
      console.log('Creating clean image for RatingScreen2 at:', newFilePath);

      // Copy the current image file to new location
      await RNFS.copyFile(photo.uri, newFilePath);
      console.log('File copied successfully for RatingScreen2');

      // Create a fresh photo object to avoid any reference issues
      const freshPhoto = {
        uri: newFilePath,
        width: photo.width,
        height: photo.height,
        sessionId: sessionId // Add session ID for tracking
      };

      console.log(`Navigating to RatingScreen2 with fresh image: ${freshPhoto.uri}`);

      // Format and combine the comments from each section
      const formatComments = (comment1: string, comment2: string): string => {
        let result = '';

        // Add first comment if it's not empty
        if (comment1.trim()) {
          result += '• ' + comment1.trim();
        }

        // Add second comment if it's not empty
        if (comment2.trim()) {
          // Add a line break if we already have content
          if (result) result += '\n';
          result += '• ' + comment2.trim();
        }

        return result;
      };

      // Format and combine the comments from each section
      const formattedLikedComment = formatComments(likedComment1, likedComment2);
      const formattedDislikedComment = formatComments(dislikedComment1, dislikedComment2);

      // Navigate to RatingScreen2 with all collected data
      navigation.navigate('RatingScreen2', {
        photo: freshPhoto,
        location: location,
        rating: rating,
        likedComment: formattedLikedComment,
        dislikedComment: formattedDislikedComment,
        suggestionData: route.params.suggestionData, // Pass along any suggestion data
        _uniqueKey: sessionId // This helps React Navigation identify this as a new navigation
      });
    } catch (error) {
      console.error('Error preparing data for RatingScreen2:', error);
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
            <Text style={styles.ratingTitle}>How would you rate this meal?</Text>
            <View style={styles.ratingContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => handleRating(star)}
                  style={styles.starTouchable}
                >
                  <Image
                    source={star <= rating
                      ? require('../assets/stars/star-filled.png')
                      : require('../assets/stars/star-empty.png')}
                    style={styles.star}
                    resizeMode="contain"
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
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <TextInput
                  style={styles.bulletInput}
                  placeholder="First thing you liked..."
                  placeholderTextColor="#999"
                  multiline={true}
                  blurOnSubmit={true}
                  returnKeyType="done"
                  autoCapitalize="sentences"
                  onSubmitEditing={handleSubmitEditing}
                  onChangeText={setLikedComment1}
                  value={likedComment1}
                  maxLength={150}
                />
              </View>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <TextInput
                  style={styles.bulletInput}
                  placeholder="Second thing you liked..."
                  placeholderTextColor="#999"
                  multiline={true}
                  blurOnSubmit={true}
                  returnKeyType="done"
                  autoCapitalize="sentences"
                  onSubmitEditing={handleSubmitEditing}
                  onChangeText={setLikedComment2}
                  value={likedComment2}
                  maxLength={150}
                />
              </View>
            </View>

            {/* Disliked Comments Section */}
            <View style={styles.commentSection}>
              <Text style={styles.commentTitle}>What did you not like?</Text>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <TextInput
                  style={styles.bulletInput}
                  placeholder="First thing you didn't like..."
                  placeholderTextColor="#999"
                  multiline={true}
                  blurOnSubmit={true}
                  returnKeyType="done"
                  autoCapitalize="sentences"
                  onSubmitEditing={handleSubmitEditing}
                  onChangeText={setDislikedComment1}
                  value={dislikedComment1}
                  maxLength={150}
                />
              </View>
              <View style={styles.bulletContainer}>
                <Text style={styles.bullet}>•</Text>
                <TextInput
                  style={styles.bulletInput}
                  placeholder="Second thing you didn't like..."
                  placeholderTextColor="#999"
                  multiline={true}
                  blurOnSubmit={true}
                  returnKeyType="done"
                  autoCapitalize="sentences"
                  onSubmitEditing={handleSubmitEditing}
                  onChangeText={setDislikedComment2}
                  value={dislikedComment2}
                  maxLength={150}
                />
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.continueButton,
              { backgroundColor: rating > 0 ? '#ff6b6b' : '#cccccc' }
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
    backgroundColor: '#f8f8f8',
  },
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  contentContainer: {
    padding: 15,
    alignItems: 'center',
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
  },
  ratingSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  ratingTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
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
    marginVertical: 10,
  },
  commentSection: {
    width: '100%',
    marginBottom: 20,
  },
  commentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  commentSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
    fontStyle: 'italic',
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
  continueButton: {
    width: '100%',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  continueButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default RatingScreen1;