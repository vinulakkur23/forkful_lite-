/**
 * Monument Pixel Art Service
 * Handles generation and caching of pixel-art monument icons for cities
 *
 * This service implements a caching strategy:
 * 1. Check if monument exists in Firebase Storage
 * 2. If yes, return cached URL
 * 3. If no, generate new monument via API
 * 4. Upload to Firebase Storage for future use
 * 5. Return the URL
 */

import storage from '@react-native-firebase/storage';

const BASE_URL = 'https://dishitout-imageinhancer.onrender.com';

export interface MonumentData {
  monument_url: string; // Firebase Storage download URL
  city_name: string;
  monument_name: string;
  cached: boolean; // Whether this was retrieved from cache
}

export interface MonumentApiResponse {
  success: boolean;
  image_data?: string; // Base64 encoded monument image
  mime_type?: string;
  city_name?: string;
  monument_name?: string;
  error?: string;
  performance?: {
    total_time_seconds: number;
    api_time_seconds: number;
  };
}

/**
 * Normalize city name for consistent file naming
 * Converts to lowercase and replaces spaces/special chars with underscores
 */
const normalizeCityName = (cityName: string): string => {
  return cityName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_') // Replace non-alphanumeric with underscore
    .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
};

/**
 * Get the Firebase Storage path for a city's monument
 */
const getMonumentStoragePath = (cityName: string): string => {
  const normalized = normalizeCityName(cityName);
  return `monuments/${normalized}.png`;
};

/**
 * Check if a monument already exists in Firebase Storage
 * Returns the download URL if it exists, null otherwise
 */
const checkMonumentCache = async (cityName: string): Promise<string | null> => {
  try {
    const storagePath = getMonumentStoragePath(cityName);
    console.log(`🏛️ MonumentService: Checking cache for: ${cityName} at ${storagePath}`);

    const storageRef = storage().ref(storagePath);
    const downloadUrl = await storageRef.getDownloadURL();

    console.log(`✅ MonumentService: Found cached monument for ${cityName}`);
    return downloadUrl;
  } catch (error: any) {
    if (error.code === 'storage/object-not-found') {
      console.log(`🏛️ MonumentService: No cached monument found for ${cityName}`);
      return null;
    }
    // Other errors (permissions, network, etc.)
    console.error(`❌ MonumentService: Error checking cache for ${cityName}:`, error);
    return null;
  }
};

/**
 * Generate a new monument via the backend API
 */
const generateMonumentFromApi = async (cityName: string): Promise<MonumentApiResponse> => {
  console.log(`🏛️ MonumentService: Generating new monument for: ${cityName}`);

  const formData = new FormData();
  formData.append('city_name', cityName);

  const response = await fetch(`${BASE_URL}/generate-monument-pixel-art`, {
    method: 'POST',
    body: formData,
  });

  console.log(`🏛️ MonumentService: API response status: ${response.status}`);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result: MonumentApiResponse = await response.json();
  return result;
};

/**
 * Upload monument image to Firebase Storage and return the download URL
 */
const uploadMonumentToStorage = async (
  cityName: string,
  base64Image: string
): Promise<string> => {
  console.log(`🏛️ MonumentService: Uploading monument to storage for: ${cityName}`);

  const storagePath = getMonumentStoragePath(cityName);
  const storageRef = storage().ref(storagePath);

  // Convert base64 to data URI
  const dataUri = `data:image/png;base64,${base64Image}`;

  // Upload to Firebase Storage
  await storageRef.putString(dataUri, 'data_url');

  // Get download URL
  const downloadUrl = await storageRef.getDownloadURL();

  console.log(`✅ MonumentService: Monument uploaded successfully for ${cityName}`);
  return downloadUrl;
};

/**
 * Get or generate a monument for a city
 * This is the main function to use - it handles caching automatically
 *
 * @param cityName - Name of the city
 * @returns MonumentData with the monument URL and metadata
 */
export const getOrGenerateMonument = async (
  cityName: string
): Promise<MonumentData | null> => {
  try {
    console.log(`🏛️ MonumentService: Getting monument for city: ${cityName}`);

    // Step 1: Check cache
    const cachedUrl = await checkMonumentCache(cityName);
    if (cachedUrl) {
      console.log(`✅ MonumentService: Using cached monument for ${cityName}`);
      return {
        monument_url: cachedUrl,
        city_name: cityName,
        monument_name: 'Cached monument', // We don't store monument name in cache
        cached: true,
      };
    }

    // Step 2: Generate new monument
    console.log(`🏛️ MonumentService: Generating new monument for ${cityName}...`);
    const apiResult = await generateMonumentFromApi(cityName);

    if (!apiResult.success || !apiResult.image_data) {
      console.error(`❌ MonumentService: Failed to generate monument for ${cityName}`);
      console.error(`❌ MonumentService: Error:`, apiResult.error);
      return null;
    }

    console.log(`✅ MonumentService: Monument generated for ${cityName} (${apiResult.monument_name})`);

    // Step 3: Upload to storage
    const monumentUrl = await uploadMonumentToStorage(cityName, apiResult.image_data);

    console.log(`✅ MonumentService: Monument ready for ${cityName}`);
    return {
      monument_url: monumentUrl,
      city_name: apiResult.city_name || cityName,
      monument_name: apiResult.monument_name || 'Unknown monument',
      cached: false,
    };

  } catch (error) {
    console.error(`🏛️ MonumentService: Error getting monument for ${cityName}:`, error);
    return null;
  }
};

/**
 * Batch get monuments for multiple cities
 * Useful for loading all monuments at once
 *
 * @param cityNames - Array of city names
 * @returns Array of MonumentData (excluding failed generations)
 */
export const batchGetMonuments = async (
  cityNames: string[]
): Promise<MonumentData[]> => {
  console.log(`🏛️ MonumentService: Batch loading ${cityNames.length} monuments`);

  const promises = cityNames.map(city => getOrGenerateMonument(city));
  const results = await Promise.allSettled(promises);

  const monuments: MonumentData[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      monuments.push(result.value);
    } else {
      console.warn(`⚠️ MonumentService: Failed to load monument for ${cityNames[index]}`);
    }
  });

  console.log(`✅ MonumentService: Loaded ${monuments.length}/${cityNames.length} monuments`);
  return monuments;
};

/**
 * Manually clear monument cache for a specific city
 * Useful for testing or if monument needs to be regenerated
 */
export const clearMonumentCache = async (cityName: string): Promise<boolean> => {
  try {
    const storagePath = getMonumentStoragePath(cityName);
    console.log(`🏛️ MonumentService: Clearing cache for ${cityName}`);

    const storageRef = storage().ref(storagePath);
    await storageRef.delete();

    console.log(`✅ MonumentService: Cache cleared for ${cityName}`);
    return true;
  } catch (error) {
    console.error(`❌ MonumentService: Error clearing cache for ${cityName}:`, error);
    return false;
  }
};
