import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import SimpleFilterComponent, { FilterItem } from './SimpleFilterComponent';
import RatingFilterComponent from './RatingFilterComponent';
// Import theme
import { colors, typography, spacing, shadows } from '../themes';

export type SortOption = 'chronological' | 'rating';

interface CompositeFilterComponentProps {
  onFilterChange: (filters: FilterItem[] | null) => void;
  onRatingFilterChange: (ratings: number[] | null) => void;
  onSortChange?: (sort: SortOption) => void;
  initialFilters?: FilterItem[] | null;
  initialRatings?: number[] | null;
  initialSort?: SortOption;
  onUserSelect?: (userId: string, userName: string, userPhoto?: string) => void;
}

const CompositeFilterComponent: React.FC<CompositeFilterComponentProps> = ({
  onFilterChange,
  onRatingFilterChange,
  onSortChange,
  initialFilters = null,
  initialRatings = null,
  initialSort = 'chronological',
  onUserSelect
}) => {
  const [currentSort, setCurrentSort] = useState<SortOption>(initialSort);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showRatingDropdown, setShowRatingDropdown] = useState(false);

  const handleSortChange = (sort: SortOption) => {
    setCurrentSort(sort);
    setShowSortDropdown(false);
    if (onSortChange) {
      onSortChange(sort);
    }
  };

  const handleSortDropdownToggle = () => {
    setShowSortDropdown(!showSortDropdown);
    setShowRatingDropdown(false); // Close rating dropdown
  };

  const handleRatingDropdownToggle = (isOpen: boolean) => {
    setShowRatingDropdown(isOpen);
    if (isOpen) {
      setShowSortDropdown(false); // Close sort dropdown
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.filtersRow}>
        <View style={styles.searchFilterContainer}>
          <SimpleFilterComponent
            onFilterChange={onFilterChange}
            initialFilters={initialFilters}
            onUserSelect={onUserSelect}
          />
        </View>

        <RatingFilterComponent
          onRatingFilterChange={onRatingFilterChange}
          initialRatings={initialRatings}
          showDropdown={showRatingDropdown}
          onDropdownToggle={handleRatingDropdownToggle}
          onSortChange={onSortChange}
          initialSort={initialSort}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    zIndex: 1000,
  },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  searchFilterContainer: {
    flex: 1,
    marginRight: spacing.sm,
  },
  sortContainer: {
    position: 'relative',
    zIndex: 1000,
    marginRight: spacing.sm,
  },
  sortButton: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: spacing.borderRadius.md,
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: colors.mediumGray,
  },
  sortDropdownContainer: {
    position: 'absolute',
    top: 45,
    right: 0,
    zIndex: 1001,
    ...shadows.medium,
  },
  sortDropdownContent: {
    backgroundColor: colors.white,
    borderRadius: spacing.borderRadius.md,
    width: 120,
    borderWidth: 1,
    borderColor: colors.mediumGray,
  },
  sortOption: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
  },
  sortOptionActive: {
    backgroundColor: '#e8f5e9',
  },
  sortOptionText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  sortOptionTextActive: {
    color: '#5B8A72',
    fontWeight: '600',
  },
});

export default CompositeFilterComponent;