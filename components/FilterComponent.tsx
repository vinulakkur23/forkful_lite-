import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  SafeAreaView,
  ActivityIndicator
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { firestore } from '../firebaseConfig';

interface FilterComponentProps {
  onFilterChange: (filters: { cuisineTypes: string[], foodTypes: string[] }) => void;
  initialFilters?: { cuisineTypes: string[], foodTypes: string[] };
}

const FilterComponent: React.FC<FilterComponentProps> = ({ 
  onFilterChange,
  initialFilters = { cuisineTypes: [], foodTypes: [] }
}) => {
  // Filter modal visibility
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'cuisine' | 'food'>('cuisine');
  
  // Filter states
  const [selectedCuisineTypes, setSelectedCuisineTypes] = useState<string[]>(initialFilters.cuisineTypes || []);
  const [selectedFoodTypes, setSelectedFoodTypes] = useState<string[]>(initialFilters.foodTypes || []);
  
  // Available options
  const [availableCuisineTypes, setAvailableCuisineTypes] = useState<string[]>([]);
  const [availableFoodTypes, setAvailableFoodTypes] = useState<string[]>([]);
  
  // Search states
  const [cuisineSearch, setCuisineSearch] = useState('');
  const [foodSearch, setFoodSearch] = useState('');
  
  // Loading states
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Calculate total filter count
  const filterCount = selectedCuisineTypes.length + selectedFoodTypes.length;
  
  // Fetch available filter options from Firestore
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        setLoadingOptions(true);
        
        // Query for distinct cuisine types
        const cuisineTypesSet = new Set<string>();
        
        // Query for meals with valid aiMetadata
        const mealsSnapshot = await firestore()
          .collection('mealEntries')
          .where('aiMetadata', '!=', null)
          .limit(100) // Limit to prevent excessive data usage
          .get();

        // Extract unique cuisineType and foodType values
        mealsSnapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.aiMetadata) {
            // Add cuisineType if available and not 'Unknown'
            if (data.aiMetadata.cuisineType && 
                data.aiMetadata.cuisineType !== 'Unknown') {
              cuisineTypesSet.add(data.aiMetadata.cuisineType);
            }
            
            // Add foodType if available and not 'Unknown'
            if (data.aiMetadata.foodType && 
                data.aiMetadata.foodType !== 'Unknown') {
              // Track foodType separately
              availableFoodTypes.push(data.aiMetadata.foodType);
            }
          }
        });
        
        // Convert sets to sorted arrays
        setAvailableCuisineTypes(Array.from(cuisineTypesSet).sort());
        setAvailableFoodTypes(Array.from(new Set(availableFoodTypes)).sort());
      } catch (error) {
        console.error('Error fetching filter options:', error);
      } finally {
        setLoadingOptions(false);
      }
    };

    fetchFilterOptions();
  }, []);

  // Handle filter button press
  const openFilterModal = () => {
    setFilterModalVisible(true);
  };

  // Handle filter selection for cuisine types
  const toggleCuisineType = (cuisineType: string) => {
    setSelectedCuisineTypes(prev => {
      if (prev.includes(cuisineType)) {
        return prev.filter(c => c !== cuisineType);
      } else {
        return [...prev, cuisineType];
      }
    });
  };

  // Handle filter selection for food types
  const toggleFoodType = (foodType: string) => {
    setSelectedFoodTypes(prev => {
      if (prev.includes(foodType)) {
        return prev.filter(f => f !== foodType);
      } else {
        return [...prev, foodType];
      }
    });
  };

  // Apply filters and close modal
  const applyFilters = () => {
    onFilterChange({
      cuisineTypes: selectedCuisineTypes,
      foodTypes: selectedFoodTypes
    });
    setFilterModalVisible(false);
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedCuisineTypes([]);
    setSelectedFoodTypes([]);
    setCuisineSearch('');
    setFoodSearch('');
  };

  // Filter cuisine types based on search
  const filteredCuisineTypes = cuisineSearch
    ? availableCuisineTypes.filter(cuisine => 
        cuisine.toLowerCase().includes(cuisineSearch.toLowerCase())
      )
    : availableCuisineTypes;

  // Filter food types based on search
  const filteredFoodTypes = foodSearch
    ? availableFoodTypes.filter(food => 
        food.toLowerCase().includes(foodSearch.toLowerCase())
      )
    : availableFoodTypes;

  // Render cuisine type item
  const renderCuisineItem = ({ item }: { item: string }) => (
    <TouchableOpacity
      style={[
        styles.filterItem,
        selectedCuisineTypes.includes(item) && styles.filterItemSelected
      ]}
      onPress={() => toggleCuisineType(item)}
    >
      <Text 
        style={[
          styles.filterItemText,
          selectedCuisineTypes.includes(item) && styles.filterItemTextSelected
        ]}
      >
        {item}
      </Text>
      {selectedCuisineTypes.includes(item) && (
        <Icon name="check" size={16} color="#fff" style={styles.checkIcon} />
      )}
    </TouchableOpacity>
  );

  // Render food type item
  const renderFoodItem = ({ item }: { item: string }) => (
    <TouchableOpacity
      style={[
        styles.filterItem,
        selectedFoodTypes.includes(item) && styles.filterItemSelected
      ]}
      onPress={() => toggleFoodType(item)}
    >
      <Text 
        style={[
          styles.filterItemText,
          selectedFoodTypes.includes(item) && styles.filterItemTextSelected
        ]}
      >
        {item}
      </Text>
      {selectedFoodTypes.includes(item) && (
        <Icon name="check" size={16} color="#fff" style={styles.checkIcon} />
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Filter Button */}
      <TouchableOpacity 
        style={styles.filterButton}
        onPress={openFilterModal}
      >
        <Icon name="filter-list" size={20} color="#666" />
        <Text style={styles.filterButtonText}>Filter</Text>
        {filterCount > 0 && (
          <View style={styles.filterBadge}>
            <Text style={styles.filterBadgeText}>{filterCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Filter Modal */}
      <Modal
        visible={filterModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter Options</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setFilterModalVisible(false)}
              >
                <Icon name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[
                  styles.tab,
                  activeTab === 'cuisine' && styles.activeTab
                ]}
                onPress={() => setActiveTab('cuisine')}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === 'cuisine' && styles.activeTabText
                  ]}
                >
                  Cuisine Type
                </Text>
                {selectedCuisineTypes.length > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{selectedCuisineTypes.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tab,
                  activeTab === 'food' && styles.activeTab
                ]}
                onPress={() => setActiveTab('food')}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === 'food' && styles.activeTabText
                  ]}
                >
                  Food Type
                </Text>
                {selectedFoodTypes.length > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{selectedFoodTypes.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={styles.searchContainer}>
              <Icon name="search" size={20} color="#999" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder={activeTab === 'cuisine' ? "Search cuisine types..." : "Search food types..."}
                value={activeTab === 'cuisine' ? cuisineSearch : foodSearch}
                onChangeText={activeTab === 'cuisine' ? setCuisineSearch : setFoodSearch}
              />
              {(activeTab === 'cuisine' ? cuisineSearch : foodSearch) !== '' && (
                <TouchableOpacity
                  style={styles.clearSearchButton}
                  onPress={() => activeTab === 'cuisine' ? setCuisineSearch('') : setFoodSearch('')}
                >
                  <Icon name="cancel" size={18} color="#999" />
                </TouchableOpacity>
              )}
            </View>

            {/* Filter Lists */}
            {loadingOptions ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#ff6b6b" />
                <Text style={styles.loadingText}>Loading options...</Text>
              </View>
            ) : (
              <View style={styles.listContainer}>
                {activeTab === 'cuisine' ? (
                  filteredCuisineTypes.length > 0 ? (
                    <FlatList
                      data={filteredCuisineTypes}
                      renderItem={renderCuisineItem}
                      keyExtractor={(item) => `cuisine-${item}`}
                      contentContainerStyle={styles.filterList}
                    />
                  ) : (
                    <View style={styles.emptyListContainer}>
                      <Icon name="restaurant" size={48} color="#ddd" />
                      <Text style={styles.emptyListText}>
                        {cuisineSearch ? "No matching cuisine types found" : "No cuisine types available"}
                      </Text>
                    </View>
                  )
                ) : (
                  filteredFoodTypes.length > 0 ? (
                    <FlatList
                      data={filteredFoodTypes}
                      renderItem={renderFoodItem}
                      keyExtractor={(item) => `food-${item}`}
                      contentContainerStyle={styles.filterList}
                    />
                  ) : (
                    <View style={styles.emptyListContainer}>
                      <Icon name="fastfood" size={48} color="#ddd" />
                      <Text style={styles.emptyListText}>
                        {foodSearch ? "No matching food types found" : "No food types available"}
                      </Text>
                    </View>
                  )
                )}
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actionButtonsContainer}>
              <TouchableOpacity
                style={styles.clearButton}
                onPress={clearFilters}
              >
                <Text style={styles.clearButtonText}>Clear All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyButton}
                onPress={applyFilters}
              >
                <Text style={styles.applyButtonText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 10,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  filterButtonText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 4,
  },
  filterBadge: {
    backgroundColor: '#ff6b6b',
    borderRadius: 10,
    height: 20,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '80%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 5,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#ff6b6b',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  activeTabText: {
    fontWeight: 'bold',
    color: '#ff6b6b',
  },
  tabBadge: {
    backgroundColor: '#ff6b6b',
    borderRadius: 10,
    height: 20,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 10,
    marginBottom: 15,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
  },
  clearSearchButton: {
    padding: 5,
  },
  listContainer: {
    flex: 1,
  },
  filterList: {
    paddingBottom: 20,
  },
  filterItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  filterItemSelected: {
    backgroundColor: '#ff6b6b',
  },
  filterItemText: {
    fontSize: 16,
    color: '#333',
  },
  filterItemTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
  checkIcon: {
    marginLeft: 10,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    marginTop: 15,
  },
  clearButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 10,
    flex: 1,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: 'bold',
  },
  applyButton: {
    backgroundColor: '#ff6b6b',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },
  emptyListText: {
    marginTop: 10,
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
});

export default FilterComponent;