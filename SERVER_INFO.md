# Server API Information

This document describes the backend API endpoints used by the app and how they relate to the Python scripts.

## API Base URL
https://dishitout-imageinhancer.onrender.com

## API Endpoints

### `/suggest-meal` Endpoint
- **Description**: Gets restaurant suggestions near a location and suggests menu items
- **Required Parameters**: 
  - `latitude`: Latitude coordinate
  - `longitude`: Longitude coordinate 
- **Optional Parameters**:
  - `image`: Photo of the meal
  - `restaurant`: Name of a restaurant (if specified, will try to get menu items for this restaurant)
- **Related Python Functions**: 
  - `get_nearby_restaurants()` - Gets a list of restaurants near the coordinates
  - `get_restaurant_menu()` - Gets menu items for a specific restaurant 
  - `identify_food_with_menu_context()` - Identifies food in an image using menu context

### `/suggest-meal-for-restaurant` Endpoint 
- **Description**: Suggests menu items for a specific restaurant (this might not exist yet!)
- **Required Parameters**:
  - `restaurant`: Name of the restaurant
  - `latitude`: Latitude coordinate (for API compatibility)
  - `longitude`: Longitude coordinate (for API compatibility)
- **Optional Parameters**:
  - `image`: Photo of the meal
- **Related Python Functions**:
  - `get_restaurant_menu()` - Gets menu items for a specific restaurant
  - `identify_food_with_menu_context()` - Identifies food in an image using menu context

### `/edit-photo` Endpoint
- **Description**: Enhances or modifies food photos
- **Required Parameters**:
  - `image`: Photo to edit
  - `options`: Array of edit options (e.g., sharpen, lighting, etc.)

### `/go-big` Endpoint
- **Description**: Applies special enhancement to food photos
- **Required Parameters**:
  - `image`: Photo to enhance

## How Restaurant Menu Suggestions Work

1. The backend uses Google Places API to find nearby restaurants based on coordinates.
2. If a specific restaurant is named, it uses Google Gemini AI to search for that restaurant's menu items.
3. If an image is provided along with menu items, it uses Gemini AI to identify which menu item is most likely in the photo.

## Current Issue

The app attempts to call `/suggest-meal-for-restaurant` when a restaurant name is entered or selected, but this endpoint might not be fully implemented on the server. The server may be using the regular `/suggest-meal` endpoint for both initial suggestions and restaurant-specific suggestions.

## Fixing the Issue

1. Update the backend to properly handle the `restaurant` parameter in the `/suggest-meal` endpoint 
2. Implement the dedicated `/suggest-meal-for-restaurant` endpoint properly
3. Use fallback logic in the app to call `/suggest-meal` if `/suggest-meal-for-restaurant` fails

## Python Script Capabilities

The `restaurant_service.py` script includes functions for:
1. Finding nearby restaurants
2. Looking up restaurant menus
3. Identifying food in images with menu context

These capabilities need to be properly exposed through the API endpoints for the app to use them effectively.