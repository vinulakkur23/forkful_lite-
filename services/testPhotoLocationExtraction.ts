/**
 * Test script for validating photo location extraction
 * This shows how the app should extract and use location from photos
 */

import PhotoGPS, { LocationData, PhotoAsset } from './photoGPSModule';

/**
 * Simulate location extraction from a photo
 * This demonstrates the expected flow when processing photos with location data
 */
const testPhotoLocationExtraction = () => {
  // Simulate a photo picked from the library
  const simulatePhotoWithLocation = async (): Promise<{ success: boolean, photoAsset?: PhotoAsset }> => {
    console.log('Simulating photo selection with location data');
    
    // Create a mock PhotoAsset with location data
    const mockPhotoAsset: PhotoAsset = {
      uri: 'file:///tmp/test_photo.jpg',
      width: 1200,
      height: 800,
      hasLocation: true,
      location: {
        latitude: 45.5231,
        longitude: -122.6765,
        source: 'PHAsset'
      },
      assetId: 'mock-asset-id-12345',
      fromGallery: true
    };
    
    return { success: true, photoAsset: mockPhotoAsset };
  };
  
  // Simulate photo without built-in location
  const simulatePhotoWithoutLocation = async (): Promise<{ success: boolean, photoAsset?: PhotoAsset }> => {
    console.log('Simulating photo selection without location data');
    
    // Create a mock PhotoAsset without location data
    const mockPhotoAsset: PhotoAsset = {
      uri: 'file:///tmp/test_photo_no_location.jpg',
      width: 1200,
      height: 800,
      hasLocation: false,
      assetId: 'mock-asset-id-67890',
      fromGallery: true
    };
    
    return { success: true, photoAsset: mockPhotoAsset };
  };
  
  // Function to extract location from a photo
  const extractLocationFromPhoto = async (photoAsset: PhotoAsset): Promise<LocationData | null> => {
    console.log(`Extracting location from photo: ${photoAsset.uri}`);
    
    // First check if the photo already has location data
    if (photoAsset.hasLocation && photoAsset.location) {
      console.log('Photo already has location data from PHAsset');
      
      // Ensure the location has priority info
      const locationWithPriority: LocationData = {
        ...photoAsset.location,
        priority: 2 // Photo location gets priority 2
      };
      
      return locationWithPriority;
    }
    
    // If not, check if we have an assetId to extract location from
    if (photoAsset.assetId) {
      console.log(`Attempting to extract location using assetId: ${photoAsset.assetId}`);
      
      // This would call PhotoGPS.extractGPSFromAsset in the real app
      // Here we simulate the call with a mock response
      
      // Simulate a 50% chance of finding location data
      const hasLocation = Math.random() > 0.5;
      if (hasLocation) {
        const mockLocationData: LocationData = {
          latitude: 45.5230 + (Math.random() * 0.01),
          longitude: -122.6760 + (Math.random() * 0.01),
          source: 'PHAsset',
          priority: 2
        };
        console.log('Successfully extracted location from PHAsset', mockLocationData);
        return mockLocationData;
      } else {
        console.log('No location data found in PHAsset');
      }
    }
    
    // If we have a file path, try to extract EXIF data
    console.log(`Attempting to extract EXIF data from file: ${photoAsset.uri}`);
    
    // This would call PhotoGPS.extractGPSFromPath in the real app
    // Here we simulate the call with a mock response
    
    // Simulate a 30% chance of finding EXIF location data
    const hasExifLocation = Math.random() > 0.7;
    if (hasExifLocation) {
      const mockExifLocation: LocationData = {
        latitude: 45.5235 + (Math.random() * 0.01),
        longitude: -122.6770 + (Math.random() * 0.01),
        source: 'exif',
        priority: 2
      };
      console.log('Successfully extracted location from EXIF data', mockExifLocation);
      return mockExifLocation;
    } else {
      console.log('No location data found in EXIF');
    }
    
    // If we couldn't get location from the photo, attempt to get device location
    console.log('Falling back to device location');
    
    // This would call PhotoGPS.getCurrentLocation in the real app
    // Here we simulate the call with a mock response
    
    try {
      const mockDeviceLocation: LocationData = {
        latitude: 45.5240 + (Math.random() * 0.01),
        longitude: -122.6780 + (Math.random() * 0.01),
        source: 'device',
        priority: 3
      };
      console.log('Successfully got device location', mockDeviceLocation);
      return mockDeviceLocation;
    } catch (error) {
      console.log('Failed to get device location');
      return null;
    }
  };
  
  // Simulate what happens in the app when a photo is selected
  const handlePhotoSelection = async (withLocation: boolean) => {
    try {
      // Get photo from library (simulated)
      const result = withLocation
        ? await simulatePhotoWithLocation()
        : await simulatePhotoWithoutLocation();
      
      if (!result.success || !result.photoAsset) {
        console.log('Photo selection failed or was cancelled');
        return;
      }
      
      const photoAsset = result.photoAsset;
      console.log(`Selected photo: ${photoAsset.uri}, has location: ${photoAsset.hasLocation}`);
      
      // Extract location data from the photo
      const locationData = await extractLocationFromPhoto(photoAsset);
      
      console.log('Final location data:', locationData);
      
      // This is where we would navigate to RatingScreen2 with the photo and location
      console.log(`Navigating to RatingScreen2 with photo ${photoAsset.uri} and location data`);
      
    } catch (error) {
      console.error('Error in photo selection flow:', error);
    }
  };
  
  // Run test cases
  console.log('\n--- Test Case 1: Photo with embedded location ---');
  handlePhotoSelection(true);
  
  console.log('\n--- Test Case 2: Photo without embedded location ---');
  handlePhotoSelection(false);
};

// Run the test
console.log('------- STARTING PHOTO LOCATION EXTRACTION TESTS -------');
testPhotoLocationExtraction();
console.log('------- PHOTO LOCATION EXTRACTION TESTS COMPLETED -------');

export {};