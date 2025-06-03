import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import AchievementNotification from './AchievementNotification';
import achievementNotificationService from '../services/achievementNotificationService';
import { Achievement } from '../types/achievements';

const GlobalAchievementListener: React.FC = () => {
  const [currentAchievement, setCurrentAchievement] = useState<Achievement | null>(null);
  const [achievementQueue, setAchievementQueue] = useState<Achievement[]>([]);

  useEffect(() => {
    // Subscribe to achievement notifications
    const unsubscribe = achievementNotificationService.onAchievementUnlocked((achievement) => {
      console.log('🎉 GlobalAchievementListener received achievement:', achievement.name);
      setAchievementQueue(prev => [...prev, achievement]);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Process achievement queue
  useEffect(() => {
    if (!currentAchievement && achievementQueue.length > 0) {
      const [nextAchievement, ...remainingQueue] = achievementQueue;
      setCurrentAchievement(nextAchievement);
      setAchievementQueue(remainingQueue);
    }
  }, [currentAchievement, achievementQueue]);

  const handleDismiss = () => {
    setCurrentAchievement(null);
  };

  if (!currentAchievement) {
    return null;
  }

  return (
    <View style={styles.container}>
      <AchievementNotification
        achievement={currentAchievement}
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
    pointerEvents: 'box-none', // Allow touches to pass through except on the notification itself
    zIndex: 999999, // Very high z-index to ensure it's on top
    elevation: 999, // High elevation for Android
    overflow: 'visible', // Ensure children aren't clipped
    // Prevent layout calculations from affecting other components
    width: '100%',
    height: 0, // Zero height to not affect layout
  },
});

export default GlobalAchievementListener;