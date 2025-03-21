import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../App';

type EditPhotoScreenNavigationProp = StackNavigationProp<RootStackParamList, 'EditPhoto'>;
type EditPhotoScreenRouteProp = RouteProp<RootStackParamList, 'EditPhoto'>;

type Props = {
  navigation: EditPhotoScreenNavigationProp;
  route: EditPhotoScreenRouteProp;
};

const EditPhotoScreen: React.FC<Props> = ({ route, navigation }) => {
  const { photo, location } = route.params;
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [imageSource, setImageSource] = useState<{uri: string}>(photo);
  
  // Handle cases where the photo URI might be a remote URL (for simulator testing)
  useEffect(() => {
    if (photo && photo.uri) {
      setImageSource({ uri: photo.uri });
    }
  }, [photo]);
  
  const processPhoto = (): void => {
    // Simulate backend processing
    setIsProcessing(true);
    
    // For now, we'll just simulate a delay and pass the same photo
    // In a real app, you'd send the photo to your backend for processing
    setTimeout(() => {
      setIsProcessing(false);
      navigation.navigate('Rating', {
        photo: photo,
        location: location,
      });
    }, 2000);
  };
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Photo</Text>
      
      <View style={styles.imageContainer}>
        <Image
          source={imageSource}
          style={styles.image}
          resizeMode="contain"
        />
      </View>
      
      <Text style={styles.locationText}>
        {location ?
          `Location: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` :
          'Location data not available'}
      </Text>
      
      {isProcessing ? (
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color="#ff6b6b" />
          <Text style={styles.processingText}>Processing your photo...</Text>
        </View>
      ) : (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.backButton]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Retake</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.button, styles.continueButton]}
            onPress={processPhoto}
          >
            <Text style={styles.continueButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  imageContainer: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#eee',
    marginBottom: 20,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  locationText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  button: {
    paddingVertical: 15,
    borderRadius: 10,
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  backButton: {
    backgroundColor: '#e0e0e0',
  },
  continueButton: {
    backgroundColor: '#ff6b6b',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  processingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  processingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
});

export default EditPhotoScreen;
