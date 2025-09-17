import React, { useState, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, SafeAreaView, StyleSheet, ActivityIndicator, TouchableOpacity, Dimensions, Image, Alert, ScrollView } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, TabParamList } from '../App';
import FoodPassportScreen from './FoodPassportScreen';
import MapScreen from './MapScreen';
import StampsScreen from './StampsScreen';
import SavedMealsScreen from './SavedMealsScreen';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { firebase, auth, firestore } from '../firebaseConfig';
import SimpleFilterComponent, { FilterItem } from '../components/SimpleFilterComponent';
import CompositeFilterComponent from '../components/CompositeFilterComponent';
import TooltipOnboarding from '../components/TooltipOnboarding';
import ProfileCard from '../components/ProfileCard';
import { followUser, unfollowUser, isFollowing } from '../services/followService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import inAppNotificationService from '../services/inAppNotificationService';

const { width, height } = Dimensions.get('window');

type FoodPassportWrapperProps = {
  navigation: StackNavigationProp<RootStackParamList, 'FoodPassport'>;
  route: RouteProp<TabParamList, 'FoodPassport'>;
};

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; navigation: StackNavigationProp<RootStackParamList, 'FoodPassport'> },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; navigation: StackNavigationProp<RootStackParamList, 'FoodPassport'> }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('FoodPassport component error:', error, errorInfo);
  }

  handleGoHome = () => {
    this.props.navigation.navigate('Home');
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Icon name="error" size={64} color="#ff6b6b" />
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMessage}>{this.state.error?.message || 'An unknown error occurred'}</Text>
          
          <View style={styles.errorButtonsContainer}>
            <TouchableOpacity style={styles.retryButton} onPress={this.handleRetry}>
              <Text style={styles.buttonText}>Retry</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.homeButton} onPress={this.handleGoHome}>
              <Text style={styles.buttonText}>Go to Home</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

// Define tab routes
type Route = {
  key: string;
  title: string;
  activeIcon: any;
  inactiveIcon: any;
};

