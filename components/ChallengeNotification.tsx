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
        <Text style={styles.title}>New Challenge!</Text>
        <Text style={styles.challengeName}>{challenge.recommended_dish_name}</Text>
        <Text style={styles.description}>Try this {challenge.cuisine_type} dish next</Text>
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
    backgroundColor: '#f0f8ff', // Light blue background like challenge cards
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 10,
    paddingTop: 18,
    paddingBottom: 18,
    paddingLeft: 18,
    paddingRight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 10,
    zIndex: 10000,
    overflow: 'visible',
    borderWidth: 2,
    borderColor: '#e0e7ff',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
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
    fontSize: 14,
    fontWeight: '600',
    color: '#ff6b6b',
    marginBottom: 3,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  challengeName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a2b49',
    marginBottom: 5,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  description: {
    fontSize: 14,
    color: '#1a2b49',
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