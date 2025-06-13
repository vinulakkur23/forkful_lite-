import { firestore, storage } from '../firebaseConfig';
import { API_CONFIG } from '../config/api';

interface CityImageData {
  originalName: string;
  normalizedName: string;
  imageUrl?: string;
  prompt?: string;
  styleAnalysis?: any;
  status: 'pending' | 'prompt_generated' | 'image_generated' | 'failed';
  generatedAt?: Date;
  error?: string;
}

// Normalize city name for consistent storage keys
const normalizeCityName = (city: string): string => {
  if (!city) return '';
  return city.trim().toLowerCase().replace(/\s+/g, '-');
};

// Cache for city images to reduce Firestore reads
const cityImageCache = new Map<string, string>();

/**
 * Get the image URL for a city, with fallback to placeholder
 */
export const getCityImageUrl = async (cityName: string): Promise<string> => {
  try {
    console.log(`🏙️ [CityImage] Getting image for city: "${cityName}"`);
    const normalizedName = normalizeCityName(cityName);
    console.log(`🏙️ [CityImage] Normalized name: "${normalizedName}"`);
    
    // Check cache first
    if (cityImageCache.has(normalizedName)) {
      const cachedUrl = cityImageCache.get(normalizedName)!;
      console.log(`🏙️ [CityImage] Found in cache: ${cachedUrl}`);
      return cachedUrl;
    }
    
    // Check Firestore for city image
    console.log(`🏙️ [CityImage] Checking Firestore for city: ${normalizedName}`);
    const cityDoc = await firestore()
      .collection('cityImages')
      .doc(normalizedName)
      .get();
    
    if (cityDoc.exists) {
      const data = cityDoc.data() as CityImageData;
      console.log(`🏙️ [CityImage] Found city document:`, data);
      
      // If we have a generated image URL, use it
      if (data.imageUrl) {
        console.log(`🏙️ [CityImage] Using real image: ${data.imageUrl}`);
        cityImageCache.set(normalizedName, data.imageUrl);
        return data.imageUrl;
      } else {
        console.log(`🏙️ [CityImage] City document exists but no imageUrl. Status: ${data.status}`);
      }
    } else {
      console.log(`🏙️ [CityImage] No city document found for: ${normalizedName}`);
    }
    
    // Return placeholder for now
    // In the future, this could return a generated placeholder based on city initials
    return getPlaceholderImageUrl(cityName);
    
  } catch (error) {
    console.error('Error getting city image:', error);
    return getPlaceholderImageUrl(cityName);
  }
};

/**
 * Generate a placeholder image URL for cities without images
 */
const getPlaceholderImageUrl = (cityName: string): string => {
  // For now, return a default placeholder
  // In the future, this could generate initials-based placeholders
  const initials = cityName
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  
  // You could use a service like ui-avatars.com or generate SVG data URLs
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(cityName)}&size=200&background=4A90E2&color=fff&rounded=true&bold=true&length=2`;
};

/**
 * Preload city images for a list of cities
 */
export const preloadCityImages = async (cities: string[]): Promise<void> => {
  try {
    const uniqueCities = [...new Set(cities)];
    
    // Load all city images in parallel
    const promises = uniqueCities.map(city => getCityImageUrl(city));
    await Promise.all(promises);
    
    console.log(`Preloaded images for ${uniqueCities.length} cities`);
  } catch (error) {
    console.error('Error preloading city images:', error);
  }
};

/**
 * Request generation of a city image if it doesn't exist
 */
export const requestCityImageGeneration = async (cityName: string): Promise<void> => {
  try {
    const normalizedName = normalizeCityName(cityName);
    
    // Check if already exists or pending
    const cityDoc = await firestore()
      .collection('cityImages')
      .doc(normalizedName)
      .get();
    
    if (!cityDoc.exists) {
      // Add to generation queue
      await firestore()
        .collection('cityImages')
        .doc(normalizedName)
        .set({
          originalName: cityName,
          normalizedName: normalizedName,
          status: 'pending',
          requestedAt: firestore.FieldValue.serverTimestamp(),
        });
      
      console.log(`Requested image generation for city: ${cityName}`);
    }
  } catch (error) {
    console.error('Error requesting city image generation:', error);
  }
};

/**
 * Listen to city image updates for real-time updates
 */
export const subscribeToCityImageUpdates = (
  cities: string[],
  onUpdate: (city: string, imageUrl: string) => void
) => {
  const normalizedCities = cities.map(city => normalizeCityName(city));
  
  // Subscribe to updates for these cities
  const unsubscribe = firestore()
    .collection('cityImages')
    .where('normalizedName', 'in', normalizedCities.slice(0, 10)) // Firestore 'in' limit
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'modified' || change.type === 'added') {
          const data = change.doc.data() as CityImageData;
          if (data.imageUrl) {
            // Update cache
            cityImageCache.set(data.normalizedName, data.imageUrl);
            // Notify listener
            onUpdate(data.originalName, data.imageUrl);
          }
        }
      });
    });
  
  return unsubscribe;
};