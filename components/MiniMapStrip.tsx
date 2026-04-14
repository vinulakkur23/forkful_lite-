import React, { useMemo, useRef, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { mapStyle } from '../config/mapStyle';
import { colors, spacing, shadows } from '../themes';

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
}

const MiniMapStrip: React.FC<MiniMapStripProps> = ({
  meals,
  userLocation,
  focusedMealId,
  onMarkerPress,
  onExpandPress,
}) => {
  const mapRef = useRef<MapView>(null);

  const markers = useMemo(() => {
    if (!meals) return [];
    return meals
      .filter(m => m.location?.latitude && m.location?.longitude)
      .map(m => ({
        id: m.id,
        latitude: m.location!.latitude,
        longitude: m.location!.longitude,
      }));
  }, [meals]);

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
    return {
      latitude: 34.0522,
      longitude: -118.2437,
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
    };
  }, [userLocation, markers]);

  useEffect(() => {
    if (!focusedMealId || !mapRef.current) return;
    const marker = markers.find(m => m.id === focusedMealId);
    if (marker) {
      mapRef.current.animateToRegion(
        {
          latitude: marker.latitude,
          longitude: marker.longitude,
          latitudeDelta: 0.025,
          longitudeDelta: 0.025,
        },
        300,
      );
    }
  }, [focusedMealId, markers]);

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
});

export default React.memo(MiniMapStrip);
