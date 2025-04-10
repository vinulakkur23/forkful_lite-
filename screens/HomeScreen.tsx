import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialIcons';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { RootStackParamList } from '../App';

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

type Props = {
  navigation: HomeScreenNavigationProp;
};

interface MealEntry {
  id: string;
  photoUrl: string;
  rating: number;
  restaurant: string;
  meal: string;
  createdAt: any;
}

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const [user, setUser] = useState<any>(null);
  const [recentMeals, setRecentMeals] = useState<MealEntry[]>([]);

  useEffect(() => {
    // Check if user is logged in
    const currentUser = auth().currentUser;
    setUser(currentUser);

    // Fetch recent meals if logged in
    if (currentUser) {
      fetchRecentMeals();
    }
  }, []);

  const fetchRecentMeals = async () => {
    try {
      const userId = auth().currentUser?.uid;
      if (!userId) return;

      const querySnapshot = await firestore()
        .collection('mealEntries')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(3)
        .get();

      const meals: MealEntry[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        meals.push({
          id: doc.id,
          photoUrl: data.photoUrl,
          rating: data.rating,
          restaurant: data.restaurant || '',
          meal: data.meal || '',
          createdAt: data.createdAt?.toDate?.() || new Date()
        });
      });

      setRecentMeals(meals);
    } catch (error) {
      console.error('Error fetching recent meals:', error);
    }
  };

  const renderStars = (rating: number) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Icon
            key={star}
            name={star <= rating ? 'star' : 'star-outline'}
            size={14}
            color={star <= rating ? '#FFD700' : '#BDC3C7'}
          />
        ))}
      </View>
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>
            Welcome{user ? `, ${user.displayName?.split(' ')[0] || 'there'}` : ''}!
          </Text>
          <Text style={styles.subtitle}>Rate, enhance, and save your meals</Text>
        </View>
        {user && user.photoURL && (
          <Image
            source={{ uri: user.photoURL }}
            style={styles.profileImage}
          />
        )}
      </View>

      {/* Main Action Button */}
      <TouchableOpacity
        style={styles.mainButton}
        onPress={() => navigation.navigate('Camera')}
      >
        <Icon name="camera-alt" size={24} color="white" />
        <Text style={styles.mainButtonText}>Capture a Meal</Text>
      </TouchableOpacity>

      {/* Recent Meals Section */}
      {user && (
        <View style={styles.recentMealsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Meals</Text>
            <TouchableOpacity onPress={() => navigation.navigate('FoodPassport')}>
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>
          
          {recentMeals.length === 0 ? (
            <View style={styles.emptyMealsContainer}>
              <Icon name="restaurant" size={48} color="#ccc" />
              <Text style={styles.emptyMealsText}>No meals yet</Text>
              <Text style={styles.emptyMealsSubtext}>
                Take a photo of your meal to start building your food passport
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal={true}
              showsHorizontalScrollIndicator={false}
              style={styles.recentMealsScrollView}
            >
              {recentMeals.map((meal) => (
                <TouchableOpacity
                  key={meal.id}
                  style={styles.mealCard}
                  onPress={() => navigation.navigate('MealDetail', { mealId: meal.id })}
                >
                  <Image
                    source={{ uri: meal.photoUrl }}
                    style={styles.mealImage}
                  />
                  <View style={styles.mealCardInfo}>
                    <Text style={styles.mealName} numberOfLines={1}>
                      {meal.meal || 'Unnamed Meal'}
                    </Text>
                    <Text style={styles.restaurantName} numberOfLines={1}>
                      {meal.restaurant || 'Unknown Restaurant'}
                    </Text>
                    {renderStars(meal.rating)}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Info Cards */}
      <View style={styles.infoCardsContainer}>
        <View style={styles.infoCard}>
          <Icon name="photo-camera" size={32} color="#ff6b6b" />
          <Text style={styles.infoCardTitle}>Capture</Text>
          <Text style={styles.infoCardText}>Take a photo of your meal with our camera</Text>
        </View>
        
        <View style={styles.infoCard}>
          <Icon name="auto-fix-high" size={32} color="#ff6b6b" />
          <Text style={styles.infoCardTitle}>Enhance</Text>
          <Text style={styles.infoCardText}>Make your food look amazing with AI enhancement</Text>
        </View>
        
        <View style={styles.infoCard}>
          <Icon name="menu-book" size={32} color="#ff6b6b" />
          <Text style={styles.infoCardTitle}>Collect</Text>
          <Text style={styles.infoCardText}>Build your personal food passport collection</Text>
        </View>
      </View>

      {/* Login Prompt for Guest Users */}
      {!user && (
        <TouchableOpacity
          style={styles.loginPrompt}
          onPress={() => navigation.navigate('Login')}
        >
          <Icon name="login" size={24} color="white" />
          <Text style={styles.loginPromptText}>Sign in to save your meals</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  profileImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#eee',
  },
  mainButton: {
    backgroundColor: '#ff6b6b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  mainButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 10,
  },
  recentMealsSection: {
    marginTop: 30,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  viewAllText: {
    color: '#ff6b6b',
    fontSize: 14,
    fontWeight: '500',
  },
  recentMealsScrollView: {
    marginBottom: 20,
  },
  mealCard: {
    width: 180,
    backgroundColor: 'white',
    borderRadius: 12,
    marginRight: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  mealImage: {
    width: '100%',
    height: 120,
  },
  mealCardInfo: {
    padding: 12,
  },
  mealName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 3,
  },
  restaurantName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  starsContainer: {
    flexDirection: 'row',
  },
  emptyMealsContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyMealsText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 5,
  },
  emptyMealsSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  infoCardsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    marginVertical: 20,
  },
  infoCard: {
    width: '31%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  infoCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 5,
  },
  infoCardText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  loginPrompt: {
    backgroundColor: '#ff6b6b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginVertical: 20,
    paddingVertical: 15,
    borderRadius: 12,
  },
  loginPromptText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
});

export default HomeScreen;
