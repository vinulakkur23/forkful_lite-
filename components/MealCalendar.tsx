/**
 * MealCalendar
 * Beautiful monthly calendar showing pixel art emojis on days when meals were eaten.
 * Up to 4 emojis per day in a mini-grid. Tap a day to see all meals in a modal.
 * Profile owners can add short notes to any day.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Modal,
  ScrollView,
  TextInput,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, shadows } from '../themes';
import EmojiDisplay from './EmojiDisplay';
import { firestore } from '../firebaseConfig';

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
  isOwnProfile?: boolean;
  userId?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 64) / 7);
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const NOTE_MAX_LENGTH = 150; // ~30-40 words

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

const MealCalendar: React.FC<Props> = ({ meals, onMealPress, isOwnProfile = false, userId }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDayMeals, setSelectedDayMeals] = useState<MealEntry[] | null>(null);
  const [selectedDayLabel, setSelectedDayLabel] = useState('');
  const [selectedDayKey, setSelectedDayKey] = useState('');

  // Notes state
  const [calendarNotes, setCalendarNotes] = useState<Record<string, string>>({});
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const today = new Date();
  const todayKey = getDateKey(today);

  // Load calendar notes from Firestore
  useEffect(() => {
    if (!userId) return;
    const loadNotes = async () => {
      try {
        const userDoc = await firestore().collection('users').doc(userId).get();
        const data = userDoc.data();
        if (data?.calendar_notes) {
          setCalendarNotes(data.calendar_notes);
        }
      } catch (error) {
        console.error('MealCalendar: Error loading notes:', error);
      }
    };
    loadNotes();
  }, [userId]);

  // Group meals by date — prefer photoTakenAt (when photo was taken) over createdAt (when posted)
  const mealsByDate = useMemo(() => {
    const map = new Map<string, MealEntry[]>();
    meals.forEach(meal => {
      try {
        // Only show meals that have been rated (rating > 0)
        if (!meal.rating || meal.rating <= 0) return;
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
      setSelectedDayKey(key);
      setSelectedDayMeals(dayMeals);
      setIsEditingNote(false);
      setNoteText(calendarNotes[key] || '');
    }
  };

  // Save note to Firestore
  const handleSaveNote = async () => {
    if (!userId) return;
    setSavingNote(true);
    Keyboard.dismiss();
    try {
      const trimmed = noteText.trim();
      const updatedNotes = { ...calendarNotes };
      if (trimmed) {
        updatedNotes[selectedDayKey] = trimmed;
      } else {
        delete updatedNotes[selectedDayKey];
      }
      await firestore().collection('users').doc(userId).update({
        calendar_notes: updatedNotes,
      });
      setCalendarNotes(updatedNotes);
      setIsEditingNote(false);
    } catch (error) {
      console.error('MealCalendar: Error saving note:', error);
    } finally {
      setSavingNote(false);
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
    const hasNote = !!calendarNotes[key];

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
        {/* Emoji(s) + squiggle for notes */}
        {hasMeals && (() => {
          const maxEmojis = hasNote ? 3 : 4;
          const visibleMeals = dayMeals.slice(0, maxEmojis);
          const totalSlots = visibleMeals.length + (hasNote ? 1 : 0);
          const useGrid = totalSlots >= 2;

          if (!useGrid) {
            // Single meal, no note
            return (
              <View style={styles.emojiGrid}>
                <View style={styles.singleEmojiContainer}>
                  {getEmojiUrl(dayMeals[0]) ? (
                    <Image source={{ uri: getEmojiUrl(dayMeals[0])! }} style={styles.singleEmoji} resizeMode="contain" />
                  ) : (
                    <View style={styles.mealDot} />
                  )}
                </View>
              </View>
            );
          }

          return (
            <View style={styles.emojiGrid}>
              <View style={styles.multiEmojiGrid}>
                {visibleMeals.map((meal, i) => (
                  <View key={i} style={styles.miniEmojiCell}>
                    {getEmojiUrl(meal) ? (
                      <Image source={{ uri: getEmojiUrl(meal)! }} style={styles.miniEmoji} resizeMode="contain" />
                    ) : (
                      <View style={styles.miniMealDot} />
                    )}
                  </View>
                ))}
                {hasNote && (
                  <View style={styles.miniEmojiCell}>
                    <Image source={require('../assets/icons/squiggle.png')} style={styles.miniEmoji} resizeMode="contain" />
                  </View>
                )}
              </View>
            </View>
          );
        })()}

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

  const existingNote = calendarNotes[selectedDayKey];

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
          onPress={() => {
            if (!isEditingNote) setSelectedDayMeals(null);
          }}
        >
          <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()} style={styles.modalCard}>
            {/* Header row: date + add note button */}
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>{selectedDayLabel}</Text>
              {isOwnProfile && !isEditingNote && (
                <TouchableOpacity
                  style={styles.addNoteButton}
                  onPress={() => {
                    setNoteText(existingNote || '');
                    setIsEditingNote(true);
                  }}
                  activeOpacity={0.6}
                >
                  <Text style={styles.addNoteButtonText}>{existingNote ? '✎' : '+'}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Existing note display (view mode) */}
            {existingNote && !isEditingNote && (
              <View style={styles.noteDisplay}>
                <Text style={styles.noteDisplayText}>{existingNote}</Text>
              </View>
            )}

            {/* Note editing */}
            {isEditingNote && (
              <View style={styles.noteEditContainer}>
                <TextInput
                  style={styles.noteInput}
                  value={noteText}
                  onChangeText={(text) => {
                    if (text.length <= NOTE_MAX_LENGTH) setNoteText(text);
                  }}
                  placeholder="Add a note about this day..."
                  placeholderTextColor={colors.textTertiary || '#B0B0B0'}
                  multiline
                  maxLength={NOTE_MAX_LENGTH}
                  autoFocus
                />
                <View style={styles.noteEditFooter}>
                  <Text style={styles.noteCharCount}>
                    {noteText.length}/{NOTE_MAX_LENGTH}
                  </Text>
                  <View style={styles.noteEditButtons}>
                    <TouchableOpacity
                      onPress={() => setIsEditingNote(false)}
                      style={styles.noteCancelButton}
                    >
                      <Text style={styles.noteCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSaveNote}
                      style={styles.noteSaveButton}
                      disabled={savingNote}
                    >
                      {savingNote ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.noteSaveText}>Save</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {(() => {
                // Group meals by time of day
                const getHour = (meal: MealEntry): number => {
                  const ts = meal.photoTakenAt || meal.createdAt;
                  if (!ts) return 12; // default to mid-day
                  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
                  return d.getHours();
                };
                const morning: MealEntry[] = [];
                const midday: MealEntry[] = [];
                const evening: MealEntry[] = [];
                const getTimestamp = (meal: MealEntry): number => {
                  const ts = meal.photoTakenAt || meal.createdAt;
                  if (!ts) return 0;
                  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
                  return d.getTime();
                };
                const sorted = [...(selectedDayMeals || [])].sort(
                  (a, b) => getTimestamp(a) - getTimestamp(b),
                );
                sorted.forEach((meal) => {
                  const h = getHour(meal);
                  if (h < 12) morning.push(meal);
                  else if (h < 18) midday.push(meal);
                  else evening.push(meal);
                });

                const sections = [
                  { label: 'Morning', meals: morning },
                  { label: 'Afternoon', meals: midday },
                  { label: 'Evening', meals: evening },
                ].filter((s) => s.meals.length > 0);

                return sections.map((section) => (
                  <View key={section.label}>
                    <Text style={styles.modalSectionLabel}>{section.label}</Text>
                    {section.meals.map((meal, index) => (
                      <TouchableOpacity
                        key={meal.id}
                        style={[styles.modalMealRow, index < section.meals.length - 1 && styles.modalMealRowBorder]}
                        onPress={() => {
                          setSelectedDayMeals(null);
                          onMealPress?.(meal);
                        }}
                      >
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
                          <EmojiDisplay rating={meal.rating} size={22} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                ));
              })()}
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
  squigglePlaceholder: {
    fontSize: 9,
    color: '#333',
    lineHeight: 12,
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
    maxHeight: '70%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  modalTitle: {
    fontFamily: 'Unna',
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  addNoteButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.lightTan || '#F8F6F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  addNoteButtonText: {
    fontSize: 18,
    color: '#5B8A72',
    fontWeight: '600',
  },

  // Note display (view mode)
  noteDisplay: {
    backgroundColor: colors.lightTan || '#F8F6F2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  noteDisplayText: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 18,
  },

  // Note editing
  noteEditContainer: {
    marginTop: 8,
    marginBottom: 4,
  },
  noteInput: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.lightTan || '#F8F6F2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 60,
    maxHeight: 100,
    textAlignVertical: 'top',
  },
  noteEditFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  noteCharCount: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: colors.textTertiary || '#B0B0B0',
  },
  noteEditButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  noteCancelButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  noteCancelText: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: colors.textTertiary || '#858585',
  },
  noteSaveButton: {
    backgroundColor: '#5B8A72',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 54,
    alignItems: 'center',
  },
  noteSaveText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },

  modalSubtitle: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: colors.textTertiary,
    marginBottom: 14,
  },
  modalScroll: {
    maxHeight: 300,
    marginTop: 10,
  },
  modalSectionLabel: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '600',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 4,
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
