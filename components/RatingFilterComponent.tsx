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
// Import theme
import { colors, typography, spacing, shadows } from '../themes';

const { width } = Dimensions.get('window');

export interface RatingFilterItem {
  type: 'rating';
  value: number; // 1-5 rating
  label: string; // Display text
}

export type SortOption = 'chronological' | 'rating';

interface RatingFilterComponentProps {
  onRatingFilterChange: (ratings: number[] | null) => void;
  initialRatings?: number[] | null;
  showDropdown?: boolean;
  onDropdownToggle?: (isOpen: boolean) => void;
  onSortChange?: (sort: SortOption) => void;
  initialSort?: SortOption;
}

const RatingFilterComponent: React.FC<RatingFilterComponentProps> = ({
  onRatingFilterChange,
  initialRatings = null,
  showDropdown: controlledShowDropdown,
  onDropdownToggle,
  onSortChange,
  initialSort = 'chronological'
}) => {
  const [selectedRatings, setSelectedRatings] = useState<number[]>(initialRatings || []);
  const [internalShowDropdown, setInternalShowDropdown] = useState(false);
  const [currentSort, setCurrentSort] = useState<SortOption>(initialSort);

  // Use controlled state if provided, otherwise use internal state
  const showDropdown = controlledShowDropdown !== undefined ? controlledShowDropdown : internalShowDropdown;
  const setShowDropdown = onDropdownToggle || setInternalShowDropdown;

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

  const handleSortChange = (sort: SortOption) => {
    setCurrentSort(sort);
    if (onSortChange) {
      onSortChange(sort);
    }
  };

  const handleToggleDropdown = () => {
    if (onDropdownToggle) {
      onDropdownToggle(!showDropdown);
    } else {
      setInternalShowDropdown(!showDropdown);
    }
  };

  const handleCloseDropdown = () => {
    if (onDropdownToggle) {
      onDropdownToggle(false);
    } else {
      setInternalShowDropdown(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.dropdownToggleButton,
          selectedRatings.length > 0 && styles.dropdownToggleButtonActive
        ]}
        onPress={handleToggleDropdown}
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

            {/* Sort Toggle Section */}
            <View style={styles.sortSection}>
              <Text style={styles.sortLabel}>Sort by:</Text>
              <View style={styles.sortButtons}>
                <TouchableOpacity
                  style={[
                    styles.sortButton,
                    currentSort === 'chronological' && styles.sortButtonActive
                  ]}
                  onPress={() => handleSortChange('chronological')}
                >
                  <Text style={[
                    styles.sortButtonText,
                    currentSort === 'chronological' && styles.sortButtonTextActive
                  ]}>
                    Date
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.sortButton,
                    currentSort === 'rating' && styles.sortButtonActive
                  ]}
                  onPress={() => handleSortChange('rating')}
                >
                  <Text style={[
                    styles.sortButtonText,
                    currentSort === 'rating' && styles.sortButtonTextActive
                  ]}>
                    Rating
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={styles.dropdownFilterButton}
              onPress={handleCloseDropdown}
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
    backgroundColor: colors.white,
    borderRadius: spacing.borderRadius.md,
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: colors.mediumGray,
  },
  dropdownToggleButtonActive: {
    backgroundColor: colors.legacyGold,
    borderColor: colors.legacyGold,
  },
  dropdownContainer: {
    position: 'absolute',
    top: 45,
    right: 0,
    zIndex: 1001,
    ...shadows.medium,
  },
  dropdownContent: {
    backgroundColor: colors.white,
    borderRadius: spacing.borderRadius.md,
    width: 140,
    maxHeight: 360,
    borderWidth: 1,
    borderColor: colors.mediumGray,
  },
  ratingsContainer: {
    maxHeight: 240,
  },
  ratingItem: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
  },
  ratingItemSelected: {
    backgroundColor: '#fff8e1',
  },
  dropdownFilterButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.mediumGray,
    alignItems: 'center',
    backgroundColor: colors.lightGray,
    borderBottomLeftRadius: spacing.borderRadius.md,
    borderBottomRightRadius: spacing.borderRadius.md,
  },
  dropdownFilterButtonText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  sortSection: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.mediumGray,
    borderBottomWidth: 1,
    borderBottomColor: colors.mediumGray,
  },
  sortLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  sortButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  sortButton: {
    flex: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: spacing.borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.mediumGray,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  sortButtonActive: {
    backgroundColor: '#5B8A72',
    borderColor: '#5B8A72',
  },
  sortButtonText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  sortButtonTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
});

export default RatingFilterComponent;