import React, { useState } from 'react';
import { View, Text, SafeAreaView, StyleSheet, ActivityIndicator, TouchableOpacity, Dimensions } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../App';
import FoodPassportScreen from './FoodPassportScreen';
import MapScreen from './MapScreen';
import StampsScreen from './StampsScreen';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { firebase, auth } from '../firebaseConfig';

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
  icon: string;
};

const FoodPassportWrapper: React.FC<FoodPassportWrapperProps> = (props) => {
  const [isLoading, setIsLoading] = useState(true);
  const [tabIndex, setTabIndex] = useState(0);
  const [routes] = useState<Route[]>([
    { key: 'passport', title: 'My Meals', icon: 'restaurant-menu' },
    { key: 'map', title: 'Map', icon: 'place' },
    { key: 'stamps', title: 'Stamps', icon: 'emoji-events' },
  ]);

  React.useEffect(() => {
    // Simulate loading to give components time to initialize
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 300);
    
    return () => clearTimeout(timer);
  }, []);

  // Scene renderer function for custom tab implementation
  const renderScene = ({ route }: { route: Route }) => {
    switch (route.key) {
      case 'passport':
        return (
          <ErrorBoundary navigation={props.navigation}>
            <FoodPassportScreen navigation={props.navigation} />
          </ErrorBoundary>
        );
      case 'map':
        return (
          <ErrorBoundary navigation={props.navigation}>
            <MapScreen navigation={props.navigation} />
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
      {/* App header */}
      <View style={styles.header}>
        <Text style={styles.title}>Food Passport</Text>
        <TouchableOpacity onPress={() => auth().signOut()} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
      
      {/* Tab navigation is inserted directly, not using renderTabBar */}
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
            <Icon 
              name={route.icon} 
              size={24} 
              color={tabIndex === i ? '#ff6b6b' : '#999'} 
              style={styles.tabIcon} 
            />
            <Text 
              style={[
                styles.tabLabel,
                { color: tabIndex === i ? '#ff6b6b' : '#999' }
              ]}
            >
              {route.title}
            </Text>
          </TouchableOpacity>
        ))}
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
    backgroundColor: '#f8f8f8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: '#ff6b6b',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  signOutButton: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 5,
  },
  signOutText: {
    color: '#fff',
    fontWeight: '500',
    fontSize: 14,
  },
  tabBarContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomColor: '#ff6b6b',
  },
  tabIcon: {
    marginBottom: 4,
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