const FoodPassportWrapper: React.FC<FoodPassportWrapperProps> = (props) => {
  const { navigation, route } = props;
  const userId = route.params?.userId;
  const userName = route.params?.userName;
  const userPhoto = route.params?.userPhoto;
  const initialTabIndex = route.params?.tabIndex || 0;
  const isOwnProfile = !userId || userId === auth().currentUser?.uid;
  const openChallengeModal = route.params?.openChallengeModal;
  
  
  const [isLoading, setIsLoading] = useState(true);
  const [tabIndex, setTabIndex] = useState(initialTabIndex);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [profileStats, setProfileStats] = useState({
    totalMeals: 0,
    averageRating: 0,
    badgeCount: 0,
    followersCount: 0,
    totalCheers: 0
  });
  
  // Follow state
  const [isUserFollowing, setIsUserFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  
  // Always show all 4 tabs for consistency
  const routes = React.useMemo<Route[]>(() => [
    { 
      key: 'passport', 
      title: 'Meals', 
      activeIcon: require('../assets/icons/passport_tabs/meals-active.png'), 
      inactiveIcon: require('../assets/icons/passport_tabs/meals-inactive.png')
    },
    { 
      key: 'saved', 
      title: 'Wishlist', 
      activeIcon: require('../assets/icons/passport_tabs/wishlist-active.png'),
      inactiveIcon: require('../assets/icons/passport_tabs/wishlist-inactive.png')
    },
    { 
      key: 'map', 
      title: 'Map', 
      activeIcon: require('../assets/icons/passport_tabs/map-active.png'), 
      inactiveIcon: require('../assets/icons/passport_tabs/map-inactive.png')
    },
    { 
      key: 'stamps', 
      title: 'Accolades', 
      activeIcon: require('../assets/icons/passport_tabs/stamps-active.png'), 
      inactiveIcon: require('../assets/icons/passport_tabs/stamps-inactive.png')
    },
  ], []);
  
  // Shared filter state for both tabs - now an array of filters
  const [activeFilters, setActiveFilters] = useState<FilterItem[] | null>(null);
  const [activeRatingFilters, setActiveRatingFilters] = useState<number[] | null>(null);
  
  // Tooltip onboarding state
  const [showTooltips, setShowTooltips] = useState(false);
  const [tabBarLayout, setTabBarLayout] = useState<any>(null);
  
  // Notification state
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Handle route param changes (e.g., when navigating with openChallengeModal)
  useEffect(() => {
    if (route.params?.tabIndex !== undefined) {
      setTabIndex(route.params.tabIndex);
    }
    // If openChallengeModal is set, switch to stamps tab
    if (route.params?.openChallengeModal) {
      setTabIndex(3); // Stamps tab is index 3
    }
  }, [route.params?.tabIndex, route.params?.openChallengeModal]);
  
  // Handle filter changes from SimpleFilterComponent
  const handleFilterChange = (filters: FilterItem[] | null) => {
    console.log('FoodPassportWrapper: Filters changed to:', JSON.stringify(filters));
    setActiveFilters(filters);
    
    // Log the new state on the next render
    setTimeout(() => {
      console.log('FoodPassportWrapper: Active filters after state update:', JSON.stringify(activeFilters));
    }, 0);
  };

  // Handle rating filter changes
  const handleRatingFilterChange = (ratings: number[] | null) => {
    console.log('FoodPassportWrapper: Rating filters changed to:', ratings);
    setActiveRatingFilters(ratings);
  };

  // Handle tooltip completion
  const handleTooltipComplete = async () => {
    try {
      const onboardingService = (await import('../services/onboardingService')).default;
      await onboardingService.markFoodPassportTooltipsSeen();
      setShowTooltips(false);
    } catch (error) {
      console.error('Error marking tooltips complete:', error);
      setShowTooltips(false);
    }
  };

  // Handle tooltip skip
  const handleTooltipSkip = () => {
    handleTooltipComplete();
  };

  // Handle notification press
  const handleNotificationPress = () => {
    navigation.navigate('Notifications');
  };

  // Listen to unread notification count (only for own profile)
  useEffect(() => {
    if (!isOwnProfile) return;

    const user = auth().currentUser;
    if (!user) return;

    console.log('🔔 Setting up notification count listener for user:', user.uid);
    const unsubscribe = inAppNotificationService.getUnreadCount(user.uid, (count) => {
      console.log('🔔 Unread notification count updated:', count);
      setUnreadCount(count);
    });

    return unsubscribe;
  }, [isOwnProfile]);

  const handleSignOut = async () => {
    console.log("Sign out button pressed");
    try {
      // Enhanced sign out that handles Google Sign In properly
      if (global.GoogleSignin) {
        try {
          // First revoke access and sign out from Google
          await global.GoogleSignin.revokeAccess();
          await global.GoogleSignin.signOut();
          console.log("Google Sign In: Signed out successfully");
        } catch (googleError) {
          console.log("Error signing out from Google:", googleError);
          // Continue with Firebase sign out even if Google sign out fails
        }
      }
      
      // Then sign out from Firebase
      await auth().signOut();
      console.log("Firebase Auth: Signed out successfully");
      
      // Navigate to Login
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    } catch (error) {
      console.error("Error signing out:", error);
      alert("Failed to sign out. Please try again.");
    }
  };

  const handleBackPress = () => {
    navigation.goBack();
  };

  const handleFollowToggle = async () => {
    if (!userId || !userProfile) return;
    
    setFollowLoading(true);
    try {
      if (isUserFollowing) {
        const result = await unfollowUser(userId);
        if (result.success) {
          setIsUserFollowing(false);
        } else {
          Alert.alert('Error', result.message);
        }
      } else {
        const result = await followUser(userId, userProfile.displayName, userProfile.photoURL);
        if (result.success) {
          setIsUserFollowing(true);
        } else {
          Alert.alert('Error', result.message);
        }
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      Alert.alert('Error', 'Failed to update follow status');
    } finally {
      setFollowLoading(false);
    }
  };

  // Check if should show tooltips whenever screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      console.log('🚀 FoodPassport: Screen focused, checking tooltips...');
      const checkTooltips = async () => {
        try {
          const onboardingService = (await import('../services/onboardingService')).default;
          
          const shouldShow = await onboardingService.shouldShowFoodPassportTooltips();
          console.log('🔍 FoodPassport: Should show tooltips?', shouldShow);
          
          if (shouldShow) {
            console.log('🎯 FoodPassport: Setting showTooltips to TRUE');
            setShowTooltips(true);
          } else {
            console.log('❌ FoodPassport: NOT showing tooltips');
          }
        } catch (error) {
          console.error('❌ Error checking tooltips:', error);
        }
      };
      
      checkTooltips();
    }, [])
  );
  
  // Debug log whenever showTooltips changes
  React.useEffect(() => {
    console.log('🎭 FoodPassport: showTooltips changed to:', showTooltips);
  }, [showTooltips]);

  React.useEffect(() => {
    loadUserProfile();
  }, [userId]);
  
  // Reset tab index when route params change (e.g., when navigating to different user)
  React.useEffect(() => {
    if (route.params?.tabIndex !== undefined) {
      setTabIndex(route.params.tabIndex);
    }
  }, [route.params?.tabIndex, route.params?.userId]);
  
  const loadUserProfile = async () => {
    setIsLoading(true);
    
    try {
      if (!isOwnProfile && userId) {
        // Load other user's profile
        const profile: any = {
          userId: userId,
          displayName: userName || 'User',
          photoURL: userPhoto || null, // Use the passed userPhoto first
        };
        
        // If no userPhoto was passed, try to get it from their meals
        if (!userPhoto) {
          const mealsSnapshot = await firestore()
            .collection('mealEntries')
            .where('userId', '==', userId)
            .limit(1)
            .get();
          
          if (!mealsSnapshot.empty) {
            const firstMeal = mealsSnapshot.docs[0].data();
            if (firstMeal.userPhoto) {
              profile.photoURL = firstMeal.userPhoto;
            }
            if (firstMeal.userName && !userName) {
              profile.displayName = firstMeal.userName;
            }
          }
        }
        
        setUserProfile(profile);
        
        // Check follow status for other user's profile
        if (userId) {
          const followStatus = await isFollowing(userId);
          setIsUserFollowing(followStatus);
        }
      } else {
        // Own profile
        const currentUser = auth().currentUser;
        if (currentUser) {
          setUserProfile({
            userId: currentUser.uid,
            displayName: currentUser.displayName || 'User',
            photoURL: currentUser.photoURL,
          });
        }
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    } finally {
      // Small delay to ensure components initialize
      setTimeout(() => {
        setIsLoading(false);
      }, 300);
    }
  };
  
  // Add a useEffect to log when activeFilters change
  React.useEffect(() => {
    console.log('FoodPassportWrapper: activeFilters changed in useEffect:', JSON.stringify(activeFilters));
  }, [activeFilters]);

  // Scene renderer function for custom tab implementation
  const renderScene = ({ route }: { route: Route }) => {
    const targetUserId = userId || auth().currentUser?.uid;
    
    switch (route.key) {
      case 'passport':
        return (
          <ErrorBoundary navigation={navigation}>
            <FoodPassportScreen 
              navigation={navigation}
              activeFilters={activeFilters}
              activeRatingFilters={activeRatingFilters}
              userId={targetUserId}
              userName={userName}
              userPhoto={userPhoto}
              onStatsUpdate={(stats) => setProfileStats(stats)}
              onFilterChange={handleFilterChange}
              onTabChange={setTabIndex}
            />
          </ErrorBoundary>
        );
      case 'saved':
        return (
          <ErrorBoundary navigation={navigation}>
            <SavedMealsScreen 
              navigation={navigation}
              activeFilters={activeFilters}
              activeRatingFilters={activeRatingFilters}
              userId={targetUserId}
              isOwnProfile={isOwnProfile}
            />
          </ErrorBoundary>
        );
      case 'map':
        return (
          <ErrorBoundary navigation={navigation}>
            <MapScreen 
              navigation={navigation}
              activeFilters={activeFilters}
              activeRatingFilters={activeRatingFilters}
              isActive={tabIndex === 2} // Map is always at index 2 now
              userId={targetUserId}
            />
          </ErrorBoundary>
        );
      case 'stamps':
        return (
          <ErrorBoundary navigation={navigation}>
            <StampsScreen 
              userId={targetUserId}
              navigation={navigation}
              onFilterChange={handleFilterChange}
              onTabChange={setTabIndex}
              route={{ params: { openChallengeModal: openChallengeModal } }}
            />
          </ErrorBoundary>
        );
      default:
        return null;
    }
  };

  // We're now using a custom tab implementation instead of TabView's renderTabBar

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a2b49" />
        <Text style={styles.loadingText}>Loading Food Passport...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        style={styles.scrollContainer} 
        showsVerticalScrollIndicator={false}
        scrollEnabled={tabIndex !== 2} // Disable scroll for map tab (index 2)
      >
        {/* Profile Card */}
        <ProfileCard
          userProfile={userProfile}
          profileStats={profileStats}
          isOwnProfile={isOwnProfile}
          onSignOut={isOwnProfile ? handleSignOut : undefined}
          onFollowToggle={!isOwnProfile ? handleFollowToggle : undefined}
          isFollowing={isUserFollowing}
          followLoading={followLoading}
          unreadCount={isOwnProfile ? unreadCount : undefined}
          onNotificationPress={isOwnProfile ? handleNotificationPress : undefined}
        />
        
        {/* Tab navigation */}
        <View 
          style={styles.tabBarContainer}
          onLayout={(event) => {
            const layout = event.nativeEvent.layout;
            console.log('📐 FoodPassport: Tab bar layout detected:', layout);
            setTabBarLayout(layout);
          }}
        >
          {routes.map((route, i) => (
            <TouchableOpacity
              key={route.key}
              style={[
                styles.tabButton,
                { borderBottomWidth: tabIndex === i ? 3 : 0 }
              ]}
              onPress={() => setTabIndex(i)}
              activeOpacity={0.8}
            >
              <Image
                source={tabIndex === i ? route.activeIcon : route.inactiveIcon}
                style={styles.tabIcon}
                resizeMode="contain"
              />
              <Text style={[
                styles.tabLabel,
                { color: tabIndex === i ? '#ffc008' : '#1a2b49' }
              ]}>
                {route.title}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        
        {/* Shared filter component */}
        <View style={styles.filterArea}>
          <CompositeFilterComponent 
            key="shared-passport-filter"
            onFilterChange={handleFilterChange}
            onRatingFilterChange={handleRatingFilterChange}
            initialFilters={activeFilters}
            initialRatings={activeRatingFilters}
            onUserSelect={(searchUserId, searchUserName, searchUserPhoto) => {
              console.log('FoodPassport: Switching to user profile:', searchUserName, searchUserId, 'Photo:', searchUserPhoto);
              
              // Check if we're already viewing this user
              if (searchUserId === userId) {
                console.log('Already viewing this user profile');
                return;
              }
              
              // If we're on own profile or different user, navigate to the searched user
              if (!userId || userId === auth().currentUser?.uid) {
                // From own profile, navigate to other user
                navigation.navigate('FoodPassport', { 
                  userId: searchUserId, 
                  userName: searchUserName,
                  userPhoto: searchUserPhoto,
                  tabIndex: 0 // Always start on meals tab
                });
              } else {
                // From other user profile, replace with new user
                navigation.setParams({ 
                  userId: searchUserId, 
                  userName: searchUserName,
                  userPhoto: searchUserPhoto,
                  tabIndex: 0 // Always start on meals tab
                });
              }
            }}
          />
        </View>
        
        {/* Content area */}
        <View style={[
          styles.contentContainer,
          tabIndex === 2 && styles.mapContentContainer // Special styling for map tab
        ]}>
          {renderScene({ route: routes[tabIndex] })}
        </View>
      </ScrollView>
      
      {/* Tooltip Onboarding */}
      <TooltipOnboarding
        steps={[
          {
            id: 'first-meal',
            targetPosition: {
              x: width / 2 - 100, // Center horizontally
              y: height / 2 - 50, // Center vertically
              width: 200,
              height: 100,
            },
            message: 'Your meals show up here. Rate them so others can see!'
            // No arrowDirection = no blue box, centered tooltip
          },
          {
            id: 'map-tab',
            targetPosition: {
              x: (width / 4) * 2 + 20 + 5, // Third tab (My Map) - move a few pixels right
              y: 150 - 25, // Moved down a bit more to better align with tabs
              width: width / 8, // Much narrower box
              height: 50,
            },
            message: 'They are automatically saved on a map you can share with friends.',
            arrowDirection: 'up'
          },
          {
            id: 'stamps-tab',
            targetPosition: {
              x: (width / 4) * 3 + 20 + 5 - 3, // Fourth tab (Accolades) - adjust left to keep center
              y: 150 - 25, // Moved down a bit more to better align with tabs
              width: width / 8 + 6, // Make box a few pixels wider
              height: 50,
            },
            message: "You'll be given challenges and awards along the way. Don't forget to check!",
            arrowDirection: 'up'
          }
        ]}
        isVisible={showTooltips}
        onComplete={handleTooltipComplete}
        onSkip={handleTooltipSkip}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  scrollContainer: {
    flex: 1,
  },
  mapContentContainer: {
    height: height - 220, // Fixed height for map (screen height minus profile card and navigation)
  },
  headerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#FAF9F6',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  signOutButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  signOutText: {
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    color: '#1a2b49',
    fontWeight: '500',
    fontSize: 14,
  },
  tabBarContainer: {
    flexDirection: 'row',
    backgroundColor: '#FAF9F6',
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  filterArea: {
    paddingHorizontal: 15,
    paddingTop: 8, // Increased to match bottom padding for evenness
    paddingBottom: 8, // Reduced from 10 to 8
    backgroundColor: '#FAF9F6',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    zIndex: 5,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomColor: '#ffc008', // Changed to gold color
    backgroundColor: 'transparent', // Explicitly set transparent background
  },
  tabIcon: {
    width: 28,
    height: 28,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  contentContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
  },
  loadingText: {
    marginTop: 10,
    color: '#1a2b49', // Changed to navy blue
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f8f8',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ff6b6b',
    marginBottom: 10,
  },
  errorMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  errorButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
  },
  retryButton: {
    backgroundColor: '#ff6b6b',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    marginHorizontal: 10,
  },
  homeButton: {
    backgroundColor: '#4285F4',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    marginHorizontal: 10,
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  headerButton: {
    width: 60, // Fixed width for consistency
  },
  backButton: {
    padding: 8,
  },
  backIcon: {
    width: 24,
    height: 24,
    tintColor: '#1a2b49',
  },
});

export default FoodPassportWrapper;
