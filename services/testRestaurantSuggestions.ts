/**
 * Test script for validating restaurant suggestion functionality
 * This simulates restaurant suggestions and user interaction with them
 */

import { LocationData } from './photoGPSModule';
import { Restaurant } from './mealService';

/**
 * Test restaurant suggestions and interaction
 * This simulates the flow of getting and selecting restaurants
 */
const testRestaurantSuggestions = () => {
  // Session tracking
  const photoSessionRef = { current: `photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}` };
  
  // State variables
  let location: LocationData | null = null;
  let restaurant = '';
  let mealName = '';
  let suggestedRestaurants: Restaurant[] = [];
  let menuItems: string[] = [];
  let isUserEditingRestaurant = false;
  let isUserEditingMeal = false;
  
  // Simulate setting state
  const setLocation = (val: LocationData | null) => { location = val; };
  const setRestaurant = (val: string) => { restaurant = val; };
  const setMealName = (val: string) => { mealName = val; };
  const setSuggestedRestaurants = (val: Restaurant[]) => { suggestedRestaurants = val; };
  const setMenuItems = (val: string[]) => { menuItems = val; };
  const setIsUserEditingRestaurant = (val: boolean) => { isUserEditingRestaurant = val; };
  const setIsUserEditingMeal = (val: boolean) => { isUserEditingMeal = val; };
  
  // Function to log current state
  const logState = () => {
    console.log('Current state:');
    console.log(`- Session ID: ${photoSessionRef.current}`);
    console.log(`- Location: ${location ? `${location.latitude}, ${location.longitude} (${location.source})` : 'null'}`);
    console.log(`- Restaurant: ${restaurant}`);
    console.log(`- Meal Name: ${mealName}`);
    console.log(`- Suggested Restaurants: ${suggestedRestaurants.length}`);
    console.log(`- Menu Items: ${menuItems.length}`);
    console.log(`- User editing restaurant: ${isUserEditingRestaurant}`);
    console.log(`- User editing meal: ${isUserEditingMeal}`);
    console.log('---');
  };
  
  // Log with session tracking
  const logWithSession = (message: string) => {
    console.log(`[${photoSessionRef.current}] ${message}`);
  };
  
  // Simulate API call to fetch restaurant suggestions
  const fetchRestaurantSuggestions = async (locationData: LocationData | null) => {
    const currentSession = photoSessionRef.current;
    
    if (!locationData) {
      logWithSession("Cannot fetch restaurant suggestions: No location data");
      return;
    }
    
    try {
      logWithSession(`Fetching restaurant suggestions using location source: ${locationData.source}`);
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verify session is still the same
      if (currentSession !== photoSessionRef.current) {
        logWithSession("Session changed, discarding restaurant suggestions");
        return;
      }
      
      // Simulate API response with restaurant suggestions
      const mockRestaurants: Restaurant[] = [
        {
          id: '1',
          name: 'Tasty Burger',
          vicinity: 'Main St, Portland, OR',
          rating: 4.5,
          user_ratings_total: 120,
          geometry: {
            location: {
              lat: locationData.latitude + 0.001,
              lng: locationData.longitude + 0.001
            }
          }
        },
        {
          id: '2',
          name: 'Pizza Place',
          vicinity: 'Oak St, Portland, OR',
          rating: 4.2,
          user_ratings_total: 85,
          geometry: {
            location: {
              lat: locationData.latitude - 0.001,
              lng: locationData.longitude - 0.001
            }
          }
        },
        {
          id: '3',
          name: 'Sushi Bar',
          vicinity: 'Pine St, Portland, OR',
          rating: 4.7,
          user_ratings_total: 150,
          geometry: {
            location: {
              lat: locationData.latitude + 0.002,
              lng: locationData.longitude + 0.002
            }
          }
        }
      ];
      
      logWithSession(`Got ${mockRestaurants.length} restaurant suggestions`);
      setSuggestedRestaurants(mockRestaurants);
      
      // Only update restaurant field if user isn't currently editing
      if (!isUserEditingRestaurant) {
        logWithSession(`Auto-selecting first restaurant: ${mockRestaurants[0].name}`);
        setRestaurant(mockRestaurants[0].name);
        
        // If restaurant has location data, update our location
        if (mockRestaurants[0].geometry && mockRestaurants[0].geometry.location) {
          const restaurantLocation: LocationData = {
            latitude: mockRestaurants[0].geometry.location.lat,
            longitude: mockRestaurants[0].geometry.location.lng,
            source: 'restaurant_selection',
            priority: 1 // Highest priority
          };
          
          logWithSession(`Updated location from selected restaurant: ${JSON.stringify(restaurantLocation)}`);
          setLocation(restaurantLocation);
        }
      }
      
      // Simulate menu items
      const mockMenuItems = ['Classic Burger', 'Cheese Burger', 'Veggie Burger', 'Fries', 'Milkshake'];
      
      logWithSession(`Got ${mockMenuItems.length} menu items`);
      setMenuItems(mockMenuItems);
      
      // Only update meal name if user isn't currently editing
      if (!isUserEditingMeal) {
        logWithSession(`Setting first menu item as meal: ${mockMenuItems[0]}`);
        setMealName(mockMenuItems[0]);
      }
    } catch (error) {
      logWithSession(`Error fetching restaurant suggestions: ${error}`);
    }
  };
  
  // Extract city from restaurant data
  const extractCityFromRestaurant = (restaurantData: Restaurant): string => {
    if (!restaurantData) return '';
    
    const address = restaurantData.vicinity || restaurantData.formatted_address;
    if (!address) return '';
    
    // Try to extract city from address
    const addressParts = address.split(',').map(part => part.trim());
    logWithSession(`Address parts for restaurant: ${JSON.stringify(addressParts)}`);
    
    // City is typically the second component in a comma-separated address
    if (addressParts.length > 1) {
      const secondPart = addressParts[1];
      
      // If second part has spaces (like "Portland OR"), take just the city name
      if (secondPart.includes(' ')) {
        return secondPart.split(' ')[0];
      }
      return secondPart;
    }
    
    return '';
  };
  
  // Handle restaurant selection from autocomplete or modal
  const handleRestaurantSelection = (restaurant: Restaurant) => {
    logWithSession(`Restaurant selected: ${restaurant.name}`);
    
    // Update restaurant name
    setRestaurant(restaurant.name);
    
    // Turn off editing mode since this was an explicit selection
    setIsUserEditingRestaurant(false);
    
    // Update location if restaurant has location data
    if (restaurant.geometry && restaurant.geometry.location) {
      const city = extractCityFromRestaurant(restaurant);
      
      // Create location object with restaurant data
      const restaurantLocation: LocationData = {
        latitude: restaurant.geometry.location.lat,
        longitude: restaurant.geometry.location.lng,
        source: 'restaurant_selection',
        priority: 1, // Highest priority
        city: city
      };
      
      logWithSession(`Updated location from restaurant selection: ${JSON.stringify(restaurantLocation)}`);
      setLocation(restaurantLocation);
    }
    
    // Simulate fetching menu items for this restaurant
    const mockMenuItems = ['Signature Dish', 'Special Pasta', 'House Salad', 'Dessert'];
    setMenuItems(mockMenuItems);
    setMealName(mockMenuItems[0]);
  };
  
  // Simulate user editing restaurant name manually
  const handleRestaurantSearch = (text: string) => {
    setRestaurant(text);
    setIsUserEditingRestaurant(true);
    logWithSession(`User typing restaurant name: ${text}`);
  };
  
  // Create a new session (as if loading a new photo)
  const createNewSession = () => {
    const newSessionId = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    photoSessionRef.current = newSessionId;
    logWithSession('Created new photo session');
    
    // Reset all state
    setRestaurant('');
    setMealName('');
    setSuggestedRestaurants([]);
    setMenuItems([]);
    setIsUserEditingRestaurant(false);
    setIsUserEditingMeal(false);
    
    // Initialize with a mock location
    const mockLocation: LocationData = {
      latitude: 45.5231,
      longitude: -122.6765,
      source: 'PHAsset',
      priority: 2
    };
    
    setLocation(mockLocation);
  };
  
  // Run test scenarios
  
  // Test 1: Initial photo load with location data
  console.log('\n--- Test 1: Initial photo load with location data ---');
  createNewSession();
  logState();
  
  // Test 2: Fetch restaurant suggestions based on location
  console.log('\n--- Test 2: Fetch restaurant suggestions ---');
  fetchRestaurantSuggestions(location);
  setTimeout(() => {
    logState();
    
    // Test 3: User manually edits restaurant name while typing
    console.log('\n--- Test 3: User manually edits restaurant name ---');
    handleRestaurantSearch('My Favorite');
    logState();
    
    // Test 4: User selects a restaurant from suggestions
    console.log('\n--- Test 4: User selects a restaurant ---');
    const selectedRestaurant: Restaurant = {
      id: '5',
      name: 'Selected Restaurant',
      vicinity: 'Downtown, Portland, OR',
      rating: 4.8,
      geometry: {
        location: {
          lat: 45.5246,
          lng: -122.6752
        }
      }
    };
    handleRestaurantSelection(selectedRestaurant);
    logState();
    
    // Test 5: User loads a new photo (creates new session)
    console.log('\n--- Test 5: Load a new photo (new session) ---');
    createNewSession();
    logState();
    
    // Verify that we have a clean state for the new photo
    console.log('\n--- Verification: State should be reset for new photo ---');
    console.log(`Restaurant is empty: ${restaurant === ''}`);
    console.log(`Meal name is empty: ${mealName === ''}`);
    console.log(`User editing flags are reset: ${!isUserEditingRestaurant && !isUserEditingMeal}`);
    
    // Test 6: Fetch suggestions for new photo
    console.log('\n--- Test 6: Fetch suggestions for new photo ---');
    fetchRestaurantSuggestions(location);
    setTimeout(() => {
      logState();
      
      console.log('Tests completed');
    }, 1500);
  }, 1500);
};

// Run the test
console.log('------- STARTING RESTAURANT SUGGESTION TESTS -------');
testRestaurantSuggestions();
setTimeout(() => {
  console.log('------- RESTAURANT SUGGESTION TESTS COMPLETED -------');
}, 5000); // Give time for all async tests to complete

export {};