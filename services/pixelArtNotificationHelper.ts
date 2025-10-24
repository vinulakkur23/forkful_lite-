/**
 * Pixel Art Notification Helper
 * Updates the pixel art notification with image attachment once the file is ready
 * Uses Notifee for proper iOS image attachment support
 */

import notifee, { TimestampTrigger, TriggerType } from '@notifee/react-native';
import PushNotification from 'react-native-push-notification';
import { Platform } from 'react-native';
import { firestore } from '../firebaseConfig';
import RNFS from 'react-native-fs';

/**
 * Update pixel art notification with image attachment
 * Call this after pixel art has been generated and saved locally
 */
export const updatePixelArtNotificationWithImage = async (
  mealId: string,
  dishName: string,
  localPixelArtPath: string
): Promise<void> => {
  try {
    console.log('🔄 Scheduling pixel art notification with image using Notifee:', localPixelArtPath);

    // Verify file exists
    const fileExists = await RNFS.exists(localPixelArtPath);
    if (!fileExists) {
      console.error('⚠️ Pixel art file not found, notification will show without image');
      return;
    }

    // Cancel the original notification (scheduled with react-native-push-notification)
    PushNotification.cancelLocalNotification(`unrated-meal-pixel-art-${mealId}`);
    console.log('✅ Cancelled original pixel art notification (react-native-push-notification)');

    // Calculate when it should fire (2 minutes from now - for testing)
    const notificationTime = new Date();
    notificationTime.setMinutes(notificationTime.getMinutes() + 2);

    console.log('📬 Scheduling pixel art notification with image (Notifee)');
    console.log('   File path:', localPixelArtPath);
    console.log('   Scheduled for:', notificationTime.toLocaleTimeString());

    // Create notification channel for Android (required for Notifee)
    await notifee.createChannel({
      id: 'meal-insights',
      name: 'Meal Insights',
      sound: 'default',
      vibration: true,
      importance: 4, // High importance
    });

    // Create timestamp trigger for 10 minutes from now
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: notificationTime.getTime(),
    };

    // Schedule notification with Notifee (supports image attachments on iOS!)
    await notifee.createTriggerNotification(
      {
        id: `unrated-meal-pixel-art-${mealId}`,
        title: '', // Empty title so image shows first
        body: 'Rate your meal to unlock your emoji', // Text as body instead
        ios: {
          // iOS-specific configuration with image attachment
          attachments: [{
            url: localPixelArtPath,
            thumbnailHidden: false, // Show image as main content
          }],
          sound: 'default',
          // Make the image more prominent
          foregroundPresentationOptions: {
            banner: true,
            sound: true,
            badge: true,
          },
          // Active interruption level for better prominence and vibration
          interruptionLevel: 'active',
        },
        android: {
          channelId: 'meal-insights',
          sound: 'default',
          // Android big picture style - image takes priority
          style: {
            type: 1, // AndroidStyle.BIGPICTURE
            picture: localPixelArtPath,
          },
          largeIcon: localPixelArtPath,
          showTimestamp: false,
          // Enable vibration
          vibrationPattern: [300, 500, 300], // vibrate-pause-vibrate pattern
          // Disable auto-cancel when tapped
          autoCancel: false,
          // Don't open app on tap
          pressAction: {
            id: 'default',
          },
        },
        data: {
          type: 'unrated-meal-pixel-art',
          mealId: mealId,
          dishName: dishName,
          showPixelArt: 'true',
          hasImageAttachment: 'true',
          localPixelArtPath: localPixelArtPath,
          // Flag to ignore tap events
          ignoreTap: 'true',
        },
      },
      trigger
    );

    console.log('✅ Pixel art notification scheduled with image using Notifee');
  } catch (error) {
    console.error('❌ Error scheduling pixel art notification with Notifee:', error);
    // Don't throw - notification will still show without image
  }
};
