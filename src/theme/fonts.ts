// Font configuration for the application

export const fonts = {
  // Font families
  family: {
    // Regular font style
    regular: 'Inter-Regular',
    // Medium font style
    medium: 'Inter-Regular',
    // Semi-bold font style
    semiBold: 'Inter-Regular',
    // Bold font style
    bold: 'Inter-Regular',
    // Special fonts
    lobster: 'Lobster-Regular',
  },
  
  // Font sizes
  size: {
    xs: 12,
    small: 14,
    medium: 16,
    large: 18,
    xl: 20,
    xxl: 24,
    xxxl: 30,
  },
  
  // Font styles - pre-configured combinations of family and size
  style: {
    // Headings
    h1: {
      fontFamily: 'YourFontFamily-Bold',
      fontSize: 30,
    },
    h2: {
      fontFamily: 'YourFontFamily-Bold',
      fontSize: 24,
    },
    h3: {
      fontFamily: 'YourFontFamily-SemiBold',
      fontSize: 20,
    },
    
    // Body text
    bodyLarge: {
      fontFamily: 'YourFontFamily-Regular',
      fontSize: 18,
    },
    body: {
      fontFamily: 'YourFontFamily-Regular',
      fontSize: 16,
    },
    bodySmall: {
      fontFamily: 'YourFontFamily-Regular',
      fontSize: 14,
    },
    
    // Accent text
    subtitle: {
      fontFamily: 'YourFontFamily-Medium',
      fontSize: 16,
    },
    caption: {
      fontFamily: 'YourFontFamily-Regular',
      fontSize: 12,
    },
    
    // Button text
    buttonLarge: {
      fontFamily: 'YourFontFamily-SemiBold',
      fontSize: 18,
    },
    button: {
      fontFamily: 'YourFontFamily-SemiBold',
      fontSize: 16,
    },
    buttonSmall: {
      fontFamily: 'YourFontFamily-SemiBold',
      fontSize: 14,
    },
  },
};

// Usage example:
// import { fonts } from 'src/theme/fonts';
//
// const styles = StyleSheet.create({
//   title: {
//     ...fonts.style.h1,
//     color: '#000000',
//   },
//   paragraph: {
//     ...fonts.style.body,
//     lineHeight: 24,
//   },
// });