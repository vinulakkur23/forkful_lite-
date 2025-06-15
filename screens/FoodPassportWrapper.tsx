import React, { useState, useEffect } from 'react';
import { View, Text, SafeAreaView, StyleSheet, ActivityIndicator, TouchableOpacity, Dimensions, Image, Alert } from 'react-native';
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

const { width } = Dimensions.get('window');

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
  
  
  const [isLoading, setIsLoading] = useState(true);
  const [tabIndex, setTabIndex] = useState(initialTabIndex);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [profileStats, setProfileStats] = useState({
    totalMeals: 0,
    averageRating: 0,
    badgeCount: 0
  });
  
  // Always show all 4 tabs for consistency
  const routes = React.useMemo<Route[]>(() => [
    { 
      key: 'passport', 
      title: isOwnProfile ? 'My Meals' : 'Meals', 
      activeIcon: require('../assets/icons/passport_tabs/meals-active.png'), 
      inactiveIcon: require('../assets/icons/passport_tabs/meals-inactive.png')
    },
    { 
      key: 'saved', 
      title: 'Saved', 
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
      title: 'Stamps', 
      activeIcon: require('../assets/icons/passport_tabs/stamps-active.png'), 
      inactiveIcon: require('../assets/icons/passport_tabs/stamps-inactive.png')
    },
  ], [isOwnProfile]);
  
  // Shared filter state for both tabs - now an array of filters
  const [activeFilters, setActiveFilters] = useState<FilterItem[] | null>(null);
  const [activeRatingFilters, setActiveRatingFilters] = useState<number[] | null>(null);
  
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
        <ActivityIndicator size="large" color="#ffc008" />
        <Text style={styles.loadingText}>Loading Food Passport...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header hidden - sign out moved to profile card */}
      {false && <View style={styles.headerSection}>
        {(!isOwnProfile && tabIndex !== 2) ? (
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={() => navigation.goBack()}
          >
            <Image
              source={require('../assets/icons/back-icon.png')}
              style={styles.backIcon}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerButton} /> // Empty view for spacing
        )}
        
        <Text style={styles.headerTitle}>Food Passport</Text>
        
        {isOwnProfile ? (
          <TouchableOpacity 
            onPress={async () => {
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
            }} 
            style={styles.signOutButton}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.signOutButton} /> // Empty view for spacing
        )}
      </View>}
      
      
      {/* Tab navigation */}
      <View style={styles.tabBarContainer}>
        {routes.map((route, i) => (
          <TouchableOpacity
            key={route.key}
            style={[
              styles.tabButton,
              { borderBottomWidth: tabIndex === i ? 3 : 0 }
            ]}
            onPress={() => setTabIndex(i)}
          >
            <Image
              source={tabIndex === i ? route.activeIcon : route.inactiveIcon}
              style={styles.tabIcon}
              resizeMode="contain"
            />
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
      <View style={styles.contentContainer}>
        {renderScene({ route: routes[tabIndex] })}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
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
    borderBottomColor: '#E63946', // Changed to DishItOut Lobster font red color
  },
  tabIcon: {
    width: 28,
    height: 28,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
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
