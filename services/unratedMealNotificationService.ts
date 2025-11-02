/**
 * Unrated Meal Notification Service
 * Handles scheduling push notifications for unrated meals captured via camera
 * - 3 rating statement notifications (1 minute apart each)
 * - 1 reminder notification 2 hours after capture
 */

import PushNotification from 'react-native-push-notification';
import notifee, { TimestampTrigger, TriggerType, AuthorizationStatus } from '@notifee/react-native';
import { Platform } from 'react-native';
import { firestore } from '../firebaseConfig';

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
    // CRITICAL: Check notification permissions before scheduling
    const settings = await notifee.getNotificationSettings();
    console.log('🔔 Notification permission status:', settings.authorizationStatus);

    // IMPORTANT: iOS supports PROVISIONAL permissions which allow notifications
    // AUTHORIZED = User explicitly granted permissions
    // PROVISIONAL = iOS delivers quietly, user hasn't explicitly denied
    const allowedStatuses = [
      AuthorizationStatus.AUTHORIZED,
      AuthorizationStatus.PROVISIONAL  // iOS allows this!
    ];

    if (!allowedStatuses.includes(settings.authorizationStatus)) {
      console.error('⚠️ Notifications not authorized, skipping schedule');
      console.error('⚠️ Current status:', settings.authorizationStatus);
      console.error('⚠️ Allowed statuses:', allowedStatuses);

      await firestore().collection('mealEntries').doc(mealData.mealId).update({
        notification_error: 'Permissions not granted',
        notification_error_timestamp: firestore.FieldValue.serverTimestamp(),
        notification_permission_status: settings.authorizationStatus
      });
      return;
    }
    console.log('✅ Notification permissions verified (status: ' + settings.authorizationStatus + ')');

    // Prefer ratingStatements (new format) over ratingCriteria (old format)
    const statements = mealData.ratingStatements || mealData.ratingCriteria;

    if (!statements || statements.length === 0) {
      console.warn('⚠️ No rating statements available, skipping notifications');
    } else {
      // Use top 3 rating statements for notifications
      const top3Statements = statements.slice(0, 3);

      // Schedule notifications at 3 minute intervals
      const baseTime = new Date();
      const delays = [
        1 * 60 * 1000, // 1 minute
        4 * 60 * 1000, // 4 minutes
        7 * 60 * 1000, // 7 minutes
      ];

      for (let index = 0; index < top3Statements.length; index++) {
        const statement = top3Statements[index];

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

          // Use Notifee for better foreground support and non-interactive notifications
          const trigger: TimestampTrigger = {
            type: TriggerType.TIMESTAMP,
            timestamp: notificationTime.getTime(),
          };

          // Create notification channel for Android (if not already created)
          await notifee.createChannel({
            id: 'meal-insights',
            name: 'Meal Insights',
            sound: 'default',
            vibration: true,
            importance: 4, // High importance
          });

          await notifee.createTriggerNotification(
            {
              id: `unrated-meal-statement-${mealData.mealId}-${index}`,
              title: notificationTitle,
              body: notificationMessage,
              ios: {
                sound: 'default',
                // CRITICAL: Allow notifications to show when app is in foreground
                foregroundPresentationOptions: {
                  alert: true,
                  banner: true,
                  sound: true,
                  badge: true,
                  list: true,
                },
                interruptionLevel: 'active',
              },
              android: {
                channelId: 'meal-insights',
                sound: 'default',
                vibrationPattern: [300, 500, 300],
                // CRITICAL: No pressAction = non-interactive notification
              },
              data: {
                type: 'unrated-meal-statement',
                mealId: mealData.mealId,
                statementIndex: String(index),
                ignoreTap: 'true', // Flag to ignore tap events
              }
            },
            trigger
          );

          console.log(`📬 Statement notification ${index + 1} scheduled for:`, notificationTime.toLocaleTimeString());
          console.log(`   Title: ${notificationTitle}`);
          console.log(`   Message: ${notificationMessage.substring(0, 50)}...`);
        }
      }
    }

    // Schedule pixel art reveal notification for 10 minutes later
    // By then, pixel art will be generated and saved locally
    const pixelArtTime = new Date();
    pixelArtTime.setMinutes(pixelArtTime.getMinutes() + 10);

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

    // Verify notifications were scheduled successfully
    const scheduledIds = await notifee.getTriggerNotificationIds();
    console.log('✅ Verified scheduled Notifee notifications:', scheduledIds);

    // Log to Firestore for production tracking
    await firestore().collection('mealEntries').doc(mealData.mealId).update({
      scheduled_notification_ids: scheduledIds,
      notification_schedule_timestamp: firestore.FieldValue.serverTimestamp(),
      notification_schedule_success: true
    });

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

  } catch (error: any) {
    console.error('❌ Error scheduling notifications:', error);

    // CRITICAL: Log errors to Firestore for production debugging
    try {
      await firestore().collection('mealEntries').doc(mealData.mealId).update({
        notification_scheduling_error: error.message || String(error),
        notification_error_timestamp: firestore.FieldValue.serverTimestamp(),
        notification_error_stack: error.stack || 'No stack trace available',
        notification_schedule_success: false
      });
    } catch (firestoreError) {
      console.error('Failed to log notification error to Firestore:', firestoreError);
    }

    // Don't throw - notifications are nice-to-have, not critical
  }
};

/**
 * Cancel all notifications for a meal (when user rates it)
 */
export const cancelUnratedMealNotifications = async (mealId: string): Promise<void> => {
  console.log('🔕 Canceling notifications for meal:', mealId);

  // Cancel all statement notifications (0, 1, 2) - Notifee
  for (let i = 0; i < 3; i++) {
    await notifee.cancelNotification(`unrated-meal-statement-${mealId}-${i}`);
    // Also cancel old PushNotification format for backward compatibility
    PushNotification.cancelLocalNotification(`unrated-meal-statement-${mealId}-${i}`);
    PushNotification.cancelLocalNotification(`unrated-meal-criteria-${mealId}-${i}`);
  }

  // Cancel pixel art reveal notification - Notifee
  await notifee.cancelNotification(`unrated-meal-pixel-art-${mealId}`);
  // Also cancel PushNotification version
  PushNotification.cancelLocalNotification(`unrated-meal-pixel-art-${mealId}`);

  // Cancel reminder notification - PushNotification (still using this for reminders)
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
