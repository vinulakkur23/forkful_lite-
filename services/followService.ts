import { firestore, auth } from '../firebaseConfig';
import { Alert } from 'react-native';

export interface FollowData {
  followerId: string;
  followingId: string;
  followerName: string;
  followerPhoto: string;
  followingName: string;
  followingPhoto: string;
  followedAt: any; // Firestore timestamp
}

/**
 * Follow a user
 */
export const followUser = async (targetUserId: string, targetUserName: string, targetUserPhoto: string): Promise<{ success: boolean; message: string }> => {
  try {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      return { success: false, message: 'Not authenticated' };
    }

    if (currentUser.uid === targetUserId) {
      return { success: false, message: 'Cannot follow yourself' };
    }

    const batch = firestore().batch();
    const timestamp = firestore.FieldValue.serverTimestamp();

    // 1. Add to current user's following list
    const followingRef = firestore()
      .collection('users')
      .doc(currentUser.uid)
      .collection('following')
      .doc(targetUserId);

    batch.set(followingRef, {
      followerId: currentUser.uid,
      followingId: targetUserId,
      followerName: currentUser.displayName || 'User',
      followerPhoto: currentUser.photoURL || '',
      followingName: targetUserName,
      followingPhoto: targetUserPhoto,
      followedAt: timestamp
    });

    // 2. Add to target user's followers list
    const followerRef = firestore()
      .collection('users')
      .doc(targetUserId)
      .collection('followers')
      .doc(currentUser.uid);

    batch.set(followerRef, {
      followerId: currentUser.uid,
      followingId: targetUserId,
      followerName: currentUser.displayName || 'User',
      followerPhoto: currentUser.photoURL || '',
      followingName: targetUserName,
      followingPhoto: targetUserPhoto,
      followedAt: timestamp
    });

    // 3. Update follow counts in user documents
    const currentUserRef = firestore().collection('users').doc(currentUser.uid);
    const targetUserRef = firestore().collection('users').doc(targetUserId);

    batch.update(currentUserRef, {
      followingCount: firestore.FieldValue.increment(1),
      updatedAt: timestamp
    });

    batch.update(targetUserRef, {
      followersCount: firestore.FieldValue.increment(1),
      updatedAt: timestamp
    });

    await batch.commit();

    return { success: true, message: `Now following ${targetUserName}` };
  } catch (error) {
    console.error('Error following user:', error);
    return { success: false, message: 'Failed to follow user' };
  }
};

/**
 * Unfollow a user
 */
export const unfollowUser = async (targetUserId: string): Promise<{ success: boolean; message: string }> => {
  try {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      return { success: false, message: 'Not authenticated' };
    }

    const batch = firestore().batch();
    const timestamp = firestore.FieldValue.serverTimestamp();

    // 1. Remove from current user's following list
    const followingRef = firestore()
      .collection('users')
      .doc(currentUser.uid)
      .collection('following')
      .doc(targetUserId);

    batch.delete(followingRef);

    // 2. Remove from target user's followers list
    const followerRef = firestore()
      .collection('users')
      .doc(targetUserId)
      .collection('followers')
      .doc(currentUser.uid);

    batch.delete(followerRef);

    // 3. Update follow counts in user documents
    const currentUserRef = firestore().collection('users').doc(currentUser.uid);
    const targetUserRef = firestore().collection('users').doc(targetUserId);

    batch.update(currentUserRef, {
      followingCount: firestore.FieldValue.increment(-1),
      updatedAt: timestamp
    });

    batch.update(targetUserRef, {
      followersCount: firestore.FieldValue.increment(-1),
      updatedAt: timestamp
    });

    await batch.commit();

    return { success: true, message: 'Unfollowed successfully' };
  } catch (error) {
    console.error('Error unfollowing user:', error);
    return { success: false, message: 'Failed to unfollow user' };
  }
};

/**
 * Check if current user is following a specific user
 */
