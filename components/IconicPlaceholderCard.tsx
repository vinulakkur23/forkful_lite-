/**
 * IconicPlaceholderCard
 * Feed/profile placeholder card for an un-completed iconic eat challenge.
 * Visually distinct from DoubleTapMealCard (shadow emoji, "ICONIC EAT" label,
 * muted palette) so users can tell it's a challenge, not a real user post.
 * Tap opens IconicEatModal.
 */

import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, shadows } from '../themes';
import { IconicEat } from '../services/iconicEatsService';

interface Props {
  eat: IconicEat;
  onPress: (eat: IconicEat) => void;
}

const IconicPlaceholderCard: React.FC<Props> = ({ eat, onPress }) => {
  const uri = eat.unlocked ? eat.emoji_url : eat.shadow_emoji_url;
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(eat)}
      activeOpacity={0.85}
    >
      <View style={styles.emojiContainer}>
        {uri ? (
          <Image source={{ uri }} style={styles.emoji} resizeMode="contain" />
        ) : (
          <View style={[styles.emoji, styles.emojiPlaceholder]} />
        )}
        <View style={styles.iconicTag}>
          <Text style={styles.iconicTagText}>ICONIC EAT</Text>
        </View>
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.dishName} numberOfLines={1}>
          {eat.dish_name}
        </Text>
        <Text style={styles.restaurant} numberOfLines={1}>
          {eat.restaurant_name}
        </Text>
        <Text style={styles.challengeHint} numberOfLines={1}>
          {eat.unlocked ? 'Unlocked' : 'Tap to learn more'}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.lightTan,
    ...shadows.light,
  },
  emojiContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.lightTan,
    borderRadius: 10,
    marginRight: 12,
    position: 'relative',
  },
  emoji: {
    width: 64,
    height: 64,
  },
  emojiPlaceholder: {
    backgroundColor: colors.lightTan,
  },
  iconicTag: {
    position: 'absolute',
    top: -6,
    left: -6,
    backgroundColor: '#1a2b49',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  iconicTagText: {
    fontSize: 8,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 0.6,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  dishName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  restaurant: {
    fontSize: 13,
    color: colors.textPrimary,
    marginTop: 2,
  },
  challengeHint: {
    fontSize: 11,
    color: colors.warmTaupe,
    marginTop: 4,
    fontStyle: 'italic',
  },
});

export default React.memo(IconicPlaceholderCard);
