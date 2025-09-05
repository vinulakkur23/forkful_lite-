import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { followUser, unfollowUser } from '../services/followService';
import { getUserRecommendations, NearbyUser } from '../services/userRecommendationService';

interface NearbyUsersCarouselProps {
  userLocation: { latitude: number; longitude: number } | null;
  onUserPress: (userId: string, userName: string, userPhoto: string) => void;
  onRefresh?: number; // Trigger number for refresh
}

const NearbyUsersCarousel: React.FC<NearbyUsersCarouselProps> = ({
  userLocation,
  onUserPress,
  onRefresh
}) => {
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingStates, setFollowingStates] = useState<{ [key: string]: boolean }>({});
  const [processingFollow, setProcessingFollow] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    loadNearbyUsers();
  }, [userLocation]);

  useEffect(() => {
    // Reload when onRefresh value changes
    loadNearbyUsers();
  }, [onRefresh]);

  const loadNearbyUsers = async () => {
    try {
      setLoading(true);
      // Don't need location anymore - just get most active users
      const users = await getUserRecommendations(null, 10);
      setNearbyUsers(users);
      
      // Initialize following states
      const states: { [key: string]: boolean } = {};
      users.forEach(user => {
        states[user.id] = user.isFollowing || false;
      });
      setFollowingStates(states);
    } catch (error) {
      console.error('Error loading nearby users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFollowToggle = async (user: NearbyUser) => {
    if (processingFollow[user.id]) return;

    setProcessingFollow(prev => ({ ...prev, [user.id]: true }));
    const isCurrentlyFollowing = followingStates[user.id];

    try {
      let result;
      if (isCurrentlyFollowing) {
        result = await unfollowUser(user.id);
      } else {
        result = await followUser(user.id, user.displayName, user.photoURL);
      }

      if (result.success) {
        setFollowingStates(prev => ({
          ...prev,
          [user.id]: !isCurrentlyFollowing
        }));
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      Alert.alert('Error', 'Failed to update follow status');
    } finally {
      setProcessingFollow(prev => ({ ...prev, [user.id]: false }));
    }
  };

  // Remove the location check - always show carousel

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#1a2b49" />
          <Text style={styles.loadingText}>Finding active foodies...</Text>
        </View>
      </View>
    );
  }

  if (nearbyUsers.length === 0) {
    return null; // Don't show carousel if no nearby users
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Active Foodies Around You</Text>
      </View>
      
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {nearbyUsers.map((user) => (
          <TouchableOpacity
            key={user.id}
            style={styles.userCard}
            onPress={() => onUserPress(user.id, user.displayName, user.photoURL)}
            activeOpacity={0.8}
          >
            <View style={styles.imageContainer}>
              {user.photoURL ? (
                <Image
                  source={{ uri: user.photoURL }}
                  style={styles.userImage}
                  defaultSource={require('../assets/default-avatar.png')}
                />
              ) : (
                <View style={[styles.userImage, styles.placeholderImage]}>
                  <Icon name="person" size={32} color="#999" />
                </View>
              )}
            </View>
            
            <Text style={styles.userName} numberOfLines={1}>
              {user.displayName}
            </Text>
            
            <Text style={styles.mealCount}>
              {user.recentMealCount} {user.recentMealCount === 1 ? 'post' : 'posts'}
            </Text>
            
            <TouchableOpacity
              style={[
                styles.followButton,
                followingStates[user.id] && styles.followingButton
              ]}
              onPress={() => handleFollowToggle(user)}
              disabled={processingFollow[user.id]}
            >
              {processingFollow[user.id] ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[
                  styles.followButtonText,
                  followingStates[user.id] && styles.followingButtonText
                ]}>
                  {followingStates[user.id] ? 'Following' : 'Follow'}
                </Text>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    marginBottom: 12,
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  loadingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginLeft: 8,
    color: '#666',
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  header: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  userCard: {
    alignItems: 'center',
    marginHorizontal: 6,
    width: 100,
  },
  imageContainer: {
    position: 'relative',
    marginBottom: 8,
  },
  userImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  placeholderImage: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  userName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1a2b49',
    textAlign: 'center',
    marginBottom: 2,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  mealCount: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: 'Inter-Regular',
  },
  followButton: {
    backgroundColor: '#1a2b49', // Navy blue instead of red
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
    minWidth: 70,
    alignItems: 'center',
  },
  followingButton: {
    backgroundColor: '#f0f0f0',
  },
  followButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Inter-Regular',
  },
  followingButtonText: {
    color: '#666',
  },
});

export default NearbyUsersCarousel;