import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

export interface NearbyUser {
  id: string;
  displayName: string;
  photoURL: string;
  lastMealLocation: {
    latitude: number;
    longitude: number;
    city?: string;
  };
  distance: number; // in km
  recentMealCount: number;
  lastActiveAt: Date;
  isFollowing?: boolean;
}

// Calculate distance between two coordinates in kilometers
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in km
};

const deg2rad = (deg: number): number => {
  return deg * (Math.PI/180);
};

/**
 * Get most active users based on their recent meal posts
 * Simplified version that doesn't require location
 */
export const getMostActiveUsers = async (
  limit: number = 10
): Promise<NearbyUser[]> => {
  try {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      console.log('No current user available');
      return [];
    }

    // Get recent meals to find active users
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const mealsSnapshot = await firestore()
      .collection('mealEntries')
      .where('createdAt', '>=', thirtyDaysAgo)
      .orderBy('createdAt', 'desc')
      .limit(500) // Get more meals to find the most active users
      .get();

    // Map to track users and their meal counts
    const userMealMap = new Map<string, {
      userId: string;
      userName: string;
      userPhoto: string;
      location: any;
      mealCount: number;
      lastMealDate: Date;
    }>();

    // Process meals to find unique users and count their posts
    mealsSnapshot.docs.forEach(doc => {
      const meal = doc.data();
      
      // Skip meals from current user
      if (meal.userId === currentUser.uid) {
        return;
      }

      const existing = userMealMap.get(meal.userId);
      const mealDate = meal.createdAt?.toDate() || new Date(0);

      if (!existing) {
        userMealMap.set(meal.userId, {
          userId: meal.userId,
          userName: meal.userName || 'Unknown User',
          userPhoto: meal.userPhoto || '',
          location: meal.location || null,
          mealCount: 1,
          lastMealDate: mealDate
        });
      } else {
        existing.mealCount++;
        if (mealDate > existing.lastMealDate) {
          existing.lastMealDate = mealDate;
          // Update to most recent meal's data
          existing.userName = meal.userName || existing.userName;
          existing.userPhoto = meal.userPhoto || existing.userPhoto;
          existing.location = meal.location || existing.location;
        }
      }
    });

    // Get unique user IDs for batch fetching user data
    const userIds = Array.from(userMealMap.keys());
    
    // Batch fetch user data from users collection for better profile info
    const userDataMap = new Map<string, any>();
    const batchSize = 10;
    
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      try {
        const userSnapshot = await firestore()
          .collection('users')
          .where(firestore.FieldPath.documentId(), 'in', batch)
          .get();
        
        userSnapshot.docs.forEach(doc => {
          const userData = doc.data();
          userDataMap.set(doc.id, {
            displayName: userData.displayName || userData.email?.split('@')[0] || 'User',
            photoURL: userData.photoURL || userData.profileImageUrl || ''
          });
        });
      } catch (error) {
        console.log('Error fetching user batch:', error);
      }
    }

    // Check following status for current user
    const followingSnapshot = await firestore()
      .collection('users')
      .doc(currentUser.uid)
      .collection('following')
      .get();
    
    const followingSet = new Set(followingSnapshot.docs.map(doc => doc.id));

    // Convert to user objects
    const activeUsers: NearbyUser[] = [];

    userMealMap.forEach((userData, userId) => {
      // Get enhanced user data if available
      const enhancedUserData = userDataMap.get(userId);
      
      activeUsers.push({
        id: userId,
        displayName: enhancedUserData?.displayName || userData.userName,
        photoURL: enhancedUserData?.photoURL || userData.userPhoto,
        lastMealLocation: userData.location ? {
          latitude: userData.location.latitude,
          longitude: userData.location.longitude,
          city: userData.location.city
        } : { latitude: 0, longitude: 0 },
        distance: 0, // Not using distance anymore
        recentMealCount: userData.mealCount,
        lastActiveAt: userData.lastMealDate,
        isFollowing: followingSet.has(userId)
      });
    });

    // Sort by meal count (most active first) and limit
    return activeUsers
      .sort((a, b) => b.recentMealCount - a.recentMealCount)
      .slice(0, limit);

  } catch (error) {
    console.error('Error getting most active users:', error);
    return [];
  }
};

/**
 * Get user recommendations based on activity
 * Shows the most active users (by post count)
 */
export const getUserRecommendations = async (
  userLocation: { latitude: number; longitude: number } | null,
  limit: number = 10
): Promise<NearbyUser[]> => {
  try {
    // Just get the most active users, regardless of location
    const activeUsers = await getMostActiveUsers(limit);
    return activeUsers;
  } catch (error) {
    console.error('Error getting user recommendations:', error);
    return [];
  }
};