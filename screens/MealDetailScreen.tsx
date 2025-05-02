import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ActivityIndicator, ScrollView, Alert, Share } from 'react-native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import { RootStackParamList, TabParamList } from '../App';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import { getAuth } from '@react-native-firebase/auth';

// Update the navigation prop type to use composite navigation
type MealDetailScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'MealDetail'>,
  StackNavigationProp<RootStackParamList>
>;

type MealDetailScreenRouteProp = RouteProp<TabParamList, 'MealDetail'>;

type Props = {
  navigation: MealDetailScreenNavigationProp;
  route: MealDetailScreenRouteProp;
};

const MealDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  // Extract the mealId from route params
  const { mealId } = route.params;
  
  // State to hold the meal data once loaded
  const [meal, setMeal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  
  // Log the route params for debugging
  console.log("MealDetail Route params:", route.params);
  console.log("Meal ID:", mealId);
  
  // Fetch the meal data when the component mounts
  useEffect(() => {
    const fetchMealDetails = async () => {
      try {
        setLoading(true);
        
        if (!mealId) {
          setError('No meal ID provided');
          setLoading(false);
          return;
        }
        
        // Get the meal document from Firestore
        console.log("Fetching meal document with ID:", mealId);
        const mealDoc = await firestore().collection('mealEntries').doc(mealId).get();
        
        if (!mealDoc.exists) {
          console.log("Meal document not found");
          setError('Meal not found');
          setLoading(false);
          return;
        }
        
        const mealData = mealDoc.data();
        console.log("Meal data retrieved:", mealData ? "Data exists" : "No data");
        
        setMeal(mealData);
      } catch (err) {
        console.error('Error fetching meal details:', err);
        setError('Failed to load meal details');
      } finally {
        setLoading(false);
      }
    };
    
    fetchMealDetails();
  }, [mealId]);
  
  // Handle image load error
  const handleImageError = () => {
    console.log('Failed to load image in MealDetailScreen');
    setImageError(true);
  };
    
  const handleDeleteMeal = () => {
    // Show confirmation dialog first
    Alert.alert(
      "Delete Entry",
      "Are you sure you want to delete this meal from your Food Passport?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: deleteMealEntry
        }
      ]
    );
  };

  // Handle delete meal
  const deleteMealEntry = async () => {
    try {
      // Start loading state
      setLoading(true);

      // Check if user is owner of this meal entry
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user || !meal || user.uid !== meal.userId) {
        Alert.alert("Error", "You don't have permission to delete this entry");
        setLoading(false);
        return;
      }

      // First, if there's a photo URL, delete the image from Firebase Storage
      if (meal.photoUrl) {
        try {
          // Extract the file path from the URL
          const storageRef = storage().refFromURL(meal.photoUrl);
          await storageRef.delete();
          console.log('Image deleted from storage');
        } catch (storageError) {
          console.error('Error deleting image:', storageError);
          // Continue with deleting the record even if image deletion fails
        }
      }

      // Delete the record from Firestore
      await firestore().collection('mealEntries').doc(mealId).delete();
      console.log('Meal entry deleted from Firestore');

      // Navigate back to the Food Passport with a success message
      Alert.alert(
        "Deleted",
        "The meal has been removed from your Food Passport",
        [
          {
            text: "OK",
            onPress: () => navigation.navigate('FoodPassport')
          }
        ]
      );
    } catch (error) {
      console.error('Error deleting meal:', error);
      Alert.alert('Error', 'Failed to delete meal entry');
      setLoading(false);
    }
  };
  
  // Share the meal
  const handleShare = async () => {
    try {
      await Share.share({
        message: `I rated ${meal.meal || 'my meal'} ${meal.rating} stars${meal.restaurant ? ` at ${meal.restaurant}` : ''}!`,
        url: meal.photoUrl
      });
    } catch (error) {
      console.log('Sharing error:', error);
    }
  };
  
  // Navigate back
  const goBack = () => {
    navigation.goBack();
  };
  
  // Show loading state
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff6b6b" />
        <Text style={styles.loadingText}>Loading meal details...</Text>
      </View>
    );
  }
  
  // Show error state
  if (error || !meal) {
    return (
      <View style={styles.errorContainer}>
        <Icon name="error" size={64} color="#ff6b6b" />
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorMessage}>{error || 'Failed to load meal'}</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goBack}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  // Format date
  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown date';
    
    try {
      // Firestore timestamp to JS Date
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (err) {
      console.error("Date formatting error:", err);
      return 'Unknown date';
    }
  };
  
  return (
    <ScrollView style={styles.container}>
      {/* Meal image */}
      <View style={styles.imageContainer}>
        {meal.photoUrl && !imageError ? (
          <Image
            source={{ uri: meal.photoUrl }}
            style={styles.image}
            resizeMode="cover"
            onError={handleImageError}
          />
        ) : (
          <View style={styles.noImageContainer}>
            <Icon name="no-photography" size={64} color="#ccc" />
            <Text style={styles.noImageText}>No image available</Text>
          </View>
        )}
      </View>
      
      {/* Meal details */}
      <View style={styles.detailsContainer}>
        <Text style={styles.mealName}>{meal.meal || 'Untitled Meal'}</Text>
        
        {meal.restaurant && (
          <View style={styles.infoRow}>
            <Icon name="restaurant" size={18} color="#666" />
            <Text style={styles.restaurantName}>{meal.restaurant}</Text>
          </View>
        )}
        
        <View style={styles.ratingContainer}>
          <Text style={styles.ratingLabel}>Rating:</Text>
          <View style={styles.starsContainer}>
            {[1, 2, 3, 4, 5].map((star) => (
              <FontAwesome
                key={star}
                name={star <= meal.rating ? 'star' : 'star-o'}
                size={18}
                color={star <= meal.rating ? '#FFD700' : '#BDC3C7'}
                style={styles.star}
              />
            ))}
          </View>
        </View>
        
        {meal.location && (
          <View style={styles.locationContainer}>
            <Icon name="place" size={18} color="#666" />
            <Text style={styles.locationText}>
              {`${meal.location.latitude.toFixed(4)}, ${meal.location.longitude.toFixed(4)}`}
            </Text>
          </View>
        )}
        
        <Text style={styles.dateText}>
          {formatDate(meal.createdAt)}
        </Text>
      </View>
      
      {/* Action buttons */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShare}
        >
          <Icon name="share" size={18} color="white" />
          <Text style={styles.buttonText}>Share</Text>
        </TouchableOpacity>
        
        {/* Only show delete button if the user is the owner */}
        {meal.userId === getAuth().currentUser?.uid && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDeleteMeal}
          >
            <Icon name="delete" size={18} color="white" />
            <Text style={styles.buttonText}>Delete</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          style={styles.backButton}
          onPress={goBack}
        >
          <Icon name="arrow-back" size={18} color="white" />
          <Text style={styles.buttonText}>Back</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f8f8',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ff6b6b',
    marginTop: 10,
    marginBottom: 10,
  },
  errorMessage: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 30,
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#ff6b6b',
    borderRadius: 5,
  },
  backButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  imageContainer: {
    width: '100%',
    height: 300,
    backgroundColor: '#eee',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  noImageContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  noImageText: {
    marginTop: 10,
    color: '#999',
    fontSize: 16,
  },
  detailsContainer: {
    padding: 20,
    backgroundColor: 'white',
    margin: 10,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  mealName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  restaurantName: {
    fontSize: 16,
    marginLeft: 8,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  ratingLabel: {
    fontSize: 16,
    marginRight: 10,
  },
  starsContainer: {
    flexDirection: 'row',
  },
  star: {
    marginRight: 5,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  locationText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  dateText: {
    fontSize: 14,
    color: '#999',
    marginTop: 10,
    textAlign: 'right',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3498db',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  buttonText: {
    color: 'white',
    marginLeft: 8,
    fontWeight: '600',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff6b6b',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e74c3c',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
});

export default MealDetailScreen;
