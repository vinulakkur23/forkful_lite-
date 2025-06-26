import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer, NavigationState } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
// Icon import was duplicated, removed one. MaterialIcons is conventional.
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Image, ActivityIndicator, View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform } from 'react-native';
// Import Firebase from our config file to ensure consistent initialization
import { firebase, auth, firestore, storage } from './firebaseConfig';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { getPhotoWithMetadata } from './services/photoLibraryService';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GlobalAchievementListener from './components/GlobalAchievementListener';
import OnboardingOverlay from './components/OnboardingOverlay';

// Screens
import HomeScreen from './screens/HomeScreen';
import CameraScreen from './screens/CameraScreen';
import CropScreen from './screens/CropScreen';
import RatingScreen1 from './screens/RatingScreen1';
import RatingScreen2 from './screens/RatingScreen2';
import ResultScreen from './screens/ResultScreen';
import LoginScreen from './screens/LoginScreen';
import MealDetailScreen from './screens/MealDetailScreen';
import EditMealScreen from './screens/EditMealScreen';
// Import our wrapper component
import FoodPassportWrapper from './screens/FoodPassportWrapper';
import * as ImagePicker from 'react-native-image-picker';
import Geolocation from '@react-native-community/geolocation';
import { Alert } from 'react-native';

// Define the types for our navigation parameters
export type RootStackParamList = {
  Login: undefined;
  MainTabs: { screen?: string; params?: any }; // Added params for deep linking to tabs
  Home: { tabIndex?: number } | undefined; // Kept for potential direct stack navigation, though usually via MainTabs
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
    photoSource?: 'camera' | 'gallery';
    _navigationKey?: string; // For forcing screen refresh
    // New parameters for adding photos to existing meals
    isAddingToExistingMeal?: boolean;
    existingMealId?: string;
    returnToEditMeal?: boolean;
  };
  RatingScreen1: {
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
    photoSource?: 'camera' | 'gallery';
    _uniqueKey?: string; // Ensure Rating screen reloads with new data
  };
  RatingScreen2: {
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
    rating: number;
    likedComment?: string;
    dislikedComment?: string;
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
    mealType?: string;
    likedComment?: string;
    dislikedComment?: string;
    _uniqueKey?: string; // Ensure Result screen reloads
  };
  FoodPassport: {
    userId?: string;
    userName?: string;
    userPhoto?: string;
    tabIndex?: number;
  } | undefined; // Can view own passport (undefined) or another user's passport
  MealDetail: {
    mealId: string;
    previousScreen?: string;
    previousTabIndex?: number;
    justEdited?: boolean;
    savedStatus?: boolean;
    passportUserId?: string;
    passportUserName?: string;
    passportUserPhoto?: string;
  };
  EditMeal: {
    mealId: string;
    meal: any;
    processedPhotoUri?: string; // For returning from CropScreen with processed photo
    previousScreen?: string;
    previousTabIndex?: number;
    passportUserId?: string;
    passportUserName?: string;
    passportUserPhoto?: string;
  };
};

// Define separate types for tab navigation (screens directly in Tab.Navigator)
export type TabParamList = {
  Home: undefined;
  Camera: undefined; // This is a tab that navigates to CameraScreen
  FoodPassport: RootStackParamList['FoodPassport']; // This is a tab that navigates to FoodPassportWrapper
  
  // Screens that are part of flows, not "tabs" themselves, but defined in Tab.Navigator
  // They will be hidden from the tab bar using tabBarButton: () => null
  Crop: RootStackParamList['Crop']; // Use RootStackParamList type
  RatingScreen1: RootStackParamList['RatingScreen1'];
  RatingScreen2: RootStackParamList['RatingScreen2'];
  Result: RootStackParamList['Result'];
  MealDetail: RootStackParamList['MealDetail'];
  EditMeal: RootStackParamList['EditMeal'];
};

