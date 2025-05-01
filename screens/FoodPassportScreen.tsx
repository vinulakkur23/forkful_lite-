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
  Alert
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { RootStackParamList } from '../App';
import { getAuth } from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

type FoodPassportScreenNavigationProp = StackNavigationProp<RootStackParamList, 'FoodPassport'>;

type Props = {
  navigation: FoodPassportScreenNavigationProp;
};

interface MealEntry {
  id: string;
  photoUrl: string;
  rating: number;
  restaurant: string;
  meal: string;
  location: {
    latitude: number;
    longitude: number;
  } | null;
  createdAt: number;
}

const { width } = Dimensions.get('window');
const itemWidth = (width - 40) / 2; // 2 items per row with 10px spacing

const FoodPassportScreen: React.FC<Props> = ({ navigation }) => {
    const [meals, setMeals] = useState<MealEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [userInfo, setUserInfo] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [imageErrors, setImageErrors] = useState<{[key: string]: boolean}>({});
    
    useEffect(() => {
        // Initialize GoogleSignin
        GoogleSignin.configure({
            webClientId: '476812977799-7dmlpm8g3plslrsftesst7op6ipm71a4.apps.googleusercontent.com',
            iosClientId: '476812977799-vutvsmj3dit2ov9ko1sgp4p2p0u57kh4.apps.googleusercontent.com',
            offlineAccess: true,
        });
        
        // Get current user
        try {
            const auth = getAuth();
            const user = auth.currentUser;
            
            if (user) {
                setUserInfo({
                    displayName: user.displayName,
                    email: user.email,
                    photoURL: user.photoURL,
                    uid: user.uid
                });
                fetchMealEntries();
            } else {
                // If no user, redirect to login
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'Login' }],
                });
            }
        } catch (err: any) {
            console.error('Error in useEffect:', err);
            setError(`Failed to initialize: ${err.message}`);
            setLoading(false);
        }
    }, []);
    
    const fetchMealEntries = async () => {
        try {
            setLoading(true);
            const auth = getAuth();
            const userId = auth.currentUser?.uid;
            
            if (!userId) {
                setError('User not authenticated');
                setLoading(false);
                return;
            }
            
            const querySnapshot = await firestore()
                .collection('mealEntries')
                .where('userId', '==', userId)
                .orderBy('createdAt', 'desc')
                .get();
            
            const fetchedMeals: MealEntry[] = [];
            
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                fetchedMeals.push({
                    id: doc.id,
                    photoUrl: data.photoUrl,
                    rating: data.rating,
                    restaurant: data.restaurant || '',
                    meal: data.meal || '',
                    location: data.location,
                    createdAt: data.createdAt?.toDate?.() || Date.now()
                });
            });
            
            setMeals(fetchedMeals);
            // Reset image errors when fetching new data
            setImageErrors({});
        } catch (err: any) {
            console.error('Error fetching meal entries:', err);
            setError(`Failed to load meals: ${err.message}`);
            Alert.alert('Error', 'Failed to load your food passport entries');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };
    
    const handleRefresh = () => {
        setRefreshing(true);
        fetchMealEntries();
    };
    
    const viewMealDetails = (meal: MealEntry) => {
        console.log("Navigating to meal detail with ID:", meal.id);
        navigation.navigate('MealDetail', { mealId: meal.id });
    };
    
    const handleImageError = (mealId: string) => {
        console.log(`Image load error for meal: ${mealId}`);
        setImageErrors(prev => ({...prev, [mealId]: true}));
    };
    
    const signOut = async () => {
        try {
            console.log("Starting sign out process");
            
            // First sign out from Google
            try {
                await GoogleSignin.signOut();
                console.log("Google sign out successful");
            } catch (googleError) {
                console.error('Google Sign out error:', googleError);
                // Continue with Firebase sign out even if Google fails
            }
            
            // Then sign out from Firebase
            const auth = getAuth();
            await auth.signOut();
            console.log("Firebase sign out successful");
            
            // Navigate to Login screen
            navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
            });
            console.log("Navigation to Login complete");
        } catch (err: any) {
            console.error('Sign out error:', err);
            Alert.alert('Error', `Failed to sign out: ${err.message}`);
        }
    };
    
    const confirmSignOut = () => {
        Alert.alert(
            'Sign Out',
            'Are you sure you want to sign out?',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign Out', onPress: signOut }
            ],
            { cancelable: true }
        );
    };
    
    // Error state
    if (error) {
        return (
            <View style={[styles.container, styles.centerContent]}>
                <Icon name="error" size={64} color="#ff6b6b" />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                    style={styles.retryButton}
                    onPress={() => {
                        setError(null);
                        setLoading(true);
                        fetchMealEntries();
                    }}
                >
                    <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }
    
    // Loading state
    if (loading && !refreshing) {
        return (
            <View style={[styles.container, styles.loadingContainer]}>
                <ActivityIndicator size="large" color="#ff6b6b" />
            </View>
        );
    }
    
    return (
        <View style={styles.container}>
            {/* User Profile Section */}
            <View style={styles.profileContainer}>
                {userInfo?.photoURL && !imageErrors['profile'] ? (
                    <Image
                        source={{ uri: userInfo.photoURL }}
                        style={styles.profileImage}
                        onError={() => setImageErrors(prev => ({...prev, profile: true}))}
                    />
                ) : (
                    <View style={[styles.profileImage, styles.profileImagePlaceholder]}>
                        <Icon name="person" size={32} color="#fff" />
                    </View>
                )}
                
                <View style={styles.profileInfo}>
                    <Text style={styles.profileName}>{userInfo?.displayName || 'Food Lover'}</Text>
                    <Text style={styles.profileEmail}>{userInfo?.email}</Text>
                    <View style={styles.statsContainer}>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{meals.length}</Text>
                            <Text style={styles.statLabel}>Meals</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>
                                {meals.length > 0 ? (meals.reduce((sum, meal) => sum + meal.rating, 0) / meals.length).toFixed(1) : '0.0'}
                            </Text>
                            <Text style={styles.statLabel}>Avg Rating</Text>
                        </View>
                    </View>
                </View>
                <TouchableOpacity style={styles.logoutButton} onPress={confirmSignOut}>
                    <Icon name="logout" size={24} color="#666" />
                </TouchableOpacity>
            </View>
            
            {/* Meals Gallery Section */}
            <View style={styles.galleryContainer}>
                <Text style={styles.galleryTitle}>My Food Passport</Text>
                
                {meals.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Icon name="no-food" size={64} color="#ccc" />
                        <Text style={styles.emptyText}>No meal entries yet</Text>
                        <TouchableOpacity
                            style={styles.addMealButton}
                            onPress={() => navigation.navigate('Camera')}
                        >
                            <Text style={styles.addMealButtonText}>Add Your First Meal</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <FlatList
                        data={meals}
                        keyExtractor={(item) => item.id}
                        numColumns={2}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={styles.mealItem}
                                onPress={() => viewMealDetails(item)}
                            >
                                {item.photoUrl && !imageErrors[item.id] ? (
                                    <Image
                                        source={{ uri: item.photoUrl }}
                                        style={styles.mealImage}
                                        onError={() => handleImageError(item.id)}
                                    />
                                ) : (
                                    <View style={[styles.mealImage, styles.noImageContainer]}>
                                        <Icon name="no-food" size={24} color="#ccc" />
                                    </View>
                                )}
                                <View style={styles.mealInfo}>
                                    <Text style={styles.mealName} numberOfLines={1}>{item.meal || 'Unknown Meal'}</Text>
                                    <View style={styles.mealRating}>
                                        <Text style={styles.mealRatingText}>{item.rating}</Text>
                                        <Icon name="star" size={12} color="#FFD700" />
                                    </View>
                                </View>
                            </TouchableOpacity>
                        )}
                        contentContainerStyle={styles.gallery}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={handleRefresh}
                                colors={['#ff6b6b']}
                            />
                        }
                    />
                )}
            </View>
        </View>
    );
};
  

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#ff6b6b',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  profileContainer: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    alignItems: 'center',
  },
  profileImage: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#eee',
  },
  profileImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ccc',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 15,
  },
  profileName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  profileEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  statsContainer: {
    flexDirection: 'row',
    marginTop: 5,
  },
  statItem: {
    marginRight: 20,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ff6b6b',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  logoutButton: {
    padding: 8,
  },
  galleryContainer: {
    flex: 1,
    padding: 15,
  },
  galleryTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  gallery: {
    paddingBottom: 20,
  },
  mealItem: {
    width: itemWidth,
    margin: 5,
    borderRadius: 10,
    backgroundColor: 'white',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  mealImage: {
    width: '100%',
    height: itemWidth,
  },
  noImageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f2f2f2',
  },
  mealInfo: {
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mealName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  mealRating: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2f2f2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  mealRatingText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginRight: 3,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginVertical: 10,
  },
  addMealButton: {
    backgroundColor: '#ff6b6b',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    marginTop: 15,
  },
  addMealButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});

export default FoodPassportScreen;
