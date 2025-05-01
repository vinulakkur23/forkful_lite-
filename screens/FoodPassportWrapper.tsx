import React, { useState } from 'react';
import { View, Text, SafeAreaView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../App';
import FoodPassportScreen from './FoodPassportScreen';
import Icon from 'react-native-vector-icons/MaterialIcons';

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

const FoodPassportWrapper: React.FC<FoodPassportWrapperProps> = (props) => {
  const [isLoading, setIsLoading] = useState(true);

  React.useEffect(() => {
    // Simulate loading to give components time to initialize
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 300);
    
    return () => clearTimeout(timer);
  }, []);

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
      <ErrorBoundary navigation={props.navigation}>
        <FoodPassportScreen {...props} />
      </ErrorBoundary>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
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
