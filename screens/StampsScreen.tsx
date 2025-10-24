import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Alert,
  ScrollView,
  Modal,
  Share
} from 'react-native';
import { firebase, auth, firestore } from '../firebaseConfig';
import { Achievement, UserAchievement } from '../types/achievements';
import { getUserAchievements, getAchievementById, getAllAchievements } from '../services/achievementService';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { PieChart } from 'react-native-chart-kit';
import { clearUserStamps } from '../services/clearUserStamps';
import { clearAllUserData } from '../services/clearAllUserData';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../App';
import { FilterItem } from '../components/SimpleFilterComponent';
import { getActiveChallenges, getCompletedChallenges, getUserChallenges, UserChallenge, deleteChallenge } from '../services/userChallengesService';

const { width } = Dimensions.get('window');
const STAMP_SIZE = (width - 60) / 3; // 3 per row with some spacing

interface AchievementDisplayItem {
  id: string;
  name: string;
  description: string;
  image: string;
  earned: boolean;
  earnedAt?: firebase.firestore.Timestamp;
}

type Props = {
  userId?: string;
  navigation?: StackNavigationProp<RootStackParamList, 'FoodPassport'>;
  onFilterChange?: (filters: FilterItem[] | null) => void;
  onTabChange?: (index: number) => void;
  route?: { params?: { openChallengeModal?: string } };
};

interface City {
  name: string;
  imageUrl: string;
  mealCount: number;
}

interface Cuisine {
  name: string;
  imageUrl: string;
  mealCount: number;
}

interface Restaurant {
  name: string;
  mealCount: number;
}

interface TopRatedPhoto {
  id: string;
  photoUrl: string;
  photoScore: number;
  meal?: string;
  restaurant?: string;
}

