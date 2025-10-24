import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import SimpleFilterComponent, { FilterItem } from './SimpleFilterComponent';
import RatingFilterComponent from './RatingFilterComponent';

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

        {/* Sort button with dropdown */}
        <View style={styles.sortContainer}>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={handleSortDropdownToggle}
          >
            <Icon name="sort" size={20} color="#1a2b49" />
          </TouchableOpacity>

          {showSortDropdown && (
            <View style={styles.sortDropdownContainer}>
              <View style={styles.sortDropdownContent}>
                <TouchableOpacity
                  style={[
                    styles.sortOption,
                    currentSort === 'chronological' && styles.sortOptionActive
                  ]}
                  onPress={() => handleSortChange('chronological')}
                >
                  <Text style={[
                    styles.sortOptionText,
                    currentSort === 'chronological' && styles.sortOptionTextActive
                  ]}>
                    Recent
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.sortOption,
                    currentSort === 'rating' && styles.sortOptionActive
                  ]}
                  onPress={() => handleSortChange('rating')}
                >
                  <Text style={[
                    styles.sortOptionText,
                    currentSort === 'rating' && styles.sortOptionTextActive
                  ]}>
                    Rating
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <RatingFilterComponent
          onRatingFilterChange={onRatingFilterChange}
          initialRatings={initialRatings}
          showDropdown={showRatingDropdown}
          onDropdownToggle={handleRatingDropdownToggle}
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
    marginRight: 8,
  },
  sortContainer: {
    position: 'relative',
    zIndex: 1000,
    marginRight: 8,
  },
  sortButton: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  sortDropdownContainer: {
    position: 'absolute',
    top: 45,
    right: 0,
    zIndex: 1001,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  sortDropdownContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: 120,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  sortOption: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sortOptionActive: {
    backgroundColor: '#e8f5e9',
  },
  sortOptionText: {
    fontSize: 14,
    color: '#666',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  sortOptionTextActive: {
    color: '#5B8A72',
    fontWeight: '600',
  },
});

export default CompositeFilterComponent;