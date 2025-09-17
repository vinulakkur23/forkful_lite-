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
    backgroundColor: '#f8f8f8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 4,
  },
  backIcon: {
    width: 24,
    height: 24,
    tintColor: '#1a2b49',
    resizeMode: 'contain',
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a2b49',
    marginLeft: 12,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  markAllText: {
    color: '#ffc008',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    paddingVertical: 8,
  },
  emptyListContainer: {
    flex: 1,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  unreadNotification: {
    backgroundColor: '#fef9f3',
  },
  notificationLeft: {
    position: 'relative',
    marginRight: 12,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  defaultAvatar: {
    backgroundColor: '#1a2b49',
    justifyContent: 'center',
    alignItems: 'center',
  },
  defaultAvatarText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  notificationContent: {
    flex: 1,
    marginRight: 8,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  commentText: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 4,
  },
  timeAgo: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
});

export default NotificationsScreen;