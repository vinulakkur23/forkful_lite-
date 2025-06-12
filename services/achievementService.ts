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
  },
  {
    id: 'plantlandia',
    name: 'Plantlandia',
    description: 'Your first vegan meal in Portland!',
    image: 'plantlandia.png',
    criteria: {
      type: 'location_and_diet',
      location: {
        city: 'Portland',
        coordinates: {
          latitude: 45.5051,
          longitude: -122.6750,
          radius: 30 // 30km radius around Portland
        }
      },
      dietType: 'vegan'
    },
    evaluate: (mealEntry, userAchievements) => {
      console.log("Evaluating 'Plantlandia' achievement...");
      
      // Check if user already has this achievement
      const hasAchievement = userAchievements.some(a => a.achievementId === 'plantlandia');
      if (hasAchievement) {
        console.log("User already has 'Plantlandia' achievement - skipping");
        return false;
      }
      
      // Check if meal has location
      if (!mealEntry.location) {
        console.log("Meal is missing location for 'Plantlandia' check");
        return false;
      }
      
      // Calculate distance from Portland coordinates
      const portlandLat = 45.5051;
      const portlandLng = -122.6750;
      
      const distance = calculateDistance(
        mealEntry.location.latitude,
        mealEntry.location.longitude,
        portlandLat,
        portlandLng
      );
      
      // Check if within 30km radius of Portland
      if (distance > 30) {
        console.log(`Meal not in Portland (${distance}km away) - 'Plantlandia' not unlocked`);
        return false;
      }
      
      // Check if meal has AI metadata with vegan diet type
      if (!mealEntry.aiMetadata) {
        console.log("Meal is missing AI metadata for 'Plantlandia' check");
        return false;
      }
      
      // Check diet type for vegan
      if (mealEntry.aiMetadata.dietType) {
        const dietType = mealEntry.aiMetadata.dietType.toLowerCase();
        console.log(`Diet type: "${dietType}"`);
        if (dietType.includes('vegan')) {
          console.log("ACHIEVEMENT UNLOCKED: 'Plantlandia' - Vegan meal in Portland!");
          return true;
        }
      }
      
      // Also check meal name for vegan keywords as backup
      if (mealEntry.meal) {
        const mealName = mealEntry.meal.toLowerCase();
        console.log(`Checking meal name for vegan keywords: "${mealName}"`);
        if (mealName.includes('vegan')) {
          console.log("ACHIEVEMENT UNLOCKED: 'Plantlandia' - Vegan meal name in Portland!");
          return true;
        }
      }
      
      console.log("No vegan indicators found in Portland meal - 'Plantlandia' achievement not unlocked");
      return false;
    }
  },
  {
    id: 'brew_and_chew',
    name: 'Brew and Chew',
    description: 'Your first beer in Portland!',
    image: 'brew_and_chew.png',
    criteria: {
      type: 'location_and_beverage',
      location: {
        city: 'Portland',
        coordinates: {
          latitude: 45.5051,
          longitude: -122.6750,
          radius: 30 // 30km radius around Portland
        }
      },
      beverageType: 'beer'
    },
    evaluate: (mealEntry, userAchievements) => {
      console.log("Evaluating 'Brew and Chew' achievement...");
      
      // Check if user already has this achievement
      const hasAchievement = userAchievements.some(a => a.achievementId === 'brew_and_chew');
      if (hasAchievement) {
        console.log("User already has 'Brew and Chew' achievement - skipping");
        return false;
      }
      
      // Check if meal has location
      if (!mealEntry.location) {
        console.log("Meal is missing location for 'Brew and Chew' check");
        return false;
      }
      
      // Calculate distance from Portland coordinates
      const portlandLat = 45.5051;
      const portlandLng = -122.6750;
      
      const distance = calculateDistance(
        mealEntry.location.latitude,
        mealEntry.location.longitude,
        portlandLat,
        portlandLng
      );
      
      // Check if within 30km radius of Portland
      if (distance > 30) {
        console.log(`Meal not in Portland (${distance}km away) - 'Brew and Chew' not unlocked`);
        return false;
      }
      
      // Check if meal has AI metadata with beer beverage type
      if (!mealEntry.aiMetadata) {
        console.log("Meal is missing AI metadata for 'Brew and Chew' check");
        return false;
      }
      
      // Check beverage type for beer
      if (mealEntry.aiMetadata.beverageType) {
        const beverageType = mealEntry.aiMetadata.beverageType.toLowerCase();
        console.log(`Beverage type: "${beverageType}"`);
        if (beverageType.includes('beer')) {
          console.log("ACHIEVEMENT UNLOCKED: 'Brew and Chew' - Beer in Portland!");
          return true;
        }
      }
      
      // Also check meal name for beer keywords as backup
      if (mealEntry.meal) {
        const mealName = mealEntry.meal.toLowerCase();
        console.log(`Checking meal name for beer keywords: "${mealName}"`);
        const beerKeywords = ['beer', 'ale', 'lager', 'ipa', 'stout', 'porter', 'pilsner'];
        if (beerKeywords.some(keyword => mealName.includes(keyword))) {
          console.log("ACHIEVEMENT UNLOCKED: 'Brew and Chew' - Beer keyword in meal name in Portland!");
          return true;
        }
      }
      
      console.log("No beer indicators found in Portland meal - 'Brew and Chew' achievement not unlocked");
      return false;
    }
  },
  {
    id: 'taco_tuesday',
    name: 'Taco Tuesday',
    description: 'Tacos on a Tuesday!',
    image: 'taco_tuesday.png',
    criteria: {
      type: 'food_and_day',
      foodType: 'taco',
      dayOfWeek: 'Tuesday'
    },
    evaluate: (mealEntry, userAchievements) => {
      console.log("Evaluating 'Taco Tuesday' achievement...");
      
      // Check if user already has this achievement
      const hasAchievement = userAchievements.some(a => a.achievementId === 'taco_tuesday');
      if (hasAchievement) {
        console.log("User already has 'Taco Tuesday' achievement - skipping");
        return false;
      }
      
      // Check if meal has a timestamp to derive day of week
      if (!mealEntry.createdAt) {
        console.log("Meal is missing createdAt timestamp for 'Taco Tuesday' check");
        return false;
      }
      
      // Get day of week from timestamp
      let dayOfWeek = '';
      try {
        // Handle both Firebase timestamp and regular date objects
        const date = mealEntry.createdAt.toDate ? mealEntry.createdAt.toDate() : new Date(mealEntry.createdAt);
        dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
        console.log(`Day of week: "${dayOfWeek}"`);
      } catch (error) {
        console.log("Error getting day of week from timestamp:", error);
        return false;
      }
      
      // Check if it's Tuesday
      if (dayOfWeek !== 'Tuesday') {
        console.log(`Not Tuesday (${dayOfWeek}) - 'Taco Tuesday' not unlocked`);
        return false;
      }
      
      // Check if meal has AI metadata
      if (!mealEntry.aiMetadata) {
        console.log("Meal is missing AI metadata for 'Taco Tuesday' check");
        return false;
      }
      
      // Check food type for tacos
      if (mealEntry.aiMetadata.foodType) {
        // Handle foodType as array
        const foodTypes = Array.isArray(mealEntry.aiMetadata.foodType) 
          ? mealEntry.aiMetadata.foodType 
          : [mealEntry.aiMetadata.foodType];
        
        console.log(`Food types: ${JSON.stringify(foodTypes)}`);
        
        for (const foodType of foodTypes) {
          const foodTypeLower = foodType.toLowerCase();
          if (foodTypeLower.includes('taco')) {
            console.log("ACHIEVEMENT UNLOCKED: 'Taco Tuesday' - Tacos on Tuesday!");
            return true;
          }
        }
      }
      
      // Also check meal name for taco keywords as backup
      if (mealEntry.meal) {
        const mealName = mealEntry.meal.toLowerCase();
        console.log(`Checking meal name for taco keywords: "${mealName}"`);
        const tacoKeywords = ['taco', 'tacos'];
        if (tacoKeywords.some(keyword => mealName.includes(keyword))) {
          console.log("ACHIEVEMENT UNLOCKED: 'Taco Tuesday' - Taco keyword in meal name on Tuesday!");
          return true;
        }
      }
      
      console.log("No taco indicators found on Tuesday - 'Taco Tuesday' achievement not unlocked");
      return false;
    }
  },
  {
    id: 'dreaming_of_sushi',
    name: 'Dreaming of Sushi',
    description: 'Posted 5 sushi meals!',
    image: 'dreaming_of_sushi.png',
    criteria: {
      type: 'food_count',
      foodType: 'sushi',
      count: 5
    },
    evaluate: (mealEntry, userAchievements) => {
      console.log("Evaluating 'Dreaming of Sushi' achievement...");
      
      // Check if user already has this achievement
      const hasAchievement = userAchievements.some(a => a.achievementId === 'dreaming_of_sushi');
      if (hasAchievement) {
        console.log("User already has 'Dreaming of Sushi' achievement - skipping");
        return false;
      }
      
      // For Dreaming of Sushi, we'll check asynchronously after saving the meal
      // Return false here and handle it in a separate function
      return false;
    }
  },
  {
    id: 'takeout_tour',
    name: 'Takeout Tour',
    description: 'Posted 5 takeout/to-go meals!',
    image: 'takeout_tour.png',
    criteria: {
      type: 'setting_count',
      setting: 'takeout',
      count: 5
    },
    evaluate: (mealEntry, userAchievements) => {
      console.log("Evaluating 'Takeout Tour' achievement...");
      
      // Check if user already has this achievement
      const hasAchievement = userAchievements.some(a => a.achievementId === 'takeout_tour');
      if (hasAchievement) {
        console.log("User already has 'Takeout Tour' achievement - skipping");
        return false;
      }
      
      // For Takeout Tour, we'll check asynchronously after saving the meal
      // Return false here and handle it in a separate function
      return false;
    }
  },
  {
    id: 'urban_explorer',
    name: 'Urban Explorer',
    description: 'Dined in 10 different cities!',
    image: 'urban_explorer.png',
    criteria: {
      type: 'multi_city',
      cityCount: 10
    },
    evaluate: (mealEntry, userAchievements) => {
      console.log("Evaluating 'Urban Explorer' achievement...");
      
      // Check if user already has this achievement
      const hasAchievement = userAchievements.some(a => a.achievementId === 'urban_explorer');
      if (hasAchievement) {
        console.log("User already has 'Urban Explorer' achievement - skipping");
        return false;
      }
      
      // For Urban Explorer, we'll check asynchronously after saving the meal
      // Return false here and handle it in a separate function
      return false;
    }
  },
  {
    id: 'flavor_nomad',
    name: 'Flavor Nomad',
    description: 'Explored 5 different cuisines!',
    image: 'flavor_nomad.png',
    criteria: {
      type: 'multi_cuisine',
      cuisineCount: 5
    },
    evaluate: (mealEntry, userAchievements) => {
      console.log("Evaluating 'Flavor Nomad' achievement...");
      
      // Check if user already has this achievement
      const hasAchievement = userAchievements.some(a => a.achievementId === 'flavor_nomad');
      if (hasAchievement) {
        console.log("User already has 'Flavor Nomad' achievement - skipping");
        return false;
      }
      
      // For Flavor Nomad, we'll check asynchronously after saving the meal
      // Return false here and handle it in a separate function
      return false;
    }
  },
  {
    id: 'world_on_a_plate',
    name: 'World on a Plate',
    description: 'Explored 10 different cuisines!',
    image: 'world_on_a_plate.png',
    criteria: {
      type: 'multi_cuisine',
      cuisineCount: 10
    },
    evaluate: (mealEntry, userAchievements) => {
      console.log("Evaluating 'World on a Plate' achievement...");
      
      // Check if user already has this achievement
      const hasAchievement = userAchievements.some(a => a.achievementId === 'world_on_a_plate');
      if (hasAchievement) {
        console.log("User already has 'World on a Plate' achievement - skipping");
        return false;
      }
      
      // For World on a Plate, we'll check asynchronously after saving the meal
      // Return false here and handle it in a separate function
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
    
    const achievements: UserAchievement[] = [];
    
    // Check new format: users/{userId}/achievements subcollection
    const newFormatSnapshot = await firestore()
      .collection('users')
      .doc(userId)
      .collection('achievements')
      .get();
    
    newFormatSnapshot.forEach(doc => {
      const data = doc.data();
      achievements.push({
        id: doc.id,
        userId: data.userId,
        achievementId: data.achievementId,
        earnedAt: data.earnedAt,
        mealEntryId: data.mealEntryId
      });
    });
    
    // Also check old format: userAchievements flat collection (for backward compatibility)
    const oldFormatSnapshot = await firestore()
      .collection('userAchievements')
      .where('userId', '==', userId)
      .get();
    
    oldFormatSnapshot.forEach(doc => {
      const data = doc.data();
      // Only add if we don't already have this achievement from the new format
      const existingAchievement = achievements.find(a => a.achievementId === data.achievementId);
      if (!existingAchievement) {
        achievements.push({
          id: doc.id,
          userId: data.userId,
          achievementId: data.achievementId,
          earnedAt: data.earnedAt,
          mealEntryId: data.mealEntryId
        });
      }
    });
    
    console.log(`📊 Found ${achievements.length} achievements for user ${userId}: ${newFormatSnapshot.size} from new format, ${oldFormatSnapshot.size} from old format`);
    
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

// Helper function to extract city from meal data
export const extractCityFromMeal = (meal: any): string | null => {
  let city = null;
  
  // Check top-level city field
  if (meal.city) {
    city = meal.city;
  }
  // Check location.city field
  else if (meal.location && meal.location.city) {
    city = meal.location.city;
  }
  // Try to extract from restaurant field (e.g., "Restaurant Name, Portland OR")
  else if (meal.restaurant && meal.restaurant.includes(',')) {
    const parts = meal.restaurant.split(',');
    if (parts.length > 1) {
      const cityPart = parts[1].trim();
      // Keep the full city name
      city = cityPart;
    }
  }
  
  return city ? city.toLowerCase().trim() : null;
};

// Helper function to extract cuisine from meal data
export const extractCuisineFromMeal = (meal: any): string | null => {
  // Check if meal has AI metadata with cuisine type
  if (meal.aiMetadata && meal.aiMetadata.cuisineType) {
    const cuisine = meal.aiMetadata.cuisineType.toLowerCase().trim();
    // Normalize some common variations
    if (cuisine === 'unknown' || cuisine === 'n/a' || cuisine === '') {
      return null;
    }
    return cuisine;
  }
  
  return null;
};

// Helper function to check if meal contains sushi
export const isSushiMeal = (meal: any): boolean => {
  // Check if meal has AI metadata
  if (!meal.aiMetadata) {
    return false;
  }
  
  // Check cuisine type for sushi/Japanese
  if (meal.aiMetadata.cuisineType) {
    const cuisine = meal.aiMetadata.cuisineType.toLowerCase();
    if (cuisine.includes('sushi') || cuisine.includes('japanese')) {
      // Additional check for sushi keywords in food type or meal name
      const sushiKeywords = ['sushi', 'sashimi', 'nigiri', 'maki', 'roll'];
      
      // Check food type
      if (meal.aiMetadata.foodType) {
        const foodTypes = Array.isArray(meal.aiMetadata.foodType) 
          ? meal.aiMetadata.foodType 
          : [meal.aiMetadata.foodType];
        
        for (const foodType of foodTypes) {
          if (sushiKeywords.some(keyword => foodType.toLowerCase().includes(keyword))) {
            return true;
          }
        }
      }
      
      // Check meal name
      if (meal.meal) {
        const mealName = meal.meal.toLowerCase();
        if (sushiKeywords.some(keyword => mealName.includes(keyword))) {
          return true;
        }
      }
    }
  }
  
  // Direct check in food type for sushi keywords
  if (meal.aiMetadata.foodType) {
    const foodTypes = Array.isArray(meal.aiMetadata.foodType) 
      ? meal.aiMetadata.foodType 
      : [meal.aiMetadata.foodType];
    
    const sushiKeywords = ['sushi', 'sashimi', 'nigiri', 'maki', 'roll'];
    for (const foodType of foodTypes) {
      if (sushiKeywords.some(keyword => foodType.toLowerCase().includes(keyword))) {
        return true;
      }
    }
  }
  
  // Check meal name directly
  if (meal.meal) {
    const mealName = meal.meal.toLowerCase();
    const sushiKeywords = ['sushi', 'sashimi', 'nigiri', 'maki', 'roll'];
    if (sushiKeywords.some(keyword => mealName.includes(keyword))) {
      return true;
    }
  }
  
  return false;
};

// Helper function to check if meal is takeout/to-go
export const isTakeoutMeal = (meal: any): boolean => {
  // Check if meal has AI metadata
  if (!meal.aiMetadata) {
    return false;
  }
  
  // Check setting field for takeout indicators
  if (meal.aiMetadata.setting) {
    const setting = meal.aiMetadata.setting.toLowerCase();
    const takeoutKeywords = ['takeout', 'to-go', 'togo', 'delivery', 'pickup'];
    if (takeoutKeywords.some(keyword => setting.includes(keyword))) {
      return true;
    }
  }
  
  // Check meal name for takeout indicators as backup
  if (meal.meal) {
    const mealName = meal.meal.toLowerCase();
    const takeoutKeywords = ['takeout', 'to-go', 'togo', 'delivery', 'pickup'];
    if (takeoutKeywords.some(keyword => mealName.includes(keyword))) {
      return true;
    }
  }
  
  // Check restaurant field for takeout indicators
  if (meal.restaurant) {
    const restaurant = meal.restaurant.toLowerCase();
    const takeoutKeywords = ['takeout', 'to-go', 'togo', 'delivery', 'pickup'];
    if (takeoutKeywords.some(keyword => restaurant.includes(keyword))) {
      return true;
    }
  }
  
  return false;
};

// Update user's takeout tracking when a new meal is posted
export const updateUserTakeoutTracking = async (mealEntry: any): Promise<void> => {
  try {
    const userId = auth().currentUser?.uid;
    if (!userId) return;
    
    // Check if this meal is takeout/to-go
    if (!isTakeoutMeal(mealEntry)) {
      console.log("Not a takeout meal, skipping takeout tracking");
      return;
    }
    
    console.log("Updating takeout tracking - takeout meal detected");
    
    // Get current user profile
    const userDoc = await firestore().collection('users').doc(userId).get();
    const userData = userDoc.data() || {};
    
    // Get current takeout count
    const currentTakeoutCount = userData.takeoutMealCount || 0;
    const newTakeoutCount = currentTakeoutCount + 1;
    
    console.log(`User now has ${newTakeoutCount} takeout meals (was ${currentTakeoutCount})`);
    
    // Update user profile with new takeout count
    await firestore()
      .collection('users')
      .doc(userId)
      .update({
        takeoutMealCount: newTakeoutCount
      });
  } catch (error) {
    console.error("Error updating takeout tracking:", error);
  }
};

// Update user's cuisine tracking when a new meal is posted
export const updateUserCuisineTracking = async (mealEntry: any): Promise<void> => {
  try {
    const userId = auth().currentUser?.uid;
    if (!userId) return;
    
    const cuisine = extractCuisineFromMeal(mealEntry);
    if (!cuisine) {
      console.log("No cuisine found in meal entry, skipping cuisine tracking");
      return;
    }
    
    console.log(`Updating cuisine tracking for cuisine: ${cuisine}`);
    
    // Get current user profile
    const userDoc = await firestore().collection('users').doc(userId).get();
    const userData = userDoc.data() || {};
    
    // Get existing cuisines or initialize
    const uniqueCuisines = new Set<string>(userData.uniqueCuisines || []);
    const previousCount = uniqueCuisines.size;
    
    // Add the new cuisine
    uniqueCuisines.add(cuisine);
    const newCount = uniqueCuisines.size;
    
    // Only update if this is a new cuisine
    if (newCount > previousCount) {
      console.log(`New cuisine detected! User now has ${newCount} unique cuisines`);
      
      // Update user profile with new cuisine data
      await firestore()
        .collection('users')
        .doc(userId)
        .update({
          uniqueCuisineCount: newCount,
          uniqueCuisines: Array.from(uniqueCuisines)
        });
    }
  } catch (error) {
    console.error("Error updating cuisine tracking:", error);
  }
};

// Update user's sushi tracking when a new meal is posted
export const updateUserSushiTracking = async (mealEntry: any): Promise<void> => {
  try {
    const userId = auth().currentUser?.uid;
    if (!userId) return;
    
    // Check if this meal contains sushi
    if (!isSushiMeal(mealEntry)) {
      console.log("Not a sushi meal, skipping sushi tracking");
      return;
    }
    
    console.log("Updating sushi tracking - sushi meal detected");
    
    // Get current user profile
    const userDoc = await firestore().collection('users').doc(userId).get();
    const userData = userDoc.data() || {};
    
    // Get current sushi count
    const currentSushiCount = userData.sushiMealCount || 0;
    const newSushiCount = currentSushiCount + 1;
    
    console.log(`User now has ${newSushiCount} sushi meals (was ${currentSushiCount})`);
    
    // Update user profile with new sushi count
    await firestore()
      .collection('users')
      .doc(userId)
      .update({
        sushiMealCount: newSushiCount
      });
  } catch (error) {
    console.error("Error updating sushi tracking:", error);
  }
};

// Update user's city tracking when a new meal is posted
export const updateUserCityTracking = async (mealEntry: any): Promise<void> => {
  try {
    const userId = auth().currentUser?.uid;
    if (!userId) return;
    
    const city = extractCityFromMeal(mealEntry);
    if (!city) {
      console.log("No city found in meal entry, skipping city tracking");
      return;
    }
    
    console.log(`Updating city tracking for city: ${city}`);
    
    // Get current user profile
    const userDoc = await firestore().collection('users').doc(userId).get();
    const userData = userDoc.data() || {};
    
    // Get existing cities or initialize
    const uniqueCities = new Set<string>(userData.uniqueCities || []);
    const previousCount = uniqueCities.size;
    
    // Add the new city
    uniqueCities.add(city);
    const newCount = uniqueCities.size;
    
    // Only update if this is a new city
    if (newCount > previousCount) {
      console.log(`New city detected! User now has ${newCount} unique cities`);
      
      // Update user profile with new city data
      await firestore()
        .collection('users')
        .doc(userId)
        .update({
          uniqueCityCount: newCount,
          uniqueCities: Array.from(uniqueCities)
        });
    }
  } catch (error) {
    console.error("Error updating city tracking:", error);
  }
};

// Check for Urban Explorer achievement - now much more efficient!
export const checkUrbanExplorerAchievement = async (userId: string): Promise<boolean> => {
  try {
    // Get user's existing achievements
    const userAchievements = await getUserAchievements(userId);
    
    // Check if user already has this achievement
    const hasAchievement = userAchievements.some(a => a.achievementId === 'urban_explorer');
    if (hasAchievement) {
      console.log("User already has 'Urban Explorer' achievement");
      return false;
    }
    
    // Simply check the count from user profile - no need to query all meals!
    const userDoc = await firestore().collection('users').doc(userId).get();
    const userData = userDoc.data() || {};
    const cityCount = userData.uniqueCityCount || 0;
    
    console.log(`User has dined in ${cityCount} different cities`);
    
    // Check if user has reached 10 different cities
    if (cityCount >= 10) {
      console.log("ACHIEVEMENT UNLOCKED: 'Urban Explorer' - 10+ cities reached!");
      
      // Get the most recent meal ID for the achievement record
      const recentMealSnapshot = await firestore()
        .collection('mealEntries')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      
      const mealId = recentMealSnapshot.docs[0]?.id || 'unknown';
      
      // Save the achievement
      const saved = await saveUserAchievement('urban_explorer', mealId);
      if (saved) {
        const urbanExplorerAchievement = getAchievementById('urban_explorer');
        if (urbanExplorerAchievement) {
          // Emit global notification
          console.log('🎯 Emitting global achievement notification for Urban Explorer');
          achievementNotificationService.showAchievement(urbanExplorerAchievement);
        }
      }
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error("Error checking Urban Explorer achievement:", error);
    return false;
  }
};

// Check for Flavor Nomad achievement - efficient check!
export const checkFlavorNomadAchievement = async (userId: string): Promise<boolean> => {
  try {
    // Get user's existing achievements
    const userAchievements = await getUserAchievements(userId);
    
    // Check if user already has this achievement
    const hasAchievement = userAchievements.some(a => a.achievementId === 'flavor_nomad');
    if (hasAchievement) {
      console.log("User already has 'Flavor Nomad' achievement");
      return false;
    }
    
    // Simply check the count from user profile - no need to query all meals!
    const userDoc = await firestore().collection('users').doc(userId).get();
    const userData = userDoc.data() || {};
    const cuisineCount = userData.uniqueCuisineCount || 0;
    
    console.log(`User has tried ${cuisineCount} different cuisines`);
    
    // Check if user has reached 5 different cuisines
    if (cuisineCount >= 5) {
      console.log("ACHIEVEMENT UNLOCKED: 'Flavor Nomad' - 5+ cuisines reached!");
      
      // Get the most recent meal ID for the achievement record
      const recentMealSnapshot = await firestore()
        .collection('mealEntries')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      
      const mealId = recentMealSnapshot.docs[0]?.id || 'unknown';
      
      // Save the achievement
      const saved = await saveUserAchievement('flavor_nomad', mealId);
      if (saved) {
        const flavorNomadAchievement = getAchievementById('flavor_nomad');
        if (flavorNomadAchievement) {
          // Emit global notification
          console.log('🎯 Emitting global achievement notification for Flavor Nomad');
          achievementNotificationService.showAchievement(flavorNomadAchievement);
        }
      }
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error("Error checking Flavor Nomad achievement:", error);
    return false;
  }
};

// Check for Takeout Tour achievement - efficient check!
export const checkTakeoutTourAchievement = async (userId: string): Promise<boolean> => {
  try {
    // Get user's existing achievements
    const userAchievements = await getUserAchievements(userId);
    
    // Check if user already has this achievement
    const hasAchievement = userAchievements.some(a => a.achievementId === 'takeout_tour');
    if (hasAchievement) {
      console.log("User already has 'Takeout Tour' achievement");
      return false;
    }
    
    // Simply check the count from user profile
    const userDoc = await firestore().collection('users').doc(userId).get();
    const userData = userDoc.data() || {};
    const takeoutCount = userData.takeoutMealCount || 0;
    
    console.log(`User has posted ${takeoutCount} takeout meals`);
    
    // Check if user has reached 5 takeout meals
    if (takeoutCount >= 5) {
      console.log("ACHIEVEMENT UNLOCKED: 'Takeout Tour' - 5+ takeout meals reached!");
      
      // Get the most recent meal ID for the achievement record
      const recentMealSnapshot = await firestore()
        .collection('mealEntries')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      
      const mealId = recentMealSnapshot.docs[0]?.id || 'unknown';
      
      // Save the achievement
      const saved = await saveUserAchievement('takeout_tour', mealId);
      if (saved) {
        const takeoutTourAchievement = getAchievementById('takeout_tour');
        if (takeoutTourAchievement) {
          // Emit global notification
          console.log('🎯 Emitting global achievement notification for Takeout Tour');
          achievementNotificationService.showAchievement(takeoutTourAchievement);
        }
      }
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error("Error checking Takeout Tour achievement:", error);
    return false;
  }
};

// Check for Dreaming of Sushi achievement - efficient check!
export const checkDreamingOfSushiAchievement = async (userId: string): Promise<boolean> => {
  try {
    // Get user's existing achievements
    const userAchievements = await getUserAchievements(userId);
    
    // Check if user already has this achievement
    const hasAchievement = userAchievements.some(a => a.achievementId === 'dreaming_of_sushi');
    if (hasAchievement) {
      console.log("User already has 'Dreaming of Sushi' achievement");
      return false;
    }
    
    // Simply check the count from user profile
    const userDoc = await firestore().collection('users').doc(userId).get();
    const userData = userDoc.data() || {};
    const sushiCount = userData.sushiMealCount || 0;
    
    console.log(`User has posted ${sushiCount} sushi meals`);
    
    // Check if user has reached 5 sushi meals
    if (sushiCount >= 5) {
      console.log("ACHIEVEMENT UNLOCKED: 'Dreaming of Sushi' - 5+ sushi meals reached!");
      
      // Get the most recent meal ID for the achievement record
      const recentMealSnapshot = await firestore()
        .collection('mealEntries')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      
      const mealId = recentMealSnapshot.docs[0]?.id || 'unknown';
      
      // Save the achievement
      const saved = await saveUserAchievement('dreaming_of_sushi', mealId);
      if (saved) {
        const dreamingOfSushiAchievement = getAchievementById('dreaming_of_sushi');
        if (dreamingOfSushiAchievement) {
          // Emit global notification
          console.log('🎯 Emitting global achievement notification for Dreaming of Sushi');
          achievementNotificationService.showAchievement(dreamingOfSushiAchievement);
        }
      }
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error("Error checking Dreaming of Sushi achievement:", error);
    return false;
  }
};

// Check for World on a Plate achievement - efficient check!
export const checkWorldOnAPlateAchievement = async (userId: string): Promise<boolean> => {
  try {
    // Get user's existing achievements
    const userAchievements = await getUserAchievements(userId);
    
    // Check if user already has this achievement
    const hasAchievement = userAchievements.some(a => a.achievementId === 'world_on_a_plate');
    if (hasAchievement) {
      console.log("User already has 'World on a Plate' achievement");
      return false;
    }
    
    // Simply check the count from user profile - no need to query all meals!
    const userDoc = await firestore().collection('users').doc(userId).get();
    const userData = userDoc.data() || {};
    const cuisineCount = userData.uniqueCuisineCount || 0;
    
    console.log(`User has tried ${cuisineCount} different cuisines`);
    
    // Check if user has reached 10 different cuisines
    if (cuisineCount >= 10) {
      console.log("ACHIEVEMENT UNLOCKED: 'World on a Plate' - 10+ cuisines reached!");
      
      // Get the most recent meal ID for the achievement record
      const recentMealSnapshot = await firestore()
        .collection('mealEntries')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      
      const mealId = recentMealSnapshot.docs[0]?.id || 'unknown';
      
      // Save the achievement
      const saved = await saveUserAchievement('world_on_a_plate', mealId);
      if (saved) {
        const worldOnAPlateAchievement = getAchievementById('world_on_a_plate');
        if (worldOnAPlateAchievement) {
          // Emit global notification
          console.log('🎯 Emitting global achievement notification for World on a Plate');
          achievementNotificationService.showAchievement(worldOnAPlateAchievement);
        }
      }
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error("Error checking World on a Plate achievement:", error);
    return false;
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
    
    // Update tracking for the new meal
    await updateUserCityTracking(mealEntry);
    await updateUserCuisineTracking(mealEntry);
    await updateUserSushiTracking(mealEntry);
    await updateUserTakeoutTracking(mealEntry);
    
    // Check achievements (now efficient - just checks the counts!)
    await checkUrbanExplorerAchievement(userId);
    await checkFlavorNomadAchievement(userId);
    await checkWorldOnAPlateAchievement(userId);
    await checkDreamingOfSushiAchievement(userId);
    await checkTakeoutTourAchievement(userId);
    
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

// One-time migration function to populate cuisine data for existing users
export const migrateUserCuisineData = async (userId: string): Promise<void> => {
  try {
    console.log(`Starting cuisine data migration for user: ${userId}`);
    
    // Check if user already has cuisine data
    const userDoc = await firestore().collection('users').doc(userId).get();
    const userData = userDoc.data() || {};
    
    if (userData.uniqueCuisineCount !== undefined) {
      console.log("User already has cuisine data, skipping migration");
      return;
    }
    
    // Get all user's meals to count unique cuisines (one-time only)
    const mealsSnapshot = await firestore()
      .collection('mealEntries')
      .where('userId', '==', userId)
      .get();
    
    const uniqueCuisines = new Set<string>();
    
    mealsSnapshot.forEach((doc) => {
      const meal = doc.data();
      const cuisine = extractCuisineFromMeal(meal);
      if (cuisine) {
        uniqueCuisines.add(cuisine);
      }
    });
    
    console.log(`Migration: User has ${uniqueCuisines.size} unique cuisines`);
    
    // Update user profile with cuisine data
    await firestore()
      .collection('users')
      .doc(userId)
      .update({
        uniqueCuisineCount: uniqueCuisines.size,
        uniqueCuisines: Array.from(uniqueCuisines)
      });
    
    console.log("Cuisine data migration completed successfully");
  } catch (error) {
    console.error("Error during cuisine data migration:", error);
  }
};

// One-time migration function to populate city data for existing users
export const migrateUserCityData = async (userId: string): Promise<void> => {
  try {
    console.log(`Starting city data migration for user: ${userId}`);
    
    // Check if user already has city data
    const userDoc = await firestore().collection('users').doc(userId).get();
    const userData = userDoc.data() || {};
    
    if (userData.uniqueCityCount !== undefined) {
      console.log("User already has city data, skipping migration");
      return;
    }
    
    // Get all user's meals to count unique cities (one-time only)
    const mealsSnapshot = await firestore()
      .collection('mealEntries')
      .where('userId', '==', userId)
      .get();
    
    const uniqueCities = new Set<string>();
    
    mealsSnapshot.forEach((doc) => {
      const meal = doc.data();
      const city = extractCityFromMeal(meal);
      if (city) {
        uniqueCities.add(city);
      }
    });
    
    console.log(`Migration: User has ${uniqueCities.size} unique cities`);
    
    // Update user profile with city data
    await firestore()
      .collection('users')
      .doc(userId)
      .update({
        uniqueCityCount: uniqueCities.size,
        uniqueCities: Array.from(uniqueCities)
      });
    
    console.log("City data migration completed successfully");
  } catch (error) {
    console.error("Error during city data migration:", error);
  }
};

export default {
  getUserAchievements,
  checkAchievements,
  checkUrbanExplorerAchievement,
  checkFlavorNomadAchievement,
  checkWorldOnAPlateAchievement,
  checkDreamingOfSushiAchievement,
  checkTakeoutTourAchievement,
  updateUserCityTracking,
  updateUserCuisineTracking,
  updateUserSushiTracking,
  updateUserTakeoutTracking,
  extractCityFromMeal,
  extractCuisineFromMeal,
  isSushiMeal,
  isTakeoutMeal,
  migrateUserCityData,
  migrateUserCuisineData,
  getAchievementById,
  getAllAchievements
};