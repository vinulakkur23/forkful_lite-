# Customizing Food Passport Tab Icons

This guide explains how to customize the tab icons in the Food Passport screen.

## Changes Made

1. Changed "Food Passport" text to "My Food Passport" in the header
2. Removed text labels beneath the tab icons
3. Set up the tab navigation to use custom image icons
4. Created a directory structure for custom tab icons

## How to Add Your Own Custom Icons

### Icon Requirements

1. **Format**: PNG format with transparency
2. **Size**: While icons will display at 28x28 pixels, create them at higher resolutions:
   - Recommended sizes: 56x56 pixels (2x) or 84x84 pixels (3x)
   - Using larger source images will ensure they look crisp on high-density displays
   - React Native will automatically scale them down for display
3. **States**: Each tab needs both active (selected) and inactive (unselected) versions
4. **Background**: Transparent background

### Steps to Add Custom Icons

1. Create your custom icons using your preferred design tool (Photoshop, Figma, etc.)
2. Save each icon in PNG format with transparency
3. Name them according to this convention:
   - For "My Meals" tab: `meals-active.png` and `meals-inactive.png`
   - For "Map" tab: `map-active.png` and `map-inactive.png`
   - For "Stamps" tab: `stamps-active.png` and `stamps-inactive.png`
4. Place the files in this directory:
   ```
   /assets/icons/passport_tabs/
   ```
5. Rebuild and restart the app to see your custom icons

### Design Recommendations

- **Active Icons**: Should represent the selected state, usually in the app's accent color (red/pink)
- **Inactive Icons**: Should represent the unselected state, usually in a muted gray
- **Style Consistency**: Maintain consistent weight, style, and visual treatment across all icons
- **Visual Simplicity**: Since there are no text labels, icons should clearly communicate their function

## File Locations

The following files were modified in this implementation:

1. `/screens/FoodPassportWrapper.tsx` - Modified to use custom icons and remove text labels
2. Created directory: `/assets/icons/passport_tabs/` - For storing custom tab icons
3. Added placeholder icon files named according to the required convention

## Troubleshooting

If your custom icons don't appear:
1. Confirm file names exactly match the required format
2. Verify files are in the correct directory
3. Ensure images are in PNG format with proper dimensions
4. Clear the React Native cache and rebuild the app

To clear the cache on iOS:
```
cd ios && pod install && cd ..
npx react-native start --reset-cache
```