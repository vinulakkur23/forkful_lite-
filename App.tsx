import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
// Icon import was duplicated, removed one. MaterialIcons is conventional.
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Image, ActivityIndicator, View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform } from 'react-native';
// Import Firebase from our config file to ensure consistent initialization
import { firebase, auth, firestore, storage } from './firebaseConfig';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';

// Screens
import HomeScreen from './screens/HomeScreen';
import CameraScreen from './screens/CameraScreen';
import CropScreen from './screens/CropScreen'; // Import the new Crop Screen
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
  MainTabs: { screen?: string; params?: any }; // Added params for deep linking to tabs
  Home: undefined; // Kept for potential direct stack navigation, though usually via MainTabs
  Camera: undefined; // Kept for potential direct stack navigation
  Crop: {
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
    _navigationKey?: string; // For forcing screen refresh
  };
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
    _navigationKey?: string;
  };
  Rating: {
    photo: {
      uri: string;
      base64?: string;
      width?: number;
      height?: number;
      sessionId?: string; // For tracking session
    };
    location: {
      latitude: number;
      longitude: number;
    } | null;
    _uniqueKey?: string; // Ensure Rating screen reloads with new data
  };
  Result: {
    photo: {
      uri: string;
      base64?: string;
      width?: number;
      height?: number;
      sessionId?: string;
    };
    location: {
      latitude: number;
      longitude: number;
    } | null;
    rating: number;
    restaurant?: string;
    meal?: string;
    _uniqueKey?: string; // Ensure Result screen reloads
  };
  FoodPassport: undefined; // Kept for potential direct stack navigation
  MealDetail: {
    mealId: string;
  };
};

// Define separate types for tab navigation (screens directly in Tab.Navigator)
export type TabParamList = {
  Home: undefined;
  Camera: undefined; // This is a tab that navigates to CameraScreen
  FoodPassport: undefined; // This is a tab that navigates to FoodPassportWrapper
  
  // Screens that are part of flows, not "tabs" themselves, but defined in Tab.Navigator
  // They will be hidden from the tab bar using tabBarButton: () => null
  Crop: RootStackParamList['Crop']; // Use RootStackParamList type
  EditPhoto: RootStackParamList['EditPhoto'];
  Rating: RootStackParamList['Rating'];
  Result: RootStackParamList['Result'];
  MealDetail: RootStackParamList['MealDetail'];
};

