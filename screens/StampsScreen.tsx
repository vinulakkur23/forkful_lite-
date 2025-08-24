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
  Modal
} from 'react-native';
import { firebase, auth, firestore } from '../firebaseConfig';
import { Achievement, UserAchievement } from '../types/achievements';
import { getUserAchievements, getAchievementById, getAllAchievements } from '../services/achievementService';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { clearUserStamps } from '../services/clearUserStamps';
import { clearAllUserData } from '../services/clearAllUserData';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../App';
import { FilterItem } from '../components/SimpleFilterComponent';
import { getActiveChallenges, UserChallenge } from '../services/userChallengesService';

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
};

interface City {
  name: string;
  imageUrl: string;
}

interface TopRatedPhoto {
  id: string;
  photoUrl: string;
  photoScore: number;
  meal?: string;
  restaurant?: string;
}

const StampsScreen: React.FC<Props> = ({ userId, navigation, onFilterChange, onTabChange }) => {
  const [loading, setLoading] = useState(true);
  const [userAchievements, setUserAchievements] = useState<UserAchievement[]>([]);
  const [achievementItems, setAchievementItems] = useState<AchievementDisplayItem[]>([]);
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementDisplayItem | null>(null);
  const [topRatedPhotos, setTopRatedPhotos] = useState<TopRatedPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<TopRatedPhoto | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(true);
  const [activeChallenges, setActiveChallenges] = useState<UserChallenge[]>([]);
  const [challengesLoading, setChallengesLoading] = useState(true);
  const [selectedChallenge, setSelectedChallenge] = useState<UserChallenge | null>(null);
  const [pixelArtEmojis, setPixelArtEmojis] = useState<string[]>([]);
  const [emojisLoading, setEmojisLoading] = useState(true);

  console.log('🏆 StampsScreen rendered with userId:', userId);

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
    // DISABLED: Achievements/stamps feature
    // loadAchievements();
    // DISABLED: Top rated photos and cities to reduce Firestore calls
    // loadTopRatedPhotos();
    // loadCities();
    loadActiveChallenges();
    loadPixelArtEmojis();
  }, [userId]);

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

  // DISABLED: Cities feature to reduce Firestore calls
  const loadCities = async () => {
    // Commenting out to reduce Firestore calls
    /*
    try {
      setCitiesLoading(true);
      
      const targetUserId = userId || auth().currentUser?.uid;
      if (!targetUserId) return;

      console.log(`🌎 Loading cities for user: ${targetUserId}`);

      // Get user document to get unique cities
      const userDoc = await firestore().collection('users').doc(targetUserId).get();
      const userData = userDoc.data();
      const uniqueCities = userData?.uniqueCities || [];

      // Load city images from cityImages collection
      const citiesWithImages: City[] = [];
      
      for (const cityName of uniqueCities) {
        const normalizedCityName = cityName.toLowerCase().trim().replace(/\s+/g, '-');
        const cityDoc = await firestore().collection('cityImages').doc(normalizedCityName).get();
        
        // Capitalize each word in the city name
        const capitalizedCityName = cityName.split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
        
        if (cityDoc.exists) {
          const cityData = cityDoc.data();
          if (cityData.imageUrl) {
            citiesWithImages.push({
              name: capitalizedCityName,
              imageUrl: cityData.imageUrl
            });
          }
        } else {
          // Use placeholder if no image exists
          citiesWithImages.push({
            name: capitalizedCityName,
            imageUrl: 'https://via.placeholder.com/350'
          });
        }
      }

      console.log(`🌎 Found ${citiesWithImages.length} cities for user`);
      setCities(citiesWithImages);
    } catch (error) {
      console.error('Error loading cities:', error);
    } finally {
      setCitiesLoading(false);
    }
    */
    setCitiesLoading(false);
    setCities([]);
  };

  const loadActiveChallenges = async () => {
    try {
      setChallengesLoading(true);
      const targetUserId = userId || auth().currentUser?.uid;
      console.log(`🍽️ Loading active challenges for user: ${targetUserId}`);
      
      const challenges = await getActiveChallenges();
      console.log(`🍽️ Found ${challenges.length} active challenges`);
      setActiveChallenges(challenges);
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
      
      // Query user's meals that have pixel art
      const mealsQuery = await firestore()
        .collection('mealEntries')
        .where('userId', '==', targetUserId)
        .where('pixel_art_url', '!=', null)
        .orderBy('pixel_art_url') // Need this for the != query
        .orderBy('createdAt', 'desc')
        .limit(50) // Limit to last 50 emojis
        .get();
      
      const emojiUrls: string[] = [];
      mealsQuery.forEach((doc) => {
        const data = doc.data();
        if (data.pixel_art_url) {
          emojiUrls.push(data.pixel_art_url);
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
                      loadActiveChallenges();
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
          
          // Switch to map tab (index 2)
          onTabChange(2);
        } else {
          // Fallback if functions not available
          Alert.alert('View City', `Showing meals for ${item.name} on map`);
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
      <Text style={styles.cityName} numberOfLines={2}>
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

  const renderChallengeItem = ({ item }: { item: UserChallenge }) => (
    <TouchableOpacity
      style={[
        styles.stampItem,
        styles.earnedStamp
      ]}
      onPress={() => setSelectedChallenge(item)}
    >
      <View style={styles.stampIconContainer}>
        {item.image_data ? (
          <Image
            source={{ uri: item.image_data }}
            style={styles.challengeEmojiImage}
            resizeMode="contain"
          />
        ) : (
          <Icon name="restaurant" size={40} color="#ff6b6b" />
        )}
      </View>
      
      <Text 
        style={[
          styles.stampName, 
          styles.earnedStampText
        ]}
        numberOfLines={2}
      >
        {item.recommended_dish_name}
      </Text>
    </TouchableOpacity>
  );

  return (
    <>
      <ScrollView 
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
      >
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff6b6b" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : (
        <>
          {/* Empty state - when no challenges, cities, photos, or emojis */}
          {!challengesLoading && !citiesLoading && !photosLoading && !emojisLoading &&
           activeChallenges.length === 0 && cities.length === 0 && topRatedPhotos.length === 0 && pixelArtEmojis.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Add meals to get and win challenges!</Text>
            </View>
          ) : (
            <>
              {/* I've Eaten Section */}
          {!emojisLoading && pixelArtEmojis.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>I've Eaten:</Text>
              <FlatList
                data={pixelArtEmojis}
                renderItem={renderEmojiItem}
                keyExtractor={(item, index) => `emoji_${index}`}
                numColumns={6}
                contentContainerStyle={styles.emojisList}
                scrollEnabled={false}
              />
            </>
          )}

          {/* Active Challenges Section */}
              {!challengesLoading && activeChallenges.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Challenge: What to Eat Next</Text>
              <FlatList
                data={activeChallenges}
                renderItem={renderChallengeItem}
                keyExtractor={item => item.challenge_id}
                numColumns={3}
                contentContainerStyle={styles.stampsList}
                scrollEnabled={false}
              />
            </>
          )}

          {/* Cities Section - DISABLED to reduce Firestore calls */}
          {/* {!citiesLoading && cities.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Cities</Text>
              
              <FlatList
                data={cities}
                renderItem={renderCityItem}
                keyExtractor={item => item.name}
                numColumns={3}
                contentContainerStyle={styles.citiesList}
                scrollEnabled={false}
              />
            </>
          )} */}

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
    backgroundColor: '#ffffff', // White background for consistency
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
    backgroundColor: 'transparent',
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
    width: 150, // Full size of the image
    height: 150, // Full size of the image
    borderRadius: 0, // No border radius to show full square image
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 25, // Proportionally scaled spacing
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
    height: STAMP_SIZE + 10, // Reduced extra space for text
    margin: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    backgroundColor: '#ffffff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cityImageContainer: {
    width: STAMP_SIZE - 16, // Use even more of the stamp width
    height: STAMP_SIZE - 25, // Leave less room for text at bottom
    borderRadius: 8,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  cityImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  cityName: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 2,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    color: '#1a2b49',
    minHeight: 24, // Reduced height for tighter spacing
  },
  challengeItem: {
    width: 150,
    marginRight: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e7ff',
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
  emojiItem: {
    width: (width - 100) / 6, // 6 per row to make them tiny
    height: (width - 100) / 6,
    marginHorizontal: 2,
    marginVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiImage: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
});

export default StampsScreen;