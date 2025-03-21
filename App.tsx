import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen from './screens/HomeScreen';
import CameraScreen from './screens/CameraScreen';
import EditPhotoScreen from './screens/EditPhotoScreen';
import RatingScreen from './screens/RatingScreen';
import ResultScreen from './screens/ResultScreen';

// Define the types for our navigation parameters
export type RootStackParamList = {
  Home: undefined;
  Camera: undefined;
  EditPhoto: {
    photo: {
      uri: string;
      base64?: string;
      width?: number;
      height?: number;
    };
    location: {
      latitude: number;
      longitude: number;
    } | null;
  };
  Rating: {
    photo: {
      uri: string;
      base64?: string;
      width?: number;
      height?: number;
    };
    location: {
      latitude: number;
      longitude: number;
    } | null;
  };
  Result: {
    photo: {
      uri: string;
      base64?: string;
      width?: number;
      height?: number;
    };
    location: {
      latitude: number;
      longitude: number;
    } | null;
    rating: number;
  };
};

const Stack = createStackNavigator<RootStackParamList>();

const App: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'Meal Rating App' }}
        />
        <Stack.Screen
          name="Camera"
          component={CameraScreen}
          options={{ title: 'Take Photo' }}
        />
        <Stack.Screen
          name="EditPhoto"
          component={EditPhotoScreen}
          options={{ title: 'Edit Photo' }}
        />
        <Stack.Screen
          name="Rating"
          component={RatingScreen}
          options={{ title: 'Rate Your Meal' }}
        />
        <Stack.Screen
          name="Result"
          component={ResultScreen}
          options={{ title: 'Rating Result' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;
