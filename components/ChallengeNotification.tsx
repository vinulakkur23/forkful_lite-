import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
  Image,
  Platform,
  ActivityIndicator
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { UserChallenge } from '../services/userChallengesService';
import { navigate } from '../services/navigationService';
// Import theme
import { colors, typography, spacing, shadows } from '../themes';

interface ChallengeNotificationProps {
  challenge: UserChallenge;
  onDismiss: () => void;
}

const { width } = Dimensions.get('window');

const ChallengeNotification: React.FC<ChallengeNotificationProps> = ({ 
  challenge, 
  onDismiss
}) => {
  const translateY = useRef(new Animated.Value(-200)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    console.log("ChallengeNotification mounted for:", challenge.recommended_dish_name);
    
    // Slide in animation
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      })
    ]).start(() => {
      console.log("Challenge animation completed for:", challenge.recommended_dish_name);
    });

    // Auto dismiss after 8 seconds
    const timer = setTimeout(() => {
      console.log("Auto-dismissing challenge after timeout");
      dismiss();
    }, 8000);

    return () => {
      console.log("ChallengeNotification unmounting");
      clearTimeout(timer);
    };
  }, []);

  const dismiss = () => {
    // Slide out animation
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -200,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start(() => {
      onDismiss();
    });
  };

  const handleChallengePress = () => {
    console.log('🔘 Challenge notification clicked:', challenge.challenge_id);
    console.log('🔘 Challenge name:', challenge.recommended_dish_name);
    
    // Dismiss the notification first
    dismiss();
    
    // Navigate to stamps screen and open the challenge modal
    setTimeout(() => {
      console.log('🔘 Navigating to FoodPassport with challenge:', challenge.challenge_id);
      navigate('FoodPassport', { 
        openChallengeModal: challenge.challenge_id
      });
    }, 300); // Wait for dismiss animation to complete
  };

  return (
    <Animated.View 
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity
        }
      ]}
    >
      <TouchableOpacity 
        style={styles.contentContainer}
        onPress={handleChallengePress}
        activeOpacity={0.8}
      >
        <View style={styles.iconContainer}>
          {challenge.image_data ? (
            <Image 
              source={{ uri: challenge.image_data }} 
              style={styles.challengeEmojiImage} 
              resizeMode="contain" 
            />
          ) : challenge.image_status === 'pending' || challenge.image_status === 'generating' ? (
            <View style={styles.imageLoadingContainer}>
              <Icon name="restaurant" size={40} color="#ff6b6b" />
              {challenge.image_status === 'generating' && (
                <ActivityIndicator 
                  style={styles.imageLoadingIndicator} 
                  size="small" 
                  color="#ff6b6b" 
                />
              )}
            </View>
          ) : (
            <Icon name="restaurant" size={40} color="#ff6b6b" />
          )}
        </View>
        
        <View style={styles.textContainer}>
          {(challenge as any).justCompleted ? (
            <>
              <Text style={styles.completedTitle}>Challenge Complete!</Text>
              <Text style={styles.challengeName}>{challenge.recommended_dish_name}</Text>
              <Text style={styles.cheersText}>+ 5 Cheers</Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>You'd enjoy this dish next!</Text>
              <Text style={styles.challengeName}>{challenge.recommended_dish_name}</Text>
            </>
          )}
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.closeButton} onPress={dismiss}>
        <Text style={styles.closeButtonX}>×</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderRadius: spacing.borderRadius.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadows.medium,
    elevation: 10,
    zIndex: 10000,
    overflow: 'visible',
    borderWidth: 0,
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    overflow: 'hidden',
  },
  challengeEmojiImage: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: '#ff6b6b',
    marginBottom: spacing.xs,
  },
  completedTitle: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: '#ff6b6b',
    marginBottom: spacing.xs,
  },
  cheersText: {
    ...typography.bodyMedium,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  challengeName: {
    ...typography.bodyMedium,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  description: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  closeButton: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    padding: spacing.sm,
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  closeButtonX: {
    fontSize: 20,
    color: colors.textPrimary,
    fontWeight: 'bold',
    lineHeight: 20,
    textAlign: 'center',
    ...typography.bodyMedium,
  },
  imageLoadingContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageLoadingIndicator: {
    position: 'absolute',
    bottom: -5,
  },
});

export default ChallengeNotification;