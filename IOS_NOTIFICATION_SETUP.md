# iOS Notification Image Attachment Setup

This guide explains how to enable pixel art images in push notifications for iOS using Notifee.

## Overview

When a user captures a meal photo, the app:
1. Generates a custom pixel art emoji (~5-10 seconds)
2. Saves it locally on the iPhone
3. Schedules a notification for 10 minutes later using **Notifee**
4. **Shows the pixel art image in the notification**

## Technology Stack

- **Notifee** - Used for pixel art notification with image attachment (iOS & Android)
- **react-native-push-notification** - Used for tip notifications and reminders (no images)

## Required Setup

### Step 1: Install Dependencies (Already Done)

The following packages are already installed:
- `@notifee/react-native` - For rich notifications with image support
- `react-native-push-notification` - For basic notifications
- `react-native-fs` - For local file storage

### Step 2: Rebuild the App

After installing Notifee, rebuild to include native iOS code:

```bash
cd ios
pod install
cd ..
npm run ios
```

### Step 3: Test Notification Images

1. Capture a meal photo via camera
2. Wait 10 minutes
3. Check notification - should show pixel art image

## How It Works

### File Storage
```
iPhone Storage (Private to App)
└── Library/
    └── PixelArt/
        └── pixel_art_[mealId].png  (5-10 KB each)
```

### Notification Flow
```
1. Photo captured → CameraScreen
2. Pixel art generated (5-10s) → API returns base64
3. Save to local file → RNFS.writeFile()
4. Cancel original notification (react-native-push-notification)
5. Schedule new notification with image → notifee.createTriggerNotification()
6. 10 minutes later → iOS displays notification with image
```

### Platform Support

**iOS (via Notifee):**
- ✅ Uses `ios.attachments` parameter
- ✅ Shows image as thumbnail or full view when expanded
- ✅ File path format: Direct local path (e.g., `/var/mobile/.../pixel_art.png`)
- ✅ No service extension required!

**Android (via Notifee):**
- ✅ Uses `android.style.picture` (big picture style)
- ✅ Shows image in expanded notification
- ✅ File path format: Direct local path

## Troubleshooting

### Notification shows but no image

**Check logs for:**
```
✅ Pixel art saved locally: /path/to/file.png
✅ Pixel art notification updated with image attachment
```

**Common issues:**
1. **File path wrong** - Check RNFS.LibraryDirectoryPath value
2. **File doesn't exist** - Pixel art generation may have failed
3. **Permission issue** - Try enabling App Groups
4. **Format issue** - Ensure PNG format (not JPEG)

### Image too large

Pixel art should be small (5-10 KB). If larger:
- Check API response size
- Verify base64 encoding is correct
- Ensure PNG compression is enabled

### Notification doesn't fire at all

Check scheduled notifications:
```typescript
import notificationService from './services/notificationService';
await notificationService.getScheduledNotifications();
```

## File Cleanup

Pixel art files are automatically cleaned up when:
- User deletes the meal
- App is uninstalled
- User clears app data

No manual cleanup needed - iOS handles it automatically.

## Security & Privacy

- ✅ No user permission required
- ✅ Files are sandboxed (app-private)
- ✅ Not visible in Photos or Files app
- ✅ Deleted when app is deleted
- ✅ Uses device storage only (no cloud)

## Performance

- **File size:** ~5-10 KB per pixel art
- **Storage impact:** Minimal (100 meals = ~500 KB - 1 MB)
- **Network:** No additional network requests (file is local)
- **Battery:** Negligible impact

## Summary

This implementation provides a **frictionless user experience**:
- No permissions to grant
- No setup required
- No visible file management
- Just works automatically

The only developer action needed is **optional App Group setup** in Xcode for more robust file sharing between app and notifications.
