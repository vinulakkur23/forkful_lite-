import { DeviceEventEmitter } from 'react-native';
import { UserChallenge } from './userChallengesService';

class ChallengeNotificationService {
  private static instance: ChallengeNotificationService;
  private static readonly EVENT_NAME = 'challengeUnlocked';
  
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
  
  onChallengeUnlocked(callback: (challenge: UserChallenge) => void) {
    const subscription = DeviceEventEmitter.addListener(ChallengeNotificationService.EVENT_NAME, callback);
    return () => {
      subscription.remove();
    };
  }
}

export default ChallengeNotificationService.getInstance();