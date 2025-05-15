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
      
      // If we have location data, log it
      if (result.location) {
        console.log(`Photo has location data with source "${result.location.source}":`, 
          `${result.location.latitude}, ${result.location.longitude}`);
      } else {
        console.log('Photo does not have location data');
        
        // If we have an assetId but no location, try one more time with extractGPSFromAsset
        if (photoAsset.assetId) {
          console.log('Trying to extract GPS data directly from asset ID');
          const locationData = await PhotoGPS.extractGPSFromAsset(photoAsset.assetId);
          
          if (locationData) {
            console.log('Successfully extracted location data from asset ID:', locationData);
            result.location = locationData;
          } else {
            console.log('Failed to extract location data from asset ID');
          }
        }
        
        // If still no location, try extracting from the file path
        if (!result.location && result.uri) {
          console.log('Trying to extract GPS data from file path');
          const locationData = await PhotoGPS.extractGPSFromPath(result.uri);
          
          if (locationData) {
            console.log('Successfully extracted location data from file path:', locationData);
            result.location = locationData;
          } else {
            console.log('Failed to extract location data from file path');
          }
        }
        
        // If still no location, fall back to device location
        if (!result.location) {
          console.log('Falling back to device location');
          const deviceLocation = await PhotoGPS.getCurrentLocation();
          
          if (deviceLocation) {
            console.log('Using device location as fallback:', deviceLocation);
            result.location = deviceLocation;
          }
        }
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
    
    if (Platform.OS === 'ios') {
      try {
        deviceLocation = await PhotoGPS.getCurrentLocation();
      } catch (error) {
        console.error('Error getting location from native module:', error);
      }
    }
    
    // If native module failed, fall back to Geolocation
    if (!deviceLocation) {
      try {
        const position = await new Promise<any>((resolve, reject) => {
          Geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 10000,
          });
        });
        
        deviceLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          source: 'device',
        };
      } catch (error) {
        console.error('Error getting device location:', error);
        return null;
      }
    }
    
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