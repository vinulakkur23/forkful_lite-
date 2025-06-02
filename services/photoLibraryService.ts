import { CameraRoll, PhotoIdentifier, GetPhotosParams, AssetInfoFilterTags } from '@react-native-camera-roll/camera-roll';
import { Platform } from 'react-native';
import { getMealSuggestions } from './mealService';
import Geolocation from '@react-native-community/geolocation';
import PhotoGPS, { PhotoAsset as NativePhotoAsset, LocationData } from './photoGPSModule';

interface PhotoAsset {
  uri: string;
  width: number;
  height: number;
  originalUri?: string;
  fromGallery: boolean;
  assetId?: string;
  exifData?: any;
  location?: {
    latitude: number;
    longitude: number;
    source: string;
  } | null;
}

/**
 * Gets a photo from the camera roll with full metadata including location
 * This uses our native Swift module to extract GPS data from PHAsset on iOS
 */
export const getPhotoWithMetadata = async (): Promise<PhotoAsset | null> => {
  // First check if we're running on iOS and our native module is available
  if (Platform.OS === 'ios') {
    try {
      console.log('Using native PhotoGPS module for full metadata access');
      
      // Request photo library permission if needed
      const permissionStatus = await PhotoGPS.requestPhotoPermission();
      console.log('Photo library permission status:', permissionStatus);
      
      if (permissionStatus === 'denied' || permissionStatus === 'restricted') {
        console.log('Photo library permission denied or restricted');
        // Fall back to device location if photo access is denied
        return await getPhotoWithDeviceLocation();
      }
      
      // Present the native photo picker with metadata access
      const photoAsset = await PhotoGPS.presentPhotoPicker();
      
      if (!photoAsset) {
        console.log('No photo selected or picker was cancelled');
        return null;
      }
      
      console.log('Selected photo with native picker:', {
        uri: photoAsset.uri,
        hasLocation: photoAsset.hasLocation,
        location: photoAsset.location,
      });
      
      // Extra debug for photo location
      if (photoAsset.location) {
        console.log('PHOTO LOCATION DEBUG - Native picker provided location:', {
          latitude: photoAsset.location.latitude,
          longitude: photoAsset.location.longitude,
          source: photoAsset.location.source || 'unknown',
          hasSource: !!photoAsset.location.source
        });
      } else {
        console.log('PHOTO LOCATION DEBUG - Native picker did NOT provide location data');
      }
      
      // Convert the native photo asset to our internal format
      const result: PhotoAsset = {
        uri: photoAsset.uri,
        width: photoAsset.width,
        height: photoAsset.height,
        originalUri: photoAsset.originalUri,
        fromGallery: true,
        assetId: photoAsset.assetId,
        location: photoAsset.location,
      };
      
      // PRIORITIZE PHASSET DATA - Only fall back if photo has no location
      console.log('=== PHASSET LOCATION EXTRACTION STATUS ===');
      
      if (result.location) {
        console.log(`✅ PHOTO HAS LOCATION from source "${result.location.source}":`, 
          `${result.location.latitude}, ${result.location.longitude}`);
      } else {
        console.log('❌ Photo picker did not return location, trying direct PHAsset extraction...');
        
        // If we have an assetId, try extracting directly from PHAsset one more time
        if (photoAsset.assetId) {
          console.log('🔍 Attempting direct PHAsset extraction with enhanced Swift module...');
          try {
            const directLocationData = await PhotoGPS.extractGPSFromAsset(photoAsset.assetId);
            
            if (directLocationData) {
              console.log('✅ DIRECT PHASSET EXTRACTION SUCCESS:', directLocationData);
              result.location = directLocationData;
            } else {
              console.log('❌ Direct PHAsset extraction returned null - photo truly has no location data');
              console.log('🔄 Photo has no location data, falling back to device location...');
              result.location = await getDeviceLocationWithFallbacks();
            }
          } catch (error) {
            console.log('❌ Direct PHAsset extraction failed:', error.message);
            console.log('🔄 Falling back to device location...');
            result.location = await getDeviceLocationWithFallbacks();
          }
        } else {
          console.log('❌ No assetId available, falling back to device location...');
          result.location = await getDeviceLocationWithFallbacks();
        }
      }
      
      console.log('=== FINAL LOCATION RESULT ===');
      if (result.location) {
        console.log(`🎉 USING LOCATION from "${result.location.source}": ${result.location.latitude}, ${result.location.longitude}`);
      } else {
        console.log('😞 NO LOCATION AVAILABLE (photo has no GPS data and device location failed)');
      }
      
      return result;
    } catch (error) {
      console.error('Error using native photo GPS module:', error);
      // Fall back to the original implementation if the native module fails
      console.log('Falling back to original implementation');
      return await getPhotoWithCameraRoll();
    }
  } else {
    // On non-iOS platforms, use the original implementation
    console.log('Using CameraRoll on non-iOS platform');
    return await getPhotoWithCameraRoll();
  }
};

