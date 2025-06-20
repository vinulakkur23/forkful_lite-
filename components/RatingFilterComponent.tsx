import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import EmojiDisplay from './EmojiDisplay';

const { width } = Dimensions.get('window');

export interface RatingFilterItem {
  type: 'rating';
  value: number; // 1-5 rating
  label: string; // Display text
}

interface RatingFilterComponentProps {
  onRatingFilterChange: (ratings: number[] | null) => void;
  initialRatings?: number[] | null;
}

const RatingFilterComponent: React.FC<RatingFilterComponentProps> = ({
  onRatingFilterChange,
  initialRatings = null
}) => {
  const [selectedRatings, setSelectedRatings] = useState<number[]>(initialRatings || []);
  const [showDropdown, setShowDropdown] = useState(false);

  // Available ratings 1-6 (only rated meals)
  const availableRatings = [1, 2, 3, 4, 5, 6];

  // Update parent when selections change
  useEffect(() => {
    console.log('RatingFilterComponent: selectedRatings changed:', selectedRatings);
    if (selectedRatings.length === 0) {
      console.log('RatingFilterComponent: Calling onRatingFilterChange with null');
      onRatingFilterChange(null);
    } else {
      console.log('RatingFilterComponent: Calling onRatingFilterChange with:', selectedRatings);
      onRatingFilterChange(selectedRatings);
    }
  }, [selectedRatings]); // Removed onRatingFilterChange from dependencies to prevent loops

  // Set initial ratings if provided
  useEffect(() => {
    if (initialRatings && initialRatings.length > 0) {
      setSelectedRatings(initialRatings);
    }
  }, [initialRatings]);

  const toggleRating = (rating: number) => {
    setSelectedRatings(prev => {
      if (prev.includes(rating)) {
        return prev.filter(r => r !== rating);
      } else {
        return [...prev, rating].sort();
      }
    });
  };

  const clearAll = () => {
    setSelectedRatings([]);
  };



  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.dropdownToggleButton,
          selectedRatings.length > 0 && styles.dropdownToggleButtonActive
        ]}
        onPress={() => setShowDropdown(!showDropdown)}
      >
        <EmojiDisplay rating={3} size={20} />
      </TouchableOpacity>

      {showDropdown && (
        <View style={styles.dropdownContainer}>
          <View style={styles.dropdownContent}>
            <ScrollView style={styles.ratingsContainer} nestedScrollEnabled={true}>
              {availableRatings.map(rating => (
                <TouchableOpacity
                  key={rating}
                  style={[
                    styles.ratingItem,
                    selectedRatings.includes(rating) && styles.ratingItemSelected
                  ]}
                  onPress={() => toggleRating(rating)}
                >
                  <EmojiDisplay rating={rating} size={24} />
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.dropdownFilterButton}
              onPress={() => setShowDropdown(false)}
            >
              <Text style={styles.dropdownFilterButtonText}>Filter</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 1000,
  },
  dropdownToggleButton: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  dropdownToggleButtonActive: {
    backgroundColor: '#ffc008',
    borderColor: '#ffc008',
  },
  dropdownContainer: {
    position: 'absolute',
    top: 45, // Just below the button
    right: 0,
    zIndex: 1001,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  dropdownContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: 80, // Made thinner since we removed the Clear button
    maxHeight: 280, // Reduced since we removed action buttons section
    borderWidth: 1,
    borderColor: '#ddd',
  },
  ratingsContainer: {
    maxHeight: 240, // Height to show all 6 ratings without scrolling
  },
  ratingItem: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8, // Reduced from 12 to 8 for more compact rows
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  ratingItemSelected: {
    backgroundColor: '#fff8e1',
  },
  dropdownFilterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  dropdownFilterButtonText: {
    color: '#1a2b49',
    fontWeight: '600',
    fontSize: 12,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
});

export default RatingFilterComponent;