# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MealRatingAppNew is a React Native mobile application that allows users to:
1. Take photos of meals or upload them from the photo library
2. Rate meals and add restaurant information
3. View a feed of nearby meals posted by other users
4. Track their food history in a "Food Passport"

The app uses Firebase for authentication, Firestore for data storage, and Firebase Storage for image storage.

## Development Environment Setup

### Prerequisites
- Node.js >= 18
- React Native development environment (follow React Native docs)
- CocoaPods for iOS development
- Android Studio for Android development

## Common Commands

### Installation
```sh
# Install dependencies
npm install

# Install iOS dependencies
cd ios && bundle install && bundle exec pod install && cd ..
```

### Running the App
```sh
# Start Metro bundler
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android
```

### Code Quality
```sh
# Run linter
npm run lint

# Run tests
npm run test
```

## Architecture Overview

### Navigation
The app uses React Navigation with a combination of:
- Stack Navigator (`createStackNavigator`) for the main navigation flow
- Tab Navigator (`createBottomTabNavigator`) for the main app tabs

The navigation structure is:
- Root Stack Navigator
  - Login Screen
  - Main Tabs
    - Home Tab (Nearby meals)
    - Camera Tab
    - Food Passport Tab
    - Hidden screens (not visible in tab bar): Crop, EditPhoto, Rating, Result, MealDetail

### Authentication
The app uses Firebase Authentication with Google Sign-In. The authentication flow is handled in:
- `App.tsx` - Checks authentication state
- `LoginScreen.tsx` - Handles login with Google
- `GoogleSignin` is configured in multiple places (App.tsx, LoginScreen.tsx, FirebaseConfig.ts)

### Data Flow

#### Taking a Photo and Rating
1. User captures a photo using the camera (`CameraScreen.tsx`) or uploads from library
2. Photo is cropped (`CropScreen.tsx`)
3. User can edit the photo (`EditPhotoScreen.tsx`)
4. User rates the meal and adds details (`RatingScreen.tsx`)
5. The rating is saved to Firebase and shown in a result screen (`ResultScreen.tsx`)

#### Viewing Meals
- `HomeScreen.tsx` - Shows nearby meals from other users
- `FoodPassportScreen.tsx` - Shows the user's own meal history
- `MealDetailScreen.tsx` - Shows detailed view of a single meal

### Firebase Structure

The app uses the following Firebase services:
- Authentication (Google Sign-In)
- Firestore database (storing meal entries)
- Storage (storing images)

Database collections:
- `mealEntries`: Stores meal ratings with references to images in storage
- `users`: Stores user information

### Key Components

- Custom Tab Bar - Defined in `App.tsx`
- Camera integration - Uses `react-native-vision-camera`
- Image handling - Uses multiple libraries including `react-native-image-crop-picker` and `react-native-image-resizer`
- Geolocation - Used for nearby restaurant suggestions and meal location tracking

## Development Guidelines

1. Maintain the existing navigation pattern when adding new screens
2. Follow the established file structure, keeping screens in the screens/ directory
3. Use TypeScript interfaces for type safety, especially in navigation params
4. For image handling, be careful with URI formats across iOS and Android
5. When working with Firebase, maintain the existing data structure for compatibility