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
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import { RootStackParamList } from '../App';
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
    
    useEffect(() => {
        const user = auth().currentUser;
        
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
    }, []);
    
    const fetchMealEntries = async () => {
        try {
            setLoading(true);
            const userId = auth().currentUser?.uid;
            
            if (!userId) return;
            
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
                    createdAt: data.createdAt
                });
            });
            
            setMeals(fetchedMeals);
        } catch (error) {
            console.error('Error fetching meal entries:', error);
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
        navigation.navigate('MealDetail', { mealId: meal.id });
    };
    
    const signOut = async () => {
        try {
            await GoogleSignin.revokeAccess();
            await GoogleSignin.signOut();
            await auth().signOut();
            
            navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
            });
        } catch (error) {
            console.error('Sign out error:', error);
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
    
    // TEST FOR ACCESSING FIRESTORE V1
//    const testFirebaseStorage = async () => {
//        try {
//            console.log("Testing Firebase Storage...");
//            
//            // Create a simple text file to upload
//            const text = 'This is a test file';
//            const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64]);
//            
//            // Create a reference
//            const storageRef = storage().ref('test/simple_test_file.txt');
//            
//            // Upload text
//            console.log("Uploading test data...");
//            await storageRef.putString(text);
//            
//            console.log("Test upload successful");
//            
//            // Try to download
//            const url = await storageRef.getDownloadURL();
//            console.log("Download URL:", url);
//            
//            Alert.alert("Success", "Firebase Storage is working correctly!");
//        } catch (error) {
//            console.error("Storage test error:", error);
//            Alert.alert("Error", `Firebase Storage test failed: ${error.message}`);
//        }
//    };
    
    // TEST BUTTON END
    
// TEST FOR ACCESSING FIRESTORE V2
    const testFirebaseStorage = async () => {
      try {
        console.log("Testing basic Firebase Storage existence...");
        
        // Try to list files from the root
        const listResult = await storage().ref().listAll();
        console.log("Storage can be accessed, found items:", listResult.items.length);
        
        // Try a simpler upload method
        const randomString = Math.random().toString(36).substring(7);
        const storageRef = storage().ref(`test_${randomString}.txt`);
        
        // Upload a simpler string
        await storageRef.putString('Test content');
        console.log("Upload successful!");
        
        Alert.alert("Success", "Firebase Storage test passed!");
      } catch (error) {
        console.error("Storage test error:", error);
        Alert.alert("Error", `Firebase Storage test failed: ${error.message}`);
      }
    };

// TEST END 
    
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
            <Image
            source={userInfo?.photoURL ? { uri: userInfo.photoURL } : require('../assets/default-avatar.png')}
            style={styles.profileImage}
            />
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
            {meals.reduce((sum, meal) => sum + meal.rating, 0) / (meals.length || 1)}
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
                                                                   <Image
                                                                   source={{ uri: item.photoUrl }}
                                                                   style={styles.mealImage}
                                                                   />
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
            
            {/* New Meal Button */}
            <TouchableOpacity
            style={styles.newMealButton}
            onPress={() => navigation.navigate('Camera')}
            >
            <Icon name="add" size={24} color="white" />
            </TouchableOpacity>
            
            {/* Test Button */}
            <TouchableOpacity
            style={styles.testButton}
            onPress={testFirebaseStorage}
            >
            <Text style={styles.testButtonText}>Test Storage</Text>
            </TouchableOpacity>
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
  newMealButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ff6b6b',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  testButton: {
      position: 'absolute',
      bottom: 20,
      left: 20,
      paddingHorizontal: 15,
      paddingVertical: 10,
      borderRadius: 20,
      backgroundColor: '#3498db',
      elevation: 5,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 3,
    },
    testButtonText: {
      color: 'white',
      fontWeight: '600',
    },
});

export default FoodPassportScreen;
