# Custom Fonts for Meal Rating App

Place your custom font files (TTF or OTF format) in this directory.

## Font File Naming

The name of the font file should match the PostScript name of the font.

For example:
- For a font family "Montserrat" with weight "Bold":
  - Use filename: `Montserrat-Bold.ttf`

## Recommended Font Weights

For a complete design system, include these weights:
- Regular (400)
- Medium (500)
- SemiBold (600)
- Bold (700)

## Usage in the App

After adding fonts to this directory, you'll need to:

1. For iOS: Update the Info.plist file
2. For Android: Update the build.gradle file
3. Link the fonts by running `npx react-native-asset`
4. Use the fonts in your styles:

```jsx
const styles = StyleSheet.create({
  text: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 16,
  },
});
```