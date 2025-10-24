import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { DishCriterion } from '../services/dishCriteriaService';

interface CriteriaRatings {
  [criterionTitle: string]: number;
}

interface DynamicCriteriaRatingProps {
  criteria: DishCriterion[];
  initialRatings?: CriteriaRatings;
  onRatingsChange: (ratings: CriteriaRatings) => void;
}

const DynamicCriteriaRating: React.FC<DynamicCriteriaRatingProps> = ({
  criteria,
  initialRatings = {},
  onRatingsChange,
}) => {
  // Initialize ratings state
  const [ratings, setRatings] = useState<CriteriaRatings>(() => {
    const initial: CriteriaRatings = {};
    criteria.forEach(criterion => {
      initial[criterion.title] = initialRatings[criterion.title] || 5; // Default to 5/10
    });
    return initial;
  });

  // Calculate average rating
  const averageRating = Object.values(ratings).reduce((sum, rating) => sum + rating, 0) / criteria.length;

  // Handle rating change for a specific criterion
  const handleRatingChange = (criterionTitle: string, value: number) => {
    const newRatings = {
      ...ratings,
      [criterionTitle]: Math.round(value), // Round to nearest integer
    };
    setRatings(newRatings);
    onRatingsChange(newRatings);
  };

  // Get color based on rating value
  const getRatingColor = (rating: number) => {
    if (rating >= 8) return '#4CAF50'; // Green for excellent
    if (rating >= 6) return '#FFC107'; // Yellow for good
    if (rating >= 4) return '#FF9800'; // Orange for okay
    return '#F44336'; // Red for poor
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Detailed Quality Rating</Text>
        <View style={styles.averageContainer}>
          <Text style={styles.averageLabel}>Average:</Text>
          <Text style={[styles.averageScore, { color: getRatingColor(averageRating) }]}>
            {averageRating.toFixed(1)}/10
          </Text>
        </View>
      </View>

      <Text style={styles.subtitle}>
        Rate each quality aspect of your dish:
      </Text>

      {criteria.map((criterion, index) => (
        <View key={index} style={styles.criterionContainer}>
          <View style={styles.criterionHeader}>
            <Text style={styles.criterionNumber}>{index + 1}.</Text>
            <Text style={styles.criterionTitle}>{criterion.title}</Text>
          </View>
          
          <Text style={styles.criterionDescription}>
            {criterion.description}
          </Text>

          <View style={styles.sliderContainer}>
            <Text style={styles.ratingValue}>1</Text>
            <Slider
              style={styles.slider}
              minimumValue={1}
              maximumValue={10}
              value={ratings[criterion.title] || 5}
              onValueChange={(value) => handleRatingChange(criterion.title, value)}
              minimumTrackTintColor={getRatingColor(ratings[criterion.title] || 5)}
              maximumTrackTintColor="#E0E0E0"
              thumbTintColor={getRatingColor(ratings[criterion.title] || 5)}
              step={1}
            />
            <Text style={styles.ratingValue}>10</Text>
          </View>

          <View style={styles.currentRatingContainer}>
            <Text style={styles.currentRatingLabel}>Your rating:</Text>
            <Text style={[
              styles.currentRatingValue,
              { color: getRatingColor(ratings[criterion.title] || 5) }
            ]}>
              {ratings[criterion.title] || 5}/10
            </Text>
          </View>
        </View>
      ))}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          💡 These criteria are specific to {criteria[0]?.title ? 'your dish' : 'this dish'} and help you evaluate it like a food expert
        </Text>
      </View>
    </View>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
    fontFamily: 'Inter',
  },
  averageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  averageLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 4,
    fontFamily: 'Inter',
  },
  averageScore: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Inter',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    fontFamily: 'Inter',
  },
  criterionContainer: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  criterionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  criterionNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginRight: 8,
    minWidth: 20,
    fontFamily: 'Inter',
  },
  criterionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    flex: 1,
    fontFamily: 'Inter',
  },
  criterionDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
    marginLeft: 28,
    fontFamily: 'Inter',
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
    marginBottom: 8,
  },
  slider: {
    flex: 1,
    height: 40,
    marginHorizontal: 10,
  },
  ratingValue: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
    fontFamily: 'Inter',
  },
  currentRatingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  currentRatingLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 8,
    fontFamily: 'Inter',
  },
  currentRatingValue: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Inter',
  },
  footer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  footerText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
    fontFamily: 'Inter',
  },
});

export default DynamicCriteriaRating;