import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Image, ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { getAuth } from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Screens
import HomeScreen from './screens/HomeScreen';
import CameraScreen from './screens/CameraScreen';
import EditPhotoScreen from './screens/EditPhotoScreen';
import RatingScreen from './screens/RatingScreen';
import ResultScreen from './screens/ResultScreen';
import LoginScreen from './screens/LoginScreen';
import MealDetailScreen from './screens/MealDetailScreen';
// Import our wrapper component
import FoodPassportWrapper from './screens/FoodPassportWrapper';

// Define the types for our navigation parameters
export type RootStackParamList = {
  Login: undefined;
  MainTabs: undefined;
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
    restaurant?: string;
    meal?: string;
  };
  FoodPassport: undefined;
  MealDetail: {
    mealId: string;
  };
};

// Create stack and tab navigators
const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

// Tab Navigator component with wrapper for FoodPassport
function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#ff6b6b',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          backgroundColor: 'white',
          borderTopColor: '#ddd',
          // Increased height for better visibility on iPhone
          height: 80,
          paddingBottom: 25,
          paddingTop: 10,
          // Add shadow for better definition
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 3,
          elevation: 10,
        },
        // Bigger icon and label for better visibility
        tabBarIconStyle: {
          width: 30,
          height: 30,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
          paddingBottom: 5,
        },
        headerShown: true,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Nearby',
          headerShown: false, // Hide header as we have a custom header
          tabBarIcon: ({ color, focused }) => (
            // Use custom icon if available, otherwise use Material icon
            focused ?
              <Image
                source={require('./assets/icons/place-active.png')}
                style={{ width: 24, height: 24 }}
              /> :
              <Image
                source={require('./assets/icons/place-inactive.png')}
                style={{ width: 24, height: 24 }}
              />
          ),
        }}
      />
      <Tab.Screen
        name="Camera"
        component={CameraScreen}
        options={{
          title: 'Capture Meal',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            // Use custom icon if available, otherwise use Material icon
            focused ?
              <Image
                source={require('./assets/icons/camera-active.png')}
                style={{ width: 24, height: 24 }}
              /> :
              <Image
                source={require('./assets/icons/camera-inactive.png')}
                style={{ width: 24, height: 24 }}
              />
          ),
        }}
      />
      <Tab.Screen
        name="FoodPassport"
        component={FoodPassportWrapper}
        options={{
          title: 'My Passport',
          headerTitle: 'My Food Passport',
          tabBarIcon: ({ color, focused }) => (
            // Use custom icon if available, otherwise use Material icon
            focused ?
              <Image
                source={require('./assets/icons/passport-active.png')}
                style={{ width: 24, height: 24 }}
              /> :
              <Image
                source={require('./assets/icons/passport-inactive.png')}
                style={{ width: 24, height: 24 }}
              />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const App: React.FC = () => {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<any>(null);

  // Initialize GoogleSignin on app start
  useEffect(() => {
    GoogleSignin.configure({
      webClientId: '476812977799-7dmlpm8g3plslrsftesst7op6ipm71a4.apps.googleusercontent.com',
      iosClientId: '476812977799-vutvsmj3dit2ov9ko1sgp4p2p0u57kh4.apps.googleusercontent.com',
      offlineAccess: true,
      forceCodeForRefreshToken: true,
    });
  }, []);

  // Handle user state changes
  function onAuthStateChanged(user: any) {
    console.log("[App.tsx] Auth state changed:", user ? "User logged in" : "No user");
    setUser(user);
    if (initializing) setInitializing(false);
  }

  useEffect(() => {
    const auth = getAuth();
    const subscriber = auth.onAuthStateChanged(onAuthStateChanged);
    return subscriber; // unsubscribe on unmount
  }, []);

  if (initializing) {
    // Show a loading screen
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff6b6b" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={user ? "MainTabs" : "Login"} screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="MainTabs"
          component={TabNavigator}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="EditPhoto"
          component={EditPhotoScreen}
          options={{
            title: 'Edit Photo',
            headerShown: true
          }}
        />
        <Stack.Screen
          name="Rating"
          component={RatingScreen}
          options={{
            title: 'Rate Your Meal',
            headerShown: true
          }}
        />
        <Stack.Screen
          name="Result"
          component={ResultScreen}
          options={{
            title: 'Rating Result',
            headerShown: true
          }}
        />
        <Stack.Screen
          name="MealDetail"
          component={MealDetailScreen}
          options={{
            title: 'Meal Details',
            headerShown: true
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  }
});

export default App;
