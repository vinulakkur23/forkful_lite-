import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../App';

type CameraScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Camera'>;

type Props = {
  navigation: CameraScreenNavigationProp;
};

const CameraScreen: React.FC<Props> = ({ navigation }) => {
  // Mock data for simulator testing
  const [location] = useState({
    latitude: 37.7749,
    longitude: -122.4194
  });
  
  // This function simulates taking a photo
  const takeMockPicture = () => {
    // Mock photo data with a placeholder image
    const mockPhoto = {
      uri: 'https://picsum.photos/400/300',  // Random placeholder image
      width: 400,
      height: 300
    };
    
    // Navigate to edit photo screen with the mock photo and location data
    navigation.navigate('EditPhoto', {
      photo: mockPhoto,
      location: location,
    });
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.mockCameraView}>
        <Text style={styles.mockText}>Camera Preview</Text>
        <Text style={styles.mockSubText}>(Simulator Mode)</Text>
        <Image
          source={require('../assets/camera-placeholder.png')}
          style={styles.placeholderImage}
          resizeMode="contain"
        />
      </View>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.captureButton} onPress={takeMockPicture}>
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  mockCameraView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#222',
  },
  mockText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  mockSubText: {
    color: '#999',
    fontSize: 16,
    marginTop: 8,
  },
  placeholderImage: {
    width: 200,
    height: 200,
    marginTop: 20,
    opacity: 0.7,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 120,
    backgroundColor: 'black',
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'white',
  },
});

export default CameraScreen;
