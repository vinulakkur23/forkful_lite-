/**
 * Forkful Typography System
 * Elegant serif headings + clean sans-serif body text
 */

export const typography = {
  // Headers (Serif) - Unna
  // Use these for screen titles, section headers, and important text
  h1: {
    fontFamily: 'Unna',
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  h2: {
    fontFamily: 'Unna',
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  h3: {
    fontFamily: 'Unna',
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: 0,
  },
  h4: {
    fontFamily: 'Unna',
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: 0,
  },

  // Body Text (Sans-serif) - Inter
  // Use these for body copy, descriptions, and general text
  bodyLarge: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0,
  },
  bodyMedium: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0,
  },
  bodySmall: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0,
  },

  // UI Elements (Sans-serif) - Inter
  // Use these for buttons, labels, and interactive elements
  buttonLarge: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  buttonMedium: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  buttonSmall: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    letterSpacing: 0.5,
  },

  // Captions & Labels
  caption: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.3,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  overline: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },

  // Legacy Fonts (for gradual migration)
  // These will be removed as we complete the redesign
  legacyLobster: {
    fontFamily: 'Lobster-Regular',
    fontSize: 28,
  },
  legacyNunito: {
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    fontSize: 16,
  },
} as const;

// Font weight helpers for platforms that support it
export const fontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export default typography;
