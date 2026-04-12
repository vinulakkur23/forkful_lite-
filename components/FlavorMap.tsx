/**
 * FlavorMap — weighted flowing tag pills for the taste profile section.
 *
 * Each pill's size (font + padding), color (gray→taupe→green), and font
 * weight encode both frequency and rating preference. Standard left-to-right
 * wrap layout — every word is horizontal and instantly readable.
 *
 * Drop-in replacement for the WordCloud component. Same data shape.
 */
import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import type {WordCloudItem} from '../utils/wordCloudData';
import {scoreToColor} from '../utils/wordCloudData';
import {colors} from '../themes';

interface FlavorMapProps {
  items: WordCloudItem[];
  onWordPress?: (item: WordCloudItem) => void;
}

const FlavorMap: React.FC<FlavorMapProps> = ({items, onWordPress}) => {
  // Sort by color (highest preference first) so the greenest pills lead.
  const sorted = [...items].sort(
    (a, b) => b.normalizedScore - a.normalizedScore,
  );

  return (
    <View style={styles.container}>
      {sorted.map((item) => {
        // Font size: 11–18 based on normalizedSize
        const fontSize = 11 + item.normalizedSize * 7;
        // Padding scales with font size
        const hPad = 8 + item.normalizedSize * 6;
        const vPad = 4 + item.normalizedSize * 3;
        // Font weight: bold for top items, regular for the rest
        const fontWeight: '400' | '600' | '700' =
          item.normalizedSize > 0.7
            ? '700'
            : item.normalizedSize > 0.35
              ? '600'
              : '400';
        // Color from rating score
        const textColor = scoreToColor(item.normalizedScore);
        // Background: subtle tinted fill — green for high score, gray for low
        const bgOpacity = 0.08 + item.normalizedSize * 0.07;
        const bgColor =
          item.normalizedScore > 0
            ? `rgba(58, 143, 92, ${bgOpacity})`   // green tint
            : `rgba(160, 160, 160, ${bgOpacity})`; // gray tint

        return (
          <TouchableOpacity
            key={item.rawKey}
            activeOpacity={0.7}
            onPress={() => onWordPress?.(item)}
            style={[
              styles.pill,
              {
                paddingHorizontal: hPad,
                paddingVertical: vPad,
                backgroundColor: bgColor,
              },
            ]}
          >
            <Text
              style={[
                styles.pillText,
                {
                  fontSize,
                  fontWeight,
                  color: textColor,
                },
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 6,
  },
  pill: {
    borderRadius: 20,
  },
  pillText: {
    fontFamily: 'Inter-Regular',
    textTransform: 'capitalize',
  },
});

export default FlavorMap;
