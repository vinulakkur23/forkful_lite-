import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { firestore } from '../firebaseConfig';

interface SimpleFilterComponentProps {
  onFilterChange: (filter: { type: string, value: string } | null) => void;
  initialFilter?: { type: string, value: string } | null;
}

const SimpleFilterComponent: React.FC<SimpleFilterComponentProps> = ({
  onFilterChange,
  initialFilter = null
}) => {
  // States
  const [searchText, setSearchText] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [filterOptions, setFilterOptions] = useState<Array<{type: string, value: string}>>([]);
  const [loading, setLoading] = useState(false);
  const [currentFilter, setCurrentFilter] = useState<{type: string, value: string} | null>(initialFilter);

  // Fetch filter options on mount
  useEffect(() => {
    fetchFilterOptions();
  }, []);

  // Set initial search text if a filter is provided
  useEffect(() => {
    if (initialFilter) {
      setCurrentFilter(initialFilter);
      setSearchText(initialFilter.value);
    }
  }, [initialFilter]);

  // Fetch available cuisine and food types from Firestore
  const fetchFilterOptions = async () => {
    try {
      setLoading(true);
      
      const cuisineTypesSet = new Set<string>();
      const foodTypesSet = new Set<string>();
      
      // Query for meals with valid aiMetadata
      const mealsSnapshot = await firestore()
        .collection('mealEntries')
        .where('aiMetadata', '!=', null)
        .limit(100)
        .get();

      // Extract unique values
      mealsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.aiMetadata) {
          if (data.aiMetadata.cuisineType && 
              data.aiMetadata.cuisineType !== 'Unknown') {
            cuisineTypesSet.add(data.aiMetadata.cuisineType);
          }
          
          if (data.aiMetadata.foodType && 
              data.aiMetadata.foodType !== 'Unknown') {
            foodTypesSet.add(data.aiMetadata.foodType);
          }
        }
      });
      
      // Create combined options array
      const options: Array<{type: string, value: string}> = [];
      
      // Add cuisine types
      Array.from(cuisineTypesSet).sort().forEach(cuisine => {
        options.push({ type: 'cuisineType', value: cuisine });
      });
      
      // Add food types
      Array.from(foodTypesSet).sort().forEach(food => {
        options.push({ type: 'foodType', value: food });
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
    
    return filterOptions.filter(option => 
      option.value.toLowerCase().includes(searchText.toLowerCase())
    ).slice(0, 10); // Limit to 10 results
  };

  // Handle option selection
  const handleSelectOption = (option: {type: string, value: string}) => {
    setCurrentFilter(option);
    setSearchText(option.value);
    setShowDropdown(false);
    onFilterChange(option);
  };

  // Clear filter
  const handleClearFilter = () => {
    setCurrentFilter(null);
    setSearchText('');
    onFilterChange(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Icon name="search" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search cuisine or food type..."
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
            onPress={handleClearFilter}
          >
            <Icon name="close" size={20} color="#999" />
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
                  <Icon 
                    name={item.type === 'cuisineType' ? 'restaurant' : 'fastfood'} 
                    size={16} 
                    color="#666" 
                    style={styles.optionIcon} 
                  />
                  <Text style={styles.optionText}>{item.value}</Text>
                  <Text style={styles.optionType}>
                    {item.type === 'cuisineType' ? 'Cuisine' : 'Food'}
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
      
      {currentFilter && !showDropdown && (
        <View style={styles.selectedFilterContainer}>
          <View style={styles.filterBadge}>
            <Icon 
              name={currentFilter.type === 'cuisineType' ? 'restaurant' : 'fastfood'} 
              size={12} 
              color="#fff" 
            />
            <Text style={styles.filterBadgeText}>{currentFilter.value}</Text>
            <TouchableOpacity
              style={styles.filterBadgeCloseButton}
              onPress={handleClearFilter}
            >
              <Icon name="close" size={12} color="#fff" />
            </TouchableOpacity>
          </View>
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
    paddingHorizontal: 10,
    height: 40,
    borderWidth: 1,
    borderColor: '#eee',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
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
  optionIcon: {
    marginRight: 8,
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  optionType: {
    fontSize: 12,
    color: '#999',
    marginLeft: 4,
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
  },
  noResultsContainer: {
    padding: 12,
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: 14,
    color: '#999',
  },
  selectedFilterContainer: {
    flexDirection: 'row',
    marginTop: 8,
    flexWrap: 'wrap',
  },
  filterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff6b6b',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 12,
    marginHorizontal: 4,
  },
  filterBadgeCloseButton: {
    padding: 2,
  },
});

export default SimpleFilterComponent;