import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';

interface TooltipStep {
  id: string;
  targetPosition: { x: number; y: number; width: number; height: number };
  message: string;
  arrowDirection?: 'up' | 'down' | 'left' | 'right'; // Made optional for center tooltips
  fontSize?: number; // Optional custom font size
}

interface TooltipOnboardingProps {
  steps: TooltipStep[];
  isVisible: boolean;
  onComplete: () => void;
  onSkip?: () => void;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const TooltipOnboarding: React.FC<TooltipOnboardingProps> = ({
  steps,
  isVisible,
  onComplete,
  onSkip,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (isVisible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isVisible, currentStepIndex]);

  if (!isVisible || steps.length === 0) {
    return null;
  }

  const currentStep = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip();
    } else {
      onComplete();
    }
  };

  const getTooltipPosition = () => {
    const { targetPosition, arrowDirection } = currentStep;
    const tooltipWidth = 280;
    const tooltipHeight = 120;
    const arrowSize = 12;
    const margin = 16;

    let x = targetPosition.x + targetPosition.width / 2 - tooltipWidth / 2;
    let y = targetPosition.y;

    // If no arrow direction, center the tooltip
    if (!arrowDirection) {
      x = screenWidth / 2 - tooltipWidth / 2;
      y = targetPosition.y + targetPosition.height / 2 - tooltipHeight / 2;
    } else {
      // Adjust position based on arrow direction
      switch (arrowDirection) {
        case 'up':
          y = targetPosition.y + targetPosition.height + arrowSize + margin;
          break;
        case 'down':
          y = targetPosition.y - tooltipHeight - arrowSize - margin;
          break;
        case 'left':
          x = targetPosition.x + targetPosition.width + arrowSize + margin;
          y = targetPosition.y + targetPosition.height / 2 - tooltipHeight / 2;
          break;
        case 'right':
          x = targetPosition.x - tooltipWidth - arrowSize - margin;
          y = targetPosition.y + targetPosition.height / 2 - tooltipHeight / 2;
          break;
      }
    }

    // Keep tooltip on screen
    x = Math.max(margin, Math.min(x, screenWidth - tooltipWidth - margin));
    y = Math.max(margin, Math.min(y, screenHeight - tooltipHeight - margin));

    return { x, y };
  };

  const getArrowPosition = () => {
    const { targetPosition, arrowDirection } = currentStep;
    
    // Return null if no arrow direction specified
    if (!arrowDirection) {
      return null;
    }
    
    const tooltipPos = getTooltipPosition();
    const arrowSize = 12;

    let arrowX = targetPosition.x + targetPosition.width / 2 - arrowSize / 2;
    let arrowY = targetPosition.y;

    switch (arrowDirection) {
      case 'up':
        arrowY = tooltipPos.y - arrowSize;
        arrowX = Math.max(tooltipPos.x + 20, Math.min(arrowX, tooltipPos.x + 260));
        break;
      case 'down':
        arrowY = tooltipPos.y + 120;
        arrowX = Math.max(tooltipPos.x + 20, Math.min(arrowX, tooltipPos.x + 260));
        break;
      case 'left':
        arrowX = tooltipPos.x - arrowSize;
        arrowY = Math.max(tooltipPos.y + 20, Math.min(arrowY, tooltipPos.y + 100));
        break;
      case 'right':
        arrowX = tooltipPos.x + 280;
        arrowY = Math.max(tooltipPos.y + 20, Math.min(arrowY, tooltipPos.y + 100));
        break;
    }

    return { arrowX, arrowY };
  };

  const tooltipPosition = getTooltipPosition();
  const arrowPosition = getArrowPosition();

  return (
    <View style={styles.overlay}>
      {/* Semi-transparent overlay */}
      <View style={styles.backdrop} />
      
      {/* Highlight cutout - only show if there's an arrow direction */}
      {currentStep.arrowDirection && (
        <View
          style={[
            styles.highlight,
            {
              left: currentStep.targetPosition.x - 4,
              top: currentStep.targetPosition.y - 4,
              width: currentStep.targetPosition.width + 8,
              height: currentStep.targetPosition.height + 8,
            },
          ]}
        />
      )}

      {/* Arrow - only show if arrow position exists */}
      {arrowPosition && currentStep.arrowDirection && (
        <Animated.View
          style={[
            styles.arrow,
            styles[`arrow${currentStep.arrowDirection.charAt(0).toUpperCase() + currentStep.arrowDirection.slice(1)}`],
            {
              left: arrowPosition.arrowX,
              top: arrowPosition.arrowY,
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        />
      )}

      {/* Tooltip */}
      <Animated.View
        style={[
          styles.tooltip,
          {
            left: tooltipPosition.x,
            top: tooltipPosition.y,
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Text style={[styles.tooltipText, currentStep.fontSize && { fontSize: currentStep.fontSize }]}>{currentStep.message}</Text>
        
        <View style={styles.tooltipActions}>
          <View style={styles.stepIndicator}>
            <Text style={styles.stepText}>
              {currentStepIndex + 1} of {steps.length}
            </Text>
          </View>
          
          <View style={styles.buttonContainer}>
            <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
              <Text style={styles.skipButtonText}>Skip</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={handleNext} style={styles.nextButton}>
              <Text style={styles.nextButtonText}>
                {isLastStep ? 'Got it!' : 'Next'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  highlight: {
    position: 'absolute',
    backgroundColor: 'rgba(26, 43, 73, 0.3)', // Blue with 30% opacity
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#1a2b49',
    shadowColor: '#1a2b49',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  tooltip: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    width: 280,
    minHeight: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 12,
  },
  tooltipText: {
    fontSize: 16,
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    lineHeight: 22,
    marginBottom: 16,
  },
  tooltipActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepIndicator: {
    flex: 1,
  },
  stepText: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  skipButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  skipButtonText: {
    fontSize: 14,
    color: '#666',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  nextButton: {
    backgroundColor: '#1a2b49',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  nextButtonText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  arrow: {
    position: 'absolute',
    width: 0,
    height: 0,
  },
  arrowUp: {
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#ffffff',
  },
  arrowDown: {
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#ffffff',
  },
  arrowLeft: {
    borderTopWidth: 12,
    borderBottomWidth: 12,
    borderRightWidth: 12,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: '#ffffff',
  },
  arrowRight: {
    borderTopWidth: 12,
    borderBottomWidth: 12,
    borderLeftWidth: 12,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#ffffff',
  },
});

export default TooltipOnboarding;