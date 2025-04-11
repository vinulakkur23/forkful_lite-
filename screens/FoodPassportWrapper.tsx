import React, { useState } from 'react';
import { View, Text, SafeAreaView, StyleSheet, ActivityIndicator } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../App';

// Import the original FoodPassportScreen - but with error handling
let OriginalFoodPassportScreen: React.ComponentType<any>;
try {
  // Using require instead of import gives us more control for error handling
  OriginalFoodPassportScreen = require('./FoodPassportScreen').default;
} catch (error) {
  console.error('Error importing FoodPassportScreen:', error);
  // Create a fallback component if the import fails
  OriginalFoodPassportScreen = () => (
    <View style={{ padding: 20 }}>
      <Text>Error loading Food Passport component: {error.message}</Text>
    </View>
  );
}

type FoodPassportWrapperProps = {
  navigation: StackNavigationProp<RootStackParamList, 'FoodPassport'>;
};

const FoodPassportWrapper: React.FC<FoodPassportWrapperProps> = (props) => {
  const [hasError, setHasError] = useState(false);
  const [errorInfo, setErrorInfo] = useState<string | null>(null);

  // Create error boundary functionality
  class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; error: Error | null }
  > {
    constructor(props: { children: React.ReactNode }) {
      super(props);
      this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
      return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
      console.error('FoodPassport component error:', error, errorInfo);
      setHasError(true);
      setErrorInfo(error.message);
    }

    render() {
      if (this.state.hasError) {
        return (
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorMessage}>{this.state.error?.message}</Text>
          </View>
        );
      }

      return this.props.children;
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ErrorBoundary>
        {/* Conditionally render the original component */}
        {OriginalFoodPassportScreen ? (
          <OriginalFoodPassportScreen {...props} />
        ) : (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ff6b6b" />
            <Text style={styles.loadingText}>Loading Food Passport...</Text>
          </View>
        )}
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
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
  },
});

export default FoodPassportWrapper;