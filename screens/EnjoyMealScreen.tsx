import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../App';
import { colors, typography, spacing } from '../themes';
import ImageResizer from 'react-native-image-resizer';

type EnjoyMealScreenRouteProp = RouteProp<RootStackParamList, 'EnjoyMeal'>;
type EnjoyMealScreenNavigationProp = StackNavigationProp<RootStackParamList, 'EnjoyMeal'>;

type Props = {
  route: EnjoyMealScreenRouteProp;
  navigation: EnjoyMealScreenNavigationProp;
};

const { width } = Dimensions.get('window');

const EnjoyMealScreen: React.FC<Props> = ({ route, navigation }) => {
  const { photoUri } = route.params;
  const [displayUri, setDisplayUri] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Generate a small thumbnail for fast display.
  // The original camera photo can be 12MP+ which takes seconds to decode.
  // A 600px thumbnail at 80% JPEG quality takes ~50ms to generate and loads instantly.
  useEffect(() => {
    let mounted = true;

    ImageResizer.createResizedImage(
      photoUri,
      600,
      600,
      'JPEG',
      80,
      0,
      undefined,
      false,
      { mode: 'contain', onlyScaleDown: true }
    )
      .then((result) => {
        if (mounted) {
          console.log('EnjoyMealScreen: Thumbnail ready');
          setDisplayUri(result.uri);
        }
      })
      .catch((err) => {
        console.error('EnjoyMealScreen: Thumbnail generation failed, using original:', err);
        // Fall back to the original URI — it'll be slow but should still work
        if (mounted) {
          setDisplayUri(photoUri);
        }
      });

    return () => { mounted = false; };
  }, [photoUri]);

  // Slow progress bar animation (~45 seconds to fill)
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 45000,
      useNativeDriver: false,
    }).start();
  }, []);

  const goToCaptureAnother = () => {
    navigation.navigate('Camera' as never);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header Text */}
        <View style={styles.headerContainer}>
          <Text style={styles.headerText}>Enjoy your meal!</Text>

          {/* Generating Art Progress */}
          <View style={styles.generatingContainer}>
            <Text style={styles.generatingText}>Generating Custom Art</Text>
            <View style={styles.progressBarBackground}>
              <Animated.View
                style={[
                  styles.progressBarFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
            <Text style={styles.checkBackText}>
              Check back soon to see your meal art, add more photos, and rate your meal
            </Text>
          </View>
        </View>

        {/* Photo Display */}
        <View style={styles.photoContainer}>
          {imageError ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorEmoji}>📸</Text>
              <Text style={styles.errorText}>Photo is still processing</Text>
              <Text style={styles.errorSubtext}>
                Your meal has been saved — check your Food Passport!
              </Text>
            </View>
          ) : displayUri ? (
            <Image
              source={{ uri: displayUri }}
              style={styles.photo}
              resizeMode="cover"
              onError={(e) => {
                console.error('EnjoyMealScreen: Image failed to load:', e.nativeEvent.error);
                setImageError(true);
              }}
            />
          ) : (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.textSecondary || '#888'} />
            </View>
          )}
        </View>

        {/* Button */}
        <TouchableOpacity
          style={styles.passportButton}
          onPress={goToCaptureAnother}
        >
          <Text style={styles.passportButtonText}>Capture Another Dish</Text>
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
  content: {
    flex: 1,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  headerText: {
    ...typography.h1,
    fontFamily: 'Inter',
    fontWeight: 'normal',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  generatingContainer: {
    marginTop: 16,
    alignItems: 'center',
    width: '100%',
  },
  generatingText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
    color: '#5B8A72',
    marginBottom: 8,
  },
  progressBarBackground: {
    width: '70%',
    height: 6,
    backgroundColor: colors.mediumGray,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#5B8A72',
    borderRadius: 3,
  },
  checkBackText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 20,
    lineHeight: 17,
  },
  photoContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: spacing.borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  errorText: {
    ...typography.bodyLarge,
    fontFamily: 'Inter',
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSubtext: {
    ...typography.bodyMedium,
    fontFamily: 'Inter',
    color: colors.textSecondary || '#888',
    textAlign: 'center',
  },
  passportButton: {
    backgroundColor: '#5B8A72',
    paddingVertical: spacing.md,
    borderRadius: spacing.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  passportButtonText: {
    ...typography.bodyLarge,
    fontFamily: 'Inter',
    fontWeight: '600',
    color: colors.white,
  },
});

export default EnjoyMealScreen;
