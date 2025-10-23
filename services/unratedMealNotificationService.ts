/**
 * Unrated Meal Notification Service
 * Handles scheduling push notifications for unrated meals captured via camera
 * - 3 rating statement notifications (1 minute apart each)
 * - 1 reminder notification 2 hours after capture
 */

import PushNotification from 'react-native-push-notification';
import { Platform } from 'react-native';

interface RatingStatement {
  title: string;
  description: string;
}

interface UnratedMealData {
  mealId: string;
  dishName: string;
  restaurantName?: string;
  city?: string;
  ratingStatements?: RatingStatement[]; // Top 3 rating statements (title + description)
  ratingCriteria?: string[]; // Backward compatibility
}

/**
 * Schedule all notifications for a newly captured unrated meal
 */
export const scheduleUnratedMealNotifications = async (
  mealData: UnratedMealData
): Promise<void> => {
  console.log('📅 Scheduling notifications for unrated meal:', mealData.mealId);

  try {
    // Prefer ratingStatements (new format) over ratingCriteria (old format)
    const statements = mealData.ratingStatements || mealData.ratingCriteria;

    if (!statements || statements.length === 0) {
      console.warn('⚠️ No rating statements available, skipping notifications');
    } else {
      // Use top 3 rating statements for notifications
      const top3Statements = statements.slice(0, 3);

      // Schedule notifications every 1 minute (for testing)
      const baseTime = new Date();
      const delays = [
        0.5 * 60 * 1000, // 30 seconds (for faster testing)
        1 * 60 * 1000, // 1 minute
        1.5 * 60 * 1000, // 1.5 minutes
      ];

      top3Statements.forEach((statement, index) => {
        // Handle both new format (object with title+description) and old format (string)
        let notificationTitle: string;
        let notificationMessage: string;

        if (typeof statement === 'string') {
          // Old format - use generic title
          notificationTitle = `🍽️ What to Look For`;
          notificationMessage = statement;
        } else {
          // New format - use statement title as notification title, description as message
          notificationTitle = `🍽️ ${statement.title}`;
          notificationMessage = statement.description;
        }

        if (notificationTitle && notificationMessage && notificationMessage.trim()) {
          const notificationTime = new Date(baseTime.getTime() + delays[index]);

          PushNotification.localNotificationSchedule({
            id: `unrated-meal-statement-${mealData.mealId}-${index}`,
            channelId: 'meal-insights',
            title: notificationTitle,
            message: notificationMessage,
            date: notificationTime,
            allowWhileIdle: true,
            playSound: true,
            soundName: 'default',
            invokeApp: false, // Don't open app when notification is tapped
            ignoreInForeground: false, // Show notification even when app is open
            userInfo: {
              type: 'unrated-meal-statement',
              mealId: mealData.mealId,
              statementIndex: index
            }
          });

          console.log(`📬 Statement notification ${index + 1} scheduled for:`, notificationTime.toLocaleTimeString());
          console.log(`   Title: ${notificationTitle}`);
          console.log(`   Message: ${notificationMessage.substring(0, 50)}...`);
        }
      });
    }

    // Schedule pixel art reveal notification for 2 minutes later (for testing)
    // By then, pixel art will be generated and saved locally
    const pixelArtTime = new Date();
    pixelArtTime.setMinutes(pixelArtTime.getMinutes() + 2);

    // Note: The pixel art local path will be fetched when this notification fires
    // We'll update the notification dynamically if we detect the file is ready
    PushNotification.localNotificationSchedule({
      id: `unrated-meal-pixel-art-${mealData.mealId}`,
      channelId: 'meal-insights',
      title: '🎨 Your custom emoji is ready!',
      message: `Check out the unique emoji we created for your ${mealData.dishName}`,
      date: pixelArtTime,
      allowWhileIdle: true,
      playSound: true,
      soundName: 'default',
      ignoreInForeground: false,
      invokeApp: false, // Don't open app automatically
      // iOS: For notification attachments to work, we need to:
      // 1. Pass local file path in notification data
      // 2. iOS will automatically load and display the image
      // Note: This requires the pixel art to be saved locally first (done in CameraScreen)
      userInfo: {
        type: 'unrated-meal-pixel-art',
        mealId: mealData.mealId,
        dishName: mealData.dishName,
        showPixelArt: true,
        // The local path will be fetched from Firestore when notification fires
        needsPixelArtPath: true
      }
    });

    console.log('📬 Pixel art reveal scheduled for:', pixelArtTime.toLocaleTimeString());
    console.log('   Note: Pixel art image will be attached if local file path is available');

    // Schedule rating reminder notification for 2 hours later
    const reminderTime = new Date();
    reminderTime.setHours(reminderTime.getHours() + 2);

    PushNotification.localNotificationSchedule({
      id: `unrated-meal-reminder-${mealData.mealId}`,
      channelId: 'meal-reminders',
      title: '⏰ How was your meal?',
      message: `Don't forget to rate your ${mealData.dishName} and check out your custom emoji!`,
      date: reminderTime,
      allowWhileIdle: true,
      playSound: true,
      soundName: 'default',
      ignoreInForeground: false, // Show notification even when app is open
      // invokeApp is true by default - will open app and navigate to EditMealScreen
      userInfo: {
        type: 'unrated-meal-reminder',
        mealId: mealData.mealId,
        dishName: mealData.dishName,
        checkReviewStatus: true, // Will verify meal is still unrated before showing
        navigateToEditMeal: true // Signal to navigate to EditMealScreen
      }
    });

    console.log('📬 Rating reminder scheduled for:', reminderTime.toLocaleTimeString());
    console.log('✅ All notifications scheduled successfully');

  } catch (error) {
    console.error('❌ Error scheduling notifications:', error);
    // Don't throw - notifications are nice-to-have, not critical
  }
};

/**
 * Cancel all notifications for a meal (when user rates it)
 */
export const cancelUnratedMealNotifications = (mealId: string): void => {
  console.log('🔕 Canceling notifications for meal:', mealId);

  // Cancel all statement notifications (0, 1, 2)
  for (let i = 0; i < 3; i++) {
    PushNotification.cancelLocalNotification(`unrated-meal-statement-${mealId}-${i}`);
    // Also cancel old format for backward compatibility
    PushNotification.cancelLocalNotification(`unrated-meal-criteria-${mealId}-${i}`);
  }

  // Cancel pixel art reveal notification
  PushNotification.cancelLocalNotification(`unrated-meal-pixel-art-${mealId}`);

  // Cancel reminder notification
  PushNotification.cancelLocalNotification(`unrated-meal-reminder-${mealId}`);

  console.log('✅ Notifications canceled');
};

/**
 * Initialize notification channels (Android)
 * Call this in App.tsx on startup
 */
export const initializeUnratedMealNotificationChannels = (): void => {
  if (Platform.OS === 'android') {
    // Channel for meal insights
    PushNotification.createChannel(
      {
        channelId: 'meal-insights',
        channelName: 'Meal Insights',
        channelDescription: 'Interesting facts about your meals',
        playSound: true,
        soundName: 'default',
        importance: 4, // High importance
        vibrate: true,
      },
      (created) => console.log(`Meal insights channel created: ${created}`)
    );

    // Channel for meal reminders
    PushNotification.createChannel(
      {
        channelId: 'meal-reminders',
        channelName: 'Meal Rating Reminders',
        channelDescription: 'Reminders to rate your meals',
        playSound: true,
        soundName: 'default',
        importance: 4, // High importance
        vibrate: true,
      },
      (created) => console.log(`Meal reminders channel created: ${created}`)
    );
  }
};
