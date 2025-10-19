/**
 * Forkful Spacing System
 * Consistent spacing values for padding, margins, and gaps
 */

export const spacing = {
  // Base spacing units
  xs: 4,      // Extra small - tight spacing, icon padding
  sm: 8,      // Small - compact elements, between items
  md: 16,     // Medium - standard padding/margin
  lg: 24,     // Large - section spacing, generous padding
  xl: 32,     // Extra large - major sections, screen padding
  xxl: 48,    // Double extra large - hero sections, major gaps
  xxxl: 64,   // Triple extra large - special large sections

  // Common use cases (semantic naming)
  cardPadding: 16,
  screenPadding: 20,
  sectionGap: 24,
  itemGap: 12,
  iconSpacing: 8,
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    full: 9999,
  },
} as const;

// Helper function to calculate spacing multiples
export const getSpacing = (multiplier: number): number => {
  return spacing.md * multiplier;
};

export default spacing;
