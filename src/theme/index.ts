import { fonts } from './fonts';

// Main colors used in the app
const colors = {
  primary: '#ff6b6b', // Existing primary color from your app
  secondary: '#4ecdc4',
  accent: '#ffd166',
  background: '#ffffff',
  surface: '#f8f8f8',
  text: {
    primary: '#212121',
    secondary: '#757575',
    hint: '#9e9e9e',
    disabled: '#bdbdbd',
    inverse: '#ffffff',
  },
  status: {
    success: '#4caf50',
    warning: '#ff9800',
    error: '#f44336',
    info: '#2196f3',
  },
};

// Spacing constants for consistent layout
const spacing = {
  xs: 4,
  small: 8,
  medium: 16,
  large: 24,
  xl: 32,
  xxl: 48,
};

// Border radius constants for consistent UI
const borderRadius = {
  small: 4,
  medium: 8,
  large: 16,
  round: 999, // For circular elements
};

// Shadows for elevation
const shadows = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 12,
  },
};

// Export the theme object
export const theme = {
  colors,
  fonts,
  spacing,
  borderRadius,
  shadows,
};

// Usage example:
// import { theme } from 'src/theme';
//
// const styles = StyleSheet.create({
//   container: {
//     backgroundColor: theme.colors.background,
//     padding: theme.spacing.medium,
//     borderRadius: theme.borderRadius.medium,
//     ...theme.shadows.small,
//   },
//   title: {
//     ...theme.fonts.style.h2,
//     color: theme.colors.text.primary,
//   },
// });