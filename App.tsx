import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Image, ActivityIndicator, View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { getAuth } from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';

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
import * as ImagePicker from 'react-native-image-picker';
import Geolocation from '@react-native-community/geolocation';
import { Alert } from 'react-native';

// Define the types for our navigation parameters
export type RootStackParamList = {
  Login: undefined;
  MainTabs: { screen?: string; params?: any };
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

// Define separate types for tab navigation
export type TabParamList = {
  Home: undefined;
  Camera: undefined;
  FoodPassport: undefined;
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
  MealDetail: {
    mealId: string;
  };
};

// Create stack and tab navigators
const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Custom tab bar component
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  // Updated Image Picker function
    const openImagePicker = async () => {
      // Force reset camera/photo state by navigating to home first to clear any cached state
      const currentRoute = state.routes[state.index].name;
      if (currentRoute !== 'Home') {
        navigation.navigate('Home');
        // Small delay to allow state to reset
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const options = {
        mediaType: 'photo',
        includeBase64: false,
        maxHeight: 2000,
        maxWidth: 2000,
        quality: 0.8,
        // Force new selection
        selectionLimit: 1,
      };

      try {
        // Use the Promise API with fresh options
        const result = await ImagePicker.launchImageLibrary({...options});
        
        if (result.didCancel) {
          console.log('User cancelled image picker');
          return;
        }
        
        if (result.errorCode) {
          console.log('Image picker error:', result.errorCode, result.errorMessage);
          Alert.alert('Error', 'There was an error selecting the image.');
          return;
        }
        
        if (!result.assets || result.assets.length === 0) {
          console.log('No assets returned from picker');
          return;
        }
        
        const selectedImage = result.assets[0];
        
        if (!selectedImage.uri) {
          Alert.alert('Error', 'Could not get image data. Please try another image.');
          return;
        }
        
        // Get current location
        Geolocation.getCurrentPosition(
          position => {
            const location = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
            
            // Add a timestamp to ensure uniqueness
            const timestamp = new Date().getTime();
            const uniqueUri = selectedImage.uri.includes('?')
              ? `${selectedImage.uri}&t=${timestamp}`
              : `${selectedImage.uri}?t=${timestamp}`;
            
            // Navigate to EditPhoto screen with the selected image
            navigation.navigate('EditPhoto', {
              photo: {
                uri: uniqueUri, // Add timestamp to force reload
                width: selectedImage.width || 1000,
                height: selectedImage.height || 1000,
              },
              location: location,
            });
          },
          error => {
            console.log('Location error:', error);
            // Even without location, still allow uploading
            
            // Add a timestamp to ensure uniqueness
            const timestamp = new Date().getTime();
            const uniqueUri = selectedImage.uri.includes('?')
              ? `${selectedImage.uri}&t=${timestamp}`
              : `${selectedImage.uri}?t=${timestamp}`;
            
            navigation.navigate('EditPhoto', {
              photo: {
                uri: uniqueUri, // Add timestamp to force reload
                width: selectedImage.width || 1000,
                height: selectedImage.height || 1000,
              },
              location: null,
            });
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
      } catch (error) {
        console.error('Unexpected error in image picker:', error);
        Alert.alert('Error', 'An unexpected error occurred while selecting an image.');
      }
    };

  // We'll show these four tabs
  const mainTabs = [
    { name: 'Home', label: 'Nearby', icon: (focused: boolean) => (
      focused ?
        <Image source={require('./assets/icons/place-active.png')} style={{ width: 24, height: 24 }} /> :
        <Image source={require('./assets/icons/place-inactive.png')} style={{ width: 24, height: 24 }} />
    )},
    { name: 'Camera', label: 'Take Photo', icon: (focused: boolean) => (
      focused ?
        <Image source={require('./assets/icons/camera-active.png')} style={{ width: 24, height: 24 }} /> :
        <Image source={require('./assets/icons/camera-inactive.png')} style={{ width: 24, height: 24 }} />
    )},
    {
      name: 'Upload',
      label: 'Upload Photo',
      icon: (focused: boolean) => (
        <Icon name="photo-library" size={24} color={focused ? '#ff6b6b' : '#999'} />
      ),
      // This isn't a real screen, it triggers the image picker
      customAction: true
    },
    { name: 'FoodPassport', label: 'My Passport', icon: (focused: boolean) => (
      focused ?
        <Image source={require('./assets/icons/passport-active.png')} style={{ width: 24, height: 24 }} /> :
        <Image source={require('./assets/icons/passport-inactive.png')} style={{ width: 24, height: 24 }} />
    )}
  ];

  return (
    <View style={styles.tabBarContainer}>
      {mainTabs.map((tab, index) => {
        // For the Upload tab, we use a custom action instead of navigation
        if (tab.customAction) {
          return (
            <TouchableOpacity
              key={index}
              onPress={openImagePicker}
              style={styles.tabButton}
              activeOpacity={0.7}
            >
              {tab.icon(false)} {/* Always use unfocused state for this button */}
              <Text style={[styles.tabLabel, { color: '#999' }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        }
        
        // Find the corresponding route from the state
        const route = state.routes.find(r => r.name === tab.name);
        
        if (!route) return null;
        
        const { options } = descriptors[route.key];
        const label = options.tabBarLabel || options.title || route.name;
        
        // Check if this tab is focused
        const isFocused = state.index === state.routes.findIndex(r => r.name === tab.name);
        
        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };
        
        return (
          <TouchableOpacity
            key={index}
            onPress={onPress}
            style={styles.tabButton}
            activeOpacity={0.7}
          >
            {tab.icon(isFocused)}
            <Text style={[
              styles.tabLabel,
              { color: isFocused ? '#ff6b6b' : '#999' }
            ]}>
              {label as string}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Tab Navigator component with custom tab bar
function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: true,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Nearby',
          headerShown: false, // Hide header as we have a custom header
        }}
      />
      <Tab.Screen
        name="Camera"
        component={CameraScreen}
        options={{
          title: 'Capture Meal',
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="FoodPassport"
        component={FoodPassportWrapper}
        options={{
          title: 'My Passport',
          headerTitle: 'My Food Passport',
        }}
      />
      
      {/* Add new screens to the tab navigator */}
      <Tab.Screen
        name="EditPhoto"
        component={EditPhotoScreen}
        options={{
          title: 'Edit Photo',
          headerShown: true,
        }}
      />
      
      <Tab.Screen
        name="Rating"
        component={RatingScreen}
        options={{
          title: 'Rate Your Meal',
          headerShown: true,
        }}
      />
      
      <Tab.Screen
        name="Result"
        component={ResultScreen}
        options={{
          title: 'Rating Result',
          headerShown: true,
        }}
      />
      
      <Tab.Screen
        name="MealDetail"
        component={MealDetailScreen}
        options={{
          title: 'Meal Details',
          headerShown: true,
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
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const { width } = Dimensions.get('window');

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
  },
  tabBarContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    height: 80,
    paddingBottom: 25,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 10,
  },
  tabButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: width / 3, // Explicitly divide the width by 3 for even spacing
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  }
});

export default App;