// ResourceManager to track and clean temporary files and resources
export const ResourceManager = {
  _resources: new Map<string, () => void>(),
  _tempFiles: new Set<string>(),
  
  trackResource(id: string, cleanup: () => void): void {
    console.log(`[ResourceManager] Tracking resource: ${id}`);
    this._resources.set(id, cleanup);
  },
  
  releaseResource(id: string): void {
    console.log(`[ResourceManager] Releasing resource: ${id}`);
    const cleanup = this._resources.get(id);
    if (cleanup && typeof cleanup === 'function') {
      cleanup();
    }
    this._resources.delete(id);
  },
  
  trackTempFile(filePath: string): void {
    if (filePath && (
      filePath.includes(RNFS.TemporaryDirectoryPath) || 
      filePath.includes(RNFS.CachesDirectoryPath)
    )) {
      console.log(`[ResourceManager] Tracking temp file: ${filePath}`);
      this._tempFiles.add(filePath);
    }
  },
  
  async cleanupTempFiles(): Promise<void> {
    console.log(`[ResourceManager] Cleaning up ${this._tempFiles.size} temp files`);
    
    const currentTime = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    // Files to keep (added within the last 5 minutes)
    const recentFiles = new Set<string>();
    
    for (const filePath of this._tempFiles) {
      try {
        const exists = await RNFS.exists(filePath);
        if (exists) {
          // Check file stats to determine age
          const stats = await RNFS.stat(filePath);
          const fileAge = currentTime - new Date(stats.mtime).getTime();
          
          // Only delete files older than 5 minutes
          if (fileAge > FIVE_MINUTES) {
            await RNFS.unlink(filePath);
            console.log(`[ResourceManager] Deleted old temp file: ${filePath}`);
          } else {
            recentFiles.add(filePath);
            console.log(`[ResourceManager] Keeping recent file: ${filePath}`);
          }
        }
      } catch (e: any) {
        // Ignore ENOENT errors (file already deleted)
        if (e.code !== 'ENOENT') {
          console.warn(`[ResourceManager] Error cleaning up file ${filePath}:`, e.message || e);
        }
      }
    }
    
    // Update the set to only contain recent files
    this._tempFiles = recentFiles;
  },
  
  releaseAll(): void {
    console.log(`[ResourceManager] Releasing all ${this._resources.size} resources`);
    this._resources.forEach(cleanup => {
      try {
        cleanup();
      } catch (e) {
        console.warn('[ResourceManager] Error during cleanup:', e);
      }
    });
    this._resources.clear();
    
    // Also clean temp files
    this.cleanupTempFiles().catch(e => {
      if (e.code !== 'ENOENT') {
        console.warn('[ResourceManager] Error cleaning temp files:', e);
      }
    });
  }
};

// Create stack and tab navigators
const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Custom tab bar component wrapped with React.memo to prevent unnecessary re-renders
const CustomTabBar = React.memo(({ state, descriptors, navigation }: BottomTabBarProps) => {
  // Pre-load and cache all tab bar icons using React.useMemo
  const tabIcons = React.useMemo(() => ({
    place: {
      active: require('./assets/icons/place-active.png'),
      inactive: require('./assets/icons/place-inactive.png')
    },
    camera: {
      active: require('./assets/icons/camera-active.png'),
      inactive: require('./assets/icons/camera-inactive.png')
    },
    upload: {
      active: require('./assets/icons/upload-active.png'),
      inactive: require('./assets/icons/upload-inactive.png')
    },
    passport: {
      active: require('./assets/icons/passport-active.png'),
      inactive: require('./assets/icons/passport-inactive.png')
    }
  }), []);

  // Updated Image Picker function to use PhotoGPSModule
    const openImagePicker = async () => {
      try {
        console.log("Opening gallery from tab bar using PhotoGPSModule");
        
        // Use our enhanced photo library service that gets GPS metadata
        const photoAsset = await getPhotoWithMetadata();
        
        if (!photoAsset) {
          console.log("No photo selected or selection was cancelled");
          return;
        }
        
        console.log("Selected photo with metadata:", {
          uri: photoAsset.uri,
          hasLocation: !!photoAsset.location,
          location: photoAsset.location,
        });
        
        // Add a timestamp to create a unique navigation key
        const timestamp = new Date().getTime();
        const navigationKey = `gallery_photo_${timestamp}`;
        
        // Navigate to Crop screen with the selected photo and location data
        navigation.navigate('Crop', {
          photo: {
            uri: photoAsset.uri,
            width: photoAsset.width,
            height: photoAsset.height,
            originalUri: photoAsset.originalUri,
            fromGallery: true,
            assetId: photoAsset.assetId,
          },
          location: photoAsset.location || null,
          exifData: photoAsset.exifData,
          _navigationKey: navigationKey,
        });
      } catch (error: any) {
        console.error('Error selecting photo from gallery:', error);
        Alert.alert(
          "Gallery Error", 
          `There was a problem accessing your photo library: ${error.message || 'Unknown error'}`
        );
      }
    };

    const mainTabs = [
      { 
        name: 'Home', 
        label: 'Nearby', 
        icon: (focused: boolean) => (
          <Image 
            source={focused ? tabIcons.place.active : tabIcons.place.inactive} 
            style={{ width: 20, height: 20 }} // ORIGINAL: width: 24, height: 24 - made smaller
            // Force image to be reloaded properly
            key={`home-icon-${focused ? 'active' : 'inactive'}`}
          />
        )
      },
      { 
        name: 'Camera', 
        label: 'Take Photo', 
        icon: (focused: boolean) => (
          <Image 
            source={focused ? tabIcons.camera.active : tabIcons.camera.inactive} 
            style={{ width: 28, height: 28 }} // ORIGINAL: width: 24, height: 24 - made larger
            key={`camera-icon-${focused ? 'active' : 'inactive'}`}
          />
        )
      },
      {
        name: 'Upload', // This is a virtual tab
        label: 'Upload Photo',
        icon: (focused: boolean) => ( // focused will always be false for this button
          <Image 
            source={tabIcons.upload.inactive} 
            style={{ width: 28, height: 28 }} // ORIGINAL: width: 24, height: 24 - made larger
            key="upload-icon-inactive"
          />
        ),
        customAction: true
      },
      { 
        name: 'FoodPassport', 
        label: 'My Passport', 
        icon: (focused: boolean) => (
          <Image 
            source={focused ? tabIcons.passport.active : tabIcons.passport.inactive} 
            style={{ width: 20, height: 20 }} // ORIGINAL: width: 24, height: 24 - made smaller
            key={`passport-icon-${focused ? 'active' : 'inactive'}`}
          />
        )
      }
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
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

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
          headerShown: false, // Hide the header to avoid duplicate titles
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            // Prevent default action
            e.preventDefault();
            // Navigate to FoodPassport with no params (own profile) and always start on meals tab
            navigation.navigate('FoodPassport', { tabIndex: 0 });
          },
        })}
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
        name="RatingScreen1"
        component={RatingScreen1}
        options={{
          title: 'Rate Your Meal',
          headerShown: true,
          tabBarButton: () => null, // Hide from tab bar
        }}
      />
      <Tab.Screen
        name="RatingScreen2"
        component={RatingScreen2}
        options={{
          title: 'Meal Details',
          headerShown: true,
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
          headerShown: false, // Hide the header
          tabBarButton: () => null, // Hide from tab bar
        }}
      />
      <Tab.Screen
        name="EditMeal"
        component={EditMealScreen}
        options={{
          headerShown: false, // Hide the header since we add our own
          tabBarButton: () => null, // Hide from tab bar
        }}
      />
    </Tab.Navigator>
  );
}

