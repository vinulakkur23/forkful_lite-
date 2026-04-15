/**
 * IconicEatModal
 * Centered modal displaying an iconic eat's details: category label, dish
 * name, restaurant, why_selected, and photo (Places photo or emoji
 * fallback). Dismisses by tapping the dark overlay. Used from the Discover
 * IconicEatsRow and map markers.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Image,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import { colors, spacing } from '../themes';
import {
  IconicEat,
  buildPlacesPhotoUrl,
} from '../services/iconicEatsService';

interface Props {
  visible: boolean;
  eat: IconicEat | null;
  onClose: () => void;
  // Accepted for backwards compatibility with existing callers, but no
  // longer invoked — the "Show on map" button has been removed. The
  // modal dismisses on overlay tap instead.
  onShowOnMap?: (eat: IconicEat) => void;
}

const IconicEatModal: React.FC<Props> = ({ visible, eat, onClose }) => {
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    setPhotoFailed(false);
  }, [eat?.id]);

  if (!eat) return null;

  // Open the restaurant in Google Maps — mirrors the pattern used on
  // MealDetailScreen (`handleRestaurantPress`) so taps here feel the
  // same as tapping any other restaurant link in the app.
  const openInGoogleMaps = async () => {
    if (!eat.restaurant_name) return;
    try {
      let searchQuery = eat.restaurant_name;
      if (eat.city) searchQuery += `, ${eat.city}`;
      const query = encodeURIComponent(searchQuery);

      const googleMapsUrl = `comgooglemaps://?q=${query}`;
      const canOpenGoogleMaps = await Linking.canOpenURL(googleMapsUrl);
      if (canOpenGoogleMaps) {
        await Linking.openURL(googleMapsUrl);
        return;
      }
      const webUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
      const canOpenWeb = await Linking.canOpenURL(webUrl);
      if (canOpenWeb) {
        await Linking.openURL(webUrl);
      } else {
        Alert.alert('Error', 'Unable to open maps application');
      }
    } catch (error) {
      console.error('Error opening maps:', error);
      Alert.alert('Error', 'Failed to open maps application');
    }
  };

  const placesPhoto = buildPlacesPhotoUrl(eat.photo_references?.[0], 800);
  const showPlacesPhoto = !!placesPhoto && !photoFailed;
  const emojiFallback = eat.unlocked ? eat.emoji_url : eat.shadow_emoji_url;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={e => e.stopPropagation()}
          style={styles.card}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.photoContainer}>
              {showPlacesPhoto ? (
                <Image
                  source={{ uri: placesPhoto }}
                  style={styles.photo}
                  resizeMode="cover"
                  onError={() => setPhotoFailed(true)}
                />
              ) : emojiFallback ? (
                <View style={styles.emojiFallback}>
                  <Image
                    source={{ uri: emojiFallback }}
                    style={styles.emojiImg}
                    resizeMode="contain"
                  />
                </View>
              ) : (
                <View style={[styles.photo, styles.photoPlaceholder]} />
              )}
              {eat.unlocked && (
                <View style={styles.unlockedBadge}>
                  <Text style={styles.unlockedText}>Unlocked</Text>
                </View>
              )}
            </View>

            <View style={styles.content}>
              <Text style={styles.iconicLabel}>
                {(eat.category || 'Iconic Eat').toUpperCase()}
              </Text>
              <Text style={styles.dishName}>{eat.dish_name}</Text>
              <TouchableOpacity onPress={openInGoogleMaps} activeOpacity={0.7}>
                <Text style={styles.restaurant}>{eat.restaurant_name}</Text>
              </TouchableOpacity>

              <View style={styles.divider} />

              <Text style={styles.whySelected}>{eat.why_selected}</Text>
            </View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    width: '88%',
    maxWidth: 380,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  photoContainer: {
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: 200,
    backgroundColor: colors.lightTan,
  },
  photoPlaceholder: {
    backgroundColor: colors.lightTan,
  },
  emojiFallback: {
    width: '100%',
    height: 200,
    backgroundColor: colors.lightTan,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiImg: {
    width: 140,
    height: 140,
  },
  unlockedBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: colors.success,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  unlockedText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  content: {
    padding: 18,
  },
  iconicLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.warmTaupe,
    marginBottom: 4,
  },
  dishName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  restaurant: {
    fontSize: 15,
    color: colors.textPrimary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.lightTan,
    marginVertical: 12,
  },
  whySelected: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
});

export default IconicEatModal;
