# Button Icons

This directory contains icons for buttons used throughout the app.

## Required Icons

Please add the following icons to this directory:

1. `share-icon.png` - Icon for the Share button
2. `edit-icon.png` - Icon for the Edit button
3. `delete-icon.png` - Icon for the Delete button

## Icon Guidelines

- Icons should be white PNG images with transparent backgrounds
- Recommended size: 24x24 pixels
- Use simple, clean designs with clear silhouettes
- Make sure the icons are visually consistent with each other

## Usage

These icons are imported from the `config/buttonIcons.ts` file, which centralizes all button icon references. To use these icons in a component:

```javascript
import { BUTTON_ICONS } from '../config/buttonIcons';

// Then in your component:
<Image 
  source={BUTTON_ICONS.SHARE} 
  style={styles.buttonIcon} 
/>
```

## Adding New Icons

When adding new button icons:

1. Add the icon file to this directory
2. Update the `config/buttonIcons.ts` file with the new icon reference
3. Use the constant from the config file in your components