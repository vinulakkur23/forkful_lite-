/**
 * Forkful Design System
 * Central export for all theme tokens
 */

import colors, { addAlpha } from './colors';
import typography, { fontWeights } from './typography';
import spacing, { getSpacing } from './spacing';

// Common shadow presets
export const shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  light: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  heavy: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
};

// Common button styles
export const buttons = {
  primary: {
    backgroundColor: colors.warmTaupe,
    borderRadius: spacing.borderRadius.sm,
    paddingVertical: 14,
    paddingHorizontal: 24,
    ...shadows.light,
  },
  primaryText: {
    color: colors.white,
    ...typography.buttonLarge,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderRadius: spacing.borderRadius.sm,
    borderWidth: 1.5,
    borderColor: colors.warmTaupe,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  secondaryText: {
    color: colors.warmTaupe,
    ...typography.buttonLarge,
  },
  tertiary: {
    backgroundColor: 'transparent',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tertiaryText: {
    color: colors.textSecondary,
    ...typography.buttonMedium,
  },
};

// Common card styles
export const cards = {
  default: {
    backgroundColor: colors.white,
    borderRadius: spacing.borderRadius.md,
    padding: spacing.md,
    ...shadows.light,
  },
  elevated: {
    backgroundColor: colors.white,
    borderRadius: spacing.borderRadius.md,
    padding: spacing.md,
    ...shadows.medium,
  },
  outlined: {
    backgroundColor: colors.white,
    borderRadius: spacing.borderRadius.md,
    borderWidth: 1,
    borderColor: colors.mediumGray,
    padding: spacing.md,
  },
};

// Common input styles
export const inputs = {
  default: {
    backgroundColor: colors.lightGray,
    borderRadius: spacing.borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.mediumGray,
    paddingVertical: 12,
    paddingHorizontal: 16,
    ...typography.bodyLarge,
    color: colors.textPrimary,
  },
  focused: {
    borderColor: colors.warmTaupe,
    backgroundColor: colors.white,
  },
  error: {
    borderColor: colors.error,
  },
};

// Export everything
export { colors, typography, spacing, fontWeights, addAlpha, getSpacing };

export const theme = {
  colors,
  typography,
  spacing,
  shadows,
  buttons,
  cards,
  inputs,
};

export default theme;