// Create stack and tab navigators
const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Custom tab bar component
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  // Updated Image Picker function
    const openImagePicker = async () => {
      // Removed workaround of navigating to Home first.
      // The fix should be in CropScreen's ability to handle new props.

      const options: ImagePicker.ImageLibraryOptions = { // Explicitly type options
        mediaType: 'photo',
        includeBase64: false,
        maxHeight: 2000,
        maxWidth: 2000,
        quality: 0.8,
        selectionLimit: 1,
      };

      try {
        const result = await ImagePicker.launchImageLibrary(options); // Use typed options
        
        if (result.didCancel) {
          console.log('User cancelled image picker');
          return;
        }
        
        if (result.errorCode) {
          console.log('Image picker error:', result.errorCode, result.errorMessage);
          Alert.alert('Error', 'There was an error selecting the image: ' + result.errorMessage);
          return;
        }
        
        if (!result.assets || result.assets.length === 0 || !result.assets[0].uri) {
          console.log('No assets or URI returned from picker');
          Alert.alert('Error', 'Could not get image data. Please try another image.');
          return;
        }
        
        const selectedImage = result.assets[0];
        
        // Add a timestamp and unique key to ensure CropScreen refreshes
        const timestamp = new Date().getTime();
        const navigationKey = `crop_upload_${timestamp}`;
        // Ensure URI is unique to bust any caching by Image component itself if needed
        const uniqueImageUri = selectedImage.uri!.includes('?')
          ? `${selectedImage.uri}&t=${timestamp}`
          : `${selectedImage.uri}?t=${timestamp}`;
        
        Geolocation.getCurrentPosition(
          position => {
            const location = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
            
            navigation.navigate('Crop', {
              photo: {
                uri: uniqueImageUri,
                width: selectedImage.width || 1000,
                height: selectedImage.height || 1000,
              },
              location: location,
              _navigationKey: navigationKey,
            });
          },
          error => {
            console.log('Location error:', error);
            navigation.navigate('Crop', {
              photo: {
                uri: uniqueImageUri,
                width: selectedImage.width || 1000,
                height: selectedImage.height || 1000,
              },
              location: null,
              _navigationKey: navigationKey,
            });
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
      } catch (error: any) { // Catch any error
        console.error('Unexpected error in image picker:', error);
        Alert.alert('Error', `An unexpected error occurred: ${error.message || 'Unknown error'}`);
      }
    };

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
        name: 'Upload', // This is a virtual tab
        label: 'Upload Photo',
        icon: (focused: boolean) => ( // focused will always be false for this button
          focused ? // This case won't be hit, but kept for structure
            <Image source={require('./assets/icons/upload-active.png')} style={{ width: 24, height: 24 }} /> :
            <Image source={require('./assets/icons/upload-inactive.png')} style={{ width: 24, height: 24 }} />
        ),
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
        if (tab.customAction) {
          return (
            <TouchableOpacity
              key={index}
              onPress={openImagePicker}
              style={styles.tabButton}
              activeOpacity={0.7}
            >
              {tab.icon(false)}
              <Text style={[styles.tabLabel, { color: '#999' }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        }
        
        const route = state.routes.find(r => r.name === tab.name);
        if (!route) return null;
        
        const { options } = descriptors[route.key];
        // Use tab.label for consistency, fallback to route info
        const labelToDisplay = tab.label || options.tabBarLabel || options.title || route.name;
        
        const isFocused = state.index === state.routes.findIndex(r => r.name === tab.name);
        
        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          
          if (!isFocused && !event.defaultPrevented) {
            // For tabs, navigate to the tab's initial screen or itself.
            // If it's a stack navigator, it will go to its initial route.
            navigation.navigate(route.name as any, (route as any).params);
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
              {labelToDisplay as string}
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
        // headerShown is set per screen
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Nearby',
          headerShown: false,
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
        component={FoodPassportWrapper} // This wrapper handles FoodPassportScreen
        options={{
          title: 'My Passport',
          headerTitle: 'My Food Passport', // This will be shown if headerShown: true
          headerShown: true, // FoodPassportWrapper might need its own header logic or this can be true
        }}
      />
      
      {/* Screens part of flows, hidden from tab bar */}
      <Tab.Screen
        name="Crop"
        component={CropScreen}
        options={{
          title: 'Crop Photo',
          headerShown: false,
          tabBarButton: () => null, // Hide from tab bar
        }}
      />
      <Tab.Screen
        name="EditPhoto"
        component={EditPhotoScreen}
        options={{
          title: 'Edit Photo',
          headerShown: true, // EditPhotoScreen seems to expect a header
          tabBarButton: () => null, // Hide from tab bar
        }}
      />
      <Tab.Screen
        name="Rating"
        component={RatingScreen}
        options={{
          title: 'Rate Your Meal',
          headerShown: true, // RatingScreen expects a header
          tabBarButton: () => null, // Hide from tab bar
        }}
      />
      <Tab.Screen
        name="Result"
        component={ResultScreen}
        options={{
          title: 'Rating Result',
          headerShown: true, // ResultScreen expects a header
          tabBarButton: () => null, // Hide from tab bar
        }}
      />
      <Tab.Screen
        name="MealDetail"
        component={MealDetailScreen}
        options={{
          title: 'Meal Details',
          headerShown: true, // MealDetailScreen expects a header
          tabBarButton: () => null, // Hide from tab bar
        }}
      />
    </Tab.Navigator>
  );
}

const App: React.FC = () => {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: '476812977799-7dmlpm8g3plslrsftesst7op6ipm71a4.apps.googleusercontent.com',
      iosClientId: '476812977799-vutvsmj3dit2ov9ko1sgp4p2p0u57kh4.apps.googleusercontent.com',
      offlineAccess: true,
      forceCodeForRefreshToken: true,
    });
  }, []);

  function onAuthStateChanged(user: any) {
    console.log("[App.tsx] Auth state changed:", user ? "User logged in" : "No user");
    setUser(user);
    if (initializing) setInitializing(false);
  }

  useEffect(() => {
    // Use the auth instance imported from firebaseConfig
    const subscriber = auth().onAuthStateChanged(onAuthStateChanged);
    return subscriber;
  }, []);

  if (initializing) {
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
        />
        <Stack.Screen
          name="MainTabs"
          component={TabNavigator}
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
    height: Platform.OS === 'ios' ? 90 : 80, // Adjusted for SafeAreaView on iOS
    paddingBottom: Platform.OS === 'ios' ? 30 : 25, // More padding for home indicator
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
    // Removed width: width / 3 as mainTabs.length is 4. Flexbox handles distribution.
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  }
});

export default App;
