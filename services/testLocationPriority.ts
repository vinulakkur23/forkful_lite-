/**
 * Test script for validating the location priority system in RatingScreen2
 * This simulates different location scenarios to verify correct behavior
 */

import { LocationData } from './photoGPSModule';

/**
 * Test the location priority system
 * This simulates the getBestAvailableLocation function from RatingScreen2
 */
const testLocationPriority = () => {
  // Function to get best available location based on priority
  // This is copied from RatingScreen2.tsx getBestAvailableLocation function
  const getBestAvailableLocation = (
    location: LocationData | null,
    deviceLocation: LocationData | null
  ): LocationData | null => {
    // Check if we have restaurant-selected location (priority 1)
    if (location && location.source === 'restaurant_selection') {
      console.log('Using restaurant_selection location (priority 1)');
      return location;
    }
    
    // Check if we have photo location (priority 2)
    if (location && (location.source === 'exif' || location.source === 'PHAsset')) {
      console.log('Using photo location from EXIF/PHAsset (priority 2)');
      return location;
    }
    
    // Check if we have any location set
    if (location) {
      console.log(`Using general location from source: ${location.source} (priority ${location.priority})`);
      return location;
    }
    
    // Fallback to device location
    if (deviceLocation) {
      console.log('Using device location (priority 3)');
      return deviceLocation;
    }
    
    console.log('No location available');
    return null;
  };

  // Test Case 1: All location types available
  console.log('\n--- Test Case 1: All location types available ---');
  const restaurantLocation: LocationData = {
    latitude: 45.5231,
    longitude: -122.6765,
    source: 'restaurant_selection',
    priority: 1
  };
  
  const photoLocation: LocationData = {
    latitude: 45.5234,
    longitude: -122.6768,
    source: 'PHAsset',
    priority: 2
  };
  
  const deviceLocation: LocationData = {
    latitude: 45.5238,
    longitude: -122.6772,
    source: 'device',
    priority: 3
  };
  
  const bestLocation1 = getBestAvailableLocation(restaurantLocation, deviceLocation);
  console.log('Best location should be restaurant_selection:', bestLocation1?.source);
  
  // Test Case 2: Only photo and device location available
  console.log('\n--- Test Case 2: Only photo and device location available ---');
  const bestLocation2 = getBestAvailableLocation(photoLocation, deviceLocation);
  console.log('Best location should be PHAsset:', bestLocation2?.source);
  
  // Test Case 3: Only device location available
  console.log('\n--- Test Case 3: Only device location available ---');
  const bestLocation3 = getBestAvailableLocation(null, deviceLocation);
  console.log('Best location should be device:', bestLocation3?.source);
  
  // Test Case 4: No locations available
  console.log('\n--- Test Case 4: No locations available ---');
  const bestLocation4 = getBestAvailableLocation(null, null);
  console.log('Best location should be null:', bestLocation4 === null ? 'null' : bestLocation4?.source);
  
  // Test Case 5: Testing priority override
  console.log('\n--- Test Case 5: Testing priority override ---');
  const lowPriorityLocation: LocationData = {
    latitude: 45.5231,
    longitude: -122.6765,
    source: 'unknown',
    priority: 4
  };
  
  const bestLocation5 = getBestAvailableLocation(lowPriorityLocation, deviceLocation);
  console.log('Best location should be unknown:', bestLocation5?.source, 'with priority', bestLocation5?.priority);
};

// Run the test
console.log('------- STARTING LOCATION PRIORITY TESTS -------');
testLocationPriority();
console.log('------- LOCATION PRIORITY TESTS COMPLETED -------');

export {};