import React, { useMemo, useRef, useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { passportMiniMapStyle } from '../config/passportMiniMapStyle';
import { spacing, shadows } from '../themes';

interface MealEntry {
  id: string;
  photoUrl?: string;
  pixel_art_url?: string;
  rating?: number;
  restaurant?: string;
  createdAt?: any;
  location: {
    latitude: number;
    longitude: number;
    [key: string]: any;
  } | null;
  [key: string]: any;
}

interface PassportMiniMapProps {
  meals: MealEntry[];
  userLocation: { latitude: number; longitude: number } | null;
  imageErrors: { [mealId: string]: boolean };
  onImageError: (mealId: string) => void;
}

/**
 * Small square map widget for the FoodPassport List tab. Shows the user's
 * meals as pixel-art emoji markers (matching the Passport Map tab —
 * MapScreen.tsx, which is what the wrapper actually renders for the Map
 * tab). Pan/zoom enabled but taps disabled — it's a glanceable widget,
 * not a navigation surface. The dedicated Map tab is still the way to
 * drill into a meal.
 *
 * Marker rendering mirrors MapScreen.tsx:867-886: pixel_art_url is the
 * primary, photoUrl is the fallback for older meals without generated
 * pixel art, and a placeholder icon covers the rest.
 */
const PassportMiniMap: React.FC<PassportMiniMapProps> = ({
  meals,
  userLocation,
  imageErrors,
  onImageError,
}) => {
  // Dedupe by restaurant so overlapping markers don't flicker on top of each
  // other. Same approach as the Passport Map tab (MapScreen.tsx:832-837):
  // within a group, keep the highest-rated meal, tiebreak by earliest
  // createdAt. Falls back to rounded-location grouping when restaurant name is
  // missing so we don't accidentally merge unrelated meals into one bucket.
  const mealsWithLocation = useMemo(() => {
    const withLoc = (meals || []).filter(
      m =>
        m.location &&
        typeof m.location.latitude === 'number' &&
        typeof m.location.longitude === 'number',
    );

    const groups: { [key: string]: MealEntry[] } = {};
    withLoc.forEach(m => {
      const key = m.restaurant
        ? `r:${m.restaurant.trim().toLowerCase()}`
        : `l:${m.location!.latitude.toFixed(4)},${m.location!.longitude.toFixed(4)}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    });

    return Object.values(groups).map(group => {
      if (group.length === 1) return group[0];
      return [...group].sort((a, b) => {
        const ra = a.rating ?? 0;
        const rb = b.rating ?? 0;
        if (rb !== ra) return rb - ra;
        const ca = typeof a.createdAt === 'number' ? a.createdAt : 0;
        const cb = typeof b.createdAt === 'number' ? b.createdAt : 0;
        return ca - cb;
      })[0];
    });
  }, [meals]);

  // Zoom to the densest metro cluster, not the global bounding box. A user
  // with meals in NY + SF would otherwise see a US-spanning view that's
  // useless at this size (~220pt square). Bucket by ~0.5° (≈55km, metro
  // scale), pick the cell with the most meals, then fit just that cell.
  // Re-runs when filters change so chips like "Italian" snap to the metro
  // where the user actually has the most Italian meals.
  const targetRegion = useMemo<Region>(() => {
    if (mealsWithLocation.length > 0) {
      const BUCKET = 0.5; // degrees; ≈55km, separates most metros cleanly
      const buckets: { [key: string]: typeof mealsWithLocation } = {};
      mealsWithLocation.forEach(m => {
        const { latitude, longitude } = m.location!;
        const key = `${Math.floor(latitude / BUCKET)},${Math.floor(longitude / BUCKET)}`;
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(m);
      });

      // Densest bucket wins. Ties broken by whichever bucket key sorts first
      // (deterministic — avoids region jitter on equal-sized clusters).
      const densest = Object.values(buckets).sort((a, b) => b.length - a.length)[0];

      let minLat = Number.MAX_VALUE;
      let maxLat = -Number.MAX_VALUE;
      let minLng = Number.MAX_VALUE;
      let maxLng = -Number.MAX_VALUE;
      densest.forEach(m => {
        const { latitude, longitude } = m.location!;
        minLat = Math.min(minLat, latitude);
        maxLat = Math.max(maxLat, latitude);
        minLng = Math.min(minLng, longitude);
        maxLng = Math.max(maxLng, longitude);
      });

      const centerLat = (minLat + maxLat) / 2;
      const centerLng = (minLng + maxLng) / 2;
      // 1.5× pad so markers aren't on the edge. Min span ≈9km so a single
      // marker doesn't zoom in absurdly far. (No max span — the bucket size
      // already caps how wide this can get.)
      const latDelta = Math.max(0.08, (maxLat - minLat) * 1.5);
      const lngDelta = Math.max(0.08, (maxLng - minLng) * 1.5);

      return {
        latitude: centerLat,
        longitude: centerLng,
        latitudeDelta: latDelta,
        longitudeDelta: lngDelta,
      };
    }

    // No meals yet → center on user location so the widget isn't empty/disorienting.
    if (userLocation) {
      return {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
    }

    // Last-resort default (SF).
    return {
      latitude: 37.78825,
      longitude: -122.4324,
      latitudeDelta: 0.0922,
      longitudeDelta: 0.0421,
    };
  }, [mealsWithLocation, userLocation]);

  // Animate to the target region whenever filters change. initialRegion only
  // applies on first mount, so without this the map would stay parked on
  // whatever it showed when the user first opened the Passport.
  const mapRef = useRef<MapView>(null);
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.animateToRegion(targetRegion, 400);
  }, [targetRegion]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        customMapStyle={passportMiniMapStyle}
        initialRegion={targetRegion}
        scrollEnabled
        zoomEnabled
        rotateEnabled={false}
        pitchEnabled={false}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {mealsWithLocation.map(meal => (
          <Marker
            key={meal.id}
            coordinate={{
              latitude: meal.location!.latitude,
              longitude: meal.location!.longitude,
            }}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.customPhotoMarker}>
              {meal.pixel_art_url ? (
                <Image
                  source={{ uri: meal.pixel_art_url }}
                  style={styles.markerPixelArt}
                  resizeMode="contain"
                />
              ) : meal.photoUrl && !imageErrors[meal.id] ? (
                <Image
                  source={{ uri: meal.photoUrl }}
                  style={styles.markerPhoto}
                  onError={() => onImageError(meal.id)}
                />
              ) : (
                <View style={[styles.markerPhoto, styles.markerPhotoPlaceholder]}>
                  <Icon name="image" size={12} color="#ddd" />
                </View>
              )}
            </View>
          </Marker>
        ))}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    aspectRatio: 1, // square
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    borderRadius: 12,
    overflow: 'hidden',
    ...shadows.light,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  customPhotoMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Pixel-art marker — matches the Passport Map tab's style (MapScreen.tsx).
  // No border/shadow: pixel art is its own visual.
  markerPixelArt: {
    width: 30,
    height: 30,
  },
  // Photo fallback for meals predating pixel-art generation.
  markerPhoto: {
    width: 28,
    height: 28,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'white',
  },
  markerPhotoPlaceholder: {
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default React.memo(PassportMiniMap);
