# Custom Fonts for iOS

This directory contains the font files that are directly bundled with the iOS app.

## Font Files
- Lobster-Regular.ttf: Used for app title

## Manual Steps in Xcode (if needed)
If the fonts are not being bundled correctly, you may need to:

1. Open the Xcode project
2. Right-click on the Project Navigator
3. Select "Add Files to [project name]"
4. Navigate to this "Fonts" directory
5. Select all font files
6. Make sure "Copy items if needed" is checked
7. Add to target: MealRatingAppNew
8. Click "Add"

## Checking in Runtime
To verify fonts are available in the running app, you can check:
- The log for font loading messages
- Check `UIFont.familyNames` and `UIFont.fontNames(forFamilyName:)` output