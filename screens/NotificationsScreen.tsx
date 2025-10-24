import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../App';
import { auth } from '../firebaseConfig';
import inAppNotificationService, { InAppNotification } from '../services/inAppNotificationService';
import Icon from 'react-native-vector-icons/MaterialIcons';
// Import theme
import { colors, typography, spacing, shadows } from '../themes';

type NavigationProp = StackNavigationProp<RootStackParamList>;

const NotificationsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const user = auth().currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    console.log('📱 NotificationsScreen: Setting up listener for user:', user.uid);

    // Listen to notifications in real-time
    const unsubscribe = inAppNotificationService.listenToNotifications(
      user.uid,
      (notifs) => {
        console.log('📱 NotificationsScreen: Received notifications:', notifs.length);
        console.log('📱 First notification:', notifs[0]);
        setNotifications(notifs);
        setLoading(false);
        setRefreshing(false);
      }
    );

    // Cleanup old notifications on mount
    inAppNotificationService.cleanupOldNotifications(user.uid);

    return unsubscribe;
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    const user = auth().currentUser;
    if (user) {
      inAppNotificationService.getNotifications(user.uid).then((notifs) => {
        setNotifications(notifs);
        setRefreshing(false);
      });
    }
  };

  const handleNotificationPress = async (notification: InAppNotification) => {
    // Mark as read
    if (!notification.read) {
      await inAppNotificationService.markAsRead(notification.id);
    }

    // Navigate based on notification type
    if (notification.mealId) {
      console.log('📱 Navigating to meal detail from notification, mealId:', notification.mealId);
      navigation.navigate('MealDetail', {
        mealId: notification.mealId,
        previousScreen: 'Notifications'
      });
    }
  };

  const markAllAsRead = async () => {
    const user = auth().currentUser;
    if (user) {
      await inAppNotificationService.markAllAsRead(user.uid);
    }
  };


  const renderNotification = ({ item }: { item: InAppNotification }) => (
    <TouchableOpacity
      style={[styles.notificationItem, !item.read && styles.unreadNotification]}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.notificationLeft}>
        {/* User Avatar */}
        {item.fromUser.photo ? (
          <Image source={{ uri: item.fromUser.photo }} style={styles.userAvatar} />
        ) : (
          <View style={[styles.userAvatar, styles.defaultAvatar]}>
            <Text style={styles.defaultAvatarText}>
              {item.fromUser.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.notificationContent}>
        <Text style={styles.notificationMessage} numberOfLines={2}>
          {item.message}
        </Text>
        {item.commentText && (
          <Text style={styles.commentText} numberOfLines={1}>
            "{item.commentText}"
          </Text>
        )}
        <Text style={styles.timeAgo}>
          {inAppNotificationService.formatTimeAgo(item.createdAt)}
        </Text>
      </View>

      {!item.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );


  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Icon name="notifications-none" size={64} color="#ccc" />
      <Text style={styles.emptyText}>No notifications yet</Text>
      <Text style={styles.emptySubtext}>
        When someone interacts with your meals, you'll see it here
      </Text>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Image
          source={require('../assets/icons/back-icon.png')}
          style={styles.backIcon}
        />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Notifications</Text>
      {notifications.some(n => !n.read) && (
        <TouchableOpacity onPress={markAllAsRead} style={styles.markAllButton}>
          <Text style={styles.markAllText}>Mark all read</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a2b49" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id}
        contentContainerStyle={notifications.length === 0 ? styles.emptyListContainer : styles.listContainer}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#1a2b49']} />
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.lightTan,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
  },
  backButton: {
    padding: spacing.xs,
  },
  backIcon: {
    width: 24,
    height: 24,
    tintColor: colors.textPrimary,
    resizeMode: 'contain',
  },
  headerTitle: {
    flex: 1,
    ...typography.h2,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginLeft: spacing.sm,
  },
  markAllButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  markAllText: {
    color: colors.warmTaupe,
    ...typography.bodyMedium,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    paddingVertical: spacing.xs,
  },
  emptyListContainer: {
    flex: 1,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
  },
  unreadNotification: {
    backgroundColor: '#fef9f3',
  },
  notificationLeft: {
    position: 'relative',
    marginRight: spacing.sm,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  defaultAvatar: {
    backgroundColor: colors.warmTaupe,
    justifyContent: 'center',
    alignItems: 'center',
  },
  defaultAvatarText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  notificationContent: {
    flex: 1,
    marginRight: spacing.xs,
  },
  notificationMessage: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  commentText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  timeAgo: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    ...typography.bodyLarge,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  emptySubtext: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});

export default NotificationsScreen;