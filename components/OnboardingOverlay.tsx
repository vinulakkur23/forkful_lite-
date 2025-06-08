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
      description: "Rate your meals, discover great restaurants, and build your food passport.",
      image: require('../assets/app-logo.png'),
    },
    {
      title: "Capture & Rate",
      description: "Take photos of your meals and rate your dining experiences with emoji ratings.",
      image: require('../assets/icons/camera-active.png'),
    },
    {
      title: "Discover Nearby",
      description: "See what others are eating around you and discover new restaurants to try.",
      image: require('../assets/icons/place-active.png'),
    },
    {
      title: "Build Your Passport",
      description: "Track your culinary journey and earn stamps for your food adventures.",
      image: require('../assets/icons/passport-active.png'),
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
              <Image source={currentStepData.image} style={styles.stepImage} resizeMode="contain" />
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
    paddingBottom: 100,
  },
  imageContainer: {
    marginBottom: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepImage: {
    width: 120,
    height: 120,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a2b49',
    textAlign: 'center',
    marginBottom: 20,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  description: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  bottomSection: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  stepIndicators: {
    flexDirection: 'row',
    marginBottom: 40,
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