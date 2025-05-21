# Adding Custom Fonts to Your React Native App

This guide explains how to add custom fonts to your React Native application.

## Step 1: Add Font Files

1. Place your font files (TTF or OTF) in the `/assets/fonts` directory
2. Make sure the font filenames match the PostScript name of the font (e.g., `Montserrat-Bold.ttf`)

## Step 2: Configure iOS

Add the fonts to your iOS project's Info.plist:

1. Open `/ios/MealRatingAppNew/Info.plist`
2. Add fonts to the "Fonts provided by application" array:

```xml
<key>UIAppFonts</key>
<array>
  <string>YourFontFamily-Regular.ttf</string>
  <string>YourFontFamily-Medium.ttf</string>
  <string>YourFontFamily-SemiBold.ttf</string>
  <string>YourFontFamily-Bold.ttf</string>
</array>
```

## Step 3: Configure Android

Add fonts to your Android project:

1. Create a font resource folder:
```
mkdir -p android/app/src/main/assets/fonts
```

2. (Optional) Copy your font files to the Android assets folder:
```
cp assets/fonts/*.ttf android/app/src/main/assets/fonts/
```

## Step 4: Link the Fonts

React Native provides a tool to automate the linking process:

```bash
npx react-native-asset
```

This command will:
- Update the Info.plist for iOS
- Copy fonts to the Android assets folder
- Configure all necessary build files

## Step 5: Update Font Configuration

1. Update the font names in `/src/theme/fonts.ts` to match your actual font names
2. Replace `YourFontFamily` with your actual font family name, for example:

```typescript
export const fonts = {
  family: {
    regular: 'Montserrat-Regular',
    medium: 'Montserrat-Medium',
    semiBold: 'Montserrat-SemiBold',
    bold: 'Montserrat-Bold',
  },
  // ...rest of the file
};
```

## Step 6: Use Custom Fonts in Your App

Import the theme or fonts directly and use them in your styles:

```jsx
import { theme } from '../src/theme';
// OR
import { fonts } from '../src/theme/fonts';

const styles = StyleSheet.create({
  title: {
    ...theme.fonts.style.h1,
    color: 'black',
  },
  // OR
  alternativeTitle: {
    fontFamily: fonts.family.bold,
    fontSize: fonts.size.xxl,
  },
});
```

## Troubleshooting

If fonts don't appear:

1. Check that font names match exactly in code and filenames
2. Ensure fonts are properly linked (try running `npx react-native-asset` again)
3. Clean and rebuild your project:
   ```
   npx react-native clean
   cd ios && pod install && cd ..
   npx react-native run-ios
   ```
   or
   ```
   cd android && ./gradlew clean && cd ..
   npx react-native run-android
   ```
4. Check font references in your styles for typos

## Example Usage

Here's an example of a component using custom fonts:

```jsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../src/theme';

const ExampleComponent = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Custom Font Heading</Text>
      <Text style={styles.body}>This text uses the regular custom font.</Text>
      <Text style={styles.emphasis}>This text uses the bold custom font.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.medium,
  },
  heading: {
    ...theme.fonts.style.h2,
    marginBottom: theme.spacing.small,
  },
  body: {
    ...theme.fonts.style.body,
    marginBottom: theme.spacing.small,
  },
  emphasis: {
    ...theme.fonts.style.subtitle,
    color: theme.colors.primary,
  },
});

export default ExampleComponent;
```