const App: React.FC = () => {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null); // null = checking, true/false = determined

  // Create a navigation reference to access navigation state
  const navigationRef = useRef(null);
  
  // Track previous and current state to identify screen changes
  const routeNameRef = useRef<string | undefined>();
  const prevStateRef = useRef<NavigationState | null>(null);

  // Check if this is the first launch
  useEffect(() => {
    const checkFirstLaunch = async () => {
      try {
        const hasSeenOnboarding = await AsyncStorage.getItem('hasSeenOnboarding');
        console.log('[App] Checking first launch:', hasSeenOnboarding);
        setShowOnboarding(hasSeenOnboarding === null);
      } catch (error) {
        console.error('[App] Error checking first launch:', error);
        setShowOnboarding(false); // Default to not showing onboarding if there's an error
      }
    };
    
    checkFirstLaunch();
  }, []);

  // Handle onboarding completion
  const handleOnboardingComplete = async () => {
    try {
      await AsyncStorage.setItem('hasSeenOnboarding', 'true');
      setShowOnboarding(false);
      console.log('[App] Onboarding completed and saved');
    } catch (error) {
      console.error('[App] Error saving onboarding completion:', error);
      setShowOnboarding(false); // Still hide onboarding even if saving fails
    }
  };

  // Configure Google Sign-In
  useEffect(() => {
    GoogleSignin.configure({
      webClientId: '476812977799-7dmlpm8g3plslrsftesst7op6ipm71a4.apps.googleusercontent.com',
      iosClientId: '476812977799-vutvsmj3dit2ov9ko1sgp4p2p0u57kh4.apps.googleusercontent.com',
      offlineAccess: true,
      forceCodeForRefreshToken: true,
    });
  }, []);
  
  // Preload critical UI assets at startup to prevent memory-related disappearance
  useEffect(() => {
    console.log("Preloading app icons and assets...");
    
    // Preload all tab icons
    const iconsToPreload = [
      require('./assets/icons/place-active.png'),
      require('./assets/icons/place-inactive.png'),
      require('./assets/icons/camera-active.png'),
      require('./assets/icons/camera-inactive.png'),
      require('./assets/icons/upload-active.png'),
      require('./assets/icons/upload-inactive.png'),
      require('./assets/icons/passport-active.png'),
      require('./assets/icons/passport-inactive.png'),
      // Preload rating stars too since they have disappearance issues
      require('./assets/stars/star-filled.png'),
      require('./assets/stars/star-empty.png')
    ];
    
    // Force immediate loading by resolving asset sources
    iconsToPreload.forEach(icon => {
      const resolved = Image.resolveAssetSource(icon);
      console.log(`Preloaded asset: ${resolved.uri}`);
    });
    
    // Return cleanup function
    return () => {
      console.log("Cleaning up preloaded assets");
    };
  }, []);

  async function onAuthStateChanged(user: any) {
    console.log("[App.tsx] Auth state changed:", user ? "User logged in" : "No user");
    
    // If user is logged in but doesn't have a displayName, try to get it from Google
    if (user && !user.displayName) {
      console.log("User logged in but missing displayName, checking Google Sign-In status");
      try {
        const isSignedIn = await GoogleSignin.isSignedIn();
        if (isSignedIn) {
          const googleUser = await GoogleSignin.getCurrentUser();
          if (googleUser && googleUser.user) {
            console.log("Found Google user info, updating profile");
            await user.updateProfile({
              displayName: googleUser.user.name || googleUser.user.email?.split('@')[0] || 'User',
              photoURL: googleUser.user.photo || null
            });
            console.log("Profile updated with Google info");
          }
        }
      } catch (error) {
        console.error("Error updating user profile from Google:", error);
      }
    }
    
    // Ensure user document exists in Firestore
    if (user) {
      try {
        const userDoc = await firestore().collection('users').doc(user.uid).get();
        if (!userDoc.exists) {
          console.log("Creating missing user document in Firestore");
          await firestore().collection('users').doc(user.uid).set({
            displayName: user.displayName || user.email?.split('@')[0] || 'User',
            email: user.email,
            photoURL: user.photoURL || null,
            uid: user.uid,
            createdAt: firestore.FieldValue.serverTimestamp(),
            lastLoginAt: firestore.FieldValue.serverTimestamp()
          });
        } else {
          // Update last login
          await firestore().collection('users').doc(user.uid).update({
            lastLoginAt: firestore.FieldValue.serverTimestamp()
          });
        }
      } catch (error) {
        console.error("Error ensuring user document exists:", error);
      }
    }
    
    setUser(user);
    if (initializing) setInitializing(false);
  }

  useEffect(() => {
    // Use the auth instance imported from firebaseConfig
    const subscriber = auth().onAuthStateChanged(onAuthStateChanged);
    return subscriber;
  }, []);
  
  // Schedule periodic temp file cleanup
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      ResourceManager.cleanupTempFiles();
    }, 60000); // Run every minute
    
    return () => {
      clearInterval(cleanupInterval);
      ResourceManager.releaseAll();
    };
  }, []);
  
  // Handle navigation state changes for memory cleanup
  const onNavigationStateChange = (state: NavigationState | undefined) => {
    if (!state) return;
    
    const previousState = prevStateRef.current;
    const currentRouteName = getActiveRouteName(state);
    
    // Get previous route name
    const previousRouteName = routeNameRef.current;
    
    // If the route has changed, run cleanup for previous screen
    if (previousRouteName && previousRouteName !== currentRouteName) {
      console.log(`Navigation changed from ${previousRouteName} to ${currentRouteName}`);
      
      // Clean up resources when leaving resource-intensive screens
      if (['CropScreen', 'RatingScreen1', 'RatingScreen2', 'Result'].some(
        screen => previousRouteName.includes(screen))
      ) {
        console.log(`Screen ${previousRouteName} was unmounted, cleaning up resources`);
        
        // Schedule cleanup for next tick to avoid interrupting navigation
        setTimeout(() => {
          ResourceManager.cleanupTempFiles();
        }, 500);
      }
    }
    
    // Save the current navigation state for next comparison
    routeNameRef.current = currentRouteName;
    prevStateRef.current = state;
  };
  
  // Helper to get the active route name from navigation state
  const getActiveRouteName = (state: NavigationState): string => {
    if (!state || !state.routes) return 'unknown';
    
    const route = state.routes[state.index];
    
    // Dive into nested navigators
    if (route.state && (route.state as NavigationState).index !== undefined) {
      return getActiveRouteName(route.state as NavigationState);
    }
    
    return route.name;
  };

  // Show loading while initializing or checking onboarding status
  if (initializing || showOnboarding === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff6b6b" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <>
      <View style={{ flex: 1 }}>
        <NavigationContainer
          ref={navigationRef}
          onStateChange={onNavigationStateChange}
        >
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
      </View>
      {/* GlobalAchievementListener is rendered outside the main View to prevent layout interference */}
      <GlobalAchievementListener />
      
      {/* Onboarding overlay - shows on first app launch */}
      <OnboardingOverlay
        visible={showOnboarding === true}
        onComplete={handleOnboardingComplete}
      />
    </>
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
    backgroundColor: '#FAF9F6',
    height: Platform.OS === 'ios' ? 70 : 60, // Reduced height since no text labels
    paddingBottom: Platform.OS === 'ios' ? 25 : 15, // Reduced padding
    paddingTop: 8, // Slightly reduced top padding
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
