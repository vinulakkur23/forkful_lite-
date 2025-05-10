import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

// Star images - add these to your assets folder
// Path would be: /assets/stars/star-filled.png and /assets/stars/star-empty.png
const STAR_FILLED = require('../assets/stars/star-filled.png');
const STAR_EMPTY = require('../assets/stars/star-empty.png');

interface StarRatingProps {
  rating: number;
  maxStars?: number;
  starSize?: number;
  spacing?: number;
  style?: any;
}

const StarRating: React.FC<StarRatingProps> = ({
  rating,
  maxStars = 5,
  starSize = 16,
  spacing = 2,
  style = {},
}) => {
  return (
    <View style={[styles.container, style]}>
      {[...Array(maxStars)].map((_, i) => (
        <Image
          key={`star-${i}`}
          source={i < rating ? STAR_FILLED : STAR_EMPTY}
          style={[
            styles.star,
            {
              width: starSize,
              height: starSize,
              marginRight: i < maxStars - 1 ? spacing : 0,
            },
          ]}
          resizeMode="contain"
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  star: {
    width: 16,
    height: 16,
  },
});

export default StarRating;