import { firebase } from '../firebaseConfig';

// Base achievement interface
export interface Achievement {
  id: string;
  name: string;
  description: string;
  image: string;
  criteria: AchievementCriteria;
  createdAt?: firebase.firestore.Timestamp;
}

// User-specific achievement record
export interface UserAchievement {
  id?: string;
  userId: string;
  achievementId: string;
  earnedAt: firebase.firestore.Timestamp;
  mealEntryId?: string; // The meal that triggered this achievement
}

// Different types of achievement criteria
export type AchievementCriteriaType = 
  | 'first_post'
  | 'location_based'
  | 'food_type'
  | 'day_of_week'
  | 'meal_count'
  | 'rating_based';

// The criteria for earning an achievement 
export interface AchievementCriteria {
  type: AchievementCriteriaType;
  
  // For location-based achievements
  location?: {
    city?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
      radius: number; // in km
    };
  };
  
  // For food type achievements
  foodType?: {
    type: string;
    dayOfWeek?: number; // 0 = Sunday, 1 = Monday, etc.
  };
  
  // For meal count achievements
  mealCount?: {
    count: number;
    timeFrame?: 'day' | 'week' | 'month' | 'all_time';
  };
  
  // For rating-based achievements
  rating?: {
    value: number;
    comparison: 'equal' | 'greater_than' | 'less_than';
    count?: number; // How many ratings are required
  };
}

// Achievement data that we'll store in our app (in-memory or in Firestore)
export interface AchievementDefinition extends Achievement {
  evaluate: (mealEntry: any, userAchievements: UserAchievement[]) => boolean;
}