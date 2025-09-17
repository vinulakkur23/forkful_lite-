import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NavigationContainer, NavigationState } from '@react-navigation/native';
import { navigationRef } from './services/navigationService';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
// Icon import was duplicated, removed one. MaterialIcons is conventional.
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Image, ActivityIndicator, View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform, Linking, Alert } from 'react-native';
// Import Firebase from our config file to ensure consistent initialization
import { firebase, auth, firestore, storage } from './firebaseConfig';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { getPhotoWithMetadata } from './services/photoLibraryService';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GlobalAchievementListener from './components/GlobalAchievementListener';
import GlobalChallengeListener from './components/GlobalChallengeListener';
import { warmupQuickCriteriaService } from './services/quickCriteriaService';

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
import NotificationsScreen from './screens/NotificationsScreen';

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
    thoughts?: string;
    likedComment?: string;
    dislikedComment?: string;
    enhancedMetadata?: any; // Enhanced metadata from service (legacy)
    dishCriteria?: any; // Dish criteria from service
    combinedResult?: any; // Combined metadata and criteria (backward compatibility)
    quickCriteriaResult?: any; // NEW: Quick criteria result from fast service
    _uniqueKey?: string; // Ensure Result screen reloads
  };
  FoodPassport: {
    userId?: string;
    userName?: string;
    userPhoto?: string;
    tabIndex?: number;
    openChallengeModal?: string;
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
  Notifications: undefined;
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
  Notifications: RootStackParamList['Notifications'];
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
    passport: {
      active: require('./assets/icons/passport-active.png'),
      inactive: require('./assets/icons/passport-inactive.png')
    },
    add: {
      icon: require('./assets/icons/camera-active.png')
    }
  }), []);


    const mainTabs = [
      { 
        name: 'FoodPassport', 
        label: 'Passport', 
        icon: (focused: boolean) => (
          <Image 
            source={focused ? tabIcons.passport.active : tabIcons.passport.inactive} 
            style={{ width: 32, height: 32 }}
            key={`passport-icon-${focused ? 'active' : 'inactive'}`}
          />
        )
      },
      { 
        name: 'Home', 
        label: 'Discover', 
        icon: (focused: boolean) => (
          <Image 
            source={focused ? tabIcons.place.active : tabIcons.place.inactive} 
            style={{ width: 32, height: 32 }}
            key={`home-icon-${focused ? 'active' : 'inactive'}`}
          />
        )
      }
    ];

  return (
    <>
      <View style={styles.tabBarContainer}>
        {/* Left tab - Passport */}
        {mainTabs[0] && (() => {
          const tab = mainTabs[0];
          const route = state.routes.find(r => r.name === tab.name);
          if (!route) return null;
          
          const isFocused = state.index === state.routes.findIndex(r => r.name === tab.name);
          
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name as any, (route as any).params);
            }
          };
          
          return (
            <TouchableOpacity
              key={0}
              onPress={onPress}
              style={styles.tabButton}
              activeOpacity={0.7}
            >
              <View style={styles.tabIconContainer}>
                {tab.icon(isFocused)}
              </View>
              <Text style={styles.tabLabel}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })()}
        
        {/* Center button - Add Meal */}
        <View style={styles.centerButtonContainer}>
          <TouchableOpacity
            onPress={() => navigation.navigate('RatingScreen2', {
              photo: null, // Start without photo
              location: null, // Will fetch current location  
              rating: 0,
              _uniqueKey: `location_first_${Date.now()}`,
              thoughts: '',
              meal: '',
              restaurant: '',
              isEditingExisting: false
            })}
            style={styles.centerButton}
            activeOpacity={0.9}
          >
            <Text style={styles.centerButtonText}>+</Text>
          </TouchableOpacity>
        </View>
        
        {/* Right tab - Home */}
        {mainTabs[1] && (() => {
          const tab = mainTabs[1];
          const route = state.routes.find(r => r.name === tab.name);
          if (!route) return null;
          
          const isFocused = state.index === state.routes.findIndex(r => r.name === tab.name);
          
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name as any, (route as any).params);
            }
          };
          
          return (
            <TouchableOpacity
              key={1}
              onPress={onPress}
              style={styles.tabButton}
              activeOpacity={0.7}
            >
              {tab.icon(isFocused)}
              <Text style={styles.tabLabel}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })()}
      </View>
      
    </>
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
      <Tab.Screen
        name="Camera"
        component={CameraScreen}
        options={{
          title: 'Capture Meal',
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Nearby',
          headerShown: false,
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
          headerShown: false, // Hide the header
          tabBarButton: () => null, // Hide from tab bar
        }}
      />
      <Tab.Screen
        name="Result"
        component={ResultScreen}
        options={{
          title: 'Rating Result',
          headerShown: false, // Remove header as requested
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
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          headerShown: false,
          tabBarButton: () => null, // Hide from tab bar
        }}
      />
    </Tab.Navigator>
  );
}

