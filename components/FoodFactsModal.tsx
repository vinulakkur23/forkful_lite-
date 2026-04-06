/**
 * FoodFactsModal
 * Scrollable modal displaying all available food facts, dish history, and insights.
 * Reusable from EditMealScreen and MealDetailScreen.
 */
import React from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';

interface FoodFactsModalProps {
  visible: boolean;
  onClose: () => void;
  dishName?: string;
  dishInsights?: {
    dish_history?: string;
    restaurant_fact?: string;
    cultural_insight?: string;
  };
  enhancedFacts?: {
    food_facts?: {
      ingredient_history?: string;
      dish_city_history?: string;
      restaurant_history?: string;
    };
    metadata?: {
      key_ingredients?: string[];
      cooking_method?: string;
      flavor_profile?: string[];
      interesting_ingredient?: string;
    };
  };
}

interface FactItem {
  label: string;
  text: string;
}

// Render text with **bold** markdown
const renderTextWithBold = (text: string) => {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Text key={index} style={{ fontWeight: 'bold' }}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    return part;
  });
};

const FoodFactsModal: React.FC<FoodFactsModalProps> = ({
  visible,
  onClose,
  dishName,
  dishInsights,
  enhancedFacts,
}) => {
  // Collect all available facts, deduplicating where the same info appears in both sources
  const facts: FactItem[] = [];

  if (dishInsights?.dish_history) {
    facts.push({ label: 'Dish History', text: dishInsights.dish_history });
  } else if (enhancedFacts?.food_facts?.restaurant_history) {
    facts.push({ label: 'Dish History', text: enhancedFacts.food_facts.restaurant_history });
  }

  if (dishInsights?.cultural_insight) {
    facts.push({ label: 'Cultural Insight', text: dishInsights.cultural_insight });
  } else if (enhancedFacts?.food_facts?.dish_city_history) {
    facts.push({ label: 'Cultural Insight', text: enhancedFacts.food_facts.dish_city_history });
  }

  if (dishInsights?.restaurant_fact) {
    facts.push({ label: 'Restaurant Fact', text: dishInsights.restaurant_fact });
  }

  if (enhancedFacts?.food_facts?.ingredient_history) {
    facts.push({ label: 'Ingredient Story', text: enhancedFacts.food_facts.ingredient_history });
  }

  // Also show enhanced_facts versions if they differ from what dish_insights provided
  if (enhancedFacts?.food_facts?.dish_city_history && dishInsights?.cultural_insight) {
    // Both exist — show enhanced version too if it's different
    if (enhancedFacts.food_facts.dish_city_history !== dishInsights.cultural_insight) {
      facts.push({ label: 'City Connection', text: enhancedFacts.food_facts.dish_city_history });
    }
  }
  if (enhancedFacts?.food_facts?.restaurant_history && dishInsights?.dish_history) {
    if (enhancedFacts.food_facts.restaurant_history !== dishInsights.dish_history) {
      facts.push({ label: 'Restaurant Story', text: enhancedFacts.food_facts.restaurant_history });
    }
  }

  // Metadata extras
  const metadata = enhancedFacts?.metadata;
  const hasMetadataExtras = metadata?.interesting_ingredient ||
    (metadata?.key_ingredients && metadata.key_ingredients.length > 0) ||
    metadata?.cooking_method ||
    (metadata?.flavor_profile && metadata.flavor_profile.length > 0);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text style={styles.headerTitle} numberOfLines={1}>
            {dishName || 'Food Facts'}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Facts */}
          {facts.length > 0 ? (
            facts.map((fact, index) => (
              <View key={index} style={styles.factCard}>
                <Text style={styles.factLabel}>{fact.label}</Text>
                <Text style={styles.factText}>{renderTextWithBold(fact.text)}</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                Facts about this dish are still loading...
              </Text>
            </View>
          )}

          {/* Metadata extras */}
          {hasMetadataExtras && (
            <View style={styles.metadataSection}>
              <Text style={styles.metadataSectionTitle}>AT A GLANCE</Text>

              {metadata?.interesting_ingredient && (
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Star Ingredient</Text>
                  <Text style={styles.metadataValue}>{metadata.interesting_ingredient}</Text>
                </View>
              )}

              {metadata?.cooking_method && (
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Cooking Method</Text>
                  <Text style={styles.metadataValue}>{metadata.cooking_method}</Text>
                </View>
              )}

              {metadata?.flavor_profile && metadata.flavor_profile.length > 0 && (
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Flavor Profile</Text>
                  <View style={styles.tagsRow}>
                    {metadata.flavor_profile.map((flavor, i) => (
                      <View key={i} style={styles.tag}>
                        <Text style={styles.tagText}>{flavor}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {metadata?.key_ingredients && metadata.key_ingredients.length > 0 && (
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Key Ingredients</Text>
                  <View style={styles.tagsRow}>
                    {metadata.key_ingredients.map((ingredient, i) => (
                      <View key={i} style={styles.tag}>
                        <Text style={styles.tagText}>{ingredient}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F6F2',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
  },
  headerSpacer: {
    width: 50,
  },
  headerTitle: {
    fontFamily: 'Unna',
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    width: 50,
    alignItems: 'flex-end',
    paddingVertical: 4,
  },
  closeButtonText: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '600',
    color: '#5B8A72',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  factCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  factLabel: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    color: '#5B8A72',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  factText: {
    fontFamily: 'Inter',
    fontSize: 15,
    color: '#1A1A1A',
    lineHeight: 22,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: '#858585',
    fontStyle: 'italic',
  },
  metadataSection: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  metadataSectionTitle: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    color: '#858585',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  metadataRow: {
    marginBottom: 14,
  },
  metadataLabel: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    color: '#5B8A72',
    marginBottom: 4,
  },
  metadataValue: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: '#1A1A1A',
    lineHeight: 20,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  tag: {
    backgroundColor: '#EDF4F0',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  tagText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: '#5B8A72',
  },
});

export default FoodFactsModal;
