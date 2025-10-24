import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
  Image,
  Platform
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Achievement } from '../types/achievements';
// Import theme
import { colors, typography, spacing, shadows } from '../themes';

interface AchievementNotificationProps {
  achievement: Achievement;
  onDismiss: () => void;
}

const { width } = Dimensions.get('window');

const AchievementNotification: React.FC<AchievementNotificationProps> = ({ 
  achievement, 
  onDismiss 
}) => {
  const translateY = useRef(new Animated.Value(-200)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    console.log("AchievementNotification mounted for:", achievement.name);
    
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
      console.log("Achievement animation completed for:", achievement.name);
    });

    // Auto dismiss after 8 seconds (increased from 5)
    const timer = setTimeout(() => {
      console.log("Auto-dismissing achievement after timeout");
      dismiss();
    }, 8000);

    return () => {
      console.log("AchievementNotification unmounting");
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

  // Get the stamp image for the achievement
  const getStampImage = () => {
    try {
      console.log("Getting stamp image for achievement:", achievement.id);
      
      // Use require statements for bundled images - these would need to be added in advance
      const images = {
        'first_bite': require('../assets/stamps/first_bite.png'),
        'stumptown_starter': require('../assets/stamps/stumptown_starter.png'),
        'big_apple_bite': require('../assets/stamps/big_apple_bite.png'),
        'catch_of_the_day': require('../assets/stamps/catch_of_the_day.png'),
        'plant_curious': require('../assets/stamps/plant_curious.png'),
        'plantlandia': require('../assets/stamps/plantlandia.png'),
        'brew_and_chew': require('../assets/stamps/brew_and_chew.png'),
        'taco_tuesday': require('../assets/stamps/taco_tuesday.png'),
        'dreaming_of_sushi': require('../assets/stamps/dreaming_of_sushi.png'),
        'takeout_tour': require('../assets/stamps/takeout_tour.png'),
        'urban_explorer': require('../assets/stamps/urban_explorer.png'),
        'flavor_nomad': require('../assets/stamps/flavor_nomad.png'),
        'world_on_a_plate': require('../assets/stamps/word_on_a_plate.png')
      };
      
      // If we have a bundled image for this achievement, use it
      if (images[achievement.id]) {
        console.log("Found matching stamp image for:", achievement.id);
        return images[achievement.id];
      }
      
      // Otherwise fall back to a default image
      console.log("No matching stamp image found, using default");
      return require('../assets/stars/star-filled.png');
    } catch (error) {
      console.error("Error loading achievement image:", error);
      // If there's an error (e.g., image not found), fall back to default
      return require('../assets/stars/star-filled.png');
    }
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
      <View style={styles.iconContainer}>
        <Image 
          source={getStampImage()} 
          style={styles.stampImage} 
          resizeMode="contain" 
        />
      </View>
      
      <View style={styles.textContainer}>
        <Text style={styles.title}>New Achievement!</Text>
        <Text style={styles.achievementName}>{achievement.name}</Text>
        <Text style={styles.description}>{achievement.description}</Text>
      </View>

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
  stampImage: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.warmTaupe,
    marginBottom: spacing.xs,
  },
  achievementName: {
    ...typography.bodyLarge,
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
});

export default AchievementNotification;