/**
 * Fallback method that uses CameraRoll for photo selection
 * This is used when the native module is not available or fails
 */
const getPhotoWithCameraRoll = async (): Promise<PhotoAsset | null> => {
  try {
    console.log('Using CameraRoll for photo selection');
    
    // Define the parameters for photo fetching
    const params: GetPhotosParams = {
      first: 1,
      assetType: 'Photos',
      include: [
        AssetInfoFilterTags.location,
        AssetInfoFilterTags.filename,
        AssetInfoFilterTags.fileSize,
        AssetInfoFilterTags.imageSize,
        AssetInfoFilterTags.orientation,
        AssetInfoFilterTags.filesystemData,
        AssetInfoFilterTags.exif,
      ],
    };
    
    // Check and request permissions
    const permissions = await CameraRoll.checkPhotosPermission();
    console.log('CameraRoll permission status:', permissions);
    
    if (permissions !== 'granted') {
      const result = await CameraRoll.requestPhotosPermission();
      console.log('CameraRoll permission request result:', result);
      
      if (result !== 'granted') {
        console.log('CameraRoll permission denied');
        return await getPhotoWithDeviceLocation();
      }
    }
    
    // Present the picker
    const pickerResult = await CameraRoll.presentPicker({
      mediaType: 'photo',
      selectionLimit: 1,
      includeBase64: false,
      includeFullMetadata: true,
    });
    
    // Check if user selected a photo
    if (!pickerResult.assets || pickerResult.assets.length === 0) {
      console.log('No photo selected from CameraRoll picker');
      return null;
    }
    
    const selectedAsset = pickerResult.assets[0];
    console.log('Selected asset details from CameraRoll:', selectedAsset);
    
    // Get detailed info if possible
    if (selectedAsset.uri && selectedAsset.id) {
      try {
        const photos = await CameraRoll.getPhotos({
          ...params,
          assetIds: [selectedAsset.id],
        });
        
        if (photos.edges.length > 0) {
          const photo = photos.edges[0].node;
          
          // Create location object if available
          let locationInfo = null;
          if (photo.location) {
            locationInfo = {
              latitude: photo.location.latitude,
              longitude: photo.location.longitude,
              source: 'exif',
            };
          }
          
          return {
            uri: selectedAsset.uri,
            width: photo.image.width || selectedAsset.width || 1000,
            height: photo.image.height || selectedAsset.height || 1000,
            originalUri: selectedAsset.originalUri || selectedAsset.uri,
            fromGallery: true,
            assetId: selectedAsset.id,
            exifData: photo.exif,
            location: locationInfo,
          };
        }
      } catch (error) {
        console.error('Error getting detailed photo info:', error);
      }
    }
    
    // Fallback to basic info
    console.log('Falling back to basic asset info');
    return {
      uri: selectedAsset.uri,
      width: selectedAsset.width || 1000,
      height: selectedAsset.height || 1000,
      fromGallery: true,
      originalUri: selectedAsset.originalUri || selectedAsset.uri,
      assetId: selectedAsset.id,
    };
  } catch (error) {
    console.error('Error using CameraRoll:', error);
    return await getPhotoWithDeviceLocation();
  }
};

/**
 * Last resort fallback that creates a photo asset with device location
 */
