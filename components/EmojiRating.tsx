import React, { useState } from 'react';
import { View, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from 'react-native';

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
}

const EmojiRating: React.FC<Props> = ({ 
  rating, 
  onRatingChange, 
  size = 40, 
  interactive = true,
  style 
}) => {
  const [loadingImages, setLoadingImages] = useState<{[key: number]: boolean}>({});

  const handleEmojiPress = (emojiId: number) => {
    if (interactive && onRatingChange) {
      onRatingChange(emojiId);
    }
  };

  const handleImageLoadStart = (emojiId: number) => {
    setLoadingImages(prev => ({ ...prev, [emojiId]: true }));
  };

  const handleImageLoadEnd = (emojiId: number) => {
    setLoadingImages(prev => ({ ...prev, [emojiId]: false }));
  };

  return (
    <View style={[styles.container, style]}>
      {EMOJI_RATINGS.map((emoji) => (
        <TouchableOpacity
          key={emoji.id}
          onPress={() => handleEmojiPress(emoji.id)}
          style={[styles.emojiTouchable, { opacity: interactive ? 1 : 1 }]}
          activeOpacity={interactive ? 0.7 : 1}
          disabled={!interactive}
        >
          <View style={[styles.imageContainer, { width: size, height: size }]}>
            <Image
              source={rating === emoji.id ? emoji.active : emoji.inactive}
              style={[styles.emoji, { width: size, height: size }]}
              resizeMode="contain"
              onLoadStart={() => handleImageLoadStart(emoji.id)}
              onLoadEnd={() => handleImageLoadEnd(emoji.id)}
              onError={() => handleImageLoadEnd(emoji.id)}
            />
            {loadingImages[emoji.id] && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="small" color="#ccc" />
              </View>
            )}
          </View>
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
  imageContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    width: 40,
    height: 40,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
});

export default EmojiRating;