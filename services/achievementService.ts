import { firebase, firestore, auth } from '../firebaseConfig';
import { Achievement, UserAchievement, AchievementDefinition } from '../types/achievements';
import achievementNotificationService from './achievementNotificationService';

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
    id: 'stumptown_starter',
    name: 'Stumptown Starter',
    description: 'Your first meal in Portland!',
    image: 'stumptown_starter.png',
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
      const hasAchievement = userAchievements.some(a => a.achievementId === 'stumptown_starter');
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
    image: 'big_apple_bite.png',
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
  },
  {
    id: 'catch_of_the_day',
    name: 'Catch of the Day',
    description: 'Your first seafood meal!',
    image: 'catch_of_the_day.png',
    criteria: {
      type: 'food_type',
      foodType: {
        type: 'seafood'
      }
    },
    evaluate: (mealEntry, userAchievements) => {
      console.log("Evaluating 'Catch of the Day' achievement...");
      
      // Check if user already has this achievement
      const hasAchievement = userAchievements.some(a => a.achievementId === 'catch_of_the_day');
      if (hasAchievement) {
        console.log("User already has 'Catch of the Day' achievement - skipping");
        return false;
      }
      
      // Check if meal has AI metadata
      if (!mealEntry.aiMetadata) {
        console.log("Meal is missing AI metadata for 'Catch of the Day' check");
        console.log("Meal entry data:", JSON.stringify(mealEntry, null, 2));
        return false;
      }
      
      // Look for seafood indicators in the AI metadata
      console.log("Checking for seafood indicators in metadata:", JSON.stringify(mealEntry.aiMetadata, null, 2));
      
      const seafoodKeywords = ['seafood', 'fish', 'shrimp', 'crab', 'lobster', 'salmon', 'tuna', 'sushi', 'shellfish', 'prawn', 'clam', 'mussel', 'oyster', 'scallop'];
      
      // Check primary protein
      if (mealEntry.aiMetadata.primaryProtein) {
        const protein = mealEntry.aiMetadata.primaryProtein.toLowerCase();
        console.log(`Primary protein: "${protein}"`);
        if (seafoodKeywords.some(keyword => protein.includes(keyword))) {
          console.log(`ACHIEVEMENT UNLOCKED: 'Catch of the Day' - Seafood protein detected: ${protein}`);
          return true;
        }
      }
      
      // Check food type
      if (mealEntry.aiMetadata.foodType) {
        // Handle foodType as array
        const foodTypes = Array.isArray(mealEntry.aiMetadata.foodType) 
          ? mealEntry.aiMetadata.foodType 
          : [mealEntry.aiMetadata.foodType]; // Convert string to array for backward compatibility
        
        console.log(`Food types: ${JSON.stringify(foodTypes)}`);
        
        for (const foodType of foodTypes) {
          const foodTypeLower = foodType.toLowerCase();
          if (seafoodKeywords.some(keyword => foodTypeLower.includes(keyword))) {
            console.log(`ACHIEVEMENT UNLOCKED: 'Catch of the Day' - Seafood food type detected: ${foodType}`);
            return true;
          }
        }
      }
      
      // Check cuisine type for seafood indicators
      if (mealEntry.aiMetadata.cuisineType) {
        const cuisine = mealEntry.aiMetadata.cuisineType.toLowerCase();
        console.log(`Cuisine type: "${cuisine}"`);
        if (cuisine.includes('seafood') || cuisine.includes('sushi') || cuisine.includes('fish')) {
          console.log(`ACHIEVEMENT UNLOCKED: 'Catch of the Day' - Seafood cuisine detected: ${cuisine}`);
          return true;
        }
      }
      
      // Also check the meal name itself
      if (mealEntry.meal) {
        const mealName = mealEntry.meal.toLowerCase();
        console.log(`Meal name: "${mealName}"`);
        if (seafoodKeywords.some(keyword => mealName.includes(keyword))) {
          console.log(`ACHIEVEMENT UNLOCKED: 'Catch of the Day' - Seafood keyword in meal name: ${mealName}`);
          return true;
        }
      }
      
      console.log("No seafood indicators found - 'Catch of the Day' achievement not unlocked");
      return false;
    }
  },
  {
    id: 'plant_curious',
    name: 'Plant Curious',
    description: 'Your first vegetarian meal!',
    image: 'plant_curious.png',
    criteria: {
      type: 'food_type',
      foodType: {
        type: 'vegetarian'
      }
    },
    evaluate: (mealEntry, userAchievements) => {
      console.log("Evaluating 'Plant Curious' achievement...");
      
      // Check if user already has this achievement
      const hasAchievement = userAchievements.some(a => a.achievementId === 'plant_curious');
      if (hasAchievement) {
        console.log("User already has 'Plant Curious' achievement - skipping");
        return false;
      }
      
      // Check if meal has AI metadata
      if (!mealEntry.aiMetadata) {
        console.log("Meal is missing AI metadata for 'Plant Curious' check");
        console.log("Meal entry data:", JSON.stringify(mealEntry, null, 2));
        return false;
      }
      
      // Look for vegetarian indicators in the AI metadata
      console.log("Checking for vegetarian indicators in metadata:", JSON.stringify(mealEntry.aiMetadata, null, 2));
      
      // Check diet type directly
      if (mealEntry.aiMetadata.dietType) {
        const dietType = mealEntry.aiMetadata.dietType.toLowerCase();
        console.log(`Diet type: "${dietType}"`);
        if (dietType.includes('vegetarian') || dietType.includes('vegan') || dietType.includes('plant-based')) {
          console.log("ACHIEVEMENT UNLOCKED: 'Plant Curious' - Diet type indicates vegetarian");
          return true;
        }
      }
      
      // Check primary protein for plant-based options
      if (mealEntry.aiMetadata.primaryProtein) {
        const protein = mealEntry.aiMetadata.primaryProtein.toLowerCase();
        console.log(`Primary protein: "${protein}"`);
        const vegProteinKeywords = ['tofu', 'tempeh', 'seitan', 'legume', 'bean', 'lentil', 'chickpea', 'plant-based', 'vegetable', 'none', 'soy', 'nuts'];
        
        // If a clear vegetarian protein is identified
        if (vegProteinKeywords.some(keyword => protein.includes(keyword))) {
          console.log(`ACHIEVEMENT UNLOCKED: 'Plant Curious' - Plant-based protein detected: ${protein}`);
          return true;
        }
        
        // If explicitly states "no meat"
        if (protein.includes('no meat') || protein === 'none' || protein === 'n/a') {
          console.log(`ACHIEVEMENT UNLOCKED: 'Plant Curious' - No meat protein detected: ${protein}`);
          return true;
        }
      }
      
      // Check food type
      if (mealEntry.aiMetadata.foodType) {
        // Handle foodType as array
        const foodTypes = Array.isArray(mealEntry.aiMetadata.foodType) 
          ? mealEntry.aiMetadata.foodType 
          : [mealEntry.aiMetadata.foodType]; // Convert string to array for backward compatibility
        
        console.log(`Food types: ${JSON.stringify(foodTypes)}`);
        const vegFoodKeywords = ['salad', 'vegetable', 'vegetarian', 'vegan', 'plant-based'];
        
        for (const foodType of foodTypes) {
          const foodTypeLower = foodType.toLowerCase();
          if (vegFoodKeywords.some(keyword => foodTypeLower.includes(keyword))) {
            console.log(`ACHIEVEMENT UNLOCKED: 'Plant Curious' - Vegetarian food type detected: ${foodType}`);
            return true;
          }
        }
      }
      
      // Also check the meal name itself
      if (mealEntry.meal) {
        const mealName = mealEntry.meal.toLowerCase();
        console.log(`Meal name: "${mealName}"`);
        const vegMealKeywords = ['vegetarian', 'vegan', 'plant-based', 'veggie', 'meatless'];
        if (vegMealKeywords.some(keyword => mealName.includes(keyword))) {
          console.log(`ACHIEVEMENT UNLOCKED: 'Plant Curious' - Vegetarian keyword in meal name: ${mealName}`);
          return true;
        }
      }
      
      console.log("No vegetarian indicators found - 'Plant Curious' achievement not unlocked");
      return false;
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

// Fetch all achievements for a specific user (or current user if no userId provided)
export const getUserAchievements = async (targetUserId?: string): Promise<UserAchievement[]> => {
  try {
    const userId = targetUserId || auth().currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');
    
    const snapshot = await firestore()
      .collection('users')
      .doc(userId)
      .collection('achievements')
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
      .collection('users')
      .doc(userId)
      .collection('achievements')
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
          
          // Emit global notification
          console.log('🎯 Emitting global achievement notification for:', achievement.name);
          achievementNotificationService.showAchievement(achievement);
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