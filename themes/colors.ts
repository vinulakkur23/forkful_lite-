/**
 * Forkful Color Theme
 * Elegant, sophisticated palette inspired by premium lifestyle apps
 */

export const colors = {
  // Primary Colors
  charcoal: '#1A1A1A',        // Main dark color for text and important elements
  warmTaupe: '#8B7355',       // Accent color - earthy, elegant, doesn't compete with food
  desertSand: '#C19A6B',      // Alternative accent - slightly lighter

  // Background Colors
  white: '#FFFFFF',            // Primary background - clean, lets food photos shine
  lightTan: '#F5F0E8',         // Warmer tan background - complements sage green
                               // Other options: '#E8F3F1' (light blue), '#FAF8F5' (very light tan)
  lightGray: '#F7F7F7',        // Secondary background - subtle sections/cards
  mediumGray: '#EBEBEB',       // Tertiary - dividers, borders, disabled states

  // Text Colors
  textPrimary: '#1A1A1A',      // Main headings, important text
  textSecondary: '#4A4A4A',    // Body text, descriptions
  textTertiary: '#858585',     // Metadata, timestamps, counts, subtle info
  textPlaceholder: '#BDBDBD',  // Placeholder text, disabled states

  // Semantic Colors
  success: '#2D7A3E',          // Success states, positive actions
  error: '#C84B4B',            // Error states, destructive actions
  warning: '#D4941C',          // Warning states, caution

  // Shadows & Overlays
  shadowLight: 'rgba(0, 0, 0, 0.08)',    // Subtle card elevation
  shadowMedium: 'rgba(0, 0, 0, 0.12)',   // Modals, important elements
  overlay: 'rgba(0, 0, 0, 0.4)',          // Image overlays, modal backdrops
  overlayLight: 'rgba(0, 0, 0, 0.2)',     // Lighter overlay for subtle effects

  // Legacy Colors (for gradual migration)
  // These will be removed as we complete the redesign
  legacyNavy: '#1a2b49',
  legacyGold: '#ffc008',
  legacyRed: '#E63946',
  legacyCream: '#FAF9F6',
} as const;

// Helper function to add alpha to hex colors
export const addAlpha = (color: string, opacity: number): string => {
  const alpha = Math.round(opacity * 255);
  return `${color}${alpha.toString(16).padStart(2, '0')}`;
};

export default colors;
