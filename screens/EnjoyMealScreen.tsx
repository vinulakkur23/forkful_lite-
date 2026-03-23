import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  ActivityIndicator,
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

  const goToFoodPassport = () => {
    navigation.navigate('FoodPassport', { tabIndex: 0 });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header Text */}
        <View style={styles.headerContainer}>
          <Text style={styles.headerText}>Enjoy your meal!</Text>
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
          onPress={goToFoodPassport}
        >
          <Text style={styles.passportButtonText}>Food Passport</Text>
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
