import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

interface Props {
  visible: boolean;
  emojiUrl: string;
  // dishName and restaurantName are accepted for API compatibility with existing
  // callers but intentionally no longer rendered — the modal is a quick capture
  // moment, not a detail card.
  dishName?: string;
  restaurantName?: string;
  onClose: () => void;
}

/**
 * Celebration modal for capturing an iconic eat. Matches the sizing of the
 * generic "Thank You" modal on EditMealScreen (80% width, maxWidth 350).
 *
 * Behavior:
 *   - Bounce-in animation on the iconic pixel art when the modal opens
 *   - Success haptic on first appearance
 *   - Tap anywhere outside the card to dismiss (no explicit button)
 */
const IconicUnlockCelebration: React.FC<Props> = ({
  visible,
  emojiUrl,
  onClose,
}) => {
  const scale = useRef(new Animated.Value(0)).current;
  const hasFiredHaptic = useRef(false);

  useEffect(() => {
    if (visible) {
      scale.setValue(0);
      Animated.spring(scale, {
        toValue: 1,
        friction: 4,
        tension: 80,
        useNativeDriver: true,
      }).start();

      if (!hasFiredHaptic.current) {
        try {
          ReactNativeHapticFeedback.trigger('notificationSuccess', {
            enableVibrateFallback: true,
            ignoreAndroidSystemSettings: false,
          });
        } catch {
          // haptic is nice-to-have
        }
        hasFiredHaptic.current = true;
      }
    } else {
      hasFiredHaptic.current = false;
      scale.setValue(0);
    }
  }, [visible, scale]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={styles.card}
          activeOpacity={1}
          onPress={() => {
            // Swallow taps inside the card so the backdrop dismiss doesn't fire.
          }}
        >
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
            You captured an Iconic Eat!
          </Text>

          <Animated.View
            style={[
              styles.emojiWrap,
              {
                transform: [
                  { scale },
                  {
                    rotate: scale.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['-8deg', '0deg'],
                    }),
                  },
                ],
              },
            ]}
          >
            {emojiUrl ? (
              <Image
                source={{ uri: emojiUrl }}
                style={styles.emoji}
                resizeMode="contain"
              />
            ) : (
              <View style={[styles.emoji, styles.emojiPlaceholder]} />
            )}
          </Animated.View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 30,
    width: '80%',
    maxWidth: 350,
    alignItems: 'center',
  },
  title: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 12,
    fontFamily: 'Inter',
    textAlign: 'center',
  },
  emojiWrap: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  emoji: {
    width: 100,
    height: 100,
  },
  emojiPlaceholder: {
    backgroundColor: '#eee',
    borderRadius: 12,
  },
});

export default IconicUnlockCelebration;
