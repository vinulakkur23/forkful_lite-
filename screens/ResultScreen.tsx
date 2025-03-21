import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Share } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../App';

type ResultScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Result'>;
type ResultScreenRouteProp = RouteProp<RootStackParamList, 'Result'>;

type Props = {
  navigation: ResultScreenNavigationProp;
  route: ResultScreenRouteProp;
};

const ResultScreen: React.FC<Props> = ({ route, navigation }) => {
  const { photo, location, rating } = route.params;
  
  const handleShare = async (): Promise<void> => {
    try {
      await Share.share({
        message: `I rated my meal ${rating} stars at location: ${location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : 'unknown location'}!`,
        url: photo.uri
      });
    } catch (error) {
      console.log('Sharing error:', error);
    }
  };
  
  const goHome = (): void => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  };
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Rating Has Been Saved!</Text>
      
      <View style={styles.resultCard}>
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: photo.uri }}
            style={styles.image}
            resizeMode="cover"
          />
        </View>
        
        <View style={styles.infoContainer}>
          <View style={styles.ratingContainer}>
            <Text style={styles.ratingLabel}>Your Rating:</Text>
            <View style={styles.starsContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Icon
                  key={star}
                  name={star <= rating ? 'star' : 'star-o'}
                  size={20}
                  color={star <= rating ? '#FFD700' : '#BDC3C7'}
                  style={styles.star}
                />
              ))}
            </View>
          </View>
          
          <View style={styles.locationContainer}>
            <Text style={styles.locationLabel}>Location:</Text>
            <Text style={styles.locationText}>
              {location ?
                `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` :
                'Location data not available'}
            </Text>
          </View>
        </View>
      </View>
      
      <View style={styles.buttonsContainer}>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Icon name="share-alt" size={20} color="white" />
          <Text style={styles.buttonText}>Share</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.homeButton} onPress={goHome}>
          <Icon name="home" size={20} color="white" />
          <Text style={styles.buttonText}>New Rating</Text>
        </TouchableOpacity>
      </View>
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginVertical: 20,
    textAlign: 'center',
  },
  resultCard: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 15,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageContainer: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#eee',
    marginBottom: 15,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  infoContainer: {
    marginBottom: 10,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 10,
  },
  starsContainer: {
    flexDirection: 'row',
  },
  star: {
    marginRight: 5,
  },
  locationContainer: {
    marginBottom: 10,
  },
  locationLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  locationText: {
    fontSize: 14,
    color: '#666',
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 30,
  },
  shareButton: {
    backgroundColor: '#3498db',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    flex: 1,
    marginRight: 10,
  },
  homeButton: {
    backgroundColor: '#ff6b6b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    flex: 1,
    marginLeft: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
});

export default ResultScreen;
