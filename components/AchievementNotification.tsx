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
        'plant_curious': require('../assets/stamps/plant_curious.png')
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
    top: Platform.OS === 'ios' ? 60 : 40, // Increased top spacing to avoid status bar
    left: 0,
    right: 0,
    backgroundColor: '#FAF3E0', // Changed to match food card background color
    borderRadius: 12, // Match food card radius
    marginHorizontal: 16,
    marginTop: 10,
    paddingTop: 18,
    paddingBottom: 18,
    paddingLeft: 18,
    paddingRight: 50, // Extra padding on right to ensure close button has space
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 10, // Increased elevation for Android
    zIndex: 10000, // Increased z-index
    overflow: 'visible', // Ensure nothing is clipped
  },
  iconContainer: {
    width: 80, // Increased from 60
    height: 80, // Increased from 60
    borderRadius: 40,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
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
    fontSize: 14,
    fontWeight: '600',
    color: '#E63946', // Changed to Lobster red for DishItOut
    marginBottom: 3,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  achievementName: {
    fontSize: 18, // Increased from 16
    fontWeight: 'bold',
    color: '#1a2b49', // Match HomeScreen text color
    marginBottom: 5,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  description: {
    fontSize: 14, // Increased from 12
    color: '#1a2b49', // Match HomeScreen text color
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  closeButton: {
    position: 'absolute',
    top: 5,
    right: 5,
    padding: 10,
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  closeButtonX: {
    fontSize: 20,
    color: '#1a2b49',
    fontWeight: 'bold',
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
});

export default AchievementNotification;