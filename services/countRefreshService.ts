import { firebase, firestore, auth } from '../firebaseConfig';
// DISABLED: Achievement service imports
// import { extractCityFromMeal, extractCuisineFromMeal, isSushiMeal, isTakeoutMeal } from './achievementService';

// Stub functions to replace achievement service functions
const extractCityFromMeal = (meal: any) => {
  // Try location.city first (primary source)
  if (meal.location?.city) return meal.location.city;
  // Try top-level city field
  if (meal.city) return meal.city;
  // Try metadata_enriched.city
  if (meal.metadata_enriched?.city) return meal.metadata_enriched.city;
  return null;
};

const extractCuisineFromMeal = (meal: any) => {
  // Try metadata_enriched.cuisine_type first (primary source)
  if (meal.metadata_enriched?.cuisine_type) return meal.metadata_enriched.cuisine_type;
  // Try quick_criteria_result
  if (meal.quick_criteria_result?.cuisine_type) return meal.quick_criteria_result.cuisine_type;
  // Try aiMetadata
  if (meal.aiMetadata?.cuisineType) return meal.aiMetadata.cuisineType;
  return null;
};
const extractRestaurantFromMeal = (meal: any) => {
  if (!meal.restaurant) return null;

  let restaurantName = meal.restaurant.trim();

  // If restaurant includes city/state (e.g., "Pok Pok, Portland OR"), extract just the name
  if (restaurantName.includes(',')) {
    const parts = restaurantName.split(',');
    restaurantName = parts[0].trim();
  }

  // Filter out empty strings or generic entries
  if (restaurantName === '' || restaurantName.toLowerCase() === 'unknown' || restaurantName.toLowerCase() === 'n/a') {
    return null;
  }

  return restaurantName;
};
const isSushiMeal = (meal: any) => false;
const isTakeoutMeal = (meal: any) => false;

// Manual function to refresh all counts for the current user
export const refreshUserCounts = async (userId?: string): Promise<{
  success: boolean;
  counts?: {
    cities: number;
    cuisines: number;
    restaurants: number;
    sushi: number;
    takeout: number;
  };
  error?: string;
}> => {
  try {
    const targetUserId = userId || auth().currentUser?.uid;
    if (!targetUserId) {
      return { success: false, error: 'User not authenticated' };
    }

    console.log(`Refreshing counts for user: ${targetUserId}`);

    // Get all meals for this user
    const mealsSnapshot = await firestore()
      .collection('mealEntries')
      .where('userId', '==', targetUserId)
      .get();

    const meals: any[] = [];
    mealsSnapshot.forEach(doc => {
      meals.push(doc.data());
    });

    console.log(`Found ${meals.length} meals to analyze`);

    // Recalculate all counts
    const uniqueCities = new Set<string>();
    const uniqueCuisines = new Set<string>();
    const uniqueRestaurants = new Set<string>();
    let sushiMealCount = 0;
    let takeoutMealCount = 0;

    meals.forEach(meal => {
      const city = extractCityFromMeal(meal);
      if (city) {
        uniqueCities.add(city);
      }

      const cuisine = extractCuisineFromMeal(meal);
      if (cuisine) {
        uniqueCuisines.add(cuisine);
      }

      const restaurant = extractRestaurantFromMeal(meal);
      if (restaurant) {
        uniqueRestaurants.add(restaurant);
      }

      if (isSushiMeal(meal)) {
        sushiMealCount++;
        console.log(`Sushi meal found: ${meal.meal}`);
      }

      if (isTakeoutMeal(meal)) {
        takeoutMealCount++;
        console.log(`Takeout meal found: ${meal.meal}`);
      }
    });

    const counts = {
      cities: uniqueCities.size,
      cuisines: uniqueCuisines.size,
      restaurants: uniqueRestaurants.size,
      sushi: sushiMealCount,
      takeout: takeoutMealCount
    };

    console.log('Recalculated counts:', counts);

    // Update user document with refreshed counts
    await firestore()
      .collection('users')
      .doc(targetUserId)
      .update({
        uniqueCityCount: counts.cities,
        uniqueCities: Array.from(uniqueCities),
        uniqueCuisineCount: counts.cuisines,
        uniqueCuisines: Array.from(uniqueCuisines),
        uniqueRestaurantCount: counts.restaurants,
        uniqueRestaurants: Array.from(uniqueRestaurants),
        sushiMealCount: counts.sushi,
        takeoutMealCount: counts.takeout,
        lastCountRefresh: firestore.FieldValue.serverTimestamp()
      });

    console.log('Successfully updated user counts');

    return {
      success: true,
      counts
    };

  } catch (error: any) {
    console.error('Error refreshing user counts:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
};

// Function to check if counts need refreshing (optional - for UI indicators)
export const checkIfCountsNeedRefresh = async (userId?: string): Promise<boolean> => {
  try {
    const targetUserId = userId || auth().currentUser?.uid;
    if (!targetUserId) return false;

    const userDoc = await firestore().collection('users').doc(targetUserId).get();
    const userData = userDoc.data();

    if (!userData) return false;

    // Check if lastCountRefresh exists and is recent (within last 24 hours)
    if (userData.lastCountRefresh) {
      const lastRefresh = userData.lastCountRefresh.toDate();
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      if (lastRefresh > oneDayAgo) {
        return false; // Recent refresh, no need to refresh again
      }
    }

    return true; // Needs refresh
  } catch (error) {
    console.error('Error checking refresh status:', error);
    return true; // Default to needing refresh on error
  }
};