import React from 'react';
import { View, StyleSheet } from 'react-native';
import SimpleFilterComponent, { FilterItem } from './SimpleFilterComponent';
import RatingFilterComponent from './RatingFilterComponent';

interface CompositeFilterComponentProps {
  onFilterChange: (filters: FilterItem[] | null) => void;
  onRatingFilterChange: (ratings: number[] | null) => void;
  initialFilters?: FilterItem[] | null;
  initialRatings?: number[] | null;
  onUserSelect?: (userId: string, userName: string, userPhoto?: string) => void;
}

const CompositeFilterComponent: React.FC<CompositeFilterComponentProps> = ({
  onFilterChange,
  onRatingFilterChange,
  initialFilters = null,
  initialRatings = null,
  onUserSelect
}) => {
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
});

export default CompositeFilterComponent;