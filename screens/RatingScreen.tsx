import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../App';

type RatingScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Rating'>;
type RatingScreenRouteProp = RouteProp<RootStackParamList, 'Rating'>;

type Props = {
  navigation: RatingScreenNavigationProp;
  route: RatingScreenRouteProp;
};

const RatingScreen: React.FC<Props> = ({ route, navigation }) => {
  const { photo, location } = route.params;
  const [rating, setRating] = useState<number>(0);
  
  const handleRating = (selectedRating: number): void => {
    setRating(selectedRating);
  };
  
  const saveRating = (): void => {
    // Here you would typically save the rating and data to your backend
    // For now, we'll just navigate to the result screen
    navigation.navigate('Result', {
      photo: photo,
      location: location,
      rating: rating,
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
    height: 250,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#eee',
    marginBottom: 20,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  ratingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 20,
  },
  star: {
    marginHorizontal: 10,
  },
  ratingText: {
    fontSize: 18,
    color: '#666',
    marginVertical: 20,
  },
  saveButton: {
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 20,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default RatingScreen;
