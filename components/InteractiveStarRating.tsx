import React from 'react';
import { View, Image, StyleSheet, TouchableOpacity } from 'react-native';

// Star images - same as regular StarRating
const STAR_FILLED = require('../assets/stars/star-filled.png');
const STAR_EMPTY = require('../assets/stars/star-empty.png');

interface InteractiveStarRatingProps {
  rating: number;
  onRatingChange: (rating: number) => void;
  maxStars?: number;
  starSize?: number;
  spacing?: number;
  style?: any;
}

const InteractiveStarRating: React.FC<InteractiveStarRatingProps> = ({
  rating,
  onRatingChange,
  maxStars = 5,
  starSize = 36,
  spacing = 5,
  style = {},
}) => {
  return (
    <View style={[styles.container, style]}>
      {[...Array(maxStars)].map((_, i) => (
        <TouchableOpacity
          key={`star-${i}`}
          onPress={() => onRatingChange(i + 1)}
          style={styles.starTouchable}
        >
          <Image
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
        </TouchableOpacity>
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
    width: 36,
    height: 36,
  },
  starTouchable: {
    padding: 5,
  },
});

export default InteractiveStarRating;