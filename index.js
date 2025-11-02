/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import notifee, { EventType } from '@notifee/react-native';

// CRITICAL: Register Notifee background event handler BEFORE React starts
// This ensures it works even when app is completely killed
notifee.onBackgroundEvent(async ({ type, detail }) => {
  console.log('[Background] Notifee event:', type);

  const { notification, pressAction } = detail;

  // CRITICAL: ONLY handle pixel art notifications, NOT statement notifications
  // Statement notifications are non-interactive educational tips
  if (type === EventType.PRESS && notification?.data?.type === 'unrated-meal-statement') {
    console.log('[Background] Statement notification tapped - ignoring (non-interactive)');
    return; // Do nothing - these are non-interactive
  }

  // Handle taps on pixel art notifications - navigate to MealTipsScreen
  if (type === EventType.PRESS && notification?.data?.type === 'unrated-meal-pixel-art') {
    console.log('[Background] User tapped pixel art notification - navigating to MealTipsScreen');

    const mealId = notification.data?.mealId;
    const dishName = notification.data?.dishName;

    // CRITICAL: Validate mealId before attempting navigation
    if (!mealId || typeof mealId !== 'string' || mealId.trim().length === 0) {
      console.error('[Background] Invalid or missing mealId in notification data:', mealId);
      console.error('[Background] Notification data:', JSON.stringify(notification.data));
      return; // Don't attempt navigation without valid mealId
    }

    // Import navigation service dynamically and navigate with error handling
    try {
      const { navigate } = await import('./services/navigationService');

      console.log('[Background] Attempting navigation with mealId:', mealId);

      // Navigate to MealTipsScreen with mealId
      navigate('MealTips', {
        mealId: mealId,
        dishName: dishName || undefined
      });

      console.log('[Background] Successfully initiated navigation to MealTipsScreen');
    } catch (error) {
      console.error('[Background] Error navigating to MealTipsScreen:', error);
      console.error('[Background] Error details:', error.message, error.stack);
      // Fail silently - user will just see app open to default screen
    }
    return;
  }

  // Handle interactive notifications (like meal reminders)
  if (type === EventType.PRESS) {
    console.log('[Background] User tapped interactive notification');
    // App will open and React will handle navigation
  }
});

AppRegistry.registerComponent(appName, () => App);
