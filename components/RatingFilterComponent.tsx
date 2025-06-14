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



  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.filterButton,
          selectedRatings.length > 0 && styles.filterButtonActive
        ]}
        onPress={() => setShowModal(true)}
      >
        <EmojiDisplay rating={3} size={20} />
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
                <Text style={styles.closeX}>×</Text>
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
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={clearAll}
              >
                <Text style={styles.actionButtonText}>Clear</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.actionButtonText}>Select</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  filterButtonActive: {
    backgroundColor: '#ffc008',
    borderColor: '#ffc008',
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
    width: width * 0.55,
    maxHeight: '80%',
    maxWidth: 220,
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
  closeX: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a2b49',
    lineHeight: 24,
  },
  ratingsContainer: {
    maxHeight: 350,
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
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1a2b49',
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#1a2b49',
    fontWeight: '600',
    fontSize: 14,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
});

export default RatingFilterComponent;