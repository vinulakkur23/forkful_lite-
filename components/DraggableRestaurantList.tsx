/**
 * DraggableRestaurantList
 * View mode: static restaurant list with sections. Long-press opens full-screen reorder modal.
 * Edit mode: full-screen Modal with DraggableFlatList — no parent scroll conflicts.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Modal,
  SafeAreaView,
  Keyboard,
} from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { colors, spacing } from '../themes';
import { RestaurantSection } from '../services/restaurantSectionsService';

interface Restaurant {
  name: string;
  mealCount: number;
  emojiUrls?: string[];
}

type ListItem =
  | { type: 'section-header'; sectionId: string; sectionName: string; key: string }
  | { type: 'restaurant'; name: string; mealCount: number; emojiUrls?: string[]; sectionId: string | null; key: string };

interface Props {
  restaurants: Restaurant[];
  sections: RestaurantSection[];
  unsectionedOrder: string[];
  isOwnProfile: boolean;
  onReorder: (sections: RestaurantSection[], unsectionedOrder: string[]) => void;
  onRestaurantPress: (restaurant: Restaurant) => void;
  onAddSection: () => void;
  onDeleteSection: (sectionId: string) => void;
}

const DraggableRestaurantList: React.FC<Props> = ({
  restaurants,
  sections,
  unsectionedOrder,
  isOwnProfile,
  onReorder,
  onRestaurantPress,
  onAddSection,
  onDeleteSection,
}) => {
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [showAddSectionInput, setShowAddSectionInput] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');

  // Build a lookup map for restaurant data (synchronous — needed during render)
  const restaurantMap = useRef<Map<string, Restaurant>>(new Map());
  const map = new Map<string, Restaurant>();
  restaurants.forEach(r => map.set(r.name, r));
  restaurantMap.current = map;

  // Build flat list items: unsectioned first, then sections
  const buildListItems = useCallback((): ListItem[] => {
    const items: ListItem[] = [];

    for (const rName of unsectionedOrder) {
      const r = restaurantMap.current.get(rName);
      if (r) {
        items.push({
          type: 'restaurant',
          name: r.name,
          mealCount: r.mealCount,
          emojiUrls: r.emojiUrls,
          sectionId: null,
          key: `rest_unsectioned_${r.name}`,
        });
      }
    }

    for (const section of sections) {
      items.push({
        type: 'section-header',
        sectionId: section.id,
        sectionName: section.name,
        key: `header_${section.id}`,
      });
      for (const rName of section.restaurants) {
        const r = restaurantMap.current.get(rName);
        if (r) {
          items.push({
            type: 'restaurant',
            name: r.name,
            mealCount: r.mealCount,
            emojiUrls: r.emojiUrls,
            sectionId: section.id,
            key: `rest_${section.id}_${r.name}`,
          });
        }
      }
    }

    return items;
  }, [sections, unsectionedOrder, restaurants]);

  // Modal state for drag list
  const [modalListItems, setModalListItems] = useState<ListItem[]>([]);

  // Parse flat list back into sections + unsectioned order
  const parseListItems = (items: ListItem[]): { sections: RestaurantSection[]; unsectionedOrder: string[] } => {
    const newSections: RestaurantSection[] = [];
    const newUnsectioned: string[] = [];
    let currentSection: RestaurantSection | null = null;

    for (const item of items) {
      if (item.type === 'section-header') {
        currentSection = { id: item.sectionId, name: item.sectionName, restaurants: [] };
        newSections.push(currentSection);
      } else if (item.type === 'restaurant') {
        if (currentSection) {
          currentSection.restaurants.push(item.name);
        } else {
          newUnsectioned.push(item.name);
        }
      }
    }

    return { sections: newSections, unsectionedOrder: newUnsectioned };
  };

  // Open reorder modal
  const openReorderModal = () => {
    ReactNativeHapticFeedback.trigger('impactMedium', {
      enableVibrateFallback: false,
      ignoreAndroidSystemSettings: false,
    });
    setModalListItems(buildListItems());
    setShowReorderModal(true);
  };

  // Add section inline (within the modal — no external modal needed)
  const handleAddSection = () => {
    const trimmed = newSectionName.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setNewSectionName('');
    setShowAddSectionInput(false);
    const newSection: ListItem = {
      type: 'section-header',
      sectionId: `section_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      sectionName: trimmed,
      key: `header_new_${Date.now()}`,
    };
    setModalListItems(prev => [...prev, newSection]);
  };

  // Save and close modal
  const handleDone = () => {
    const { sections: newSections, unsectionedOrder: newUnsectioned } = parseListItems(modalListItems);
    onReorder(newSections, newUnsectioned);
    setShowReorderModal(false);
  };

  // Render item in the DraggableFlatList (modal)
  const renderDragItem = useCallback(({ item, drag, isActive }: RenderItemParams<ListItem>) => {
    if (item.type === 'section-header') {
      return (
        <ScaleDecorator>
          <TouchableOpacity
            onLongPress={drag}
            delayLongPress={200}
            disabled={isActive}
            style={[styles.modalSectionHeader, isActive && styles.modalActiveItem]}
          >
            <View style={styles.sectionHeaderRow}>
              <View style={styles.dragHandle}>
                <Text style={styles.dragHandleText}>≡</Text>
              </View>
              <Text style={styles.modalSectionHeaderText}>{item.sectionName}</Text>
              <TouchableOpacity
                onPress={() => {
                  Alert.alert(
                    'Delete Section',
                    `Remove "${item.sectionName}"? Restaurants will move to the general list.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => onDeleteSection(item.sectionId) },
                    ]
                  );
                }}
                style={styles.deleteButton}
              >
                <Text style={styles.deleteButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </ScaleDecorator>
      );
    }

    return (
      <ScaleDecorator>
        <TouchableOpacity
          onLongPress={drag}
          delayLongPress={200}
          disabled={isActive}
          style={[styles.modalRestaurantItem, isActive && styles.modalActiveItem]}
        >
          <View style={styles.dragHandle}>
            <Text style={styles.dragHandleText}>≡</Text>
          </View>
          <Text style={styles.modalRestaurantName} numberOfLines={1}>
            {item.name}
          </Text>
          {item.emojiUrls && item.emojiUrls.length > 0 && (
            <View style={styles.emojiContainer}>
              {item.emojiUrls.slice(0, 3).map((url, index) => (
                <Image
                  key={index}
                  source={{ uri: url }}
                  style={styles.emoji}
                  resizeMode="contain"
                />
              ))}
            </View>
          )}
        </TouchableOpacity>
      </ScaleDecorator>
    );
  }, [onDeleteSection]);

  // Build view items from current props
  const viewItems = buildListItems();

  return (
    <View>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Restaurants</Text>
        {isOwnProfile && (
          <TouchableOpacity onPress={openReorderModal} style={styles.editButton}>
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* View mode: static list */}
      <View style={styles.listContainer}>
        {viewItems.map((item) => {
          if (item.type === 'section-header') {
            return (
              <View key={item.key} style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>{item.sectionName}</Text>
              </View>
            );
          }
          const restaurant = restaurantMap.current.get(item.name);
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => restaurant && onRestaurantPress(restaurant)}
              onLongPress={() => isOwnProfile && openReorderModal()}
              delayLongPress={600}
              style={styles.restaurantItem}
            >
              <View style={styles.restaurantItemInner}>
                <Text style={styles.restaurantName} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.emojiUrls && item.emojiUrls.length > 0 && (
                  <View style={styles.emojiContainer}>
                    {item.emojiUrls.slice(0, 5).map((url, index) => (
                      <Image
                        key={index}
                        source={{ uri: url }}
                        style={styles.emoji}
                        resizeMode="contain"
                      />
                    ))}
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Full-screen reorder modal */}
      <Modal
        visible={showReorderModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowReorderModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          {/* Modal header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowReorderModal(false)} style={styles.modalCancelButton}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Reorder Restaurants</Text>
            <TouchableOpacity onPress={handleDone} style={styles.modalDoneButton}>
              <Text style={styles.modalDoneText}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Add section */}
          {showAddSectionInput ? (
            <View style={styles.addSectionInputRow}>
              <TextInput
                style={styles.addSectionInput}
                placeholder="Section name (e.g., Favorites)"
                placeholderTextColor="#999"
                value={newSectionName}
                onChangeText={setNewSectionName}
                autoFocus
                onSubmitEditing={handleAddSection}
                maxLength={40}
              />
              <TouchableOpacity onPress={handleAddSection} style={styles.addSectionConfirm}>
                <Text style={styles.addSectionConfirmText}>Add</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowAddSectionInput(false); setNewSectionName(''); }} style={styles.addSectionCancelBtn}>
                <Text style={styles.addSectionCancelText}>×</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setShowAddSectionInput(true)} style={styles.addSectionRow}>
              <View style={styles.addSectionIcon}>
                <Text style={styles.addSectionIconText}>+</Text>
              </View>
              <Text style={styles.addSectionText}>Add Section</Text>
            </TouchableOpacity>
          )}

          {/* Draggable list — owns the full screen, no scroll conflict */}
          <DraggableFlatList
            data={modalListItems}
            renderItem={renderDragItem}
            keyExtractor={(item) => item.key}
            onDragEnd={({ data }) => setModalListItems(data)}
            containerStyle={styles.modalListContainer}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  // === View mode styles ===
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: spacing.md || 12,
    marginTop: spacing.md || 12,
    marginBottom: spacing.sm || 8,
  },
  headerTitle: {
    fontFamily: 'Unna',
    fontSize: 20,
    fontWeight: '700',
    color: colors.charcoal,
  },
  editButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  editButtonText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '500',
    color: '#5B8A72',
  },
  listContainer: {
    paddingHorizontal: spacing.md || 12,
    paddingBottom: spacing.md || 12,
  },
  sectionHeader: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginTop: 12,
  },
  sectionHeaderText: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  restaurantItem: {
    backgroundColor: colors.white,
    borderRadius: 10,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  restaurantItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  restaurantName: {
    fontFamily: 'Unna',
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
    flex: 1,
  },
  emojiContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emoji: {
    width: 20,
    height: 20,
    marginLeft: 2,
  },

  // === Modal styles ===
  modalContainer: {
    flex: 1,
    backgroundColor: colors.lightTan || '#F8F6F2',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.mediumGray || '#EBEBEB',
  },
  modalTitle: {
    fontFamily: 'Inter',
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  modalCancelButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  modalCancelText: {
    fontFamily: 'Inter',
    fontSize: 15,
    color: colors.textTertiary || '#858585',
  },
  modalDoneButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  modalDoneText: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '600',
    color: '#5B8A72',
  },
  addSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.mediumGray || '#EBEBEB',
  },
  addSectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#5B8A72',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  addSectionIconText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '600',
    marginTop: -1,
  },
  addSectionText: {
    fontFamily: 'Inter',
    fontSize: 15,
    color: '#5B8A72',
    fontWeight: '500',
  },
  addSectionInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.mediumGray || '#EBEBEB',
    gap: 8,
  },
  addSectionInput: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.mediumGray || '#EBEBEB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addSectionConfirm: {
    backgroundColor: '#5B8A72',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  addSectionConfirmText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  addSectionCancelBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  addSectionCancelText: {
    fontSize: 22,
    color: colors.textTertiary || '#858585',
    fontWeight: '600',
  },
  modalListContainer: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 40,
  },
  modalSectionHeader: {
    backgroundColor: colors.lightGray || '#F7F7F7',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalSectionHeaderText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  deleteButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.error || '#C84B4B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: -1,
  },
  modalRestaurantItem: {
    backgroundColor: colors.white,
    borderRadius: 10,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  modalRestaurantName: {
    fontFamily: 'Unna',
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
    flex: 1,
  },
  modalActiveItem: {
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
    backgroundColor: '#fff',
  },
  dragHandle: {
    width: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  dragHandleText: {
    fontSize: 20,
    color: colors.textTertiary || '#858585',
    fontWeight: '700',
  },
});

export default DraggableRestaurantList;
