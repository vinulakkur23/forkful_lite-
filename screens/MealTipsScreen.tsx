import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator, Image } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../App';
import { firestore } from '../firebaseConfig';
import { colors, typography, spacing, shadows } from '../themes';
import Icon from 'react-native-vector-icons/MaterialIcons';

type MealTipsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'MealTips'>;
type MealTipsScreenRouteProp = RouteProp<RootStackParamList, 'MealTips'>;

type Props = {
  navigation: MealTipsScreenNavigationProp;
  route: MealTipsScreenRouteProp;
};

interface RatingStatement {
  title: string;
  description: string;
}

interface MealTipsData {
  dishName: string;
  ratingStatements: RatingStatement[];
  pixelArtUrl?: string;
  pixelArtLocalPath?: string;
  localPixelArtPath?: string;
}

const MealTipsScreen: React.FC<Props> = ({ route, navigation }) => {
  const { mealId, dishName } = route.params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tipsData, setTipsData] = useState<MealTipsData | null>(null);

  useEffect(() => {
    loadMealTips();
  }, [mealId]);

  const loadMealTips = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('📖 Loading meal tips for:', mealId);

      // CRITICAL: Validate mealId before querying Firestore
      if (!mealId || typeof mealId !== 'string' || mealId.trim().length === 0) {
        console.error('❌ Invalid mealId:', mealId);
        setError('Invalid meal ID');
        setLoading(false);
        return;
      }

      // CRITICAL: Wait for Firebase to be fully initialized (production fix)
      // When navigating from background notification, Firebase may not be ready
      console.log('🔥 Ensuring Firebase is initialized...');
      await new Promise(resolve => setTimeout(resolve, 100)); // Give Firebase 100ms to initialize

      const mealDoc = await firestore().collection('mealEntries').doc(mealId).get();

      if (!mealDoc.exists) {
        setError('Meal not found');
        setLoading(false);
        return;
      }

      const mealData = mealDoc.data();
      console.log('📖 Meal data loaded:', {
        hasMealData: !!mealData,
        hasRatingStatements: !!mealData?.rating_statements_result
      });

      // Extract rating statements from Firestore
      const ratingStatementsResult = mealData?.rating_statements_result;
      let statements: RatingStatement[] = [];

      if (ratingStatementsResult?.rating_statements) {
        // New format: array of strings from API
        statements = ratingStatementsResult.rating_statements.slice(0, 3).map((stmt: string, idx: number) => ({
          title: `Tip ${idx + 1}`,
          description: stmt
        }));
      }

      // Get pixel art (try multiple possible fields)
      const pixelArtUrl = mealData?.pixel_art_url || null;
      const pixelArtLocalPath = mealData?.localPixelArtPath || mealData?.pixel_art_local_path || null;

      setTipsData({
        dishName: mealData?.meal || dishName || 'Your Meal',
        ratingStatements: statements,
        pixelArtUrl,
        pixelArtLocalPath
      });

      setLoading(false);
    } catch (err: any) {
      console.error('❌ Error loading meal tips:', err);
      setError(err.message || 'Failed to load tips');
      setLoading(false);

      // Log error to Firestore for debugging
      try {
        await firestore().collection('mealEntries').doc(mealId).update({
          tips_screen_error: err.message || String(err),
          tips_screen_error_timestamp: firestore.FieldValue.serverTimestamp()
        });
      } catch (logError) {
        console.error('Failed to log tips screen error:', logError);
      }
    }
  };

  const handleRateMeal = () => {
    // Navigate to EditMealScreen to rate the meal
    navigation.navigate('EditMeal', {
      mealId,
      previousScreen: 'MealTips'
    } as any);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.warmTaupe} />
          <Text style={styles.loadingText}>Loading tips...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !tipsData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Icon name="error-outline" size={64} color={colors.error} />
          <Text style={styles.errorTitle}>Oops!</Text>
          <Text style={styles.errorText}>{error || 'Failed to load tips'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadMealTips}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { dishName: loadedDishName, ratingStatements, pixelArtUrl, pixelArtLocalPath } = tipsData;
  const pixelArtSource = pixelArtLocalPath || pixelArtUrl;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => navigation.goBack()}
          >
            <Icon name="close" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Pixel Art Emoji */}
        {pixelArtSource && (
          <View style={styles.pixelArtContainer}>
            <Image
              source={{ uri: pixelArtSource }}
              style={styles.pixelArt}
              resizeMode="contain"
            />
          </View>
        )}

        {/* Dish Name */}
        <Text style={styles.dishName}>{loadedDishName}</Text>
        <Text style={styles.subtitle}>What to Look For When Rating</Text>

        {/* Tips Cards */}
        <View style={styles.tipsContainer}>
          {ratingStatements.length > 0 ? (
            ratingStatements.map((statement, index) => (
              <View key={index} style={styles.tipCard}>
                <View style={styles.tipHeader}>
                  <View style={styles.tipNumberBadge}>
                    <Text style={styles.tipNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.tipTitle}>{statement.title}</Text>
                </View>
                <Text style={styles.tipDescription}>{statement.description}</Text>
              </View>
            ))
          ) : (
            <View style={styles.noTipsContainer}>
              <Icon name="info-outline" size={48} color={colors.textSecondary} />
              <Text style={styles.noTipsText}>No tips available for this meal yet.</Text>
            </View>
          )}
        </View>

        {/* CTA Button */}
        <TouchableOpacity
          style={styles.rateButton}
          onPress={handleRateMeal}
        >
          <Icon name="star" size={24} color="#fff" style={styles.rateButtonIcon} />
          <Text style={styles.rateButtonText}>Rate This Meal Now</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  errorTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  retryButton: {
    backgroundColor: colors.warmTaupe,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 12,
    marginTop: spacing.xl,
  },
  retryButtonText: {
    ...typography.button,
    color: '#fff',
  },
  backButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButtonText: {
    ...typography.body,
    color: colors.warmTaupe,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: colors.lightGray,
  },
  pixelArtContainer: {
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  pixelArt: {
    width: 120,
    height: 120,
  },
  dishName: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  tipsContainer: {
    paddingHorizontal: spacing.lg,
  },
  tipCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.medium,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  tipNumberBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.warmTaupe,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  tipNumberText: {
    ...typography.button,
    color: '#fff',
    fontSize: 16,
  },
  tipTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  tipDescription: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  noTipsContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
  },
  noTipsText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  rateButton: {
    backgroundColor: colors.warmTaupe,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.medium,
  },
  rateButtonIcon: {
    marginRight: spacing.sm,
  },
  rateButtonText: {
    ...typography.button,
    color: '#fff',
    fontSize: 18,
  },
});

export default MealTipsScreen;