export const isFollowing = async (targetUserId: string): Promise<boolean> => {
  try {
    const currentUser = auth().currentUser;
    if (!currentUser) return false;

    const followingDoc = await firestore()
      .collection('users')
      .doc(currentUser.uid)
      .collection('following')
      .doc(targetUserId)
      .get();

    return followingDoc.exists;
  } catch (error) {
    console.error('Error checking follow status:', error);
    return false;
  }
};

/**
 * Get users that current user is following
 */
export const getFollowing = async (userId?: string): Promise<FollowData[]> => {
  try {
    const targetUserId = userId || auth().currentUser?.uid;
    if (!targetUserId) return [];

    const followingSnapshot = await firestore()
      .collection('users')
      .doc(targetUserId)
      .collection('following')
      .orderBy('followedAt', 'desc')
      .get();

    return followingSnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    } as FollowData));
  } catch (error) {
    console.error('Error getting following:', error);
    return [];
  }
};

/**
 * Get followers of a user
 */
export const getFollowers = async (userId?: string): Promise<FollowData[]> => {
  try {
    const targetUserId = userId || auth().currentUser?.uid;
    if (!targetUserId) return [];

    const followersSnapshot = await firestore()
      .collection('users')
      .doc(targetUserId)
      .collection('followers')
      .orderBy('followedAt', 'desc')
      .get();

    return followersSnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    } as FollowData));
  } catch (error) {
    console.error('Error getting followers:', error);
    return [];
  }
};

/**
 * Get follow counts for a user
 */
export const getFollowCounts = async (userId: string): Promise<{ followersCount: number; followingCount: number }> => {
  try {
    const userDoc = await firestore().collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    return {
      followersCount: userData?.followersCount || 0,
      followingCount: userData?.followingCount || 0
    };
  } catch (error) {
    console.error('Error getting follow counts:', error);
    return { followersCount: 0, followingCount: 0 };
  }
};

/**
 * Get meal feed prioritizing followed users
 */
export const getFollowingMealFeed = async (limit: number = 50): Promise<any[]> => {
  try {
    const currentUser = auth().currentUser;
    if (!currentUser) return [];

    // Get list of users current user is following
    const following = await getFollowing();
    const followingIds = following.map(f => f.followingId);

    let meals: any[] = [];

    // If following users, get their meals first
    if (followingIds.length > 0) {
      // Firestore 'in' queries are limited to 10 items, so we may need to batch
      const batchSize = 10;
      const batches = [];
      
      for (let i = 0; i < followingIds.length; i += batchSize) {
        const batch = followingIds.slice(i, i + batchSize);
        const batchQuery = firestore()
          .collection('mealEntries')
          .where('userId', 'in', batch)
          .orderBy('createdAt', 'desc')
          .limit(Math.floor(limit / 2)); // Reserve half the limit for following users

        batches.push(batchQuery.get());
      }

      const batchResults = await Promise.all(batches);
      const followingMeals = batchResults.flatMap(snapshot => 
        snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isFromFollowing: true }))
      );

      meals.push(...followingMeals);
    }

    // Fill remaining slots with other users' meals
    const remainingLimit = limit - meals.length;
    if (remainingLimit > 0) {
      const otherMealsQuery = await firestore()
        .collection('mealEntries')
        .where('userId', 'not-in', [...followingIds, currentUser.uid]) // Exclude following users and self
        .orderBy('createdAt', 'desc')
        .limit(remainingLimit)
        .get();

      const otherMeals = otherMealsQuery.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(), 
        isFromFollowing: false 
      }));

      meals.push(...otherMeals);
    }

    // Sort by creation date to maintain chronological order while keeping following users prioritized
    return meals.sort((a, b) => {
      // Prioritize followed users, then by date
      if (a.isFromFollowing && !b.isFromFollowing) return -1;
      if (!a.isFromFollowing && b.isFromFollowing) return 1;
      return b.createdAt?.toDate?.() - a.createdAt?.toDate?.();
    });

  } catch (error) {
    console.error('Error getting following meal feed:', error);
    return [];
  }
};