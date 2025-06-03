import React from 'react';
import { Image, StyleSheet } from 'react-native';
import { EMOJI_RATINGS } from './EmojiRating';

interface Props {
  rating: number;
  size?: number;
  style?: any;
}

const EmojiDisplay: React.FC<Props> = ({ rating, size = 24, style }) => {
  // Find the emoji for the given rating
  const emoji = EMOJI_RATINGS.find(e => e.id === rating);
  
  if (!emoji) {
    return null;
  }

  return (
    <Image
      source={emoji.active}
      style={[styles.emoji, { width: size, height: size }, style]}
      resizeMode="contain"
    />
  );
};

const styles = StyleSheet.create({
  emoji: {
    width: 24,
    height: 24,
  },
});

export default EmojiDisplay;