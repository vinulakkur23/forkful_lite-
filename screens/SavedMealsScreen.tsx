import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  SafeAreaView
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { RootStackParamList } from '../App';
import { firebase, auth, firestore } from '../firebaseConfig';
import EmojiDisplay from '../components/EmojiDisplay';
import { FilterItem } from '../components/SimpleFilterComponent';

type SavedMealsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'FoodPassport'>;

type Props = {
  navigation: SavedMealsScreenNavigationProp;
  activeFilters: FilterItem[] | null;
  activeRatingFilters?: number[] | null;
  userId?: string;
  isOwnProfile?: boolean;
};

interface SavedMeal {
  id: string;
  mealId: string;
  photoUrl: string;
  rating: number;
  restaurant: string;
  mealName: string;
  savedAt: any;
}

const { width } = Dimensions.get('window');
const itemWidth = (width - 30) / 2; // 2 items per row with more even spacing

const SavedMealsScreen: React.FC<Props> = ({ navigation, activeFilters, activeRatingFilters, userId, isOwnProfile = true }) => {
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [filteredMeals, setFilteredMeals] = useState<SavedMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<{[key: string]: boolean}>({});

  // Calculate isOwnProfile directly to be sure
  const actualIsOwnProfile = !userId || userId === auth().currentUser?.uid;


  // Fetch saved meals when component mounts or userId changes
  useEffect(() => {
    fetchSavedMeals();
  }, [userId]);

  // Apply filter whenever saved meals or active filters change
  useEffect(() => {
    console.log('SavedMealsScreen: activeFilters or activeRatingFilters changed:', activeFilters, activeRatingFilters);
    applyFilter();
  }, [savedMeals, activeFilters, activeRatingFilters]);

  const fetchSavedMeals = async () => {
    try {
      setLoading(true);
      const targetUserId = userId || auth().currentUser?.uid;
      
      if (!targetUserId) {
        setError('User not authenticated');
        setLoading(false);
        return;
      }

      // Only show saved meals for own profile (saved meals are private)
      if (userId && userId !== auth().currentUser?.uid) {
        setSavedMeals([]);
        setLoading(false);
        return;
      }
      
      const savedMealsRef = firestore()
        .collection('users')
        .doc(targetUserId)
        .collection('savedMeals')
        .orderBy('savedAt', 'desc');
      
      const querySnapshot = await savedMealsRef.get();
      
      const fetchedMeals: SavedMeal[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedMeals.push({
          id: doc.id,
          mealId: data.mealId,
          photoUrl: data.photoUrl || '',
          rating: data.rating || 0,
          restaurant: data.restaurant || '',
          mealName: data.mealName || 'Untitled Meal',
          savedAt: data.savedAt
        });
      });

      setSavedMeals(fetchedMeals);
      
      // Reset image errors when fetching new data
      setImageErrors({});
    } catch (err: any) {
      console.error('Error fetching saved meals:', err);
      setError(`Failed to load saved meals: ${err.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchSavedMeals();
  };

  // Apply filter to meals
  const applyFilter = () => {
    if (!savedMeals.length) {
      console.log('No saved meals to filter');
      setFilteredMeals([]);
      return;
    }
    
    // If no filters are active, show all meals (but still need to check for rating filters)
    if ((!activeFilters || activeFilters.length === 0) && (!activeRatingFilters || activeRatingFilters.length === 0)) {
      console.log('No active filters, showing all saved meals');
      setFilteredMeals(savedMeals);
      return;
    }
    
    console.log(`Applying ${activeFilters?.length || 0} filters and ${activeRatingFilters?.length || 0} rating filters to saved meals`);
    
    // For now, we can't filter saved meals by metadata since we only store basic info
    // This could be enhanced later by fetching full meal details for each saved meal
    
    // For now, we'll just filter by restaurant name if that filter is present
    let result = [...savedMeals];
    
    if (activeFilters && activeFilters.length > 0) {
      activeFilters.forEach(filter => {
        if (filter.type === 'city') {
          // We don't store city in saved meals currently
          console.log('City filtering not available for saved meals');
        }
      });
    }
    
    // Apply rating filters if any are active
    if (activeRatingFilters && activeRatingFilters.length > 0) {
      console.log(`SavedMealsScreen: Applying rating filters:`, activeRatingFilters);
      const beforeRatingFilter = result.length;
      result = result.filter(meal => activeRatingFilters.includes(meal.rating));
      console.log(`SavedMealsScreen: After rating filter: ${beforeRatingFilter} meals -> ${result.length} meals remain`);
    }
    
    setFilteredMeals(result);
  };

  const viewMealDetails = (savedMeal: SavedMeal) => {
    console.log("Navigating to meal detail from saved meals with ID:", savedMeal.mealId);
    navigation.navigate('MealDetail', { 
      mealId: savedMeal.mealId, 
      previousScreen: 'FoodPassport'
    });
  };

  const handleImageError = (mealId: string) => {
    console.log(`Image load error for saved meal: ${mealId}`);
    setImageErrors(prev => ({...prev, [mealId]: true}));
  };

  // Function to render each meal item
  const renderMealItem = ({ item }: { item: SavedMeal }) => {
    const isUnrated = item.rating === 0;
    
    return (
      <TouchableOpacity 
        style={styles.mealCard}
        onPress={() => {
          if (isUnrated) {
            // Navigate to rating screen for unrated meals
            navigation.navigate('Rating', { 
              mealId: item.mealId,
              photoUrl: item.photoUrl,
              previousScreen: 'FoodPassport'
            });
          } else {
            // Navigate to meal detail for rated meals
            viewMealDetails(item);
          }
        }}
      >
        <View style={styles.imageContainer}>
          {item.photoUrl && !imageErrors[item.id] ? (
            <Image 
              source={{ uri: item.photoUrl }} 
              style={styles.mealImage}
              onError={() => handleImageError(item.id)}
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Icon name="image" size={24} color="#ddd" />
            </View>
          )}
          
          {/* Show either rating or "Rate Meal" overlay */}
          {isUnrated ? (
            <View style={styles.rateMealOverlay}>
              <Text style={styles.rateMealText}>Rate Meal</Text>
            </View>
          ) : (
            <View style={styles.ratingOverlay}>
              <EmojiDisplay rating={item.rating} size={22} />
            </View>
          )}
        </View>
        
        <View style={styles.mealCardContent}>
          <Text style={styles.mealName} numberOfLines={1}>{item.mealName}</Text>
          {item.restaurant && (
            <Text style={styles.restaurantName} numberOfLines={1}>{item.restaurant}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Render the main screen
  return (
    <SafeAreaView style={styles.container}>
      {!actualIsOwnProfile ? (
        // Show private message for other users
        <View style={styles.emptyContainer}>
          <Icon name="lock" size={64} color="#ddd" />
          <Text style={styles.emptyText}>Saved meals are private</Text>
          <Text style={styles.emptySubtext}>
            Only the user can see their saved meals
          </Text>
        </View>
      ) : loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff6b6b" />
          <Text style={styles.loadingText}>Loading your saved meals...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredMeals}
          renderItem={renderMealItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#ff6b6b']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="bookmark-border" size={64} color="#ddd" />
              {activeFilters && activeFilters.length > 0 ? (
                <>
                  <Text style={styles.emptyText}>No saved meals match your filters</Text>
                  <Text style={styles.emptySubtext}>
                    Try different filters or clear your search
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.emptyText}>No saved meals yet</Text>
                  <Text style={styles.emptySubtext}>
                    Tap the bookmark icon on meal details to save meals you love!
                  </Text>
                </>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  list: {
    padding: 10,
    paddingTop: 5, // Reduced top padding to match FoodPassportScreen
    paddingBottom: 30,
  },
  row: {
    justifyContent: 'space-between',
  },
  mealCard: {
    width: itemWidth,
    marginBottom: 15,
    backgroundColor: '#FAF3E0',
    borderRadius: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
  },
  mealImage: {
    width: '100%',
    height: itemWidth,
    backgroundColor: '#f0f0f0',
  },
  imagePlaceholder: {
    width: '100%',
    height: itemWidth,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(250, 248, 230, 0.8)', // Cream color with 80% opacity
    borderRadius: 20,
    padding: 4,
    paddingHorizontal: 5,
  },
  rateMealOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(255, 107, 107, 0.9)', // Red color with 90% opacity
    borderRadius: 15,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  rateMealText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  mealCardContent: {
    padding: 10,
  },
  mealName: {
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    fontSize: 16,
    fontWeight: 'normal',
    color: '#1a2b49',
    marginBottom: 5,
  },
  restaurantName: {
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 50,
  },
  emptyText: {
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#555',
    marginTop: 15,
  },
  emptySubtext: {
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 5,
  },
});

export default SavedMealsScreen;