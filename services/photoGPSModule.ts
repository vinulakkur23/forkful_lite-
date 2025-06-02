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

  // Get current device location with timeout and retry logic
  async getCurrentLocation(timeoutMs: number = 5000, retryCount: number = 2): Promise<LocationData | null> {
    if (Platform.OS !== 'ios') {
      return null;
    }
    
    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        console.log(`PhotoGPS getCurrentLocation attempt ${attempt}/${retryCount} with ${timeoutMs}ms timeout`);
        
        // Pass timeout to the native module directly
        const result = await PhotoGPSModule.getCurrentLocation(timeoutMs);
        
        if (result) {
          console.log(`Successfully got current location on attempt ${attempt}:`, result);
          return result;
        }
      } catch (error) {
        const isLastAttempt = attempt === retryCount;
        console.error(`Error getting current location (attempt ${attempt}/${retryCount}):`, error);
        
        if (isLastAttempt) {
          console.error('All location attempts failed, returning null');
          return null;
        } else {
          // Wait before retrying (with exponential backoff)
          const delayMs = 1000 * attempt;
          console.log(`Waiting ${delayMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    
    return null;
  },

  // Test location services health with detailed diagnostics
  async testLocationServices(): Promise<{ working: boolean; details: string[] }> {
    const details: string[] = [];
    let working = false;

    if (Platform.OS !== 'ios') {
      details.push('Not iOS platform - native location services unavailable');
      return { working: false, details };
    }

    try {
      details.push('Testing native PhotoGPS module...');
      const startTime = Date.now();
      
      const result = await PhotoGPS.getCurrentLocation(3000, 1);
      const duration = Date.now() - startTime;
      
      if (result) {
        working = true;
        details.push(`✅ Native location working (${duration}ms): ${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}`);
      } else {
        details.push('❌ Native location returned null');
      }
    } catch (error) {
      details.push(`❌ Native location failed: ${error.message}`);
    }

    return { working, details };
  },
};

export default PhotoGPS;