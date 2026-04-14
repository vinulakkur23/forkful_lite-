/**
 * IconicBadge
 * Small corner badge rendered on meal cards whose `iconic_eat_id` is set.
 * Signals that this user meal completed an Iconic Eats challenge.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../themes';

interface Props {
  size?: 'small' | 'medium';
  style?: any;
}

const IconicBadge: React.FC<Props> = ({ size = 'small', style }) => {
  const isSmall = size === 'small';
  return (
    <View
      style={[
        styles.badge,
        isSmall ? styles.small : styles.medium,
        style,
      ]}
    >
      <Text style={[styles.text, isSmall ? styles.textSmall : styles.textMedium]}>
        ICONIC
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#1a2b49',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  medium: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: {
    color: colors.white,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  textSmall: {
    fontSize: 9,
  },
  textMedium: {
    fontSize: 11,
  },
});

export default React.memo(IconicBadge);