const StampsScreen: React.FC<Props> = ({ userId, navigation, onFilterChange, onTabChange, route }) => {
  const [loading, setLoading] = useState(true);
  const [userAchievements, setUserAchievements] = useState<UserAchievement[]>([]);
  const [achievementItems, setAchievementItems] = useState<AchievementDisplayItem[]>([]);
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementDisplayItem | null>(null);
  const [topRatedPhotos, setTopRatedPhotos] = useState<TopRatedPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<TopRatedPhoto | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(true);
  const [cuisines, setCuisines] = useState<Cuisine[]>([]);
  const [cuisinesLoading, setCuisinesLoading] = useState(true);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantsLoading, setRestaurantsLoading] = useState(true);
  const [allChallenges, setAllChallenges] = useState<UserChallenge[]>([]);
  const [challengesLoading, setChallengesLoading] = useState(true);
  const [selectedChallenge, setSelectedChallenge] = useState<UserChallenge | null>(null);
  const [pixelArtEmojis, setPixelArtEmojis] = useState<string[]>([]);
  const [emojisLoading, setEmojisLoading] = useState(true);

  console.log('🏆 StampsScreen rendered with userId:', userId);
  
  // Handler for sharing a challenge
  const handleShareChallenge = async (challenge: UserChallenge) => {
    try {
      // Create a shareable challenge in public collection
      const publicChallengeRef = await firestore()
        .collection('publicChallenges')
        .add({
          ...challenge,
          sharedBy: auth().currentUser?.uid,
          sharedAt: firestore.FieldValue.serverTimestamp(),
          originalChallengeId: challenge.challenge_id
        });
      
      // Create a deep link - using app scheme for TestFlight
      // For TestFlight/development, use the direct app scheme
      // For production, you'd want to use universal links (https://)
      const shareableLink = `forkful://challenge/${publicChallengeRef.id}`;
      const message = `Join me on a food challenge! ${challenge.recommended_dish_name}`;
      
      const result = await Share.share({
        message: `${message}\n${shareableLink}`,
        title: 'Food Challenge from Forkful',
        // For iOS, we can also include a URL that will show in share sheet
        url: shareableLink
      });
      
      if (result.action === Share.sharedAction) {
        console.log('Challenge shared successfully');
      }
    } catch (error) {
      console.error('Error sharing challenge:', error);
      Alert.alert('Error', 'Failed to share challenge');
    }
  };
  
  // Handler for deleting a challenge
  const handleDeleteChallenge = async (challenge: UserChallenge) => {
    Alert.alert(
      'Delete Challenge',
      `Are you sure you want to delete the challenge "${challenge.recommended_dish_name}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await deleteChallenge(challenge.challenge_id);
              if (success) {
                // Refresh challenges list
                const updatedChallenges = await getUserChallenges();
                setAllChallenges(updatedChallenges);
                setSelectedChallenge(null);
                Alert.alert('Success', 'Challenge deleted');
              } else {
                Alert.alert('Error', 'Failed to delete challenge');
              }
            } catch (error) {
              console.error('Error deleting challenge:', error);
              Alert.alert('Error', 'Failed to delete challenge');
            }
          }
        }
      ]
    );
  };

  // Function to render text with bold formatting (double asterisks)
  const renderTextWithBold = (text: string) => {
    if (!text) return null;
    
    // Split by double asterisks
    const parts = text.split(/\*\*(.*?)\*\*/g);
    
    return (
      <Text style={styles.detailDescription}>
        {parts.map((part, index) => {
          // Even indices are regular text, odd indices are bold
          if (index % 2 === 0) {
            return <Text key={index}>{part}</Text>;
          } else {
            return <Text key={index} style={{ fontWeight: 'bold' }}>{part}</Text>;
          }
        })}
      </Text>
    );
  };

  useEffect(() => {
    // DISABLED: Achievements/stamps feature - set loading to false immediately
    setLoading(false);
    setAchievementItems([]);
    // loadAchievements();
    // DISABLED: Top rated photos to reduce Firestore calls
    // loadTopRatedPhotos();
    loadCities();
    loadCuisines();
    loadRestaurants();
    loadAllChallenges();
    loadPixelArtEmojis();
  }, [userId]);

  // Handle deep link to open specific challenge modal
  useEffect(() => {
    const challengeToOpen = route?.params?.openChallengeModal;
    if (challengeToOpen && allChallenges.length > 0 && !challengesLoading) {
      console.log('🔗 Opening challenge modal from deep link:', challengeToOpen);
      const challenge = allChallenges.find(c => c.challenge_id === challengeToOpen);
      if (challenge) {
        setSelectedChallenge(challenge);
      } else {
        console.log('⚠️ Challenge not found:', challengeToOpen);
      }
    }
  }, [route?.params?.openChallengeModal, allChallenges, challengesLoading]);

  // DISABLED: Achievements/stamps feature
  const loadAchievements = async () => {
    setLoading(false);
    setAchievementItems([]);
    return;
    /*
    try {
      setLoading(true);
      
      // Get user's earned achievements
      const targetUserId = userId || auth().currentUser?.uid;
      console.log(`🏆 StampsScreen loading achievements for user: ${targetUserId}`);
      
      // Now we can get achievements for any user
      const userAchievements = await getUserAchievements(targetUserId);
      console.log(`🏆 Found ${userAchievements.length} user achievements:`, userAchievements.map(a => a.achievementId));
      setUserAchievements(userAchievements);
      
      // Get all available achievements
      const allAchievements = getAllAchievements();
      
      // Create display items that show both earned and available achievements
      const displayItems: AchievementDisplayItem[] = allAchievements.map(achievement => {
        const userAchievement = userAchievements.find(ua => ua.achievementId === achievement.id);
        
        return {
          id: achievement.id,
          name: achievement.name,
          description: achievement.description,
          image: achievement.image,
          earned: !!userAchievement,
          earnedAt: userAchievement?.earnedAt
        };
      });
      
      setAchievementItems(displayItems);
    } catch (error) {
      console.error('Error loading achievements:', error);
      Alert.alert('Error', 'Failed to load achievements');
    } finally {
      setLoading(false);
    }
    */
  };

  // DISABLED: Top rated photos feature to reduce Firestore calls
  const loadTopRatedPhotos = async () => {
    // Commenting out to reduce Firestore calls
    /*
    try {
      setPhotosLoading(true);
      
      const targetUserId = userId || auth().currentUser?.uid;
      if (!targetUserId) return;

      console.log(`📸 Loading top rated photos for user: ${targetUserId}`);
      
      // Query user's meals with photo scores above 5.2, ordered by score descending
      const mealsQuery = await firestore()
        .collection('mealEntries')
        .where('userId', '==', targetUserId)
        .where('photoScore', '>=', 5.2) // Only include photos with scores above 5.2
        .orderBy('photoScore', 'desc')
        .get();

      const photos: TopRatedPhoto[] = mealsQuery.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          photoUrl: data.photoUrl,
          photoScore: data.photoScore || 0,
          meal: data.meal,
          restaurant: data.restaurant
        };
      });

      console.log(`📸 Found ${photos.length} top rated photos:`, photos.map(p => `${p.meal} - ${p.photoScore}`));
      setTopRatedPhotos(photos);
    } catch (error) {
      console.error('Error loading top rated photos:', error);
    } finally {
      setPhotosLoading(false);
    }
    */
    setPhotosLoading(false);
    setTopRatedPhotos([]);
  };

  const loadCities = async () => {
    try {
      setCitiesLoading(true);
      
      const targetUserId = userId || auth().currentUser?.uid;
      if (!targetUserId) return;

      console.log(`🌎 Loading cities for user: ${targetUserId}`);

      // Get user document to get unique cities
      const userDoc = await firestore().collection('users').doc(targetUserId).get();
      const userData = userDoc.data();
      const uniqueCities = userData?.uniqueCities || [];

      // Load city images and count meals per city
      const citiesWithData: City[] = [];
      
      // Get meal counts per city
      const mealsQuery = await firestore()
        .collection('mealEntries')
        .where('userId', '==', targetUserId)
        .get();
      
      const cityMealCounts: { [city: string]: number } = {};
      mealsQuery.docs.forEach(doc => {
        const data = doc.data();
        const city = data.location?.city;
        if (city) {
          cityMealCounts[city] = (cityMealCounts[city] || 0) + 1;
        }
      });
      
      for (const cityName of uniqueCities) {
        const normalizedCityName = cityName.toLowerCase().trim().replace(/\s+/g, '-');
        const cityDoc = await firestore().collection('cityImages').doc(normalizedCityName).get();

        // Capitalize each word in the city name
        const capitalizedCityName = cityName.split(' ').map(word =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');

        const mealCount = cityMealCounts[cityName] || cityMealCounts[capitalizedCityName] || 0;

        if (cityDoc.exists) {
          const cityData = cityDoc.data();
          if (cityData.imageUrl) {
            citiesWithData.push({
              name: capitalizedCityName,
              imageUrl: cityData.imageUrl,
              mealCount: mealCount
            });
          }
        } else {
          // Use placeholder if no image exists
          citiesWithData.push({
            name: capitalizedCityName,
            imageUrl: 'https://via.placeholder.com/350',
            mealCount: mealCount
          });
        }
      }
      
      // Sort cities by meal count (highest first)
      citiesWithData.sort((a, b) => b.mealCount - a.mealCount);

      console.log(`🌎 Found ${citiesWithData.length} cities for user`);
      setCities(citiesWithData);
    } catch (error) {
      console.error('Error loading cities:', error);
    } finally {
      setCitiesLoading(false);
    }
  };

  const loadCuisines = async () => {
    try {
      setCuisinesLoading(true);
      
      const targetUserId = userId || auth().currentUser?.uid;
      if (!targetUserId) return;

      console.log(`🍳 Loading cuisines for user: ${targetUserId}`);

      // Get user document to get unique cuisines
      const userDoc = await firestore().collection('users').doc(targetUserId).get();
      const userData = userDoc.data();
      const uniqueCuisines = userData?.uniqueCuisines || [];

      // Load cuisine data and count meals per cuisine
      const cuisinesWithData: Cuisine[] = [];
      
      // Get meal counts per cuisine
      const mealsQuery = await firestore()
        .collection('mealEntries')
        .where('userId', '==', targetUserId)
        .get();
      
      const cuisineMealCounts: { [cuisine: string]: number } = {};
      mealsQuery.docs.forEach(doc => {
        const data = doc.data();
        // Primary source: metadata_enriched.cuisine_type (this should always be present)
        let cuisine = data.metadata_enriched?.cuisine_type;
        
        // Fallback sources (for backward compatibility)
        if (!cuisine) {
          cuisine = data.quick_criteria_result?.cuisine_type || 
                   data.enhanced_facts?.food_facts?.cuisine_type || 
                   data.aiMetadata?.cuisineType;
        }
        
        if (cuisine) {
          cuisine = cuisine.toLowerCase().trim();
          if (cuisine !== 'unknown' && cuisine !== 'n/a' && cuisine !== '' && cuisine !== 'null') {
            cuisineMealCounts[cuisine] = (cuisineMealCounts[cuisine] || 0) + 1;
          }
        }
      });
      
      for (const cuisineName of uniqueCuisines) {
        const normalizedCuisineName = cuisineName.toLowerCase().trim().replace(/\s+/g, '-');
        
        // Capitalize cuisine name for display
        const capitalizedCuisineName = cuisineName.split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
        
        const mealCount = cuisineMealCounts[cuisineName] || cuisineMealCounts[normalizedCuisineName] || cuisineMealCounts[capitalizedCuisineName] || 0;
        
        // For now, use a placeholder image. Later we can add cuisine images collection
        cuisinesWithData.push({
          name: capitalizedCuisineName,
          imageUrl: 'https://via.placeholder.com/350',
          mealCount: mealCount
        });
      }
      
      // Sort cuisines by meal count (highest first)
      cuisinesWithData.sort((a, b) => b.mealCount - a.mealCount);

      console.log(`🍳 Found ${cuisinesWithData.length} cuisines for user`);
      setCuisines(cuisinesWithData);
    } catch (error) {
      console.error('Error loading cuisines:', error);
    } finally {
      setCuisinesLoading(false);
    }
  };

  const loadRestaurants = async () => {
    try {
      setRestaurantsLoading(true);

      const targetUserId = userId || auth().currentUser?.uid;
      if (!targetUserId) return;

      console.log(`🍽️ Loading restaurants for user: ${targetUserId}`);

      // Get user document to get unique restaurants
      const userDoc = await firestore().collection('users').doc(targetUserId).get();
      const userData = userDoc.data();
      const uniqueRestaurants = userData?.uniqueRestaurants || [];

      // Get meal counts per restaurant
      const mealsQuery = await firestore()
        .collection('mealEntries')
        .where('userId', '==', targetUserId)
        .get();

      const restaurantMealCounts: { [restaurant: string]: number } = {};
      mealsQuery.docs.forEach(doc => {
        const data = doc.data();
        if (data.restaurant) {
          let restaurantName = data.restaurant.trim();

          // If restaurant includes city/state, extract just the name
          if (restaurantName.includes(',')) {
            const parts = restaurantName.split(',');
            restaurantName = parts[0].trim();
          }

          if (restaurantName && restaurantName !== '' && restaurantName.toLowerCase() !== 'unknown' && restaurantName.toLowerCase() !== 'n/a') {
            restaurantMealCounts[restaurantName] = (restaurantMealCounts[restaurantName] || 0) + 1;
          }
        }
      });

      const restaurantsWithData: Restaurant[] = [];

      for (const restaurantName of uniqueRestaurants) {
        const mealCount = restaurantMealCounts[restaurantName] || 0;

        if (mealCount > 0) {
          restaurantsWithData.push({
            name: restaurantName,
            mealCount: mealCount
          });
        }
      }

      // Sort restaurants by meal count (highest first)
      restaurantsWithData.sort((a, b) => b.mealCount - a.mealCount);

      console.log(`🍽️ Found ${restaurantsWithData.length} restaurants for user`);
      setRestaurants(restaurantsWithData);
    } catch (error) {
      console.error('Error loading restaurants:', error);
    } finally {
      setRestaurantsLoading(false);
    }
  };

  const loadAllChallenges = async () => {
    try {
      setChallengesLoading(true);
      const targetUserId = userId || auth().currentUser?.uid;
      console.log(`🍽️ Loading all challenges for user: ${targetUserId}`);
      
      // Get challenges for the target user (works for both own profile and others)
      const challenges = await getUserChallenges(targetUserId);
      console.log(`🍽️ Found ${challenges.length} total challenges for user ${targetUserId}`);
      
      // Sort challenges: incomplete first, then completed
      const sortedChallenges = [...challenges].sort((a, b) => {
        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (a.status !== 'completed' && b.status === 'completed') return -1;
        return 0;
      });
      
      setAllChallenges(sortedChallenges);
    } catch (error) {
      console.error('Error loading challenges:', error);
    } finally {
      setChallengesLoading(false);
    }
  };

  const loadPixelArtEmojis = async () => {
    try {
      setEmojisLoading(true);
      const targetUserId = userId || auth().currentUser?.uid;
      if (!targetUserId) return;
      
      console.log(`🎨 Loading pixel art emojis for user: ${targetUserId}`);
      
      // Query user's meals that have pixel art (check both URL and data fields)
      const mealsQuery = await firestore()
        .collection('mealEntries')
        .where('userId', '==', targetUserId)
        .orderBy('createdAt', 'desc')
        .limit(100) // Get more meals to check
        .get();
      
      const emojiUrls: string[] = [];
      mealsQuery.forEach((doc) => {
        const data = doc.data();
        
        // Only show pixel art for meals that have been rated (rating > 0)
        if (data.rating && data.rating > 0) {
          // Check for both pixel_art_url and pixel_art_data
          if (data.pixel_art_url) {
            emojiUrls.push(data.pixel_art_url);
          } else if (data.pixel_art_data) {
            // If it's base64 data, convert to data URI
            emojiUrls.push(`data:image/png;base64,${data.pixel_art_data}`);
          }
        }
      });
      
      console.log(`🎨 Found ${emojiUrls.length} pixel art emojis`);
      setPixelArtEmojis(emojiUrls);
    } catch (error) {
      console.error('Error loading pixel art emojis:', error);
    } finally {
      setEmojisLoading(false);
    }
  };

  const formatDate = (timestamp?: firebase.firestore.Timestamp) => {
    if (!timestamp || !timestamp.toDate) return 'Unknown date';
    
    const date = timestamp.toDate();
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Helper function to get the appropriate stamp image
  const getStampImage = (achievementId: string) => {
    try {
      console.log("StampsScreen: Loading stamp image for:", achievementId);
      
      // Use require statements for bundled images - these would need to be added in advance
      const images = {
        'first_bite': require('../assets/stamps/first_bite.png'),
        'stumptown_starter': require('../assets/stamps/stumptown_starter.png'),
        'big_apple_bite': require('../assets/stamps/big_apple_bite.png'),
        'catch_of_the_day': require('../assets/stamps/catch_of_the_day.png'),
        'plant_curious': require('../assets/stamps/plant_curious.png'),
        'plantlandia': require('../assets/stamps/plantlandia.png'),
        'brew_and_chew': require('../assets/stamps/brew_and_chew.png'),
        'taco_tuesday': require('../assets/stamps/taco_tuesday.png'),
        'dreaming_of_sushi': require('../assets/stamps/dreaming_of_sushi.png'),
        'takeout_tour': require('../assets/stamps/takeout_tour.png'),
        'urban_explorer': require('../assets/stamps/urban_explorer.png'),
        'flavor_nomad': require('../assets/stamps/flavor_nomad.png'),
        'world_on_a_plate': require('../assets/stamps/word_on_a_plate.png')
      };
      
      // If we have a bundled image for this achievement, use it
      if (images[achievementId]) {
        console.log("StampsScreen: Found stamp image for:", achievementId);
        return images[achievementId];
      }
      
      // Otherwise fall back to a default image
      console.log("StampsScreen: No stamp image found for:", achievementId, "- using default");
      return require('../assets/stars/star-filled.png');
    } catch (error) {
      console.error("StampsScreen: Error loading stamp image for:", achievementId, error);
      // If there's an error (e.g., image not found), fall back to default
      return require('../assets/stars/star-filled.png');
    }
  };

  const renderAchievementItem = ({ item }: { item: AchievementDisplayItem }) => (
    <TouchableOpacity
      style={[
        styles.stampItem,
        styles.earnedStamp
      ]}
      onPress={() => setSelectedAchievement(item)}
    >
      <View style={styles.stampIconContainer}>
        {/* Try to load the custom stamp image if it exists */}
        <Image 
          source={getStampImage(item.id)}
          style={styles.stampImage}
          resizeMode="contain"
        />
      </View>
      
      <Text 
        style={[
          styles.stampName, 
          styles.earnedStampText
        ]}
        numberOfLines={2}
      >
        {item.name}
      </Text>
      
      <Text style={styles.earnedDate}>
        {formatDate(item.earnedAt)}
      </Text>
    </TouchableOpacity>
  );

  const closeAchievementDetail = () => {
    setSelectedAchievement(null);
  };

  // DEBUG: Handler to clear stamps for testing
  const handleClearStamps = async () => {
    Alert.alert(
      'Debug: Clear All Stamps',
      'This will delete all your stamps for testing purposes. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Stamps',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await clearUserStamps();
              if (result.success) {
                Alert.alert('Success', result.message, [
                  { text: 'OK', onPress: () => {} /* loadAchievements() disabled */ }
                ]);
              } else {
                Alert.alert('Error', result.message);
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to clear stamps');
            }
          }
        }
      ]
    );
  };

  // DEBUG: Handler to clear all user data (stamps, challenges, cities)
  const handleClearAllData = async () => {
    Alert.alert(
      'Debug: Clear ALL Data',
      'This will delete ALL your stamps, challenges, and cities for testing purposes. This cannot be undone. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await clearAllUserData();
              if (result.success) {
                Alert.alert('Success', result.message, [
                  { 
                    text: 'OK', 
                    onPress: () => {
                      // Reload all data
                      // loadAchievements(); // DISABLED
                      loadAllChallenges();
                      // loadCities(); // DISABLED to reduce Firestore calls
                    }
                  }
                ]);
              } else {
                Alert.alert('Error', result.message);
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to clear all data');
            }
          }
        }
      ]
    );
  };

  const renderTopPhotoItem = ({ item }: { item: TopRatedPhoto }) => (
    <TouchableOpacity 
      style={styles.topPhotoItem}
      onPress={() => setSelectedPhoto(item)}
    >
      <View style={styles.photoContainer}>
        {/* Background photo */}
        <Image
          source={{ uri: item.photoUrl }}
          style={styles.topPhotoImage}
          resizeMode="cover"
        />
      </View>
    </TouchableOpacity>
  );

  const renderCityItem = ({ item }: { item: City }) => (
    <TouchableOpacity
      style={styles.cityItem}
      onPress={() => {
        if (navigation && onFilterChange && onTabChange) {
          // Create city filter
          const cityFilter: FilterItem = {
            type: 'city',
            value: item.name.toLowerCase(), // Use lowercase for filtering
            label: item.name
          };
          
          // Set the filter
          onFilterChange([cityFilter]);
          
          // Switch to meals tab (index 0)
          onTabChange(0);
        } else {
          // Fallback if functions not available
          Alert.alert('View City', `Showing meals for ${item.name}`);
        }
      }}
    >
      <View style={styles.cityImageContainer}>
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.cityImage}
          resizeMode="cover"
        />
      </View>
      <Text style={styles.cityName} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={styles.cityMealCount} numberOfLines={1}>
        {item.mealCount} {item.mealCount === 1 ? 'meal' : 'meals'}
      </Text>
    </TouchableOpacity>
  );

  const renderCuisineItem = ({ item }: { item: Cuisine }) => (
    <TouchableOpacity
      style={styles.cuisineItem}
      onPress={() => {
        if (navigation && onFilterChange && onTabChange) {
          // Create cuisine filter
          const cuisineFilter: FilterItem = {
            type: 'cuisineType',
            value: item.name, // Use exact name for filtering
            label: item.name
          };

          // Set the filter
          onFilterChange([cuisineFilter]);

          // Switch to meals tab (index 0)
          onTabChange(0);
        } else {
          // Fallback if functions not available
          Alert.alert('View Cuisine', `Showing meals for ${item.name}`);
        }
      }}
    >
      <View style={styles.cuisineImageContainer}>
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.cuisineImage}
          resizeMode="cover"
        />
      </View>
      <Text style={styles.cuisineName} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={styles.cuisineMealCount} numberOfLines={1}>
        {item.mealCount} {item.mealCount === 1 ? 'meal' : 'meals'}
      </Text>
    </TouchableOpacity>
  );

  const renderRestaurantItem = ({ item }: { item: Restaurant }) => (
    <TouchableOpacity
      style={styles.restaurantListItem}
      onPress={() => {
        if (navigation && onFilterChange && onTabChange) {
          // Create restaurant filter
          const restaurantFilter: FilterItem = {
            type: 'restaurant',
            value: item.name,
            label: item.name
          };

          // Set the filter
          onFilterChange([restaurantFilter]);

          // Switch to meals tab (index 0)
          onTabChange(0);
        } else {
          // Fallback if functions not available
          Alert.alert('View Restaurant', `Showing meals for ${item.name}`);
        }
      }}
    >
      <Text style={styles.restaurantListName} numberOfLines={1}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  const renderEmojiItem = ({ item }: { item: string }) => (
    <View style={styles.emojiItem}>
      <Image 
        source={{ uri: item }} 
        style={styles.emojiImage}
        resizeMode="contain"
      />
    </View>
  );

  const renderChallengeItem = ({ item }: { item: UserChallenge }) => {
    const isCompleted = item.status === 'completed';
    
    return (
      <TouchableOpacity
        style={[
          styles.stampItem,
          styles.challengeItem,
          isCompleted && styles.completedChallengeItem
        ]}
        onPress={() => setSelectedChallenge(item)}
      >
        {/* Completion status indicator */}
        {isCompleted && (
          <View style={styles.challengeStatusIndicator}>
            <Text style={styles.checkmarkText}>✓</Text>
          </View>
        )}

        <View style={styles.stampIconContainer}>
          {item.image_data ? (
            <Image
              source={{ uri: item.image_data }}
              style={[
                styles.challengeEmojiImage,
                isCompleted && styles.completedChallengeImage
              ]}
              resizeMode="contain"
            />
          ) : (
            <Icon 
              name="restaurant" 
              size={40} 
              color={isCompleted ? "#999" : "#ff6b6b"} 
            />
          )}
        </View>
        
        <Text 
          style={[
            styles.stampName, 
            styles.earnedStampText,
            isCompleted && styles.completedChallengeText
          ]}
          numberOfLines={2}
        >
          {item.recommended_dish_name}
        </Text>

        {isCompleted && item.completedWithDish && (
          <Text style={styles.completedWithText} numberOfLines={1}>
            ✓ {item.completedWithDish}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  // Generate pie chart data for cities
  const generateCitiesPieData = () => {
    if (!cities.length) return [];
    
    // Generate distinct colors for each city
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
      '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#D5A6BD'
    ];
    
    return cities.map((city, index) => ({
      name: city.name,
      population: city.mealCount,
      color: colors[index % colors.length],
      legendFontColor: '#1a2b49',
      legendFontSize: 12,
    }));
  };

  const renderCitiesPieChart = () => {
    if (!cities.length) return null;
    
    const pieData = generateCitiesPieData();
    
    return (
      <View style={styles.pieChartContainer}>
        <Text style={styles.pieChartTitle}>Meals by City</Text>
        <PieChart
          data={pieData}
          width={width - 40}
          height={200}
          chartConfig={{
            color: (opacity = 1) => `rgba(26, 43, 73, ${opacity})`,
          }}
          accessor="population"
          backgroundColor="transparent"
          paddingLeft="15"
          center={[10, 0]}
          hasLegend={true}
        />
      </View>
    );
  };

  // Generate pie chart data for cuisines
  const generateCuisinesPieData = () => {
    if (!cuisines.length) return [];
    
    // Generate distinct colors for each cuisine - using different palette than cities
    const colors = [
      '#FF9F40', '#FFCD56', '#36A2EB', '#4BC0C0', '#9966FF',
      '#FF6384', '#C9CBCF', '#FF8A80', '#82B1FF', '#B388FF',
      '#8C9EFF', '#84FFFF', '#A7FFEB', '#B9F6CA', '#CCFF90'
    ];
    
    return cuisines.map((cuisine, index) => ({
      name: cuisine.name,
      population: cuisine.mealCount,
      color: colors[index % colors.length],
      legendFontColor: '#1a2b49',
      legendFontSize: 12,
    }));
  };

  const renderCuisinesPieChart = () => {
    if (!cuisines.length) return null;
    
    const pieData = generateCuisinesPieData();
    
    return (
      <View style={styles.pieChartContainer}>
        <Text style={styles.pieChartTitle}>Meals by Cuisine</Text>
        <PieChart
          data={pieData}
          width={width - 40}
          height={200}
          chartConfig={{
            color: (opacity = 1) => `rgba(26, 43, 73, ${opacity})`,
          }}
          accessor="population"
          backgroundColor="transparent"
          paddingLeft="15"
          center={[10, 0]}
          hasLegend={true}
        />
      </View>
    );
  };

  return (
    <>
      <ScrollView 
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
      >
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a2b49" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : (
        <>
          {/* Empty state - when no challenges, cities, cuisines, photos, or emojis */}
          {!challengesLoading && !citiesLoading && !cuisinesLoading && !photosLoading && !emojisLoading &&
           allChallenges.length === 0 && cities.length === 0 && cuisines.length === 0 && topRatedPhotos.length === 0 && pixelArtEmojis.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Add meals to get and win challenges!</Text>
            </View>
          ) : (
            <>
              {/* I've Eaten Section */}
          {!emojisLoading && pixelArtEmojis.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Meals Eaten:</Text>
              <ScrollView 
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.challengeCarousel}
                contentContainerStyle={styles.challengeCarouselContent}
              >
                {pixelArtEmojis.map((item, index) => (
                  <View key={`emoji_${index}`} style={styles.emojiCarouselWrapper}>
                    {renderEmojiItem({ item, index: 0, separators: null as any })}
                  </View>
                ))}
              </ScrollView>
            </>
          )}

          {/* All Challenges Section */}
              {!challengesLoading && allChallenges.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Food Challenges</Text>
              <ScrollView 
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.challengeCarousel}
                contentContainerStyle={styles.challengeCarouselContent}
              >
                {allChallenges.map(item => (
                  <View key={item.challenge_id} style={styles.carouselItemWrapper}>
                    {renderChallengeItem({ item, index: 0, separators: null as any })}
                  </View>
                ))}
              </ScrollView>
            </>
          )}

          {/* Cities Section */}
          {!citiesLoading && cities.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Cities</Text>
              
              <ScrollView 
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.challengeCarousel}
                contentContainerStyle={styles.challengeCarouselContent}
              >
                {cities.map(item => (
                  <View key={item.name} style={styles.carouselItemWrapper}>
                    {renderCityItem({ item, index: 0, separators: null as any })}
                  </View>
                ))}
              </ScrollView>
              
              {/* Cities Pie Chart */}
              {renderCitiesPieChart()}
            </>
          )}

          {/* Cuisines Section */}
          {!cuisinesLoading && cuisines.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Cuisines</Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.challengeCarousel}
                contentContainerStyle={styles.challengeCarouselContent}
              >
                {cuisines.map(item => (
                  <View key={item.name} style={styles.carouselItemWrapper}>
                    {renderCuisineItem({ item, index: 0, separators: null as any })}
                  </View>
                ))}
              </ScrollView>
            </>
          )}

          {/* Restaurants Section */}
          {!restaurantsLoading && restaurants.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Restaurants</Text>
              <View style={styles.restaurantsList}>
                {restaurants.map(item => (
                  <View key={item.name}>
                    {renderRestaurantItem({ item, index: 0, separators: null as any })}
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Top Rated Photos Section - DISABLED to reduce Firestore calls */}
          {/* {!photosLoading && topRatedPhotos.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Wall Hangers</Text>
              
              <FlatList
                data={topRatedPhotos}
                renderItem={renderTopPhotoItem}
                keyExtractor={item => item.id}
                numColumns={3}
                contentContainerStyle={styles.topPhotosList}
                scrollEnabled={false}
              />
            </>
          )} */}

          {/* DEBUG BUTTONS - COMMENTED OUT FOR NOW
          <TouchableOpacity 
            style={[styles.debugButton, { bottom: 80 }]}
            onPress={handleClearStamps}
          >
            <Text style={styles.debugButtonText}>🧪 Clear Stamps</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.debugButton, { bottom: 20 }]}
            onPress={handleClearAllData}
          >
            <Text style={styles.debugButtonText}>🧹 Clear ALL Data</Text>
          </TouchableOpacity>
          */}
          
            </>
          )}
        </>
      )}
    </ScrollView>
    
    {/* Photo detail modal - now using Modal component for proper positioning */}
    <Modal
      visible={selectedPhoto !== null}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setSelectedPhoto(null)}
    >
      <View style={styles.photoDetailOverlay}>
        <TouchableOpacity 
          style={styles.photoDetailOverlay}
          onPress={() => setSelectedPhoto(null)}
          activeOpacity={1}
        >
          <View style={styles.photoDetailContainer}>
            <TouchableOpacity 
              style={styles.photoCloseButton}
              onPress={() => setSelectedPhoto(null)}
            >
              <Text style={styles.closeButtonX}>×</Text>
            </TouchableOpacity>
            
            <View style={styles.enlargedPhotoContainer}>
              {selectedPhoto && (
                <Image
                  source={{ uri: selectedPhoto.photoUrl }}
                  style={styles.enlargedPhoto}
                  resizeMode="cover"
                />
              )}
            </View>
            
            <View style={styles.photoDetailInfo}>
              {selectedPhoto?.meal && (
                <Text style={styles.photoDetailMeal}>{selectedPhoto.meal}</Text>
              )}
              {selectedPhoto?.restaurant && (
                <Text style={styles.photoDetailRestaurant}>{selectedPhoto.restaurant}</Text>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </View>
    </Modal>
    
    {/* Achievement detail modal - now using Modal component for proper positioning */}
    <Modal
      visible={selectedAchievement !== null}
      transparent={true}
      animationType="fade"
      onRequestClose={closeAchievementDetail}
    >
      <View style={styles.detailOverlay}>
        <TouchableOpacity 
          style={styles.detailOverlay}
          onPress={closeAchievementDetail}
          activeOpacity={1}
        >
          <View style={styles.detailCard}>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={closeAchievementDetail}
            >
              <Text style={styles.closeButtonX}>×</Text>
            </TouchableOpacity>
            
            {/* Zoomed stamp image - same proportions as original stamp */}
            <View style={styles.zoomedStampContainer}>
              {selectedAchievement?.earned ? (
                <Image 
                  source={getStampImage(selectedAchievement.id)}
                  style={styles.zoomedStampImage}
                  resizeMode="contain"
                />
              ) : (
                selectedAchievement && <Icon name="lock" size={120} color="#ccc" />
              )}
            </View>
            
            {/* Title and description at bottom */}
            <View style={styles.stampInfo}>
              {selectedAchievement && (
                <>
                  <Text style={styles.detailName}>
                    {selectedAchievement.name}
                  </Text>
                  
                  <Text style={styles.detailDescription}>
                    {selectedAchievement.description}
                  </Text>
                  
                  {selectedAchievement.earned ? (
                    <Text style={styles.statusText}>
                      Earned on {formatDate(selectedAchievement.earnedAt)}
                    </Text>
                  ) : (
                    <View style={styles.statusContainer}>
                      <Icon name="lock" size={16} color="#888" />
                      <Text style={[styles.statusText, { marginLeft: 6 }]}>
                        Not earned yet
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </View>
    </Modal>
    
    {/* Challenge detail modal */}
    <Modal
      visible={selectedChallenge !== null}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setSelectedChallenge(null)}
    >
      <View style={styles.detailOverlay}>
        <TouchableOpacity 
          style={styles.detailOverlay}
          onPress={() => setSelectedChallenge(null)}
          activeOpacity={1}
        >
          <View style={styles.detailCard}>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => setSelectedChallenge(null)}
            >
              <Text style={styles.closeButtonX}>×</Text>
            </TouchableOpacity>
            
            {/* Zoomed challenge image */}
            <View style={styles.zoomedStampContainer}>
              {selectedChallenge?.image_data ? (
                <Image 
                  source={{ uri: selectedChallenge.image_data }}
                  style={styles.zoomedStampImage}
                  resizeMode="contain"
                />
              ) : (
                <Icon name="restaurant" size={120} color="#ff6b6b" />
              )}
            </View>
            
            {/* Title and description at bottom */}
            <View style={styles.stampInfo}>
              {selectedChallenge && (
                <>
                  <Text style={styles.detailName}>
                    {selectedChallenge.recommended_dish_name}
                  </Text>
                  
                  {renderTextWithBold(
                    selectedChallenge.challenge_description || 
                    `${selectedChallenge.why_this_dish || ''}\n\n${selectedChallenge.what_to_notice || ''}`.trim()
                  )}
                  
                  {/* Action buttons for active challenges only - only show on own profile */}
                  {selectedChallenge.status === 'active' && (!userId || userId === auth().currentUser?.uid) && (
                    <View style={styles.challengeActionButtons}>
                      <TouchableOpacity 
                        style={styles.shareButton}
                        onPress={() => handleShareChallenge(selectedChallenge)}
                      >
                        <Text style={styles.shareButtonText}>Challenge Friend</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity 
                        style={styles.deleteButton}
                        onPress={() => handleDeleteChallenge(selectedChallenge)}
                      >
                        <Text style={styles.deleteButtonText}>Delete Challenge</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </View>
    </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6', // Match the app's cream background
  },
  scrollContent: {
    paddingBottom: 50, // Extra space at bottom for comfortable scrolling
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'normal',
    marginHorizontal: 15,
    marginTop: 15,
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  subtitle: {
    fontSize: 16,
    color: '#1a2b49',
    marginHorizontal: 15,
    marginBottom: 10,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  stampsList: {
    padding: 15,
    paddingBottom: 30,
  },
  stampItem: {
    width: STAMP_SIZE,
    height: STAMP_SIZE + 30, // Extra space for text
    margin: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    backgroundColor: '#FFFFFF', // Solid white background
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  earnedStamp: {
    borderWidth: 0,
  },
  unearnedStamp: {
    opacity: 0.7,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  stampIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 0,
    backgroundColor: 'transparent', // Back to transparent - let card background show through
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    overflow: 'hidden',
  },
  stampImage: {
    width: '100%',
    height: '100%',
  },
  lockedIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  stampName: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 5,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  earnedStampText: {
    color: '#1a2b49', // Updated to match app's text color
  },
  unearnedStampText: {
    color: '#888',
  },
  earnedDate: {
    fontSize: 10,
    color: '#1a2b49', // Updated to match app's text color but slightly lighter
    marginTop: 4,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingTop: 200,
    paddingBottom: 50,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'normal',
    color: '#555',
    marginTop: 15,
    textAlign: 'center',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#1a2b49',
    textAlign: 'center',
    marginTop: 5,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  // Detail modal styles
  detailOverlay: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  detailCard: {
    width: STAMP_SIZE * 3, // Increased from 2.5x to 3x for more space
    backgroundColor: '#ffffff', // White background for consistency
    borderRadius: 25, // Proportionally scaled from original 10px
    alignItems: 'center',
    padding: 25, // Proportionally scaled from original 10px
    elevation: 8, // Stronger shadow for the zoomed effect
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 5,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  closeButtonX: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a2b49',
    textAlign: 'center',
    lineHeight: 24,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  // New zoomed stamp styles
  zoomedStampContainer: {
    width: 120, // Slightly smaller than 150
    height: 120, // Slightly smaller than 150
    borderRadius: 0, // No border radius to show full square image
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20, // Reduced spacing
    overflow: 'hidden',
  },
  zoomedStampImage: {
    width: '100%',
    height: '100%',
  },
  stampInfo: {
    alignItems: 'center',
    paddingHorizontal: 0,
    width: '100%', // Ensure full width for text
  },
  challengeActionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    width: '100%',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#1a2b49',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    flex: 0.45,
    justifyContent: 'center',
  },
  shareButtonText: {
    color: '#1a2b49',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#1a2b49',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    flex: 0.45,
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: '#1a2b49',
    fontSize: 12,
    fontWeight: '600',
  },
  detailName: {
    fontSize: 20, // Significantly reduced from 36px to 20px
    fontWeight: 'bold',
    marginBottom: 12, // Proportionally scaled spacing
    textAlign: 'center',
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  detailDescription: {
    fontSize: 14, // Reduced from 16px to 14px
    color: '#1a2b49',
    textAlign: 'center',
    marginBottom: 15,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    lineHeight: 20, // Adjusted line height proportionally
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  statusText: {
    fontSize: 13,
    color: '#666', // Slightly muted for the earned date
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    textAlign: 'center',
  },
  // Debug button styles
  debugButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  debugButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  // Top Photos Section Styles
  topPhotosList: {
    padding: 15,
    paddingBottom: 20,
  },
  topPhotoItem: {
    alignItems: 'center',
    margin: 5, // Equal spacing all around for grid layout
  },
  photoContainer: {
    position: 'relative',
    width: (width - 90) / 3, // Responsive width for 3 columns with spacing
    height: (width - 90) / 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topPhotoImage: {
    width: '100%', // Full container without frame
    height: '100%',
    borderRadius: 8,
  },
  // Photo Modal Styles
  photoDetailOverlay: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  photoDetailContainer: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    backgroundColor: '#ffffff',
    borderRadius: 15,
    padding: 20,
    alignItems: 'center',
  },
  photoCloseButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 5,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  enlargedPhotoContainer: {
    position: 'relative',
    width: 320,
    height: 320,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  enlargedPhoto: {
    width: 291, // Increased from 270 to 291 (91% of 320px frame) for better frame fit
    height: 291,
    borderRadius: 15,
    position: 'absolute',
  },
  photoDetailInfo: {
    alignItems: 'center',
    marginTop: 15,
  },
  photoDetailMeal: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a2b49',
    marginBottom: 4,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    textAlign: 'center',
  },
  photoDetailRestaurant: {
    fontSize: 14,
    color: '#666',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    textAlign: 'center',
  },
  // Cities section styles
  citiesList: {
    padding: 15,
    paddingBottom: 30,
  },
  cityItem: {
    width: STAMP_SIZE,
    height: STAMP_SIZE + 25, // More reasonable space for text
    margin: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'flex-start', // Start from top
    padding: 8,
    backgroundColor: '#ffffff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cityImageContainer: {
    width: STAMP_SIZE - 16,
    height: STAMP_SIZE - 50, // Smaller image to make room for text
    borderRadius: 8,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 8, // Add space between image and text
  },
  cityImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  cityName: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    color: '#1a2b49',
    marginBottom: 2,
    marginTop: -40,
  },
  cityMealCount: {
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    marginTop: 5,
  },
  // Cuisine styles (identical to city styles)
  cuisineItem: {
    width: STAMP_SIZE,
    height: STAMP_SIZE + 25, // More reasonable space for text
    margin: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'flex-start', // Start from top
    padding: 8,
    backgroundColor: '#ffffff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cuisineImageContainer: {
    width: STAMP_SIZE - 16,
    height: STAMP_SIZE - 50, // Smaller image to make room for text
    borderRadius: 8,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 8, // Add space between image and text
  },
  cuisineImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  cuisineName: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    color: '#1a2b49',
    marginBottom: 2,
    marginTop: -40,
  },
  cuisineMealCount: {
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    marginTop: 5,
  },
  restaurantsList: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  restaurantListItem: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 4,
    borderRadius: 6,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  restaurantListName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  // Pie chart styles
  pieChartContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  pieChartTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a2b49',
    marginBottom: 15,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  challengeItem: {
    position: 'relative', // For absolute positioning of status indicator
  },
  challengeCarousel: {
    marginTop: 10,
    marginBottom: 15,
  },
  challengeCarouselContent: {
    paddingHorizontal: 15,
    paddingRight: 25, // Extra padding at the end
  },
  carouselItemWrapper: {
    marginRight: 10, // Space between carousel items
  },
  completedChallengeItem: {
    backgroundColor: '#FFFFFF', // Keep white background like active challenges
    borderColor: '#ccc',
    borderWidth: 2,
  },
  challengeStatusIndicator: {
    position: 'absolute',
    top: 5,
    right: 5,
    zIndex: 1,
  },
  activeChallengeIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ff6b6b',
    backgroundColor: 'transparent',
  },
  completedChallengeImage: {
    opacity: 0.5, // More faded for grey "completed" look
  },
  completedChallengeText: {
    color: '#999', // Grey color for completed challenge text
    textDecorationLine: 'line-through',
  },
  completedWithText: {
    fontSize: 9,
    color: '#4CAF50', // Keep green for the checkmark and completed dish text
    marginTop: 2,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  checkmarkText: {
    fontSize: 18,
    color: '#4CAF50', // Green checkmark
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 20,
  },
  challengeContent: {
    alignItems: 'center',
  },
  challengeTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a2b49',
    marginTop: 8,
    textAlign: 'center',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  challengeCuisine: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  challengeStatus: {
    fontSize: 11,
    color: '#ff6b6b',
    marginTop: 8,
    fontWeight: '600',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  challengesList: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  challengeImageContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: '#f5f5f5',
  },
  challengeImage: {
    width: '100%',
    height: '100%',
  },
  challengeEmojiImage: {
    width: '100%',
    height: '100%',
  },
  challengeStatusText: {
    fontSize: 10,
    color: '#ff6b6b',
    marginTop: 4,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    textAlign: 'center',
  },
  emojisList: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  emojiCarouselWrapper: {
    marginRight: 6, // Space between carousel items
  },
  emojiItem: {
    width: 85,
    height: 85,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
});

export default StampsScreen;