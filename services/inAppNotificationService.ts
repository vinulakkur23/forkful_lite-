import { firebase, firestore, auth } from '../firebaseConfig';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export interface InAppNotification {
  id: string;
  userId: string;
  type: 'comment' | 'cheers' | 'follow' | 'challenge_completed';
  fromUser: {
    id: string;
    name: string;
    photo: string | null;
  };
  mealId?: string;
  mealName?: string;
  commentId?: string;
  commentText?: string;
  message: string;
  read: boolean;
  createdAt: FirebaseFirestoreTypes.Timestamp | Date;
}

class InAppNotificationService {
  // Create a new notification
  async createNotification(
    toUserId: string,
    type: InAppNotification['type'],
    data: {
      fromUser: InAppNotification['fromUser'];
      mealId?: string;
      mealName?: string;
      commentId?: string;
      commentText?: string;
      customMessage?: string;
    }
  ): Promise<void> {
    try {
      // Don't create notification if it's for the same user (self-action)
      if (toUserId === data.fromUser.id) {
        console.log('Skipping notification for self-action');
        return;
      }

      // Generate message based on type
      let message = data.customMessage || '';
      if (!message) {
        switch (type) {
          case 'comment':
            message = `${data.fromUser.name} commented on your ${data.mealName || 'meal'}`;
            break;
          case 'cheers':
            message = `${data.fromUser.name} cheered your ${data.mealName || 'meal'}`;
            break;
          case 'follow':
            message = `${data.fromUser.name} started following you`;
            break;
          case 'challenge_completed':
            message = `${data.fromUser.name} completed a challenge!`;
            break;
        }
      }

      const notification: Omit<InAppNotification, 'id'> = {
        userId: toUserId,
        type,
        fromUser: data.fromUser,
        mealId: data.mealId,
        mealName: data.mealName,
        commentId: data.commentId,
        commentText: data.commentText,
        message,
        read: false,
        createdAt: firestore.FieldValue.serverTimestamp() as FirebaseFirestoreTypes.Timestamp,
      };

      console.log('🔔 Creating notification for user:', toUserId);
      console.log('🔔 Notification data:', JSON.stringify(notification, null, 2));
      console.log('🔔 MealId being stored:', data.mealId);
      
      const docRef = await firestore().collection('notifications').add(notification);
      console.log('✅ In-app notification created with ID:', docRef.id);
      console.log('✅ In-app notification message:', message);
    } catch (error) {
      console.error('❌ Error creating in-app notification:', error);
    }
  }

  // Get unread notification count for a user
  getUnreadCount(userId: string, callback: (count: number) => void): () => void {
    const unsubscribe = firestore()
      .collection('notifications')
      .where('userId', '==', userId)
      .where('read', '==', false)
      .onSnapshot(
        snapshot => {
          callback(snapshot.size);
        },
        error => {
          console.error('Error getting unread notifications:', error);
          callback(0);
        }
      );

    return unsubscribe;
  }

  // Get all notifications for a user
  async getNotifications(userId: string, limit: number = 50): Promise<InAppNotification[]> {
    try {
      console.log('🔔 Getting notifications for user:', userId);
      
      // Simpler query without orderBy to avoid index issues
      const snapshot = await firestore()
        .collection('notifications')
        .where('userId', '==', userId)
        .limit(limit)
        .get();

      console.log('🔔 Found notifications:', snapshot.size);

      const notifications = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Handle null createdAt
          createdAt: data.createdAt || new Date()
        };
      }) as InAppNotification[];
      
      // Sort manually on client side
      notifications.sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt : a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt instanceof Date ? b.createdAt : b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      
      return notifications;
    } catch (error) {
      console.error('❌ Error getting notifications:', error);
      console.error('❌ Error details:', error.message, error.code);
      return [];
    }
  }

  // Listen to notifications in real-time
  listenToNotifications(
    userId: string,
    callback: (notifications: InAppNotification[]) => void
  ): () => void {
    console.log('🔔 Setting up notification listener for user:', userId);
    
    // Try simpler query first to see if index is the issue
    const unsubscribe = firestore()
      .collection('notifications')
      .where('userId', '==', userId)
      .limit(50)
      .onSnapshot(
        snapshot => {
          console.log('🔔 Notification snapshot received, size:', snapshot.size);
          console.log('🔔 Snapshot metadata:', {
            fromCache: snapshot.metadata.fromCache,
            hasPendingWrites: snapshot.metadata.hasPendingWrites
          });
          
          const notifications = snapshot.docs.map(doc => {
            const data = doc.data();
            console.log('🔔 Notification doc:', doc.id, 'data:', data);
            return {
              id: doc.id,
              ...data,
              // Handle null createdAt (when using serverTimestamp)
              createdAt: data.createdAt || new Date()
            };
          }) as InAppNotification[];
          
          // Sort notifications by createdAt manually (client-side)
          notifications.sort((a, b) => {
            const dateA = a.createdAt instanceof Date ? a.createdAt : a.createdAt?.toDate?.() || new Date(0);
            const dateB = b.createdAt instanceof Date ? b.createdAt : b.createdAt?.toDate?.() || new Date(0);
            return dateB.getTime() - dateA.getTime(); // Descending order
          });
          
          console.log('🔔 Processed and sorted notifications:', notifications.length);
          callback(notifications);
        },
        error => {
          console.error('❌ Error listening to notifications:', error);
          console.error('❌ Error details:', error.message, error.code);
          console.error('❌ This might be an index issue. Check Firebase Console for index creation link.');
          callback([]);
        }
      );

    return unsubscribe;
  }

  // Mark notification as read
  async markAsRead(notificationId: string): Promise<void> {
    try {
      await firestore()
        .collection('notifications')
        .doc(notificationId)
        .update({ read: true });
      console.log('✅ Notification marked as read');
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
    }
  }

  // Mark all notifications as read for a user
  async markAllAsRead(userId: string): Promise<void> {
    try {
      const batch = firestore().batch();
      
      const snapshot = await firestore()
        .collection('notifications')
        .where('userId', '==', userId)
        .where('read', '==', false)
        .get();

      snapshot.docs.forEach(doc => {
        batch.update(doc.ref, { read: true });
      });

      await batch.commit();
      console.log('✅ All notifications marked as read');
    } catch (error) {
      console.error('❌ Error marking all notifications as read:', error);
    }
  }

  // Delete old notifications (30+ days)
  async cleanupOldNotifications(userId: string): Promise<void> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const snapshot = await firestore()
        .collection('notifications')
        .where('userId', '==', userId)
        .where('createdAt', '<', thirtyDaysAgo)
        .get();

      const batch = firestore().batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      console.log(`✅ Deleted ${snapshot.size} old notifications`);
    } catch (error) {
      console.error('❌ Error cleaning up old notifications:', error);
    }
  }

  // Helper to format time ago
  formatTimeAgo(timestamp: FirebaseFirestoreTypes.Timestamp | Date): string {
    const date = timestamp instanceof Date ? timestamp : timestamp.toDate();
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  }
}

export default new InAppNotificationService();