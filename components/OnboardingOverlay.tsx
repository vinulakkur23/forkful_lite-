import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  Image,
  SafeAreaView,
} from 'react-native';

const { width, height } = Dimensions.get('window');

interface OnboardingOverlayProps {
  visible: boolean;
  onComplete: () => void;
}

const OnboardingOverlay: React.FC<OnboardingOverlayProps> = ({ visible, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const onboardingSteps = [
    {
      title: "Welcome to DishItOut!",
      description: "It's Instagram meets Yelp. Kind of.\nThis one is focused on MEALS.",
      type: 'welcome',
      image: require('../assets/forkful_logos/forkful_logo_cursive2.png'),
    },
    {
      title: "Share your food journey.",
      description: "Send your favorite dishes in Paris to your pals.\n\nUnleash your inner food critic - your hot take on the best burger in town.",
      type: 'triple',
      image1: require('../assets/onboarding/step2a-screenshot.png'),
      image2: require('../assets/onboarding/step2b-screenshot.png'),
      image3: require('../assets/onboarding/step2c-screenshot.png'),
    },
    {
      title: "Find meals you'll love.",
      description: "Follow friends or well-known foodies.\n\nFind wings you're craving now, or wishlist pastas in Rome for this summer.",
      type: 'dual',
      image1: require('../assets/onboarding/step3a-screenshot.png'),
      image2: require('../assets/onboarding/step3b-screenshot.png'),
    },
  ];

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const currentStepData = onboardingSteps[currentStep];

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          {/* Skip button */}
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>

          {/* Main content */}
          <View style={styles.mainContent}>
            <View style={styles.imageContainer}>
              {currentStepData.type === 'welcome' ? (
                <Text style={styles.welcomeLogo}>DishItOut</Text>
              ) : currentStepData.type === 'triple' ? (
                <View style={styles.tripleImageContainer}>
                  <Image source={currentStepData.image1} style={[styles.stepImageSmall, styles.tripleImage1]} resizeMode="cover" />
                  <Image source={currentStepData.image2} style={[styles.stepImageSmall, styles.tripleImage2]} resizeMode="cover" />
                  <Image source={currentStepData.image3} style={[styles.stepImageSmall, styles.tripleImage3]} resizeMode="cover" />
                </View>
              ) : (
                <View style={styles.dualImageContainer}>
                  <Image source={currentStepData.image1} style={[styles.stepImage, styles.image1]} resizeMode="cover" />
                  <Image source={currentStepData.image2} style={[styles.stepImage, styles.image2]} resizeMode="cover" />
                </View>
              )}
            </View>
            
            <Text style={styles.title}>{currentStepData.title}</Text>
            <Text style={styles.description}>{currentStepData.description}</Text>
          </View>

          {/* Bottom section */}
          <View style={styles.bottomSection}>
            {/* Step indicators */}
            <View style={styles.stepIndicators}>
              {onboardingSteps.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.stepIndicator,
                    index === currentStep && styles.activeStepIndicator,
                  ]}
                />
              ))}
            </View>

            {/* Next/Get Started button */}
            <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
              <Text style={styles.nextButtonText}>
                {currentStep < onboardingSteps.length - 1 ? 'Next' : 'Get Started'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 30,
    paddingVertical: 20,
  },
  skipButton: {
    alignSelf: 'flex-end',
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  skipText: {
    fontSize: 16,
    color: '#666666',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  mainContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 20,
  },
  imageContainer: {
    marginBottom: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeLogo: {
    fontFamily: 'Lobster-Regular',
    fontSize: 64,
    color: '#E63946',
    marginBottom: 20,
  },
  dualImageContainer: {
    width: 360,
    height: 400,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepImage: {
    width: 200,
    height: 400,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  image1: {
    position: 'absolute',
    top: 0,
    left: 15,
    zIndex: 2,
    transform: [{ rotate: '-5deg' }],
  },
  image2: {
    position: 'absolute',
    top: 20,
    right: 15,
    zIndex: 1,
    transform: [{ rotate: '5deg' }],
  },
  tripleImageContainer: {
    width: 360,
    height: 380,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepImageSmall: {
    width: 165,
    height: 330,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  tripleImage1: {
    position: 'absolute',
    top: 0,
    left: 10,
    zIndex: 3,
    transform: [{ rotate: '-8deg' }],
  },
  tripleImage2: {
    position: 'absolute',
    top: 40,
    left: 105,
    zIndex: 2,
    transform: [{ rotate: '0deg' }],
  },
  tripleImage3: {
    position: 'absolute',
    top: 5,
    right: 10,
    zIndex: 1,
    transform: [{ rotate: '8deg' }],
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a2b49',
    textAlign: 'center',
    marginBottom: 10,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  description: {
    fontSize: 14,
    color: '#1a2b49',
    textAlign: 'left',
    lineHeight: 22,
    paddingHorizontal: 40,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  bottomSection: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  stepIndicators: {
    flexDirection: 'row',
    marginBottom: 25,
    marginTop: 15,
  },
  stepIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 4,
  },
  activeStepIndicator: {
    backgroundColor: '#ffc008',
  },
  nextButton: {
    backgroundColor: '#ffc008',
    paddingVertical: 15,
    paddingHorizontal: 60,
    borderRadius: 25,
    minWidth: 200,
    alignItems: 'center',
  },
  nextButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
});

export default OnboardingOverlay;