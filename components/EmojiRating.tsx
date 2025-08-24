import React from 'react';
import { View, TouchableOpacity, Image, StyleSheet } from 'react-native';

// Define the emoji ratings in order (swapped active/inactive so blue is active, gold is inactive)
export const EMOJI_RATINGS = [
  { id: 1, name: 'bad', active: require('../assets/emojis/emoji-bad-inactive.png'), inactive: require('../assets/emojis/emoji-bad-active.png') },
  { id: 2, name: 'ok', active: require('../assets/emojis/emoji-ok-inactive.png'), inactive: require('../assets/emojis/emoji-ok-active.png') },
  { id: 3, name: 'good', active: require('../assets/emojis/emoji-good-inactive.png'), inactive: require('../assets/emojis/emoji-good-active.png') },
  { id: 4, name: 'great', active: require('../assets/emojis/emoji-great-inactive.png'), inactive: require('../assets/emojis/emoji-great-active.png') },
  { id: 5, name: 'amazing', active: require('../assets/emojis/emoji-amazing-inactive.png'), inactive: require('../assets/emojis/emoji-amazing-active.png') },
  { id: 6, name: 'thebest', active: require('../assets/emojis/emoji-thebest-inactive.png'), inactive: require('../assets/emojis/emoji-thebest-active.png') },
];

interface Props {
  rating: number;
  onRatingChange?: (rating: number) => void;
  size?: number;
  interactive?: boolean;
  style?: any;
  maxEmojis?: number; // New prop to limit number of emojis shown
}

const EmojiRating: React.FC<Props> = ({ 
  rating, 
  onRatingChange, 
  size = 40, 
  interactive = true,
  style,
  maxEmojis = 6 // Default to showing all 6 emojis
}) => {
  const handleEmojiPress = (emojiId: number) => {
    if (interactive && onRatingChange) {
      onRatingChange(emojiId);
    }
  };

  // Filter emojis based on maxEmojis prop
  const emojisToShow = EMOJI_RATINGS.slice(0, maxEmojis);

  return (
    <View style={[styles.container, style]}>
      {emojisToShow.map((emoji) => (
        <TouchableOpacity
          key={emoji.id}
          onPress={() => handleEmojiPress(emoji.id)}
          style={[styles.emojiTouchable, { opacity: interactive ? 1 : 1 }]}
          activeOpacity={interactive ? 0.7 : 1}
          disabled={!interactive}
        >
          <Image
            source={rating === emoji.id ? emoji.active : emoji.inactive}
            style={[styles.emoji, { width: size, height: size }]}
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
    justifyContent: 'center',
  },
  emojiTouchable: {
    padding: 5,
    marginHorizontal: 2,
  },
  emoji: {
    width: 40,
    height: 40,
  },
});

export default EmojiRating;