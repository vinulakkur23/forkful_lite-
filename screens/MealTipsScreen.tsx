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
  const [mealData, setMealData] = useState<any>(null);

  useEffect(() => {
    loadMealTips();
  }, [mealId]);

  const loadMealTips = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('Loading meal tips for:', mealId);

      if (!mealId || typeof mealId !== 'string' || mealId.trim().length === 0) {
        console.error('Invalid mealId:', mealId);
        setError('Invalid meal ID');
        setLoading(false);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const mealDoc = await firestore().collection('mealEntries').doc(mealId).get();

      if (!mealDoc.exists) {
        setError('Meal not found');
        setLoading(false);
        return;
      }

      const loadedMealData = { id: mealDoc.id, ...mealDoc.data() };
      setMealData(loadedMealData);
      const mealData = loadedMealData;

      const ratingStatementsResult = mealData?.rating_statements_result;
      let statements: RatingStatement[] = [];

      if (ratingStatementsResult?.rating_statements) {
        statements = ratingStatementsResult.rating_statements.slice(0, 3).map((stmt: any, idx: number) => {
          if (typeof stmt === 'string') {
            return { title: `Tip ${idx + 1}`, description: stmt };
          }
          return {
            title: stmt.title || `Tip ${idx + 1}`,
            description: stmt.description || String(stmt),
          };
        });
      }

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
      console.error('Error loading meal tips:', err);
      setError(err.message || 'Failed to load tips');
      setLoading(false);
    }
  };

  const handleRateMeal = () => {
    // Navigate to RatingScreen2 like FoodPassport does for unrated camera captures
    navigation.navigate('MainTabs' as never, {
      screen: 'RatingScreen2',
      params: {
        isUnratedMeal: true,
        existingMealId: mealId,
        photo: mealData?.photoUrl ? { uri: mealData.photoUrl } : null,
        location: mealData?.location || null,
        photoSource: 'camera',
        _uniqueKey: `unrated_${mealId}_${Date.now()}`,
        rating: 0,
        thoughts: '',
        meal: mealData?.meal || '',
        restaurant: mealData?.restaurant || '',
        isEditingExisting: false,
      },
    } as never);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.textTertiary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !tipsData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackButton}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meal Tips</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Pixel Art + Dish Name */}
        <View style={styles.dishHeader}>
          {pixelArtSource && (
            <Image
              source={{ uri: pixelArtSource }}
              style={styles.pixelArt}
              resizeMode="contain"
            />
          )}
          <Text style={styles.dishName}>{loadedDishName}</Text>
          <Text style={styles.subtitle}>What to look for</Text>
        </View>

        {/* Tips */}
        <View style={styles.tipsContainer}>
          {ratingStatements.length > 0 ? (
            ratingStatements.map((statement, index) => (
              <View key={index} style={styles.tipCard}>
                <View style={styles.tipRow}>
                  <View style={styles.tipBadge}>
                    <Text style={styles.tipBadgeText}>{index + 1}</Text>
                  </View>
                  <View style={styles.tipContent}>
                    <Text style={styles.tipTitle}>{statement.title}</Text>
                    <Text style={styles.tipDescription}>{statement.description}</Text>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.noTipsContainer}>
              <Text style={styles.noTipsText}>No tips available for this meal yet.</Text>
            </View>
          )}
        </View>

        {/* Rate Button */}
        <TouchableOpacity
          style={styles.rateButton}
          onPress={handleRateMeal}
        >
          <Text style={styles.rateButtonText}>Rate This Meal</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.lightTan,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenPadding || 16,
    paddingVertical: spacing.sm || 8,
    backgroundColor: colors.lightTan,
  },
  headerBackButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  headerTitle: {
    fontFamily: 'Inter',
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontFamily: 'Inter',
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#5B8A72',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    marginTop: 20,
  },
  retryButtonText: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '600',
    color: '#5B8A72',
  },
  backButton: {
    marginTop: 12,
    paddingVertical: 8,
  },
  backButtonText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: colors.textTertiary,
  },
  dishHeader: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  pixelArt: {
    width: 80,
    height: 80,
    marginBottom: 12,
  },
  dishName: {
    fontFamily: 'Inter',
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: colors.textTertiary,
    marginTop: 4,
  },
  tipsContainer: {
    paddingHorizontal: 16,
  },
  tipCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.mediumGray,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tipBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#5B8A72',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  tipBadgeText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  tipDescription: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  noTipsContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noTipsText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  rateButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#5B8A72',
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateButtonText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '600',
    color: '#5B8A72',
  },
});

export default MealTipsScreen;
