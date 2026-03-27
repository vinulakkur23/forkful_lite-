import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Animated,
  FlatList,
  TouchableOpacity,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { colors, typography, spacing } from '../themes';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Layout constants ────────────────────────────────────────────────
const ITEM_WIDTH = 130;
const ITEM_SPACING = 12;
const TOTAL_ITEM_WIDTH = ITEM_WIDTH + ITEM_SPACING;
const SIDE_PADDING = (SCREEN_WIDTH - ITEM_WIDTH) / 2;

// ─── Types ───────────────────────────────────────────────────────────
export interface CarouselItem {
  id: string;
  label: string;
  sublabel?: string;
}

interface Carousel3DProps {
  items: CarouselItem[];
  initialSelectedId?: string;
  onSelect: (item: CarouselItem) => void;
  onWriteInSubmit: (text: string) => void;
  isLoading?: boolean;
  loadingText?: string;
  writeInPlaceholder?: string;
  writeInTitle?: string;
  autocompleteResults?: CarouselItem[];
  onWriteInTextChange?: (text: string) => void;
  isSearchingAutocomplete?: boolean;
  onAutocompleteSelect?: (item: CarouselItem) => void;
  emptyStateText?: string;
}

// ─── Skeleton loader ─────────────────────────────────────────────────
const SkeletonCard: React.FC<{ delay: number }> = ({ delay }) => {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, delay, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, delay]);

  return (
    <Animated.View style={[styles.skeletonCard, { opacity: pulse }]}>
      <View style={styles.skeletonLine} />
      <View style={styles.skeletonLineShort} />
    </Animated.View>
  );
};

// ─── Write-In Modal ──────────────────────────────────────────────────
interface WriteInModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
  placeholder: string;
  title: string;
  autocompleteResults?: CarouselItem[];
  onTextChange?: (text: string) => void;
  isSearching?: boolean;
  onAutocompleteSelect?: (item: CarouselItem) => void;
}