const getPhotoWithDeviceLocation = async (): Promise<PhotoAsset | null> => {
  try {
    console.log('Using device location as last resort');
    
    // Use either our native module or Geolocation to get device location
    let deviceLocation: LocationData | null = null;
    
    // Use the robust fallback chain for device location
    deviceLocation = await getDeviceLocationWithFallbacks();
    
    // We don't have a photo yet, so we'll need to use a standard picker
    const pickerOptions = {
      mediaType: 'photo' as const,
      includeBase64: false,
    };
    
    return null; // At this point we would need to use react-native-image-picker
                 // but that's beyond the scope of this implementation
  } catch (error) {
    console.error('Error in getPhotoWithDeviceLocation:', error);
    return null;
  }
};

/**
 * Prefetches restaurant suggestions using photo metadata
 * This is used to get recommendations based on a photo's location
 */
export const prefetchSuggestionsFromPhoto = async (photo: PhotoAsset): Promise<any> => {
  if (!photo || !photo.uri) {
    console.log('No photo provided for suggestion prefetching');
    return null;
  }
  
  try {
    console.log('Prefetching suggestions from photo with metadata');
    console.log('Photo details:', {
      uri: photo.uri,
      hasLocation: !!photo.location,
      location: photo.location,
    });
    
    // Extra debugging for location
    if (photo.location) {
      console.log('SUGGESTION PREFETCH DEBUG - Photo has location:', {
        latitude: photo.location.latitude,
        longitude: photo.location.longitude,
        source: photo.location.source || 'unknown',
        hasSource: !!photo.location.source,
        fullLocation: JSON.stringify(photo.location)
      });
    } else {
      console.log('SUGGESTION PREFETCH DEBUG - Photo does NOT have location data');
    }
    
    // If we have a location from the photo, use it
    if (photo.location) {
      // Make sure the location has a source property
      let locationWithSource = photo.location;
      if (!locationWithSource.source) {
        console.warn('Location missing source property in prefetchSuggestionsFromPhoto! Adding default source.');
        locationWithSource = {
          ...photo.location,
          source: 'exif' // Default source for PHAsset-based extraction
        };
      }
      
      console.log('Using photo location for suggestions:', locationWithSource);
      
      // Make sure we're using the original URI to preserve metadata
      const uriToUse = photo.originalUri || photo.uri;
      
      // Get suggestions using the photo and its location
      const suggestions = await getMealSuggestions(uriToUse, locationWithSource);
      
      console.log('Got suggestions based on photo location:', {
        hasRestaurants: suggestions?.restaurants?.length > 0,
        restaurantCount: suggestions?.restaurants?.length || 0,
        hasSuggestedMeal: !!suggestions?.suggested_meal,
      });
      
      return suggestions;
    }
    
    // Fall back to standard suggestion fetching without location
    console.log('No location in photo, fetching suggestions without location');
    const suggestions = await getMealSuggestions(photo.uri, null);
    
    return suggestions;
  } catch (error) {
    console.error('Error prefetching suggestions from photo:', error);
    return null;
  }
};

/**
 * Robust device location getter with multiple fallback strategies
 * This function tries multiple approaches to get device location when photo EXIF fails
 */
