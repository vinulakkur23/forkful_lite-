# Google Places API Integration

This document explains the implementation of direct Google Places API integration for restaurant suggestions in the Meal Rating App.

## Implementation Overview

The app now uses Google Places API directly for restaurant suggestions, instead of relying on the backend service. This ensures more reliable and consistent restaurant suggestions based on photo location data.

## Key Files

1. `/config/googleMapsConfig.ts` - Contains the API key and configuration for Places API calls
2. `/services/placesService.ts` - Direct implementation of Places API calls for:
   - Nearby restaurant search based on location
   - Text-based restaurant search with autocomplete
3. `/screens/RatingScreen2.tsx` - The rating screen that uses the Places API service

## Setting Up Your API Key

Before using the app, you need to set up a Google Maps API key with Places API enabled:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Places API
   - Maps SDK for Android (if building for Android)
   - Maps SDK for iOS (if building for iOS)
4. Create an API key with appropriate restrictions
5. Replace `YOUR_GOOGLE_MAPS_API_KEY` in `googleMapsConfig.ts` with your actual API key

## Important Implementation Details

### Location Priority System

The app uses a priority system for location sources:
1. Restaurant selection (priority 1) - When a user selects a restaurant, its location is used
2. Photo location (priority 2) - Location extracted from photo metadata (EXIF or PHAsset)
3. Device location (priority 3) - Current device location as fallback

### Session Tracking

Each photo upload creates a unique session ID to prevent state persistence between photos:
- The session ID is created when a photo is loaded
- All API calls validate against the current session ID
- If the session changes during an API call, the results are discarded

### Restaurant Suggestion Flow

1. Photo is uploaded or taken
2. Location is extracted from the photo or device
3. Places API is called to find nearby restaurants
4. Results are displayed to the user
5. User can select a restaurant or search for one

### Meal Suggestions

Meal suggestions have been temporarily disabled in this implementation. The app will use a generic "Meal at [Restaurant Name]" as the default meal name.

## Testing the Implementation

To test the Places API integration:
1. Ensure you have a valid API key configured
2. Take or upload a photo through the app
3. Check that nearby restaurants are suggested based on the photo's location
4. Try uploading multiple photos in sequence to verify reset behavior
5. Test searching for restaurants to verify autocomplete functionality

## Troubleshooting

If you encounter issues with the Places API integration:
1. Check the console logs for API errors
2. Verify your API key is valid and has the necessary APIs enabled
3. Ensure you have the appropriate billing set up for the Google Cloud project
4. Verify the app has location permissions

## Next Steps

Future improvements to consider:
1. Re-enable meal suggestions using a food recognition API
2. Add caching for Places API results to reduce API usage
3. Implement place photos from the Places API
4. Add restaurant ratings display from the Places API data