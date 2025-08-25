import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

interface OnboardingState {
  hasSeenFoodPassportTooltips: boolean;
  hasSeenDiscoverTooltips: boolean;
}

class OnboardingService {
  private static STORAGE_KEY = '@onboarding_state';
  
  // Check if user has any meals in Firebase
  private async userHasAnyMeals(): Promise<boolean> {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        return false;
      }

      const mealQuery = await firestore()
        .collection('mealEntries')
        .where('userId', '==', currentUser.uid)
        .limit(1)
        .get();

      return !mealQuery.empty;
    } catch (error) {
      console.error('Error checking user meals:', error);
      return false;
    }
  }
  
  // Get current onboarding state
  async getOnboardingState(): Promise<OnboardingState> {
    try {
      const stateJson = await AsyncStorage.getItem(OnboardingService.STORAGE_KEY);
      if (stateJson) {
        return JSON.parse(stateJson);
      }
      
      // Default state for new users
      return {
        hasSeenFoodPassportTooltips: false,
        hasSeenDiscoverTooltips: false,
      };
    } catch (error) {
      console.error('Error getting onboarding state:', error);
      return {
        hasSeenFoodPassportTooltips: false,
        hasSeenDiscoverTooltips: false,
      };
    }
  }
  
  // Mark that user has seen Food Passport tooltips
  async markFoodPassportTooltipsSeen(): Promise<void> {
    try {
      const currentState = await this.getOnboardingState();
      const newState = {
        ...currentState,
        hasSeenFoodPassportTooltips: true,
      };
      
      await AsyncStorage.setItem(
        OnboardingService.STORAGE_KEY,
        JSON.stringify(newState)
      );
      
      console.log('📝 Onboarding: Food Passport tooltips seen');
    } catch (error) {
      console.error('Error marking Food Passport tooltips seen:', error);
    }
  }
  
  // Mark that user has seen Discover tooltips
  async markDiscoverTooltipsSeen(): Promise<void> {
    try {
      const currentState = await this.getOnboardingState();
      const newState = {
        ...currentState,
        hasSeenDiscoverTooltips: true,
      };
      
      await AsyncStorage.setItem(
        OnboardingService.STORAGE_KEY,
        JSON.stringify(newState)
      );
      
      console.log('📝 Onboarding: Discover tooltips seen');
    } catch (error) {
      console.error('Error marking Discover tooltips seen:', error);
    }
  }
  
  // Check if user should see Food Passport tooltips
  async shouldShowFoodPassportTooltips(): Promise<boolean> {
    try {
      const state = await this.getOnboardingState();
      const hasAnyMeals = await this.userHasAnyMeals();
      return hasAnyMeals && !state.hasSeenFoodPassportTooltips;
    } catch (error) {
      console.error('Error checking Food Passport tooltips:', error);
      return false;
    }
  }
  
  // Check if user should see Discover tooltips
  async shouldShowDiscoverTooltips(): Promise<boolean> {
    try {
      const state = await this.getOnboardingState();
      const hasAnyMeals = await this.userHasAnyMeals();
      return hasAnyMeals && !state.hasSeenDiscoverTooltips;
    } catch (error) {
      console.error('Error checking Discover tooltips:', error);
      return false;
    }
  }
  
  // Reset onboarding state (for testing)
  async resetOnboardingState(): Promise<void> {
    try {
      await AsyncStorage.removeItem(OnboardingService.STORAGE_KEY);
      console.log('📝 Onboarding: State reset');
    } catch (error) {
      console.error('Error resetting onboarding state:', error);
    }
  }
  
  // Log current state (for debugging)
  async logCurrentState(): Promise<void> {
    try {
      const state = await this.getOnboardingState();
      console.log('📝 Current onboarding state:', state);
    } catch (error) {
      console.error('Error logging onboarding state:', error);
    }
  }
}

// Export a singleton instance
export default new OnboardingService();