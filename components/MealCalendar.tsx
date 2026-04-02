/**
 * MealCalendar
 * Beautiful monthly calendar showing pixel art emojis on days when meals were eaten.
 * Up to 4 emojis per day in a mini-grid. Tap a day to see all meals in a modal.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Modal,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { colors, spacing, shadows } from '../themes';

interface MealEntry {
  id: string;
  meal: string;
  restaurant: string;
  rating: number;
  photoUrl: string;
  pixel_art_url?: string;
  pixel_art_data?: string;
  createdAt: any;
  photoTakenAt?: any; // Photo creation date (preferred for calendar)
}

interface Props {
  meals: MealEntry[];
  onMealPress?: (meal: MealEntry) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 64) / 7);
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Calendar math utilities
const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

const formatDateKey = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const getDateKey = (date: Date) =>
  formatDateKey(date.getFullYear(), date.getMonth(), date.getDate());

const generateCalendarGrid = (year: number, month: number): (number | null)[][] => {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const rows: (number | null)[][] = [];
  let currentDay = 1;

  for (let row = 0; row < 6; row++) {
    const week: (number | null)[] = [];
    for (let col = 0; col < 7; col++) {
      if (row === 0 && col < firstDay) {
        week.push(null);
      } else if (currentDay > daysInMonth) {
        week.push(null);
      } else {
        week.push(currentDay);
        currentDay++;
      }
    }
    rows.push(week);
    if (currentDay > daysInMonth) break;
  }

  return rows;
};

const MealCalendar: React.FC<Props> = ({ meals, onMealPress }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDayMeals, setSelectedDayMeals] = useState<MealEntry[] | null>(null);
  const [selectedDayLabel, setSelectedDayLabel] = useState('');

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const today = new Date();
  const todayKey = getDateKey(today);

  // Group meals by date — prefer photoTakenAt (when photo was taken) over createdAt (when posted)
  const mealsByDate = useMemo(() => {
    const map = new Map<string, MealEntry[]>();
    meals.forEach(meal => {
      try {
        // Use photoTakenAt if available, otherwise fall back to createdAt
        const rawDate = meal.photoTakenAt || meal.createdAt;
        const date = rawDate?.toDate?.() || new Date(rawDate);
        const key = getDateKey(date);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(meal);
      } catch {}
    });
    return map;
  }, [meals]);

  // Generate grid for current month
  const grid = useMemo(() => generateCalendarGrid(year, month), [year, month]);

  // Month navigation
  const goToPreviousMonth = () => {
    setCurrentMonth(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() - 1);
      return d;
    });
  };

  const goToNextMonth = () => {
    const now = new Date();
    setCurrentMonth(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + 1);
      if (d.getFullYear() > now.getFullYear() || (d.getFullYear() === now.getFullYear() && d.getMonth() > now.getMonth())) {
        return prev;
      }
      return d;
    });
  };

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  // Get pixel art URL for a meal
  const getEmojiUrl = (meal: MealEntry) => {
    if (meal.pixel_art_url) return meal.pixel_art_url;
    if (meal.pixel_art_data) return `data:image/png;base64,${meal.pixel_art_data}`;
    return null;
  };

  // Handle day press
  const handleDayPress = (day: number) => {
    const key = formatDateKey(year, month, day);
    const dayMeals = mealsByDate.get(key);
    if (dayMeals && dayMeals.length > 0) {
      const date = new Date(year, month, day);
      setSelectedDayLabel(date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }));
      setSelectedDayMeals(dayMeals);
    }
  };

  // Render a day cell
  const renderDayCell = (day: number | null, rowIdx: number, colIdx: number) => {
    if (day === null) {
      return <View key={`empty_${rowIdx}_${colIdx}`} style={styles.dayCell} />;
    }

    const key = formatDateKey(year, month, day);
    const dayMeals = mealsByDate.get(key) || [];
    const isToday = key === todayKey;
    const hasMeals = dayMeals.length > 0;

    return (
      <TouchableOpacity
        key={`day_${day}`}
        style={[
          styles.dayCell,
          hasMeals && styles.dayCellWithMeal,
          isToday && styles.dayCellToday,
        ]}
        onPress={() => hasMeals && handleDayPress(day)}
        activeOpacity={hasMeals ? 0.6 : 1}
        disabled={!hasMeals}
      >
        {/* Emoji(s) */}
        {hasMeals && (
          <View style={styles.emojiGrid}>
            {dayMeals.length === 1 && (
              <View style={styles.singleEmojiContainer}>
                {getEmojiUrl(dayMeals[0]) ? (
                  <Image source={{ uri: getEmojiUrl(dayMeals[0])! }} style={styles.singleEmoji} resizeMode="contain" />
                ) : (
                  <View style={styles.mealDot} />
                )}
              </View>
            )}
            {dayMeals.length >= 2 && dayMeals.length <= 4 && (
              <View style={styles.multiEmojiGrid}>
                {dayMeals.slice(0, 4).map((meal, i) => (
                  <View key={i} style={styles.miniEmojiCell}>
                    {getEmojiUrl(meal) ? (
                      <Image source={{ uri: getEmojiUrl(meal)! }} style={styles.miniEmoji} resizeMode="contain" />
                    ) : (
                      <View style={styles.miniMealDot} />
                    )}
                  </View>
                ))}
              </View>
            )}
            {dayMeals.length > 4 && (
              <View style={styles.multiEmojiGrid}>
                {dayMeals.slice(0, 3).map((meal, i) => (
                  <View key={i} style={styles.miniEmojiCell}>
                    {getEmojiUrl(meal) ? (
                      <Image source={{ uri: getEmojiUrl(meal)! }} style={styles.miniEmoji} resizeMode="contain" />
                    ) : (
                      <View style={styles.miniMealDot} />
                    )}
                  </View>
                ))}
                <View style={styles.miniEmojiCell}>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>+{dayMeals.length - 3}</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Day number */}
        <Text style={[
          styles.dayNumber,
          hasMeals && styles.dayNumberWithMeal,
          isToday && styles.dayNumberToday,
        ]}>
          {day}
        </Text>
      </TouchableOpacity>
    );
  };

  // Rating to emoji text
  const ratingEmoji = (rating: number) => {
    const emojis: { [key: number]: string } = { 1: '😟', 2: '😐', 3: '🙂', 4: '😊', 5: '😄', 6: '🤩' };
    return emojis[rating] || '';
  };

  return (
    <View style={styles.container}>
      {/* Month header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goToPreviousMonth} style={styles.navArrow}>
          <Text style={styles.navArrowText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthText}>
          {MONTH_NAMES[month]} {year}
        </Text>
        <TouchableOpacity
          onPress={goToNextMonth}
          style={[styles.navArrow, isCurrentMonth && { opacity: 0.3 }]}
          disabled={isCurrentMonth}
        >
          <Text style={styles.navArrowText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Day labels */}
      <View style={styles.dayLabelsRow}>
        {DAY_LABELS.map(label => (
          <Text key={label} style={styles.dayLabel}>{label}</Text>
        ))}
      </View>

      {/* Calendar grid */}
      {grid.map((week, rowIdx) => (
        <View key={`week_${rowIdx}`} style={styles.weekRow}>
          {week.map((day, colIdx) => renderDayCell(day, rowIdx, colIdx))}
        </View>
      ))}

      {/* Day detail modal */}
      <Modal
        visible={selectedDayMeals !== null}
        transparent
        animationType="none"
        onRequestClose={() => setSelectedDayMeals(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedDayMeals(null)}
        >
          <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()} style={styles.modalCard}>
            <Text style={styles.modalTitle}>{selectedDayLabel}</Text>
            <Text style={styles.modalSubtitle}>
              {selectedDayMeals?.length} {selectedDayMeals?.length === 1 ? 'meal' : 'meals'}
            </Text>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {selectedDayMeals?.map((meal, index) => (
                <TouchableOpacity
                  key={meal.id}
                  style={[styles.modalMealRow, index < (selectedDayMeals?.length || 0) - 1 && styles.modalMealRowBorder]}
                  onPress={() => {
                    setSelectedDayMeals(null);
                    onMealPress?.(meal);
                  }}
                >
                  {/* Pixel art or photo thumbnail */}
                  {getEmojiUrl(meal) ? (
                    <Image source={{ uri: getEmojiUrl(meal)! }} style={styles.modalMealEmoji} resizeMode="contain" />
                  ) : meal.photoUrl ? (
                    <Image source={{ uri: meal.photoUrl }} style={styles.modalMealPhoto} resizeMode="cover" />
                  ) : (
                    <View style={[styles.modalMealPhoto, { backgroundColor: colors.lightGray }]} />
                  )}
                  <View style={styles.modalMealInfo}>
                    <Text style={styles.modalMealName} numberOfLines={1}>{meal.meal || 'Untitled'}</Text>
                    <Text style={styles.modalMealRestaurant} numberOfLines={1}>{meal.restaurant || ''}</Text>
                  </View>
                  {meal.rating > 0 && (
                    <Text style={styles.modalMealRating}>{ratingEmoji(meal.rating)}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    borderRadius: 12,
    marginHorizontal: spacing.md || 16,
    marginTop: spacing.md || 16,
    marginBottom: spacing.sm || 8,
    padding: spacing.md || 16,
    ...shadows.light,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  monthText: {
    fontFamily: 'Unna',
    fontSize: 20,
    fontWeight: '700',
    color: colors.warmTaupe,
  },
  navArrow: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  navArrowText: {
    fontSize: 28,
    color: colors.warmTaupe,
    fontWeight: '300',
  },
  dayLabelsRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '500',
    color: colors.textTertiary,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: CELL_SIZE,
    paddingVertical: 3,
    borderRadius: 8,
    marginHorizontal: 1,
  },
  dayCellWithMeal: {
    backgroundColor: colors.lightTan || '#F8F6F2',
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderColor: '#5B8A72',
  },
  dayNumber: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 1,
  },
  dayNumberWithMeal: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  dayNumberToday: {
    color: '#5B8A72',
    fontWeight: '700',
  },

  // Single emoji
  emojiGrid: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  singleEmojiContainer: {
    alignItems: 'center',
  },
  singleEmoji: {
    width: 24,
    height: 24,
  },
  mealDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#5B8A72',
  },

  // Multi emoji (2x2 grid)
  multiEmojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 28,
    justifyContent: 'center',
  },
  miniEmojiCell: {
    width: 13,
    height: 13,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 0.5,
  },
  miniEmoji: {
    width: 12,
    height: 12,
  },
  miniMealDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#5B8A72',
  },
  countBadge: {
    backgroundColor: colors.warmTaupe,
    borderRadius: 6,
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    color: colors.white,
    fontSize: 7,
    fontWeight: '700',
  },

  // Day detail modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 20,
    width: '85%',
    maxWidth: 360,
    maxHeight: '60%',
  },
  modalTitle: {
    fontFamily: 'Unna',
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  modalSubtitle: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: colors.textTertiary,
    marginBottom: 14,
  },
  modalScroll: {
    maxHeight: 300,
  },
  modalMealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  modalMealRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.mediumGray || '#EBEBEB',
  },
  modalMealEmoji: {
    width: 36,
    height: 36,
    marginRight: 12,
  },
  modalMealPhoto: {
    width: 36,
    height: 36,
    borderRadius: 8,
    marginRight: 12,
  },
  modalMealInfo: {
    flex: 1,
  },
  modalMealName: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  modalMealRestaurant: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 1,
  },
  modalMealRating: {
    fontSize: 20,
    marginLeft: 8,
  },
});

export default MealCalendar;
