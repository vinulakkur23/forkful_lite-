import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, TextInput, FlatList, Modal, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../App';

type RatingScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Rating'>;
type RatingScreenRouteProp = RouteProp<RootStackParamList, 'Rating'>;

type Props = {
  navigation: RatingScreenNavigationProp;
  route: RatingScreenRouteProp;
};

// Restaurant type definition
interface Restaurant {
  id: string;
  name: string;
  vicinity: string;
  rating?: number;
  user_ratings_total?: number;
}

const RatingScreen: React.FC<Props> = ({ route, navigation }) => {
  const { photo, location } = route.params;
  const [rating, setRating] = useState<number>(0);
  
  // Restaurant and meal state
  const [restaurant, setRestaurant] = useState("");
  const [mealName, setMealName] = useState("");
  const [suggestedRestaurants, setSuggestedRestaurants] = useState<Restaurant[]>([]);
  const [menuItems, setMenuItems] = useState<string[]>([]);
  const [showRestaurantModal, setShowRestaurantModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  
  // API configuration - hardcoded for testing
  const HARDCODED_URL = 'https://dishitout-imageinhancer.onrender.com';
  
  const handleRating = (selectedRating: number): void => {
    setRating(selectedRating);
  };
  
  // Function to get restaurant and meal suggestions
  const getSuggestions = async () => {
    if (!location) {
      alert('Location data is required for suggestions');
      return;
    }
    
    setIsLoadingSuggestions(true);
    
    try {
      // Create form data
      const formData = new FormData();
      
      // Add the image
      const fileExtension = photo.uri.split('.').pop() || 'jpg';
      const fileName = `photo.${fileExtension}`;
      const fileType = `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`;
      
      formData.append('image', {
        uri: photo.uri,
        name: fileName,
        type: fileType,
      } as any);
      
      // Add location data
      formData.append('latitude', location.latitude.toString());
      formData.append('longitude', location.longitude.toString());
      
      console.log('Requesting meal suggestions from API');
      
      // Send to your API
      const response = await fetch(`${HARDCODED_URL}/suggest-meal`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Network response error ${response.status}: ${errorText}`);
      }
      
      const result = await response.json();
      console.log('Received suggestion response');
      
      // Update restaurant and meal suggestions
      setSuggestedRestaurants(result.restaurants || []);
      setMenuItems(result.menu_items || []);
      
      // Auto-select first suggestion if available
      if (result.restaurants?.length > 0) {
        setRestaurant(result.restaurants[0].name);
      }
      if (result.suggested_meal) {
        setMealName(result.suggested_meal);
      }
      
    } catch (error) {
      console.error('Error getting suggestions:', error);
      alert('Could not get suggestions. Please enter manually.');
    } finally {
      setIsLoadingSuggestions(false);
    }
  };
  
  const saveRating = (): void => {
    // Here you would typically save the rating and data to your backend
    // For now, we'll just navigate to the result screen
    navigation.navigate('Result', {
      photo: photo,
      location: location,
      rating: rating,
      restaurant: restaurant,
      meal: mealName
    });
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: photo.uri }}
          style={styles.image}
          resizeMode="contain"
        />
      </View>
      
      {/* Restaurant and Meal Information */}
      <View style={styles.infoSection}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Restaurant:</Text>
          <TextInput
            style={styles.infoInput}
            value={restaurant}
            onChangeText={setRestaurant}
            placeholder="Enter restaurant name"
          />
          <TouchableOpacity
            style={styles.suggestButton}
            onPress={() => setShowRestaurantModal(true)}
            disabled={suggestedRestaurants.length === 0}
          >
            <MaterialIcon name="list" size={16} color="white" />
          </TouchableOpacity>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Meal:</Text>
          <TextInput
            style={styles.infoInput}
            value={mealName}
            onChangeText={setMealName}
            placeholder="Enter meal name"
          />
          {menuItems.length > 0 && (
            <TouchableOpacity
              style={styles.suggestButton}
              onPress={() => setShowMenuModal(true)}
            >
              <MaterialIcon name="restaurant-menu" size={16} color="white" />
            </TouchableOpacity>
          )}
        </View>
        
        {!restaurant && !mealName && (
          <TouchableOpacity
            style={styles.suggestAllButton}
            onPress={getSuggestions}
            disabled={isLoadingSuggestions}
          >
            {isLoadingSuggestions ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <MaterialIcon name="restaurant" size={16} color="white" />
                <Text style={styles.suggestAllButtonText}>Auto-detect Restaurant & Meal</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
      
      <Text style={styles.title}>Rate Your Meal</Text>
      
      <View style={styles.ratingContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => handleRating(star)}
          >
            <Icon
              name={star <= rating ? 'star' : 'star-o'}
              size={40}
              color={star <= rating ? '#FFD700' : '#BDC3C7'}
              style={styles.star}
            />
          </TouchableOpacity>
        ))}
      </View>
      
      <Text style={styles.ratingText}>
        {rating > 0 ? `You've selected: ${rating} star${rating > 1 ? 's' : ''}` : 'Tap to rate'}
      </Text>
      
      <TouchableOpacity
        style={[
          styles.saveButton,
          { backgroundColor: rating > 0 ? '#ff6b6b' : '#cccccc' }
        ]}
        onPress={saveRating}
        disabled={rating === 0}
      >
        <Text style={styles.saveButtonText}>Save Rating</Text>
      </TouchableOpacity>
      
      {/* Restaurant Selection Modal */}
      <Modal
        visible={showRestaurantModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowRestaurantModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nearby Restaurants</Text>
            {suggestedRestaurants.length > 0 ? (
              <FlatList
                data={suggestedRestaurants}
                keyExtractor={(item) => item.id || item.name}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.restaurantItem}
                    onPress={() => {
                      setRestaurant(item.name);
                      setShowRestaurantModal(false);
                    }}
                  >
                    <Text style={styles.restaurantName}>{item.name}</Text>
                    <Text style={styles.restaurantAddress}>{item.vicinity}</Text>
                  </TouchableOpacity>
                )}
              />
            ) : (
              <Text style={styles.noResultsText}>No restaurants found nearby</Text>
            )}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowRestaurantModal(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {/* Menu Items Modal */}
      <Modal
        visible={showMenuModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowMenuModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Menu Items</Text>
            {menuItems.length > 0 ? (
              <FlatList
                data={menuItems}
                keyExtractor={(item, index) => `menu-${index}`}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      setMealName(item);
                      setShowMenuModal(false);
                    }}
                  >
                    <Text style={styles.menuItemText}>{item}</Text>
                  </TouchableOpacity>
                )}
              />
            ) : (
              <Text style={styles.noResultsText}>No menu items available</Text>
            )}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowMenuModal(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    padding: 20,
    alignItems: 'center',
  },
  imageContainer: {
    width: '100%',
    height: 180,  // Reduced height to make room for restaurant info
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#eee',
    marginBottom: 5,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  // Restaurant and meal info styles
  infoSection: {
    width: '100%',
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoLabel: {
    width: 100,
    fontSize: 16,
    fontWeight: '500',
  },
  infoInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    paddingHorizontal: 10,
    backgroundColor: 'white',
  },
  suggestButton: {
    marginLeft: 10,
    padding: 10,
    backgroundColor: '#777',
    borderRadius: 5,
  },
  suggestAllButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#6200ee',
    padding: 12,
    borderRadius: 5,
    marginTop: 5,
    marginBottom: 5,
  },
  suggestAllButtonText: {
    color: 'white',
    marginLeft: 8,
    fontWeight: '600',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    width: '80%',
    maxHeight: '70%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  restaurantItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  restaurantName: {
    fontSize: 16,
    fontWeight: '500',
  },
  restaurantAddress: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  menuItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  menuItemText: {
    fontSize: 16,
  },
  closeButton: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#ff6b6b',
    borderRadius: 5,
    alignItems: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  noResultsText: {
    textAlign: 'center',
    padding: 20,
    color: '#666',
  },
  // Existing styles
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  ratingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 10,
  },
  star: {
    marginHorizontal: 10,
  },
  ratingText: {
    fontSize: 18,
    color: '#666',
    marginVertical: 10,
  },
  saveButton: {
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 10,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default RatingScreen;
