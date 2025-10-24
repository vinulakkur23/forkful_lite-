import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  FlatList,
  ViewToken,
} from 'react-native';
import { colors, typography, spacing } from '../themes';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

type OnboardingScreenProps = {
  onComplete: () => void;
};

type OnboardingItem = {
  id: string;
  type: 'welcome' | 'screenshot';
  text: string;
  subtext?: string;
  image?: any;
};

const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const onboardingData: OnboardingItem[] = [
    {
      id: '1',
      type: 'welcome',
      text: 'Welcome to Forkful!',
      subtext: 'This app is about food. Whether that food is from a michelin star restaurant or a hole in the wall you just discovered.',
    },
    {
      id: '2',
      type: 'screenshot',
      image: require('../assets/onboarding/onboarding_screenshot_1.png'),
      text: 'Forkful is smarter and more fun way to capture the interesting things you eat',
    },
    {
      id: '3',
      type: 'screenshot',
      image: require('../assets/onboarding/onboarding_screenshot_2.png'),
      text: 'You can also use it to find dishes that YOU will personally love',
    },
  ];

  const handleNext = () => {
    if (currentIndex < onboardingData.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
    }
  };

  const handleGetStarted = async () => {
    try {
      await AsyncStorage.setItem('@onboarding_completed', 'true');
      onComplete();
    } catch (error) {
      console.error('Error saving onboarding completion:', error);
      onComplete(); // Still proceed even if storage fails
    }
  };

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const renderItem = ({ item }: { item: OnboardingItem }) => {
    if (item.type === 'welcome') {
      return (
        <View style={styles.slide}>
          <View style={styles.contentContainer}>
            {/* Logo */}
            <Image
              source={require('../assets/forkful_logos/forkful_logo_cursive2.png')}
              style={styles.logo}
              resizeMode="contain"
            />

            {/* Welcome Text */}
            <Text style={styles.welcomeText}>{item.text}</Text>

            {/* Subtext */}
            {item.subtext && (
              <Text style={styles.welcomeSubtext}>{item.subtext}</Text>
            )}
          </View>
        </View>
      );
    }

    // Screenshot type
    return (
      <View style={styles.slide}>
        <View style={styles.contentContainer}>
          {/* Screenshot - takes top 2/3 */}
          <View style={styles.screenshotContainer}>
            {item.image && (
              <Image
                source={item.image}
                style={styles.screenshot}
                resizeMode="contain"
              />
            )}
          </View>

          {/* Text - bottom 1/3 */}
          <View style={styles.textContainer}>
            <Text style={styles.descriptionText}>{item.text}</Text>
          </View>
        </View>
      </View>
    );
  };

  const isLastSlide = currentIndex === onboardingData.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={onboardingData}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        scrollEnabled={false} // Disable manual scrolling, use buttons only
      />

      {/* Pagination Dots */}
      <View style={styles.pagination}>
        {onboardingData.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index === currentIndex && styles.activeDot,
            ]}
          />
        ))}
      </View>

      {/* Button */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.button}
          onPress={isLastSlide ? handleGetStarted : handleNext}
        >
          <Text style={styles.buttonText}>
            {isLastSlide ? 'Get Started' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.lightTan,
  },
  slide: {
    width: width,
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: 0,
  },
  logo: {
    width: width * 0.6,
    height: 80,
    alignSelf: 'center',
    marginBottom: spacing.xxl,
    marginTop: spacing.xxl,
  },
  welcomeText: {
    ...typography.h2,
    fontFamily: 'Inter',
    fontWeight: 'normal',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 32,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  welcomeSubtext: {
    ...typography.body,
    fontFamily: 'Inter',
    fontWeight: 'normal',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.xl,
  },
  screenshotContainer: {
    flex: 3,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  screenshot: {
    width: 250,
    height: 250 * (1084 / 500), // Maintain 500:1084 aspect ratio
    borderRadius: spacing.borderRadius.md,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  screenshotPlaceholder: {
    width: width * 0.7,
    height: '80%',
    backgroundColor: colors.lightTan,
    borderRadius: spacing.borderRadius.lg,
    borderWidth: 2,
    borderColor: '#5B8A72',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 60,
    marginBottom: spacing.sm,
  },
  placeholderSubtext: {
    ...typography.body,
    fontFamily: 'Inter',
    color: colors.textSecondary,
  },
  textContainer: {
    justifyContent: 'flex-end',
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  descriptionText: {
    ...typography.bodyLarge,
    fontFamily: 'Inter',
    fontWeight: 'normal',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 24,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.mediumGray,
    marginHorizontal: 4,
  },
  activeDot: {
    backgroundColor: '#5B8A72', // Sage green
    width: 24,
  },
  buttonContainer: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing.xl,
  },
  button: {
    backgroundColor: '#5B8A72', // Sage green
    paddingVertical: spacing.md,
    borderRadius: spacing.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    ...typography.bodyLarge,
    fontFamily: 'Inter',
    fontWeight: '600',
    color: colors.white,
  },
});

export default OnboardingScreen;
