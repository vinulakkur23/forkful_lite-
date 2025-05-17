import { firebase, firestore, auth } from '../firebaseConfig';
import { Achievement, UserAchievement, AchievementDefinition } from '../types/achievements';

// Define achievements directly in the service for now
// These can be moved to Firestore later for easier management
const achievementDefinitions: AchievementDefinition[] = [
  {
    id: 'first_bite',
    name: 'First Bite',
    description: 'Congratulations on your first post!',
    image: 'first_bite.png',
    criteria: {
      type: 'first_post'
    },
    evaluate: (mealEntry, userAchievements) => {
      // Check if this is the user's first post
      return userAchievements.length === 0;
    }
  },
  {
    id: 'stubtown_starter',
    name: 'Stubtown Starter',
    description: 'Your first meal in Portland!',
    image: 'portland.png',
    criteria: {
      type: 'location_based',
      location: {
        city: 'Portland',
        coordinates: {
          latitude: 45.5051,
          longitude: -122.6750,
          radius: 30 // 30km radius around Portland
        }
      }
    },
    evaluate: (mealEntry, userAchievements) => {
      // Check if this is the first meal in Portland
      if (!mealEntry.location) return false;
      
      // Check if user already has this achievement
      const hasAchievement = userAchievements.some(a => a.achievementId === 'stubtown_starter');
      if (hasAchievement) return false;
      
      // Calculate distance from Portland coordinates
      const portlandLat = 45.5051;
      const portlandLng = -122.6750;
      
      const distance = calculateDistance(
        mealEntry.location.latitude,
        mealEntry.location.longitude,
        portlandLat,
        portlandLng
      );
      
      // Check if within 30km radius
      return distance <= 30;
    }
  },
  {
    id: 'big_apple_bite',
    name: 'Big Apple Bite',
    description: 'Your first meal in New York City!',
    image: 'nyc.png',
    criteria: {
      type: 'location_based',
      location: {
        city: 'New York City',
        coordinates: {
          latitude: 40.7128,
          longitude: -74.0060,
          radius: 30 // 30km radius around NYC
        }
      }
    },
    evaluate: (mealEntry, userAchievements) => {
      // Check if this is the first meal in NYC
      if (!mealEntry.location) return false;
      
      // Check if user already has this achievement
      const hasAchievement = userAchievements.some(a => a.achievementId === 'big_apple_bite');
      if (hasAchievement) return false;
      
      // Calculate distance from NYC coordinates
      const nycLat = 40.7128;
      const nycLng = -74.0060;
      
      const distance = calculateDistance(
        mealEntry.location.latitude,
        mealEntry.location.longitude,
        nycLat,
        nycLng
      );
      
      // Check if within 30km radius
      return distance <= 30;
    }
  }
];

// Helper function to calculate distance between two coordinates using the Haversine formula
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const distance = R * c; // Distance in km
  return distance;
};

const deg2rad = (deg: number): number => {
  return deg * (Math.PI/180);
};

// Fetch all achievements for the current user
export const getUserAchievements = async (): Promise<UserAchievement[]> => {
  try {
    const userId = auth().currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');
    
    const snapshot = await firestore()
      .collection('userAchievements')
      .where('userId', '==', userId)
      .get();
    
    const achievements: UserAchievement[] = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      achievements.push({
        id: doc.id,
        userId: data.userId,
        achievementId: data.achievementId,
        earnedAt: data.earnedAt,
        mealEntryId: data.mealEntryId
      });
    });
    
    return achievements;
  } catch (error) {
    console.error('Error fetching user achievements:', error);
    return [];
  }
};

// Save a new user achievement to Firestore
export const saveUserAchievement = async (
  achievementId: string, 
  mealEntryId: string
): Promise<UserAchievement | null> => {
  try {
    const userId = auth().currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');
    
    const userAchievement: UserAchievement = {
      userId,
      achievementId,
      earnedAt: firestore.FieldValue.serverTimestamp() as firebase.firestore.Timestamp,
      mealEntryId
    };
    
    const docRef = await firestore()
      .collection('userAchievements')
      .add(userAchievement);
    
    return {
      ...userAchievement,
      id: docRef.id
    };
  } catch (error) {
    console.error('Error saving user achievement:', error);
    return null;
  }
};

// Check for unlocked achievements based on a new meal entry
export const checkAchievements = async (
  mealEntry: any
): Promise<Achievement[]> => {
  try {
    const userId = auth().currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');
    
    // Get user's existing achievements
    const userAchievements = await getUserAchievements();
    
    // Check each achievement definition to see if it's unlocked
    const unlockedAchievements: Achievement[] = [];
    
    for (const achievement of achievementDefinitions) {
      // Skip if user already has this achievement
      const alreadyEarned = userAchievements.some(
        ua => ua.achievementId === achievement.id
      );
      
      if (!alreadyEarned && achievement.evaluate(mealEntry, userAchievements)) {
        // Achievement unlocked! Save it to Firestore
        const saved = await saveUserAchievement(achievement.id, mealEntry.id);
        if (saved) {
          unlockedAchievements.push(achievement);
        }
      }
    }
    
    return unlockedAchievements;
  } catch (error) {
    console.error('Error checking achievements:', error);
    return [];
  }
};

// Get achievement details by ID
export const getAchievementById = (achievementId: string): Achievement | undefined => {
  return achievementDefinitions.find(achievement => achievement.id === achievementId);
};

// Get all available achievements
export const getAllAchievements = (): Achievement[] => {
  return achievementDefinitions;
};

export default {
  getUserAchievements,
  checkAchievements,
  getAchievementById,
  getAllAchievements
};