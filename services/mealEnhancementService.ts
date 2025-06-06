import { API_CONFIG } from '../config/api';

export interface MealEnhancement {
  type: 'haiku' | 'restaurant_history' | 'food_history' | 'photo_rating';
  content: string;
  title: string;
  rating?: number; // Optional numeric rating for photo_rating type
}

// Generate a haiku about the meal from food image and dish name
export const generateMealHaiku = async (dishName: string, imageUri?: string): Promise<string> => {
  try {
    
    const formData = new FormData();
    formData.append('dish_name', dishName);
    
    // Add image if provided
    if (imageUri) {
      formData.append('image', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'meal.jpg',
      } as any);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);

    let response;
    try {
      response = await fetch(API_CONFIG.getUrl(API_CONFIG.ENDPOINTS.MEAL_ENHANCEMENT_HAIKU), {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
          // Don't set Content-Type for FormData - let fetch set it with boundary
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('Haiku generation timed out. Please try again.');
      }
      throw fetchError;
    }

    const data = await response.json();
    const haiku = data.content || 'Food on the table\nMoments shared with those we love\nMemories made here';
    
    return haiku;
  } catch (error) {
    console.error('Error generating haiku:', error);
    return `Food on the table\nMoments shared with those we love\nMemories made here`;
  }
};

// Generate restaurant history and popular dishes
export const generateRestaurantHistory = async (restaurantName: string): Promise<string> => {
  try {
    
    const formData = new FormData();
    formData.append('restaurant_name', restaurantName);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);

    let response;
    try {
      response = await fetch(API_CONFIG.getUrl(API_CONFIG.ENDPOINTS.MEAL_ENHANCEMENT_RESTAURANT), {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
          // Don't set Content-Type for FormData - let fetch set it with boundary
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('Restaurant history generation timed out. Please try again.');
      }
      throw fetchError;
    }

    const data = await response.json();
    const history = data.content || 'This establishment has been serving the community with delicious food and warm hospitality. Known for their commitment to quality ingredients and authentic flavors. Popular dishes include their signature specialties, seasonal favorites, and classic comfort foods.';
    
    return history;
  } catch (error) {
    console.error('Error generating restaurant history:', error);
    return 'This establishment has been serving the community with delicious food and warm hospitality. Known for their commitment to quality ingredients and authentic flavors. Popular dishes include their signature specialties, seasonal favorites, and classic comfort foods.';
  }
};

// Generate food history based on dish name
export const generateFoodHistory = async (dishName: string): Promise<string> => {
  try {
    
    const formData = new FormData();
    formData.append('dish_name', dishName);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);

    let response;
    try {
      response = await fetch(API_CONFIG.getUrl(API_CONFIG.ENDPOINTS.MEAL_ENHANCEMENT_FOOD), {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
          // Don't set Content-Type for FormData - let fetch set it with boundary
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('Food history generation timed out. Please try again.');
      }
      throw fetchError;
    }

    const data = await response.json();
    const history = data.content || 'This dish has a rich culinary heritage that spans generations. It has been enjoyed by countless people across different cultures and regions. The preparation and enjoyment of this food represents a beautiful tradition of sharing meals and creating memories together.';
    
    return history;
  } catch (error) {
    console.error('Error generating food history:', error);
    return 'This dish has a rich culinary heritage that spans generations. It has been enjoyed by countless people across different cultures and regions. The preparation and enjoyment of this food represents a beautiful tradition of sharing meals and creating memories together.';
  }
};

// Generate a photo quality rating
export const getPhotoRating = async (imageUri: string): Promise<MealEnhancement> => {
  try {
    
    const formData = new FormData();
    
    // Add image
    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'meal.jpg',
    } as any);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);

    try {
      const response = await fetch(API_CONFIG.getUrl(API_CONFIG.ENDPOINTS.MEAL_ENHANCEMENT_PHOTO_RATING), {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
          // Don't set Content-Type for FormData - let fetch set it with boundary
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      return {
        type: 'photo_rating',
        content: data.content || 'Your food photography scores 7/10!',
        title: data.title || 'Photo Quality Rating',
        rating: data.rating || 7
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('Photo rating request timed out. Please try again.');
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('Error getting photo rating:', error);
    return {
      type: 'photo_rating',
      content: 'Your food photography scores 7/10! (Unable to analyze photo quality at this time)',
      title: 'Photo Quality Rating',
      rating: 7
    };
  }
};

// Main function to get a random meal enhancement
export const getRandomMealEnhancement = async (
  dishName: string,
  restaurantName: string,
  imageUri?: string,
  likedComments?: string,
  dislikedComments?: string
): Promise<MealEnhancement> => {
  try {
    const formData = new FormData();
    formData.append('dish_name', dishName);
    formData.append('restaurant_name', restaurantName);
    
    // Add comments if provided
    if (likedComments) {
      formData.append('liked_comments', likedComments);
    }
    if (dislikedComments) {
      formData.append('disliked_comments', dislikedComments);
    }
    
    // Add image if provided
    if (imageUri) {
      formData.append('image', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'meal.jpg',
      } as any);
    }

    const apiUrl = API_CONFIG.getUrl(API_CONFIG.ENDPOINTS.MEAL_ENHANCEMENT_RANDOM);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);

    let response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
          // Don't set Content-Type for FormData - let fetch set it with boundary
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('Enhancement request timed out. Please try again.');
      }
      throw fetchError;
    }

    const data = await response.json();
    
    const enhancement = {
      type: data.type || 'haiku',
      content: data.content || 'Food on the table\nMoments shared with those we love\nMemories made here',
      title: data.title || '✨ Something Special',
      rating: data.rating // Include rating if present (for photo_rating type)
    };
    
    return enhancement;
  } catch (error) {
    console.error('Error generating meal enhancement:', error);
    // Return a fallback enhancement
    return {
      type: 'haiku',
      content: `Food on the table\nMoments shared with those we love\nMemories made here`,
      title: 'A Haiku for Your Meal'
    };
  }
};

// Helper function to get the title for each enhancement type
export const getEnhancementTitle = (type: MealEnhancement['type']): string => {
  switch (type) {
    case 'haiku':
      return 'A Haiku for Your Meal';
    case 'restaurant_history':
      return 'About This Restaurant';
    case 'food_history':
      return 'The Story of This Dish';
    case 'photo_rating':
      return 'Photo Quality Rating';
    default:
      return 'Something Special';
  }
};