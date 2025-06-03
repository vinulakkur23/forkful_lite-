import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  ScrollView
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { firestore } from '../firebaseConfig';

export interface FilterItem {
  type: string;
  value: string;
}

interface SimpleFilterComponentProps {
  onFilterChange: (filters: FilterItem[] | null) => void;
  initialFilters?: FilterItem[] | null;
}

const SimpleFilterComponent: React.FC<SimpleFilterComponentProps> = ({
  onFilterChange,
  initialFilters = null
}) => {
  // States
  const [searchText, setSearchText] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterItem[]>(initialFilters || []);

  // Fetch filter options on mount
  useEffect(() => {
    fetchFilterOptions();
  }, []);

  // Set initial filters if provided
  useEffect(() => {
    if (initialFilters && initialFilters.length > 0) {
      setActiveFilters(initialFilters);
    }
  }, [initialFilters]);

  // Fetch available cuisine, food types, and cities from Firestore
  const fetchFilterOptions = async () => {
    try {
      setLoading(true);
      
      const cuisineTypesSet = new Set<string>();
      const foodTypesSet = new Set<string>();
      const citiesSet = new Set<string>();
      
      // Query for meals
      const mealsSnapshot = await firestore()
        .collection('mealEntries')
        .limit(150) // Increased limit to get more variety
        .get();

      // Extract unique values
      mealsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        
        // Get city from location data if available
        if (data.location && data.location.city) {
          // If we have explicit city data in the location object
          const city = data.location.city.trim();
          if (city && city.length > 2) { // Basic validation
            citiesSet.add(city);
          }
        } 
        // Fallback to extracting from restaurant if location.city is not available
        else if (data.restaurant) {
          // Try to extract city from restaurant name or restaurant address if it exists
          const restaurantParts = data.restaurant.split(',');
          if (restaurantParts.length > 1) {
            // If there's a comma, assume the format might be "Restaurant Name, City"
            const possibleCity = restaurantParts[1].trim();
            if (possibleCity && possibleCity.length > 2) { // Basic validation
              citiesSet.add(possibleCity);
            }
          }
        }
        
        // Get cuisine and food types from metadata
        if (data.aiMetadata) {
          if (data.aiMetadata.cuisineType && 
              data.aiMetadata.cuisineType !== 'Unknown') {
            cuisineTypesSet.add(data.aiMetadata.cuisineType);
          }
          
          if (data.aiMetadata.foodType) {
            // foodType is now an array
            if (Array.isArray(data.aiMetadata.foodType)) {
              data.aiMetadata.foodType.forEach(food => {
                if (food !== 'Unknown') {
                  foodTypesSet.add(food);
                }
              });
            } else {
              // Handle old data that might still be a string
              if (data.aiMetadata.foodType !== 'Unknown') {
                foodTypesSet.add(data.aiMetadata.foodType as string);
              }
            }
          }
        }
      });
      
      // Create combined options array
      const options: FilterItem[] = [];
      
      // Add cuisine types
      Array.from(cuisineTypesSet).sort().forEach(cuisine => {
        options.push({ type: 'cuisineType', value: cuisine });
      });
      
      // Add food types
      Array.from(foodTypesSet).sort().forEach(food => {
        options.push({ type: 'foodType', value: food });
      });
      
      // Add cities
      Array.from(citiesSet).sort().forEach(city => {
        options.push({ type: 'city', value: city });
      });
      
      setFilterOptions(options);
    } catch (error) {
      console.error('Error fetching filter options:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter options based on search text
  const getFilteredOptions = () => {
    if (!searchText) return [];
    
    // Filter options that match the search text and are not already selected
    const filteredOptions = filterOptions.filter(option => 
      option.value.toLowerCase().includes(searchText.toLowerCase()) &&
      !activeFilters.some(filter => 
        filter.type === option.type && filter.value === option.value
      )
    ).slice(0, 10); // Limit to 10 results
    
    return filteredOptions;
  };

  // Handle option selection - now adds to the list of active filters
  const handleSelectOption = (option: FilterItem) => {
    // Check if this filter is already active
    const filterExists = activeFilters.some(
      filter => filter.type === option.type && filter.value === option.value
    );
    
    if (!filterExists) {
      console.log('Adding new filter:', option);
      const newFilters = [...activeFilters, option];
      setActiveFilters(newFilters);
      console.log('New filters array:', newFilters);
      onFilterChange(newFilters);
    }
    
    setSearchText('');
    setShowDropdown(false);
  };

  // Remove a specific filter
  const handleRemoveFilter = (filterToRemove: FilterItem) => {
    console.log('Removing filter:', filterToRemove);
    const newFilters = activeFilters.filter(
      filter => !(filter.type === filterToRemove.type && filter.value === filterToRemove.value)
    );
    
    console.log('Remaining filters after removal:', newFilters);
    setActiveFilters(newFilters);
    onFilterChange(newFilters.length > 0 ? newFilters : null);
  };

  // Clear all filters
  const handleClearAllFilters = () => {
    console.log('Clearing all filters');
    setActiveFilters([]);
    setSearchText('');
    onFilterChange(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search cuisine, food, or city..."
          value={searchText}
          onChangeText={(text) => {
            setSearchText(text);
            setShowDropdown(text.length > 0);
          }}
          onFocus={() => {
            if (searchText.length > 0) {
              setShowDropdown(true);
            }
          }}
        />
        {searchText ? (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => setSearchText('')}
          >
            <Text style={[styles.closeButtonX, { color: '#999', fontSize: 20 }]}>×</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {showDropdown && (
        <View style={styles.dropdownContainer}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#ff6b6b" />
              <Text style={styles.loadingText}>Loading options...</Text>
            </View>
          ) : getFilteredOptions().length > 0 ? (
            <FlatList
              data={getFilteredOptions()}
              keyExtractor={(item, index) => `${item.type}-${item.value}-${index}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.optionItem}
                  onPress={() => handleSelectOption(item)}
                >
                  <Text style={styles.optionText}>{item.value}</Text>
                  <Text style={styles.optionType}>
                    {item.type === 'cuisineType' ? 'Cuisine' : 
                     item.type === 'foodType' ? 'Food' : 'City'}
                  </Text>
                </TouchableOpacity>
              )}
              style={styles.dropdownList}
            />
          ) : searchText.length > 0 ? (
            <View style={styles.noResultsContainer}>
              <Text style={styles.noResultsText}>No matches found</Text>
            </View>
          ) : null}
        </View>
      )}
      
      {activeFilters.length > 0 && !showDropdown && (
        <View style={styles.selectedFiltersContainer}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersScrollContent}
          >
            {activeFilters.map((filter, index) => (
              <View key={`${filter.type}-${filter.value}-${index}`} style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{filter.value}</Text>
                <TouchableOpacity
                  style={styles.filterBadgeCloseButton}
                  onPress={() => handleRemoveFilter(filter)}
                >
                  <Text style={styles.closeButtonX}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
            
            {activeFilters.length > 1 && (
              <TouchableOpacity 
                style={styles.clearAllButton}
                onPress={handleClearAllFilters}
              >
                <Text style={styles.clearAllText}>Clear All</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    zIndex: 1000,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 15,
    height: 40,
    borderWidth: 1,
    borderColor: '#eee',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
    paddingLeft: 5,
    fontFamily: 'Inter-Regular',
  },
  clearButton: {
    padding: 4,
  },
  dropdownContainer: {
    position: 'absolute',
    top: 45,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    maxHeight: 200,
    zIndex: 2000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 10,
  },
  dropdownList: {
    maxHeight: 200,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    fontFamily: 'Inter-Regular',
  },
  optionType: {
    fontSize: 12,
    color: '#999',
    marginLeft: 4,
    fontFamily: 'Inter-Regular',
  },
  loadingContainer: {
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
    fontFamily: 'Inter-Regular',
  },
  noResultsContainer: {
    padding: 12,
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: 14,
    color: '#999',
    fontFamily: 'Inter-Regular',
  },
  selectedFiltersContainer: {
    marginTop: 5, // Reduced from 8 to 5
    width: '100%',
  },
  filtersScrollContent: {
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffc008',
    borderRadius: 16,
    paddingVertical: 3, // Reduced from 4 to 3
    paddingHorizontal: 8,
    marginRight: 8,
    marginBottom: 6, // Reduced from 8 to 6
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 12,
    marginRight: 4,
    fontFamily: 'Inter-Regular',
  },
  filterBadgeCloseButton: {
    padding: 2,
  },
  clearAllButton: {
    backgroundColor: '#666',
    borderRadius: 16,
    paddingVertical: 3, // Reduced from 4 to 3
    paddingHorizontal: 10,
    marginRight: 8,
    marginBottom: 6, // Reduced from 8 to 6
  },
  clearAllText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Inter-Regular',
  },
  closeButtonX: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 16,
    fontFamily: 'Inter-Regular',
  },
});

export default SimpleFilterComponent;