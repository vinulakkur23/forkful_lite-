import PushNotification from 'react-native-push-notification';
import PushNotificationIOS from '@react-native-community/push-notification-ios';
import { Platform } from 'react-native';

interface MealReminderData {
  dishName: string;
  mealId: string;
  restaurantName?: string;
}

class NotificationService {
  constructor() {
    this.configure();
  }

  configure() {
    PushNotification.configure({
      // Called when token is generated (iOS and Android)
      onRegister: function (token) {
        console.log('TOKEN:', token);
      },

      // Called when a remote notification is received while app is in foreground
      onNotification: async function (notification) {
        console.log('NOTIFICATION:', notification);

        // Handle unrated meal reminders (check if still unrated)
        if (notification.userInfo?.type === 'unrated-meal-reminder' && notification.userInfo?.checkReviewStatus) {
          const mealId = notification.userInfo.mealId;
          const dishName = notification.userInfo.dishName;

          try {
            // Import Firebase here to avoid circular imports
            const { firestore } = await import('../firebaseConfig');

            console.log('Checking meal review status for unrated meal reminder:', mealId);

            // Get meal document from Firestore
            const mealDoc = await firestore().collection('mealEntries').doc(mealId).get();

            if (mealDoc.exists) {
              const mealData = mealDoc.data();
              const rating = mealData?.rating || 0;

              // Only show notification if meal is still unrated
              if (rating === 0 || !rating) {
                console.log('Meal is still unrated, showing notification:', mealId);
                // Notification will display normally since meal is unrated
              } else {
                console.log('Meal already rated, canceling notification:', { mealId, rating });
                // Cancel the notification since meal is already rated
                PushNotification.cancelLocalNotifications({
                  id: `unrated-meal-reminder-${mealId}`
                });
                return; // Don't process notification further
              }
            }
          } catch (error) {
            console.error('Error checking meal rating status in notification:', error);
            // If check fails, show notification anyway as fallback
          }
        }

        // Handle conditional meal reminders (legacy)
        if (notification.userInfo?.type === 'meal-reminder-conditional' && notification.userInfo?.checkReviewStatus) {
          const mealId = notification.userInfo.mealId;
          const dishName = notification.userInfo.dishName;

          try {
            // Import Firebase here to avoid circular imports
            const { firestore } = await import('../firebaseConfig');

            console.log('Checking meal review status for conditional reminder:', mealId);

            // Get meal document from Firestore
            const mealDoc = await firestore().collection('mealEntries').doc(mealId).get();

            if (mealDoc.exists) {
              const mealData = mealDoc.data();
              const rating = mealData?.rating || 0;

              // Only show notification if meal is still unreviewed
              if (rating === 0 || !rating) {
                console.log('Meal is unreviewed, showing notification:', mealId);
                // Notification will display normally since meal is unreviewed
              } else {
                console.log('Meal already reviewed, canceling notification:', { mealId, rating });
                // Cancel the notification since meal is already reviewed
                PushNotification.cancelLocalNotifications({
                  id: `meal-reminder-conditional-${mealId}`
                });
                return; // Don't process notification further
              }
            }
          } catch (error) {
            console.error('Error checking meal review status in notification:', error);
            // If check fails, show notification anyway as fallback
          }
        }

        // Handle notification tap - navigate to EditMealScreen if needed
        if (notification.userInteraction) {
          console.log('User tapped on notification');

          // Ignore taps on tip/statement notifications (non-interactive)
          if (notification.userInfo?.type === 'unrated-meal-statement') {
            console.log('Ignoring tap on tip notification - these are non-interactive');
            return;
          }

          // Navigate to EditMealScreen for unrated meal reminders
          if (notification.userInfo?.navigateToEditMeal && notification.userInfo?.mealId) {
            const mealId = notification.userInfo.mealId;
            console.log('Navigating to EditMealScreen for meal:', mealId);

            try {
              // Import navigation service
              const { navigate } = await import('./navigationService');
              const { firestore } = await import('../firebaseConfig');

              // Fetch meal data to pass to EditMealScreen
              const mealDoc = await firestore().collection('mealEntries').doc(mealId).get();

              if (mealDoc.exists) {
                const mealData = { id: mealDoc.id, ...mealDoc.data() };

                // Navigate to EditMealScreen with meal data
                navigate('EditMeal', {
                  mealId: mealId,
                  meal: mealData,
                  previousScreen: 'Notification'
                });

                console.log('Successfully navigated to EditMealScreen from notification');
              } else {
                console.error('Meal not found for navigation:', mealId);
              }
            } catch (error) {
              console.error('Error navigating from notification:', error);
            }
          }
        }

        // IMPORTANT: For iOS, must call finish to allow foreground notifications
        if (Platform.OS === 'ios') {
          notification.finish(PushNotificationIOS.FetchResult.NoData);
        }
      },

      // Should the initial notification be popped automatically
      popInitialNotification: true,

      // Permissions
      requestPermissions: Platform.OS === 'ios',
    });

    // Create notification channels for Android
    if (Platform.OS === 'android') {
      PushNotification.createChannel(
        {
          channelId: 'meal-reminders',
          channelName: 'Meal Rating Reminders',
          channelDescription: 'Reminders to rate your meals',
          playSound: true,
          soundName: 'default',
          importance: 4,
          vibrate: true,
        },
        (created) => console.log(`createChannel returned '${created}'`)
      );
    }
  }