const App: React.FC = () => {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [pendingChallengeId, setPendingChallengeId] = useState<string | null>(null);
  
  // Track previous and current state to identify screen changes
  const routeNameRef = useRef<string | undefined>();
  const prevStateRef = useRef<NavigationState | null>(null);


  // Configure Google Sign-In and warm up backend
  useEffect(() => {
    GoogleSignin.configure({
      webClientId: '219668861569-qm93jan5voigimfur98slrudb78r6uvp.apps.googleusercontent.com',
    });
    
    // PERFORMANCE: Warm up the backend service to reduce first API call delay
    warmupQuickCriteriaService().then(success => {
      console.log(`Backend warmup ${success ? 'completed' : 'failed'}`);
    }).catch(error => {
      console.log('Backend warmup error:', error);
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
    
    // Ensure user document exists in Firestore and sync profile data
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
          // Update last login and sync auth profile with Firestore data
          const userData = userDoc.data();
          await firestore().collection('users').doc(user.uid).update({
            lastLoginAt: firestore.FieldValue.serverTimestamp()
          });
          
          // If Firestore has profile data but auth doesn't, update auth profile
          if (userData && (userData.displayName || userData.photoURL)) {
            if (userData.displayName !== user.displayName || userData.photoURL !== user.photoURL) {
              console.log("Syncing auth profile with Firestore data");
              await user.updateProfile({
                displayName: userData.displayName || user.displayName || 'User',
                photoURL: userData.photoURL || user.photoURL || null
              });
              console.log("Auth profile synced with Firestore");
            }
          }
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
  
  // Function to accept a shared challenge
  const handleAcceptChallenge = useCallback(async (challengeId: string) => {
    try {
      console.log('Attempting to accept challenge:', challengeId);
      const { acceptSharedChallenge } = await import('./services/userChallengesService');
      
      const success = await acceptSharedChallenge(challengeId);
      
      if (success) {
        Alert.alert(
          '🎉 Challenge Accepted!',
          'The food challenge has been added to your profile. Check your Stamps screen to see it!',
          [
            {
              text: 'View Challenge',
              onPress: () => {
                // Navigate to FoodPassport/Stamps screen
                if (navigationRef.current) {
                  navigationRef.current.navigate('MainTabs', {
                    screen: 'FoodPassport',
                    params: {
                      tabIndex: 1  // Stamps tab
                    }
                  });
                }
              }
            },
            {
              text: 'OK',
              style: 'cancel'
            }
          ]
        );
      } else {
        Alert.alert(
          'Challenge Not Accepted',
          'You may already have this challenge or there was an error. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error accepting challenge:', error);
      Alert.alert(
        'Error',
        'Failed to accept the challenge. Please try again.',
        [{ text: 'OK' }]
      );
    }
  }, []);

  // Handle deep link when received
  const handleDeepLink = useCallback((url: string | null) => {
    if (!url) return;
    
    console.log('Deep link received:', url);
    
    // Parse challenge ID from URL
    // Expected format: https://forkful.app/challenge/[challengeId] or forkful://challenge/[challengeId]
    const challengeMatch = url.match(/challenge\/([a-zA-Z0-9_-]+)/);
    
    if (challengeMatch && challengeMatch[1]) {
      const challengeId = challengeMatch[1];
      console.log('Challenge ID extracted:', challengeId);
      
      if (user) {
        // User is logged in, accept the challenge immediately
        handleAcceptChallenge(challengeId);
      } else {
        // User not logged in, save for after login
        setPendingChallengeId(challengeId);
        Alert.alert(
          'Sign In Required',
          'Please sign in to accept this food challenge!',
          [{ text: 'OK' }]
        );
      }
    } else {
      console.log('No valid challenge ID found in URL:', url);
    }
  }, [user, handleAcceptChallenge]);
  
  // Handle deep links for shared challenges
  useEffect(() => {
    console.log('🔗 Setting up deep link listeners...');
    
    // Check if app was opened with a deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('🚀 App opened with deep link:', url);
        handleDeepLink(url);
      } else {
        console.log('📱 App opened normally (no deep link)');
      }
    }).catch(error => {
      console.error('❌ Error getting initial URL:', error);
    });
    
    // Listen for deep links while app is open
    const linkingSubscription = Linking.addEventListener('url', (event) => {
      console.log('🔔 Deep link received while app is open:', event.url);
      handleDeepLink(event.url);
    });
    
    return () => {
      linkingSubscription.remove();
    };
  }, [handleDeepLink]);
  
  // Handle pending challenge after user logs in
  useEffect(() => {
    if (user && pendingChallengeId) {
      console.log('Processing pending challenge after login:', pendingChallengeId);
      handleAcceptChallenge(pendingChallengeId);
      setPendingChallengeId(null);
    }
  }, [user, pendingChallengeId, handleAcceptChallenge]);
  
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

  // Show loading while initializing
  if (initializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a2b49" />
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
      
      {/* GlobalChallengeListener for food challenge notifications */}
      <GlobalChallengeListener />
      
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
    backgroundColor: '#ffffff',
    height: Platform.OS === 'ios' ? 80 : 70, // Increased height for labels
    paddingBottom: Platform.OS === 'ios' ? 25 : 15,
    paddingTop: 8,
    zIndex: 5,
  },
  tabButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerButtonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  centerButton: {
    position: 'absolute',
    bottom: -45,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerButtonText: {
    fontSize: 100,
    fontWeight: '350',
    color: '#1a2b49',
    lineHeight: 100,
    marginTop: -15,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
    color: '#1a2b49', // Always navy blue
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  tabIconContainer: {
    position: 'relative',
  },
});

export default App;