const getDeviceLocationWithFallbacks = async (): Promise<LocationData | null> => {
  console.log('Starting robust device location fallback chain...');
  
  // Strategy 1: Try native PhotoGPS module with shorter timeout first
  if (Platform.OS === 'ios') {
    try {
      console.log('Strategy 1: Trying native PhotoGPS with 3s timeout');
      const nativeLocation = await PhotoGPS.getCurrentLocation(3000);
      
      if (nativeLocation) {
        console.log('Strategy 1 SUCCESS: Got location from native module:', nativeLocation);
        return nativeLocation;
      }
    } catch (error) {
      console.log('Strategy 1 FAILED: Native PhotoGPS failed:', error.message);
    }
  }
  
  // Strategy 2: Try React Native Geolocation with high accuracy disabled for faster response
  try {
    console.log('Strategy 2: Trying React Native Geolocation (low accuracy, fast)');
    const position = await new Promise<any>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Fast geolocation timed out after 2s'));
      }, 2000);
      
      Geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timeoutId);
          resolve(pos);
        },
        (err) => {
          clearTimeout(timeoutId);
          reject(err);
        },
        { 
          enableHighAccuracy: false, 
          timeout: 1500, 
          maximumAge: 30000  // Accept locations up to 30 seconds old
        }
      );
    });
    
    if (position && position.coords) {
      const fastLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        source: 'device_fast'
      };
      console.log('Strategy 2 SUCCESS: Got fast location:', fastLocation);
      return fastLocation;
    }
  } catch (error) {
    console.log('Strategy 2 FAILED: Fast geolocation failed:', error.message);
  }
  
  // Strategy 3: Try React Native Geolocation with high accuracy but longer timeout
  try {
    console.log('Strategy 3: Trying React Native Geolocation (high accuracy)');
    const position = await new Promise<any>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('High accuracy geolocation timed out after 5s'));
      }, 5000);
      
      Geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timeoutId);
          resolve(pos);
        },
        (err) => {
          clearTimeout(timeoutId);
          reject(err);
        },
        { 
          enableHighAccuracy: true, 
          timeout: 4000, 
          maximumAge: 60000  // Accept locations up to 1 minute old
        }
      );
    });
    
    if (position && position.coords) {
      const accurateLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        source: 'device_accurate'
      };
      console.log('Strategy 3 SUCCESS: Got accurate location:', accurateLocation);
      return accurateLocation;
    }
  } catch (error) {
    console.log('Strategy 3 FAILED: High accuracy geolocation failed:', error.message);
  }
  
  // Strategy 4: Try native PhotoGPS again with longer timeout as last resort
  if (Platform.OS === 'ios') {
    try {
      console.log('Strategy 4: Trying native PhotoGPS again with 8s timeout (last resort)');
      const lastResortLocation = await PhotoGPS.getCurrentLocation(8000);
      
      if (lastResortLocation) {
        console.log('Strategy 4 SUCCESS: Got location from native module (last resort):', lastResortLocation);
        return lastResortLocation;
      }
    } catch (error) {
      console.log('Strategy 4 FAILED: Final native PhotoGPS attempt failed:', error.message);
    }
  }
  
  console.log('ALL STRATEGIES FAILED: No device location available');
  return null;
};

/**
 * Debug function to test location services health
 * You can call this from the React Native debugger console: 
 * require('./services/photoLibraryService').testLocationHealth()
 */
export const testLocationHealth = async (): Promise<void> => {
  console.log('🔍 Starting location services health check...');
  
  // Test native module
  const nativeTest = await PhotoGPS.testLocationServices();
  console.log('📱 Native PhotoGPS Test Results:');
  nativeTest.details.forEach(detail => console.log(`   ${detail}`));
  
  // Test React Native Geolocation
  console.log('🌍 Testing React Native Geolocation...');
  try {
    const startTime = Date.now();
    const position = await new Promise<any>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('RN Geolocation timed out after 5s'));
      }, 5000);
      
      Geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timeoutId);
          resolve(pos);
        },
        (err) => {
          clearTimeout(timeoutId);
          reject(err);
        },
        { enableHighAccuracy: false, timeout: 4000, maximumAge: 30000 }
      );
    });
    
    const duration = Date.now() - startTime;
    if (position && position.coords) {
      console.log(`   ✅ RN Geolocation working (${duration}ms): ${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`);
    } else {
      console.log('   ❌ RN Geolocation returned invalid position');
    }
  } catch (error) {
    console.log(`   ❌ RN Geolocation failed: ${error.message}`);
  }
  
  // Test the fallback chain
  console.log('🔄 Testing fallback chain...');
  const fallbackStart = Date.now();
  const fallbackResult = await getDeviceLocationWithFallbacks();
  const fallbackDuration = Date.now() - fallbackStart;
  
  if (fallbackResult) {
    console.log(`   ✅ Fallback chain succeeded (${fallbackDuration}ms): ${fallbackResult.latitude.toFixed(6)}, ${fallbackResult.longitude.toFixed(6)} [${fallbackResult.source}]`);
  } else {
    console.log(`   ❌ Fallback chain failed (${fallbackDuration}ms)`);
  }
  
  console.log('🏁 Location health check complete!');
};