  // Request notification permissions (especially important for iOS)
  async requestPermissions(): Promise<boolean> {
    return new Promise((resolve) => {
      PushNotification.requestPermissions()
        .then((permissions) => {
          console.log('Notification permissions:', permissions);
          resolve(permissions.alert && permissions.sound);
        })
        .catch((error) => {
          console.error('Error requesting notification permissions:', error);
          resolve(false);
        });
    });
  }

  // Schedule a meal rating reminder - only sends if meal is still unreviewed
  async scheduleMealReminderConditional(mealData: MealReminderData, delayHours: number = 1) {
    const { dishName, mealId, restaurantName } = mealData;
    
    console.log('Scheduling conditional meal reminder for:', mealId, 'in', delayHours, 'hours');
    
    // Calculate notification time
    const notificationTime = new Date();
    notificationTime.setHours(notificationTime.getHours() + delayHours);

    // Schedule a reminder with a unique ID that includes conditional check info
    PushNotification.localNotificationSchedule({
      id: `meal-reminder-conditional-${mealId}`,
      channelId: Platform.OS === 'android' ? 'meal-reminders' : undefined,
      title: "Rate Your Meal! 🍽️",
      message: `How was your ${dishName}? Rate it when you get a chance!`,
      date: notificationTime,
      playSound: true,
      soundName: 'default',
      repeatType: undefined,
      userInfo: {
        mealId: mealId,
        type: 'meal-reminder-conditional',
        dishName: dishName,
        restaurantName: restaurantName,
        checkReviewStatus: true // Flag to check review status when notification fires
      },
    });

    console.log('Scheduled conditional meal reminder:', {
      mealId,
      scheduledFor: notificationTime.toISOString()
    });

    return {
      success: true,
      scheduledFor: notificationTime,
      notificationId: `meal-reminder-conditional-${mealId}`
    };
  }

  // Legacy method - kept for backwards compatibility
  scheduleMealReminder(mealData: MealReminderData, delayHours: number = 1) {
    const { dishName, mealId, restaurantName } = mealData;
    
    // Calculate notification time (1 hour from now by default)
    const notificationTime = new Date();
    notificationTime.setHours(notificationTime.getHours() + delayHours);

    // Create notification title and message
    const title = "Rate Your Meal! 🍽️";
    const message = `How was your ${dishName}? Rate it when you get a chance!`;
    
    console.log('Scheduling meal reminder notification:', {
      title,
      message,
      scheduledFor: notificationTime.toISOString(),
      mealId,
      dishName
    });

    // Schedule the notification
    PushNotification.localNotificationSchedule({
      id: `meal-reminder-${mealId}`, // Unique ID for this notification
      channelId: Platform.OS === 'android' ? 'meal-reminders' : undefined,
      title: title,
      message: message,
      date: notificationTime,
      playSound: true,
      soundName: 'default',
      repeatType: undefined, // Don't repeat
      userInfo: {
        mealId: mealId,
        type: 'meal-reminder',
        dishName: dishName,
        restaurantName: restaurantName
      },
    });

    return {
      success: true,
      scheduledFor: notificationTime,
      notificationId: `meal-reminder-${mealId}`
    };
  }

  // Cancel a specific meal reminder
  cancelMealReminder(mealId: string) {
    const notificationId = `meal-reminder-${mealId}`;
    
    console.log('Canceling meal reminder:', notificationId);
    
    PushNotification.cancelLocalNotifications({
      id: notificationId
    });
  }

  // Cancel all pending notifications
  cancelAllNotifications() {
    console.log('Canceling all notifications');
    PushNotification.cancelAllLocalNotifications();
  }

  // Get all scheduled notifications (for debugging)
  getScheduledNotifications() {
    return new Promise((resolve) => {
      PushNotification.getScheduledLocalNotifications((notifications) => {
        console.log('Scheduled notifications:', notifications);
        resolve(notifications);
      });
    });
  }
}

// Export a singleton instance
export default new NotificationService();