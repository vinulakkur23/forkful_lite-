import { DeviceEventEmitter } from 'react-native';
import { UserChallenge } from './userChallengesService';

class ChallengeNotificationService {
  private static instance: ChallengeNotificationService;
  private static readonly EVENT_NAME = 'challengeUnlocked';
  private static readonly UPDATE_EVENT_NAME = 'challengeImageUpdated';
  
  private constructor() {}
  
  static getInstance(): ChallengeNotificationService {
    if (!ChallengeNotificationService.instance) {
      ChallengeNotificationService.instance = new ChallengeNotificationService();
    }
    return ChallengeNotificationService.instance;
  }
  
  showChallenge(challenge: UserChallenge) {
    console.log('🍽️ Emitting challenge notification:', challenge.recommended_dish_name);
    DeviceEventEmitter.emit(ChallengeNotificationService.EVENT_NAME, challenge);
  }
  
  showChallengeCompleted(challenge: UserChallenge, dishName: string) {
    console.log('🎉 Emitting challenge completed notification:', challenge.recommended_dish_name);
    // Add a completed flag to distinguish from new challenges
    const completedChallenge = {
      ...challenge,
      justCompleted: true,
      completedWithDish: dishName
    };
    DeviceEventEmitter.emit(ChallengeNotificationService.EVENT_NAME, completedChallenge);
  }
  
  updateChallengeImage(challenge: UserChallenge) {
    console.log('🎨 Updating challenge image:', challenge.recommended_dish_name);
    DeviceEventEmitter.emit(ChallengeNotificationService.UPDATE_EVENT_NAME, challenge);
  }
  
  onChallengeUnlocked(callback: (challenge: UserChallenge) => void) {
    const subscription = DeviceEventEmitter.addListener(ChallengeNotificationService.EVENT_NAME, callback);
    return () => {
      subscription.remove();
    };
  }
  
  onChallengeImageUpdated(callback: (challenge: UserChallenge) => void) {
    const subscription = DeviceEventEmitter.addListener(ChallengeNotificationService.UPDATE_EVENT_NAME, callback);
    return () => {
      subscription.remove();
    };
  }
}

export default ChallengeNotificationService.getInstance();