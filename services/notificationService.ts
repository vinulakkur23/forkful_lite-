import PushNotification from 'react-native-push-notification';
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
      onNotification: function (notification) {
        console.log('NOTIFICATION:', notification);

        // Handle notification tap
        if (notification.userInteraction) {
          console.log('User tapped on notification');
          // You can navigate to specific screen here if needed
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

  // Schedule a meal rating reminder
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