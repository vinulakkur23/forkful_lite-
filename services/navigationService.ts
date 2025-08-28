import { NavigationContainerRef } from '@react-navigation/native';
import React from 'react';

// Create a navigation reference that can be used outside React components
export const navigationRef = React.createRef<NavigationContainerRef<any>>();

// Helper function to navigate from outside React components
export function navigate(name: string, params?: any) {
  console.log('🔘 NavigationService: navigate called with:', name, params);
  console.log('🔘 NavigationService: navigationRef.current exists:', !!navigationRef.current);
  
  if (navigationRef.current && navigationRef.current.isReady()) {
    console.log('🔘 NavigationService: navigation ref is ready, navigating...');
    navigationRef.current.navigate(name, params);
  } else if (navigationRef.current) {
    console.log('🔘 NavigationService: navigation ref exists but not ready, waiting...');
    // Wait for navigation to be ready and try again
    const checkReady = () => {
      if (navigationRef.current?.isReady()) {
        console.log('🔘 NavigationService: navigation ref is now ready, navigating...');
        navigationRef.current.navigate(name, params);
      } else {
        console.log('🔘 NavigationService: still not ready, retrying in 100ms...');
        setTimeout(checkReady, 100);
      }
    };
    checkReady();
  } else {
    console.warn('🔘 NavigationService: Navigation ref not ready and does not exist');
  }
}

export function goBack() {
  if (navigationRef.current) {
    navigationRef.current.goBack();
  }
}