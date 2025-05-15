import { NativeModules, Platform } from 'react-native';

// Get the native module
const { PhotoGPSModule } = NativeModules;

// Define type for location data
export interface LocationData {
  latitude: number;
  longitude: number;
  source: string;
  altitude?: number;
  accuracy?: number;
}

// Define type for photo asset
export interface PhotoAsset {
  uri: string;
  width: number;
  height: number;
  hasLocation: boolean;
  location?: LocationData;
  assetId?: string;
  originalUri?: string;
  fromGallery: boolean;
}

// Define our JavaScript interface to the native module
const PhotoGPS = {
  // Check photo library permission status
  async checkPhotoPermission(): Promise<string> {
    if (Platform.OS !== 'ios') {
      return 'unavailable';
    }
    return await PhotoGPSModule.checkPhotoPermission();
  },

  // Request photo library permission
  async requestPhotoPermission(): Promise<string> {
    if (Platform.OS !== 'ios') {
      return 'unavailable';
    }
    return await PhotoGPSModule.requestPhotoPermission();
  },

  // Present the photo picker and get selected photo with metadata
  async presentPhotoPicker(): Promise<PhotoAsset | null> {
    if (Platform.OS !== 'ios') {
      return null;
    }
    try {
      const result = await PhotoGPSModule.presentPhotoPicker();
      if (!result) {
        return null; // User cancelled
      }
      return {
        uri: result.uri,
        width: result.width,
        height: result.height,
        hasLocation: result.hasLocation,
        location: result.location,
        assetId: result.assetId,
        originalUri: result.uri, // Set the originalUri to be the same as uri
        fromGallery: true,
      };
    } catch (error) {
      console.error('Error presenting photo picker:', error);
      return null;
    }
  },

  // Extract GPS data from a PHAsset using its ID
  async extractGPSFromAsset(assetId: string): Promise<LocationData | null> {
    if (Platform.OS !== 'ios' || !assetId) {
      return null;
    }
    try {
      return await PhotoGPSModule.extractGPSFromAsset(assetId);
    } catch (error) {
      console.error('Error extracting GPS from asset:', error);
      return null;
    }
  },

  // Extract GPS data from a file path (useful for camera photos)
  async extractGPSFromPath(path: string): Promise<LocationData | null> {
    if (Platform.OS !== 'ios' || !path) {
      return null;
    }
    try {
      return await PhotoGPSModule.extractGPSFromPath(path);
    } catch (error) {
      console.error('Error extracting GPS from path:', error);
      return null;
    }
  },

  // Get current device location
  async getCurrentLocation(): Promise<LocationData | null> {
    if (Platform.OS !== 'ios') {
      return null;
    }
    try {
      return await PhotoGPSModule.getCurrentLocation();
    } catch (error) {
      console.error('Error getting current location:', error);
      return null;
    }
  },
};

export default PhotoGPS;