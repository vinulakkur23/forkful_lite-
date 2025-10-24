import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { auth } from '../firebaseConfig';
import Icon from 'react-native-vector-icons/MaterialIcons';
// Import theme
import { colors, typography, spacing, shadows } from '../themes';

interface ProfileCardProps {
  userProfile: {
    userId: string;
    displayName: string;
    photoURL: string | null;
  } | null;
  profileStats: {
    totalMeals?: number;
    averageRating?: number;
    badgeCount?: number;
    followersCount?: number;
    totalCheers?: number;
  };
  isOwnProfile: boolean;
  onSignOut?: () => void;
  onFollowToggle?: () => void;
  isFollowing?: boolean;
  followLoading?: boolean;
  // Notification props
  unreadCount?: number;
  onNotificationPress?: () => void;
}

const ProfileCard: React.FC<ProfileCardProps> = ({
  userProfile,
  profileStats,
  isOwnProfile,
  onSignOut,
  onFollowToggle,
  isFollowing,
  followLoading,
  unreadCount,
  onNotificationPress,
}) => {
  const renderAvatar = () => {
    if (userProfile?.photoURL) {
      return (
        <Image 
          source={{ uri: userProfile.photoURL }} 
          style={styles.profileImage}
        />
      );
    } else {
      return (
        <View style={styles.placeholderImage}>
          <Text style={styles.placeholderText}>
            {userProfile?.displayName?.charAt(0).toUpperCase() || '?'}
          </Text>
        </View>
      );
    }
  };

  const formatRating = (rating: number | undefined): string => {
    if (!rating || rating === 0) return '0.0';
    return rating.toFixed(1);
  };

  return (
    <View style={styles.profileCard}>
      <View style={styles.profileRow}>        
        {renderAvatar()}
        
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>
            {userProfile?.displayName || 'User'}
          </Text>
          <View style={styles.statsRow}>
            <Text style={styles.statText}>{profileStats.followersCount || 0} followers</Text>
            <Text style={styles.statSeparator}>•</Text>
            <Text style={styles.statText}>{profileStats.totalCheers || 0} cheers</Text>
          </View>
        </View>

        <View style={styles.rightSideContainer}>
          {isOwnProfile ? (
            <>
              {/* Notification Bell - only show for own profile */}
              {onNotificationPress && (
                <TouchableOpacity 
                  onPress={onNotificationPress} 
                  style={styles.notificationButton}
                >
                  <Image 
                    source={require('../assets/icons/notification-bell.png')} 
                    style={styles.notificationIcon}
                    resizeMode="contain"
                  />
                  {unreadCount && unreadCount > 0 && (
                    <View style={styles.notificationBadge}>
                      <Text style={styles.notificationBadgeText}>
                        {unreadCount > 99 ? '99+' : unreadCount.toString()}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
              
              {/* Sign Out Button */}
              {onSignOut && (
                <TouchableOpacity 
                  onPress={onSignOut} 
                  style={styles.signOutButton}
                >
                  <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            onFollowToggle && (
              <TouchableOpacity 
                style={[styles.followButton, isFollowing && styles.followButtonActive]}
                onPress={onFollowToggle}
                disabled={followLoading}
              >
                <Text style={[styles.followButtonIcon, isFollowing && styles.followButtonIconActive]}>
                  {followLoading ? '...' : isFollowing ? '✓' : '+'}
                </Text>
              </TouchableOpacity>
            )
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  profileCard: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: spacing.sm,
  },
  placeholderImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.warmTaupe,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  placeholderText: {
    color: colors.white,
    ...typography.bodyMedium,
    fontWeight: 'bold',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'normal',
    color: colors.textPrimary,
    fontFamily: 'Unna',
    marginBottom: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  statSeparator: {
    ...typography.bodySmall,
    color: colors.mediumGray,
    marginHorizontal: spacing.xs,
  },
  signOutButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 8,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.textTertiary,
  },
  signOutText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  followButton: {
    width: 28,
    height: 28,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.warmTaupe,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  followButtonActive: {
    backgroundColor: colors.warmTaupe,
  },
  followButtonIcon: {
    color: colors.warmTaupe,
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 16,
  },
  followButtonIconActive: {
    color: colors.white,
  },
  rightSideContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  notificationButton: {
    padding: spacing.xs,
    position: 'relative',
  },
  notificationIcon: {
    width: 20,
    height: 20,
  },
  notificationBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  notificationBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: 'bold',
    ...typography.bodySmall,
    lineHeight: 12,
  },
});

export default ProfileCard;