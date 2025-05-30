import React, { useState } from 'react';
import { View, Text, SafeAreaView, StyleSheet, ActivityIndicator, TouchableOpacity, Dimensions, Image } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../App';
import FoodPassportScreen from './FoodPassportScreen';
import MapScreen from './MapScreen';
import StampsScreen from './StampsScreen';
import SavedMealsScreen from './SavedMealsScreen';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { firebase, auth } from '../firebaseConfig';
import SimpleFilterComponent, { FilterItem } from '../components/SimpleFilterComponent';

const { width } = Dimensions.get('window');

type FoodPassportWrapperProps = {
  navigation: StackNavigationProp<RootStackParamList, 'FoodPassport'>;
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
  const [isLoading, setIsLoading] = useState(true);
  const [tabIndex, setTabIndex] = useState(0);
  // We'll use require() for the default icons, but custom icons can be added to assets/icons/passport_tabs/
  const [routes] = useState<Route[]>([
    { 
      key: 'passport', 
      title: 'My Meals', 
      activeIcon: require('../assets/icons/passport_tabs/meals-active.png'), 
      inactiveIcon: require('../assets/icons/passport_tabs/meals-inactive.png')
    },
    { 
      key: 'saved', 
      title: 'Saved', 
      activeIcon: require('../assets/icons/wishlist-active.png'),
      inactiveIcon: require('../assets/icons/wishlist-inactive.png')
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
  ]);
  
  // Shared filter state for both tabs - now an array of filters
  const [activeFilters, setActiveFilters] = useState<FilterItem[] | null>(null);
  
  // Handle filter changes from SimpleFilterComponent
  const handleFilterChange = (filters: FilterItem[] | null) => {
    console.log('FoodPassportWrapper: Filters changed to:', JSON.stringify(filters));
    setActiveFilters(filters);
    
    // Log the new state on the next render
    setTimeout(() => {
      console.log('FoodPassportWrapper: Active filters after state update:', JSON.stringify(activeFilters));
    }, 0);
  };

  React.useEffect(() => {
    // Simulate loading to give components time to initialize
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 300);
    
    return () => clearTimeout(timer);
  }, []);
  
  // Add a useEffect to log when activeFilters change
  React.useEffect(() => {
    console.log('FoodPassportWrapper: activeFilters changed in useEffect:', JSON.stringify(activeFilters));
  }, [activeFilters]);

  // Scene renderer function for custom tab implementation
  const renderScene = ({ route }: { route: Route }) => {
    switch (route.key) {
      case 'passport':
        return (
          <ErrorBoundary navigation={props.navigation}>
            <FoodPassportScreen 
              navigation={props.navigation}
              activeFilters={activeFilters}
            />
          </ErrorBoundary>
        );
      case 'saved':
        return (
          <ErrorBoundary navigation={props.navigation}>
            <SavedMealsScreen 
              navigation={props.navigation}
              activeFilters={activeFilters}
            />
          </ErrorBoundary>
        );
      case 'map':
        return (
          <ErrorBoundary navigation={props.navigation}>
            <MapScreen 
              navigation={props.navigation}
              activeFilters={activeFilters}
              isActive={tabIndex === 2} // Updated index since we added a new tab
            />
          </ErrorBoundary>
        );
      case 'stamps':
        return (
          <ErrorBoundary navigation={props.navigation}>
            <StampsScreen />
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
        <ActivityIndicator size="large" color="#ff6b6b" />
        <Text style={styles.loadingText}>Loading Food Passport...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with title and sign out */}
      <View style={styles.headerSection}>
        <Text style={styles.headerTitle}>Food Passport</Text>
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
              props.navigation.reset({
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
      </View>
      
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
        <SimpleFilterComponent 
          key="shared-passport-filter"
          onFilterChange={handleFilterChange}
          initialFilters={activeFilters}
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
    paddingTop: 3, // Reduced from 5 to 3
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
    borderBottomColor: '#ff6b6b',
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
    color: '#666',
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
  }
});

export default FoodPassportWrapper;
