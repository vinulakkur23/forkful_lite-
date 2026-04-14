import React, { useMemo, useRef, useEffect, useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  Image,
  StyleSheet,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { mapStyle } from '../config/mapStyle';
import { colors, spacing, shadows } from '../themes';
import { IconicEat } from '../services/iconicEatsService';

interface MealEntry {
  id: string;
  pixel_art_url?: string;
  location: {
    latitude: number;
    longitude: number;
    [key: string]: any;
  } | null;
  [key: string]: any;
}

interface MiniMapStripProps {
  meals: MealEntry[];
  userLocation: { latitude: number; longitude: number } | null;
  focusedMealId: string | null;
  onMarkerPress: (mealId: string) => void;
  onExpandPress: () => void;
  iconicEats?: IconicEat[];
  focusedIconicEatId?: string | null;
  onIconicEatMarkerPress?: (id: string) => void;
  /**
   * When true (filter chip active), hide regular meal markers and render only
   * iconic shadow markers. Preserves the curated-acclaim framing on the map.
   */
  iconicOnlyMode?: boolean;
}

const MiniMapStrip: React.FC<MiniMapStripProps> = ({
  meals,
  userLocation,
  focusedMealId,
  onMarkerPress,
  onExpandPress,
  iconicEats = [],
  focusedIconicEatId = null,
  onIconicEatMarkerPress,
  iconicOnlyMode = false,
}) => {
  const mapRef = useRef<MapView>(null);

  // Track which iconic emoji images have loaded, to safely drop tracksViewChanges.
  const [loadedIconicIds, setLoadedIconicIds] = useState<Set<string>>(new Set());
  const markLoaded = (id: string) =>
    setLoadedIconicIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  const markers = useMemo(() => {
    if (!meals || iconicOnlyMode) return [];
    return meals
      .filter(m => m.location?.latitude && m.location?.longitude)
      .map(m => ({
        id: m.id,
        latitude: m.location!.latitude,
        longitude: m.location!.longitude,
      }));
  }, [meals, iconicOnlyMode]);

  const iconicMarkers = useMemo(() => {
    return iconicEats
      .filter(e => typeof e.latitude === 'number' && typeof e.longitude === 'number')
      .map(e => ({
        id: e.id,
        latitude: e.latitude,
        longitude: e.longitude,
        uri: e.unlocked ? e.emoji_url : e.shadow_emoji_url,
        unlocked: e.unlocked,
      }));
  }, [iconicEats]);

  const initialRegion = useMemo(() => {
    if (userLocation) {
      return {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      };
    }
    if (markers.length > 0) {
      return {
        latitude: markers[0].latitude,
        longitude: markers[0].longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      };
    }
    if (iconicMarkers.length > 0) {
      return {
        latitude: iconicMarkers[0].latitude,
        longitude: iconicMarkers[0].longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      };
    }
    return {
      latitude: 34.0522,
      longitude: -118.2437,
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
    };
  }, [userLocation, markers, iconicMarkers]);

  // Focus pan: prefer focused iconic eat when set, else focused meal.
  useEffect(() => {
    if (!mapRef.current) return;
    if (focusedIconicEatId) {
      const m = iconicMarkers.find(x => x.id === focusedIconicEatId);
      if (m) {
        mapRef.current.animateToRegion(
          {
            latitude: m.latitude,
            longitude: m.longitude,
            latitudeDelta: 0.025,
            longitudeDelta: 0.025,
          },
          300,
        );
        return;
      }
    }
    if (focusedMealId) {
      const m = markers.find(x => x.id === focusedMealId);
      if (m) {
        mapRef.current.animateToRegion(
          {
            latitude: m.latitude,
            longitude: m.longitude,
            latitudeDelta: 0.025,
            longitudeDelta: 0.025,
          },
          300,
        );
      }
    }
  }, [focusedMealId, focusedIconicEatId, markers, iconicMarkers]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        customMapStyle={mapStyle}
        initialRegion={initialRegion}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {markers.map(marker => (
          <Marker
            key={marker.id}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            tracksViewChanges={false}
            onPress={() => onMarkerPress(marker.id)}
            zIndex={marker.id === focusedMealId ? 10 : 1}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={marker.id === focusedMealId ? styles.dotFocused : styles.dot} />
          </Marker>
        ))}

        {iconicMarkers.map(marker => {
          const isFocused = marker.id === focusedIconicEatId;
          // Match the carousel's locked-shadow treatment: stack 0.55 opacity on
          // the PNG's baked-in alpha so the map silhouette reads mid-grey, not near-black.
          const imageStyle = [
            isFocused ? styles.iconicImageFocused : styles.iconicImage,
            !marker.unlocked && styles.iconicImageShadow,
          ];
          return (
            <Marker
              key={`iconic-${marker.id}`}
              coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
              tracksViewChanges={!loadedIconicIds.has(marker.id)}
              onPress={() => onIconicEatMarkerPress?.(marker.id)}
              zIndex={isFocused ? 20 : 5}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.iconicMarkerWrapper}>
                {marker.uri ? (
                  <Image
                    source={{ uri: marker.uri }}
                    style={imageStyle}
                    resizeMode="contain"
                    onLoad={() => markLoaded(marker.id)}
                    onError={() => markLoaded(marker.id)}
                  />
                ) : (
                  <View style={styles.dot} />
                )}
              </View>
            </Marker>
          );
        })}
      </MapView>

      <TouchableOpacity
        style={styles.expandButton}
        onPress={onExpandPress}
        activeOpacity={0.8}
      >
        <Text style={styles.expandText}>Explore Map →</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 150,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: 12,
    overflow: 'hidden',
    ...shadows.light,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  expandButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  expandText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.warmTaupe,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  dotFocused: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1a2b49',
    borderWidth: 2.5,
    borderColor: colors.white,
  },
  iconicMarkerWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconicImage: {
    width: 22,
    height: 22,
  },
  iconicImageFocused: {
    width: 32,
    height: 32,
  },
  iconicImageShadow: {
    // Match IconicEatsRow — stacks with the PNG's baked-in 60% alpha so the
    // silhouette reads as mid-grey on the map, matching the carousel.
    opacity: 0.55,
  },
});

export default React.memo(MiniMapStrip);
