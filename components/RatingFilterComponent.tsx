import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
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
  const [showModal, setShowModal] = useState(false);

  // Available ratings 1-5
  const availableRatings = [1, 2, 3, 4, 5];

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
  }, [selectedRatings, onRatingFilterChange]);

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

  const selectAll = () => {
    setSelectedRatings([...availableRatings]);
  };

  const getButtonText = () => {
    if (selectedRatings.length === 0) {
      return 'Ratings';
    } else if (selectedRatings.length === availableRatings.length) {
      return 'All Ratings';
    } else {
      return `${selectedRatings.length} Ratings`;
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.filterButton,
          selectedRatings.length > 0 && styles.filterButtonActive
        ]}
        onPress={() => setShowModal(true)}
      >
        <Icon 
          name="star" 
          size={16} 
          color={selectedRatings.length > 0 ? '#fff' : '#666'} 
          style={styles.buttonIcon}
        />
        <Text style={[
          styles.filterButtonText,
          selectedRatings.length > 0 && styles.filterButtonTextActive
        ]}>
          {getButtonText()}
        </Text>
        <Icon 
          name="keyboard-arrow-down" 
          size={16} 
          color={selectedRatings.length > 0 ? '#fff' : '#666'} 
        />
      </TouchableOpacity>

      <Modal
        visible={showModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowModal(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter by Rating</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Icon name="close" size={24} color="#1a2b49" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.ratingsContainer}>
              {availableRatings.map(rating => (
                <TouchableOpacity
                  key={rating}
                  style={[
                    styles.ratingItem,
                    selectedRatings.includes(rating) && styles.ratingItemSelected
                  ]}
                  onPress={() => toggleRating(rating)}
                >
                  <View style={styles.ratingRow}>
                    <EmojiDisplay rating={rating} size={24} />
                    <Text style={styles.ratingText}>{rating} Star{rating !== 1 ? 's' : ''}</Text>
                  </View>
                  {selectedRatings.includes(rating) && (
                    <Icon name="check" size={20} color="#ffc008" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={clearAll}
              >
                <Text style={styles.actionButtonText}>Clear All</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.actionButton}
                onPress={selectAll}
              >
                <Text style={styles.actionButtonText}>Select All</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // No margin here since it will be controlled by parent
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    minWidth: 80,
  },
  filterButtonActive: {
    backgroundColor: '#ffc008',
    borderColor: '#ffc008',
  },
  buttonIcon: {
    marginRight: 4,
  },
  filterButtonText: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
    marginRight: 4,
  },
  filterButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: width * 0.8,
    maxHeight: '60%',
    maxWidth: 300,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  ratingsContainer: {
    maxHeight: 250,
  },
  ratingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  ratingItemSelected: {
    backgroundColor: '#fff8e1',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  ratingText: {
    fontSize: 14,
    color: '#1a2b49',
    marginLeft: 8,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  actionButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffc008',
  },
  actionButtonText: {
    color: '#ffc008',
    fontWeight: '600',
    fontSize: 14,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
});

export default RatingFilterComponent;