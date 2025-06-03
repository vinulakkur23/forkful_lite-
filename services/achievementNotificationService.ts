import { DeviceEventEmitter } from 'react-native';
import { Achievement } from '../types/achievements';

class AchievementNotificationService {
  private static instance: AchievementNotificationService;
  private static readonly EVENT_NAME = 'achievementUnlocked';
  
  private constructor() {}
  
  static getInstance(): AchievementNotificationService {
    if (!AchievementNotificationService.instance) {
      AchievementNotificationService.instance = new AchievementNotificationService();
    }
    return AchievementNotificationService.instance;
  }
  
  showAchievement(achievement: Achievement) {
    console.log('🏆 Emitting achievement notification:', achievement.name);
    DeviceEventEmitter.emit(this.EVENT_NAME, achievement);
  }
  
  onAchievementUnlocked(callback: (achievement: Achievement) => void) {
    const subscription = DeviceEventEmitter.addListener(this.EVENT_NAME, callback);
    return () => {
      subscription.remove();
    };
  }
}

export default AchievementNotificationService.getInstance();