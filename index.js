/**
 * @format
 */

import {AppRegistry} from 'react-native';
import {name as appName} from './app.json';
import notifee, { EventType } from '@notifee/react-native';

// CRITICAL: Register Notifee background event handler BEFORE importing App.
// App.tsx imports every screen, which imports themes/colors (addAlpha), etc.
// On a cold launch from a killed-app notification tap, Hermes may not have
// finished initializing the full module graph. By registering the background
// handler first with only minimal imports (AppRegistry, notifee), we avoid
// the "[runtime not ready]: ReferenceError: Property 'addAlpha' doesn't exist"
// crash. The App module is loaded lazily via a dynamic require() inside
// registerComponent's factory function, which runs after Hermes is fully ready.
notifee.onBackgroundEvent(async ({ type, detail }) => {
  console.log('[Background] Notifee event:', type);

  const { notification } = detail;

  if (type === EventType.PRESS && notification?.data?.mealId) {
    const notificationType = notification.data?.type;

    if (notificationType === 'unrated-meal-statement' || notificationType === 'unrated-meal-pixel-art') {
      console.log(`[Background] Stashing navigation intent for ${notificationType}, mealId: ${notification.data.mealId}`);

      // Stash intent for App.tsx to consume once navigation is ready
      global.__pendingNotificationNav = {
        screen: 'MealTips',
        params: {
          mealId: notification.data.mealId,
          dishName: notification.data.dishName || undefined,
          showPixelArtPicker: notificationType === 'unrated-meal-pixel-art',
        },
      };
      return;
    }
  }

  // Handle interactive notifications (like meal reminders)
  if (type === EventType.PRESS) {
    console.log('[Background] User tapped interactive notification');
    // App will open and React will handle navigation
  }
});

// Load App lazily — the factory function runs after Hermes is fully initialized,
// so all modules (including themes/addAlpha) will resolve correctly.
AppRegistry.registerComponent(appName, () => {
  const App = require('./App').default;
  return App;
});
