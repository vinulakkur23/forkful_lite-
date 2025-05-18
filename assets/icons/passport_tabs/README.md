# Custom Food Passport Tab Icons

This directory contains custom icons for the Food Passport screen's tab navigation.

## Icon Requirements

1. **Format**: PNG format with transparency
2. **Size**: While icons will display at 28x28 pixels, you should create them at 56x56 pixels or higher (2x or 3x resolution) for better quality on high-density displays
3. **State**: Create both active (selected) and inactive (unselected) versions
4. **Background**: Transparent background

## Tab Icon Filenames

The app is set up to use the following image files:

| Tab | Active Icon | Inactive Icon |
|-----|-------------|---------------|
| My Meals | `meals-active.png` | `meals-inactive.png` |
| Map | `map-active.png` | `map-inactive.png` |
| Stamps | `stamps-active.png` | `stamps-inactive.png` |

## How to Add Your Custom Icons

1. Create your custom icons in a graphics editor (like Photoshop, Figma, or similar)
2. Export them as PNG files with the exact filenames listed above
3. Place the files in this directory (`/assets/icons/passport_tabs/`)
4. Rebuild the app to see your custom icons

## Notes

- Active icons will display in the accent color (`#ff6b6b`) when selected
- Inactive icons will display in a muted gray color (`#999`) when not selected
- For best results, create icons with consistent visual weight and style across all tabs