const WriteInModal: React.FC<WriteInModalProps> = ({
  visible,
  onClose,
  onSubmit,
  placeholder,
  title,
  autocompleteResults,
  onTextChange,
  isSearching = false,
  onAutocompleteSelect,
}) => {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setText('');
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [visible]);

  const handleChange = (value: string) => {
    setText(value);
    onTextChange?.(value);
  };

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text.trim());
      onClose();
    }
  };

  const handleAutocompletePress = (item: CarouselItem) => {
    onAutocompleteSelect?.(item);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{title}</Text>

          <View style={styles.modalInputRow}>
            <TextInput
              ref={inputRef}
              style={styles.modalInput}
              value={text}
              onChangeText={handleChange}
              placeholder={placeholder}
              placeholderTextColor="#999"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              autoCorrect={false}
              autoCapitalize="words"
            />
            <TouchableOpacity
              onPress={handleSubmit}
              style={[styles.modalSubmitButton, { opacity: text.trim().length > 0 ? 1 : 0 }]}
              disabled={text.trim().length === 0}
            >
              <Icon name="check-circle" size={28} color="#5B8A72" />
            </TouchableOpacity>
          </View>

          {text.length >= 2 && autocompleteResults && autocompleteResults.length > 0 && (
            <View style={styles.modalAutocompleteList}>
              {isSearching && (
                <ActivityIndicator size="small" color="#5B8A72" style={{ paddingVertical: 6 }} />
              )}
              <FlatList
                data={autocompleteResults}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 200 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalAutocompleteItem}
                    onPress={() => handleAutocompletePress(item)}
                  >
                    <Text style={styles.modalAutocompleteName} numberOfLines={1}>
                      {item.label}
                    </Text>
                    {item.sublabel && (
                      <Text style={styles.modalAutocompleteAddress} numberOfLines={1}>
                        {item.sublabel}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── Main component ──────────────────────────────────────────────────
const Carousel3D: React.FC<Carousel3DProps> = ({
  items,
  initialSelectedId,
  onSelect,
  onWriteInSubmit,
  isLoading = false,
  loadingText,
  writeInPlaceholder = 'Type a name...',
  writeInTitle = 'Enter a name',
  autocompleteResults,
  onWriteInTextChange,
  isSearchingAutocomplete = false,
  onAutocompleteSelect,
  emptyStateText,
}) => {
  const scrollX = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList>(null);
  const [showWriteInModal, setShowWriteInModal] = useState(false);
  const [centeredId, setCenteredId] = useState<string>(initialSelectedId || '');
  const hasScrolledToInitial = useRef(false);
  // Track what the user wrote in, so we can display it on the card
  const [writeInValue, setWriteInValue] = useState('');

  // Append "Write In" sentinel to items
  const allItems = useMemo<CarouselItem[]>(
    () => [...items, { id: '__write_in__', label: writeInValue || 'Write In' }],
    [items, writeInValue]
  );

  // Scroll to initial selection ONCE when items first load
  useEffect(() => {
    if (!isLoading && items.length > 0 && !hasScrolledToInitial.current) {
      const targetId = initialSelectedId || items[0]?.id;
      const idx = allItems.findIndex((i) => i.id === targetId);
      if (idx >= 0 && flatListRef.current) {
        hasScrolledToInitial.current = true;
        setCenteredId(targetId);
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({
            offset: idx * TOTAL_ITEM_WIDTH,
            animated: false,
          });
        }, 100);
      }
    }
  }, [isLoading, items.length]);

  // Handle write-in submit — store value and notify parent
  const handleWriteInSubmit = (text: string) => {
    setWriteInValue(text);
    setCenteredId('__write_in__');
    onWriteInSubmit(text);
    // Scroll to the write-in card to show it selected
    setTimeout(() => {
      const writeInIndex = allItems.length - 1;
      flatListRef.current?.scrollToOffset({
        offset: writeInIndex * TOTAL_ITEM_WIDTH,
        animated: true,
      });
    }, 100);
  };

  // Handle autocomplete selection from modal
  const handleAutocompleteFromModal = (item: CarouselItem) => {
    setWriteInValue(item.label);
    setCenteredId('__write_in__');
    onAutocompleteSelect?.(item);
    setTimeout(() => {
      const writeInIndex = allItems.length - 1;
      flatListRef.current?.scrollToOffset({
        offset: writeInIndex * TOTAL_ITEM_WIDTH,
        animated: true,
      });
    }, 100);
  };

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / TOTAL_ITEM_WIDTH);
      const clamped = Math.max(0, Math.min(index, allItems.length - 1));
      const centeredItem = allItems[clamped];

      setCenteredId(centeredItem.id);

      if (centeredItem.id !== '__write_in__') {
        onSelect(centeredItem);
      }
    },
    [allItems, onSelect]
  );

  // ── Loading state ──
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.skeletonRow}>
          <SkeletonCard delay={0} />
          <SkeletonCard delay={150} />
          <SkeletonCard delay={300} />
        </View>
        {loadingText && <Text style={styles.loadingText}>{loadingText}</Text>}
      </View>
    );
  }

  // ── Empty state — show just the write-in card ──
  if (items.length === 0) {
    const hasValue = writeInValue.length > 0;
    return (
      <View style={styles.emptyContainer}>
        <TouchableOpacity
          style={[styles.card, styles.emptyWriteInCard, hasValue && styles.cardSelected]}
          activeOpacity={1}
          onPress={() => setShowWriteInModal(true)}
        >
          <View style={styles.cardContent}>
            <Text
              style={[styles.cardLabel, hasValue && styles.cardLabelSelected]}
              numberOfLines={2}
            >
              {writeInValue || 'Write In'}
            </Text>
          </View>
        </TouchableOpacity>
        {emptyStateText && !hasValue && (
          <Text style={styles.emptyStateText}>{emptyStateText}</Text>
        )}
        <WriteInModal
          visible={showWriteInModal}
          onClose={() => setShowWriteInModal(false)}
          onSubmit={handleWriteInSubmit}
          placeholder={writeInPlaceholder}
          title={writeInTitle}
          autocompleteResults={autocompleteResults}
          onTextChange={onWriteInTextChange}
          isSearching={isSearchingAutocomplete}
          onAutocompleteSelect={handleAutocompleteFromModal}
        />
      </View>
    );
  }

  // ── Render a single carousel card ──
  const renderItem = ({ item, index }: { item: CarouselItem; index: number }) => {
    const inputRange = [
      (index - 2) * TOTAL_ITEM_WIDTH,
      (index - 1) * TOTAL_ITEM_WIDTH,
      index * TOTAL_ITEM_WIDTH,
      (index + 1) * TOTAL_ITEM_WIDTH,
      (index + 2) * TOTAL_ITEM_WIDTH,
    ];

    const scale = scrollX.interpolate({
      inputRange,
      outputRange: [0.55, 0.75, 1.0, 0.75, 0.55],
      extrapolate: 'clamp',
    });

    const opacity = scrollX.interpolate({
      inputRange,
      outputRange: [0.4, 0.7, 1.0, 0.7, 0.4],
      extrapolate: 'clamp',
    });

    const isSelected = item.id === centeredId;
    const isWriteIn = item.id === '__write_in__';

    // ── Write-In card — tapping opens the modal ──
    if (isWriteIn) {
      const hasValue = writeInValue.length > 0;
      return (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowWriteInModal(true)}
        >
          <Animated.View
            style={[
              styles.card,
              isSelected && styles.cardSelected,
              { transform: [{ scale }], opacity },
            ]}
          >
            <View style={styles.cardContent}>
              <Text
                style={[styles.cardLabel, isSelected && styles.cardLabelSelected]}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {hasValue ? writeInValue : 'Write In'}
              </Text>
            </View>
          </Animated.View>
        </TouchableOpacity>
      );
    }

    // ── Regular card ──
    return (
      <TouchableOpacity
        activeOpacity={1}
        onPress={() => {
          flatListRef.current?.scrollToOffset({
            offset: index * TOTAL_ITEM_WIDTH,
            animated: true,
          });
          setCenteredId(item.id);
          onSelect(item);
        }}
      >
        <Animated.View
          style={[
            styles.card,
            isSelected && styles.cardSelected,
            { transform: [{ scale }], opacity },
          ]}
        >
          <View style={styles.cardContent}>
            <Text
              style={[styles.cardLabel, isSelected && styles.cardLabelSelected]}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {item.label}
            </Text>
            {item.sublabel && (
              <Text style={styles.cardSublabel} numberOfLines={1} ellipsizeMode="tail">
                {item.sublabel}
              </Text>
            )}
          </View>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Animated.FlatList
        ref={flatListRef}
        data={allItems}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={TOTAL_ITEM_WIDTH}
        decelerationRate="fast"
        bounces={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: SIDE_PADDING }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true }
        )}
        onMomentumScrollEnd={handleMomentumEnd}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({
          length: TOTAL_ITEM_WIDTH,
          offset: TOTAL_ITEM_WIDTH * index,
          index,
        })}
        ItemSeparatorComponent={() => <View style={{ width: ITEM_SPACING }} />}
      />

      <WriteInModal
        visible={showWriteInModal}
        onClose={() => setShowWriteInModal(false)}
        onSubmit={handleWriteInSubmit}
        placeholder={writeInPlaceholder}
        title={writeInTitle}
        autocompleteResults={autocompleteResults}
        onTextChange={onWriteInTextChange}
        isSearching={isSearchingAutocomplete}
        onAutocompleteSelect={handleAutocompleteFromModal}
      />
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    minHeight: 110,
    justifyContent: 'center',
  },
  card: {
    width: ITEM_WIDTH,
    height: 80,
    borderRadius: 12,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: '#5B8A72',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  cardContent: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  cardLabel: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 13,
    color: colors.textPrimary || '#2D2D2D',
    textAlign: 'center',
    lineHeight: 18,
  },
  cardLabelSelected: {
    color: '#5B8A72',
  },
  cardSublabel: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: colors.textSecondary || '#4A4A4A',
    textAlign: 'center',
    marginTop: 3,
  },
  // ── Empty state ──
  emptyContainer: {
    minHeight: 110,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyWriteInCard: {
    width: 150,
    height: 85,
  },
  emptyStateText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: colors.textSecondary || '#4A4A4A',
    marginTop: 8,
    textAlign: 'center',
  },
  // ── Modal ──
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingTop: 12,
    minHeight: 180,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D0D0D0',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 18,
    color: colors.textPrimary || '#2D2D2D',
    marginBottom: 16,
  },
  modalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 48,
    backgroundColor: '#F8F8F8',
  },
  modalInput: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 16,
    color: colors.textPrimary || '#2D2D2D',
    paddingVertical: 0,
  },
  modalSubmitButton: {
    padding: 4,
    marginLeft: 8,
  },
  modalAutocompleteList: {
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: '#F8F8F8',
    overflow: 'hidden',
  },
  modalAutocompleteItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  modalAutocompleteName: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 14,
    color: colors.textPrimary || '#2D2D2D',
  },
  modalAutocompleteAddress: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: colors.textSecondary || '#4A4A4A',
    marginTop: 2,
  },
  // ── Loading skeleton ──
  loadingContainer: {
    height: 110,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: ITEM_SPACING,
  },
  skeletonCard: {
    width: ITEM_WIDTH,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#E8E8E8',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  skeletonLine: {
    width: '80%',
    height: 12,
    borderRadius: 6,
    backgroundColor: '#D0D0D0',
    marginBottom: 8,
  },
  skeletonLineShort: {
    width: '50%',
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D0D0D0',
  },
  loadingText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: colors.textSecondary || '#4A4A4A',
    marginTop: 8,
    textAlign: 'center',
  },
});

export default Carousel3D;
