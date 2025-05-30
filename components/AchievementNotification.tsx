import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
  Image
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
    ]).start();

    // Auto dismiss after 5 seconds
    const timer = setTimeout(() => {
      dismiss();
    }, 5000);

    return () => clearTimeout(timer);
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
    // Use require statements for bundled images - these would need to be added in advance
    const images = {
      'first_bite': require('../assets/stamps/first_bite.png'),
      'stumptown_starter': require('../assets/stamps/stumptown_starter.png'),
      'big_apple_bite': require('../assets/stamps/big_apple_bite.png')
    };
    
    // If we have a bundled image for this achievement, use it
    if (images[achievement.id]) {
      return images[achievement.id];
    }
    
    // Otherwise fall back to a default image
    return require('../assets/stars/star-filled.png');
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
        <Icon name="close" size={20} color="#999" />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderRadius: 10,
    marginHorizontal: 10,
    marginTop: 10,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
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
    color: '#ff6b6b',
    marginBottom: 3,
  },
  achievementName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  description: {
    fontSize: 12,
    color: '#666',
  },
  closeButton: {
    padding: 5,
  },
});

export default AchievementNotification;