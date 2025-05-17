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
  Alert
} from 'react-native';
import { firebase, auth } from '../firebaseConfig';
import { Achievement, UserAchievement } from '../types/achievements';
import { getUserAchievements, getAchievementById, getAllAchievements } from '../services/achievementService';
import Icon from 'react-native-vector-icons/MaterialIcons';

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

const StampsScreen: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [userAchievements, setUserAchievements] = useState<UserAchievement[]>([]);
  const [achievementItems, setAchievementItems] = useState<AchievementDisplayItem[]>([]);
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementDisplayItem | null>(null);

  useEffect(() => {
    loadAchievements();
  }, []);

  const loadAchievements = async () => {
    try {
      setLoading(true);
      
      // Get user's earned achievements
      const userAchievements = await getUserAchievements();
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

  const renderAchievementItem = ({ item }: { item: AchievementDisplayItem }) => (
    <TouchableOpacity
      style={[
        styles.stampItem,
        item.earned ? styles.earnedStamp : styles.unearnedStamp
      ]}
      onPress={() => setSelectedAchievement(item)}
    >
      {/* Determine the image source */}
      {item.earned ? (
        // For now we'll use icons until we have actual stamp images
        <View style={styles.stampIconContainer}>
          <Icon 
            name={
              item.id === 'first_bite' ? 'restaurant' : 
              item.id === 'stubtown_starter' ? 'location-city' :
              item.id === 'big_apple_bite' ? 'location-on' : 'stars'
            } 
            size={40} 
            color="#fff" 
          />
        </View>
      ) : (
        <View style={styles.lockedIconContainer}>
          <Icon name="lock" size={40} color="#ccc" />
        </View>
      )}
      
      <Text 
        style={[
          styles.stampName, 
          item.earned ? styles.earnedStampText : styles.unearnedStampText
        ]}
        numberOfLines={2}
      >
        {item.name}
      </Text>
      
      {item.earned && (
        <Text style={styles.earnedDate}>
          {formatDate(item.earnedAt)}
        </Text>
      )}
    </TouchableOpacity>
  );

  const closeAchievementDetail = () => {
    setSelectedAchievement(null);
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff6b6b" />
          <Text style={styles.loadingText}>Loading achievements...</Text>
        </View>
      ) : (
        <>
          <Text style={styles.subtitle}>
            {userAchievements.length} of {achievementItems.length} stamps collected
          </Text>
          
          <FlatList
            data={achievementItems}
            renderItem={renderAchievementItem}
            keyExtractor={item => item.id}
            numColumns={3}
            contentContainerStyle={styles.stampsList}
          />
          
          {/* Empty state */}
          {achievementItems.length === 0 && (
            <View style={styles.emptyContainer}>
              <Icon name="emoji-events" size={64} color="#ddd" />
              <Text style={styles.emptyText}>No achievements available yet</Text>
              <Text style={styles.emptySubtext}>
                Keep using the app to earn achievements!
              </Text>
            </View>
          )}
          
          {/* Achievement detail modal */}
          {selectedAchievement && (
            <View style={styles.detailOverlay}>
              <View style={styles.detailCard}>
                <TouchableOpacity 
                  style={styles.closeButton}
                  onPress={closeAchievementDetail}
                >
                  <Icon name="close" size={24} color="#888" />
                </TouchableOpacity>
                
                <View style={[
                  styles.detailIconContainer,
                  selectedAchievement.earned ? styles.earnedDetail : styles.unearnedDetail
                ]}>
                  <Icon 
                    name={
                      selectedAchievement.id === 'first_bite' ? 'restaurant' : 
                      selectedAchievement.id === 'stubtown_starter' ? 'location-city' :
                      selectedAchievement.id === 'big_apple_bite' ? 'location-on' : 'stars'
                    } 
                    size={60} 
                    color={selectedAchievement.earned ? "#fff" : "#ccc"} 
                  />
                </View>
                
                <Text style={styles.detailName}>
                  {selectedAchievement.name}
                </Text>
                
                <Text style={styles.detailDescription}>
                  {selectedAchievement.description}
                </Text>
                
                {selectedAchievement.earned ? (
                  <View style={styles.statusContainer}>
                    <Icon name="check-circle" size={18} color="#4CAF50" />
                    <Text style={styles.statusText}>
                      Earned on {formatDate(selectedAchievement.earnedAt)}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.statusContainer}>
                    <Icon name="lock" size={18} color="#888" />
                    <Text style={styles.statusText}>
                      Not earned yet
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
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
    fontWeight: 'bold',
    marginHorizontal: 15,
    marginTop: 15,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginHorizontal: 15,
    marginBottom: 10,
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
    backgroundColor: 'white',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  earnedStamp: {
    borderWidth: 2,
    borderColor: '#ff6b6b',
  },
  unearnedStamp: {
    opacity: 0.7,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  stampIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ff6b6b',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
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
  },
  earnedStampText: {
    color: '#333',
  },
  unearnedStampText: {
    color: '#888',
  },
  earnedDate: {
    fontSize: 10,
    color: '#888',
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#555',
    marginTop: 15,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 5,
  },
  // Detail modal styles
  detailOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  detailCard: {
    width: width * 0.8,
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 5,
  },
  detailIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  earnedDetail: {
    backgroundColor: '#ff6b6b',
  },
  unearnedDetail: {
    backgroundColor: '#f0f0f0',
  },
  detailName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  detailDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  statusText: {
    marginLeft: 5,
    fontSize: 14,
    color: '#666',
  },
});

export default StampsScreen;