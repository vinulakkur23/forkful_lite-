import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import ChallengeNotification from './ChallengeNotification';
import challengeNotificationService from '../services/challengeNotificationService';
import { UserChallenge } from '../services/userChallengesService';
import { navigate } from '../services/navigationService';

const GlobalChallengeListener: React.FC = () => {
  const [currentChallenge, setCurrentChallenge] = useState<UserChallenge | null>(null);
  const [challengeQueue, setChallengeQueue] = useState<UserChallenge[]>([]);

  useEffect(() => {
    // Subscribe to challenge notifications
    const unsubscribe = challengeNotificationService.onChallengeUnlocked((challenge) => {
      console.log('🍽️ GlobalChallengeListener received challenge:', challenge.recommended_dish_name);
      setChallengeQueue(prev => [...prev, challenge]);
    });
    
    // Subscribe to image updates
    const unsubscribeImageUpdate = challengeNotificationService.onChallengeImageUpdated((updatedChallenge) => {
      console.log('🎨 GlobalChallengeListener received image update:', updatedChallenge.recommended_dish_name);
      // Update current challenge if it matches
      setCurrentChallenge(current => {
        if (current && current.challenge_id === updatedChallenge.challenge_id) {
          return updatedChallenge;
        }
        return current;
      });
      // Update any challenges in queue
      setChallengeQueue(queue => 
        queue.map(c => c.challenge_id === updatedChallenge.challenge_id ? updatedChallenge : c)
      );
    });

    return () => {
      unsubscribe();
      unsubscribeImageUpdate();
    };
  }, []);

  // Process challenge queue
  useEffect(() => {
    if (!currentChallenge && challengeQueue.length > 0) {
      const [nextChallenge, ...remainingQueue] = challengeQueue;
      setCurrentChallenge(nextChallenge);
      setChallengeQueue(remainingQueue);
    }
  }, [currentChallenge, challengeQueue]);

  const handleDismiss = () => {
    setCurrentChallenge(null);
  };

  if (!currentChallenge) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ChallengeNotification
        challenge={currentChallenge}
        onDismiss={handleDismiss}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    pointerEvents: 'box-none',
    zIndex: 999998, // Slightly lower than achievement notifications
    elevation: 998,
    overflow: 'visible',
    width: '100%',
    height: 0,
  },
});

export default GlobalChallengeListener;