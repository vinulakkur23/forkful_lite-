# RatingScreen2 Test Suite

This test suite was created to validate the implementation of the RatingScreen2 component, which handles restaurant suggestions and location data for meal ratings.

## Background

The RatingScreen2 component was completely rewritten to fix issues with location data persistence between photo uploads. The original implementation had problems with:

1. Location data not being cleared between photo uploads
2. Restaurant suggestions from one photo being used for the next photo
3. User input being overridden by automatic suggestions

The rewritten implementation adds:
- Session tracking with unique IDs for each photo
- A priority system for location sources
- Proper handling of user editing states
- Enhanced logging for debugging

## Test Files

This directory contains several test scripts to validate different aspects of the implementation:

1. **testLocationPriority.ts**
   - Tests the location priority system
   - Verifies that restaurant-selected locations take highest priority
   - Confirms photo locations take second priority
   - Ensures device location is used as a fallback

2. **testSessionReset.ts**
   - Tests the session tracking and state reset functionality
   - Verifies that loading a new photo creates a new session
   - Confirms all state variables are properly reset

3. **testPhotoLocationExtraction.ts**
   - Tests the photo location extraction functionality
   - Simulates extracting location from PHAsset
   - Tests fallback to EXIF data
   - Tests fallback to device location

4. **testRestaurantSuggestions.ts**
   - Tests the restaurant suggestion functionality
   - Verifies suggestions respect the current session
   - Tests user interaction with restaurant input
   - Confirms proper handling of user editing states

5. **runTests.ts**
   - A script to run all tests in sequence
   - Provides a checklist for manual testing

## Running the Tests

To run all tests:

```
npx ts-node services/runTests.ts
```

To run individual tests:

```
npx ts-node services/testLocationPriority.ts
npx ts-node services/testSessionReset.ts
npx ts-node services/testPhotoLocationExtraction.ts
npx ts-node services/testRestaurantSuggestions.ts
```

## Manual Testing Checklist

After running the automated tests, it's recommended to manually test the app with the following scenarios:

1. Upload multiple photos in sequence
2. Verify suggestions don't carry over between photos
3. Start typing in fields to ensure auto-suggestions don't override
4. Select restaurants from the suggestion list
5. Test with photos containing location data
6. Test with photos without location data

## Key Implementation Details

The main implementation in RatingScreen2.tsx uses:

- `useRef` for tracking the current photo session
- `useState` for tracking if the user is actively editing fields
- Location data with priority levels (1-3)
- Session validation before applying API responses
- Clean separation of responsibilities into discrete functions