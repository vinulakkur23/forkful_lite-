// Button icons configuration
// This file centralizes the paths to button icons used throughout the app

// Default material icon equivalents
import Icon from 'react-native-vector-icons/MaterialIcons';

// Try to load custom icons, but provide fallbacks if they don't exist yet
let shareIcon, editIcon, deleteIcon;

try {
  // Attempt to load the custom icons
  shareIcon = require('../assets/icons/buttons/share-icon.png');
} catch (e) {
  // Use null if the icon file doesn't exist yet
  shareIcon = null;
}

try {
  editIcon = require('../assets/icons/buttons/edit-icon.png');
} catch (e) {
  editIcon = null;
}

try {
  deleteIcon = require('../assets/icons/buttons/delete-icon.png');
} catch (e) {
  deleteIcon = null;
}

export const BUTTON_ICONS = {
  // Detail screen action buttons
  SHARE: shareIcon,
  EDIT: editIcon,
  DELETE: deleteIcon,
  
  // Add more button icons here as needed
};

// Check if custom icons are available
export const hasCustomIcons = {
  SHARE: !!shareIcon,
  EDIT: !!editIcon,
  DELETE: !!deleteIcon
};