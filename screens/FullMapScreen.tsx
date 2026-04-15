import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
  StatusBar,
  Image,
} from 'react-native';
import type { Region } from 'react-native-maps';
import { RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import HomeMapComponent from '../components/HomeMapComponent';
import CompositeFilterComponent from '../components/CompositeFilterComponent';
import type { FilterItem } from '../components/SimpleFilterComponent';
import NearYouCarousel from '../components/NearYouCarousel';
import FullMapQuickChips from '../components/FullMapQuickChips';
import { applyHomeFilters } from '../utils/applyHomeFilters';
import { getFollowing } from '../services/followService';
import { useTasteProfile } from '../utils/useTasteProfile';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { colors, spacing } from '../themes';

// Match the MealEntry interface from HomeScreen
interface MealEntry {
  id: string;
  photoUrl: string;
  photos?: { url: string; isFlagship: boolean; order: number; uploadedAt?: any }[];
  rating: number;
  restaurant: string;
  meal: string;
  userId: string;
  userName?: string;
  userPhoto?: string;
  city?: string;
  mealType?: string;
  location: {
    latitude: number;
    longitude: number;
    source?: string;
    city?: string;
  } | null;
  createdAt: any;
  distance?: number;
  score?: number;
  tier?: string;
  iconic_eat_id?: string | null;
  aiMetadata?: any;
  metadata_enriched?: any;
  enhanced_facts?: any;
  quick_criteria_result?: any;
}

// Params received from HomeScreen (or MealDetail centerOnLocation flow).
// `nearbyMeals` is now the *unfiltered* set (homemade-stripped) so we can
// re-apply filters live as the user changes chips/ratings on this screen.
// `onFiltersSync` lets us push filter changes back to HomeScreen state when
// the user returns, so the feed reflects the same filters.
export type FullMapParams = {
  nearbyMeals?: MealEntry[];
  userLocation?: { latitude: number; longitude: number } | null;
  activeFilters?: FilterItem[] | null;
  activeRatingFilters?: number[] | null;
  onFiltersSync?: (
    filters: FilterItem[] | null,
    ratings: number[] | null
  ) => void;
  centerOnLocation?: {
    latitude: number;
    longitude: number;
    mealId?: string;
  };
};

type Props = {
  navigation: any;
  route: RouteProp<{ FullMap: FullMapParams }, 'FullMap'>;
};

const MAX_MEALS_TO_DISPLAY = 50;

const FullMapScreen: React.FC<Props> = ({ navigation, route }) => {
  const params = route.params || {};

  // React Navigation v7 can wipe route.params when this screen is
  // navigated back to via a bare navigate(name) call (which is what
  // MealDetail's back button does when previousScreen === 'FullMap').
  // Non-serializable params (onFiltersSync is a function) and large
  // arrays (nearbyMeals) are particularly prone to being dropped on
  // tab-navigate-back. Latch them into a ref on first receipt and
  // always read from the ref so FullMap's state survives a round-trip
  // through MealDetail.
  const latchedRef = useRef<{
    nearbyMeals: MealEntry[];
    userLocation: { latitude: number; longitude: number } | null;
    onFiltersSync: FullMapParams['onFiltersSync'];
  }>({ nearbyMeals: [], userLocation: null, onFiltersSync: undefined });
  if (params.nearbyMeals && params.nearbyMeals.length > 0) {
    latchedRef.current.nearbyMeals = params.nearbyMeals;
  }
  if (params.userLocation) {
    latchedRef.current.userLocation = params.userLocation;
  }
  if (params.onFiltersSync) {
    latchedRef.current.onFiltersSync = params.onFiltersSync;
  }
  const nearbyMeals = latchedRef.current.nearbyMeals;
  const userLocation = latchedRef.current.userLocation;
  const onFiltersSync = latchedRef.current.onFiltersSync;
  const initialFilters = params.activeFilters ?? null;
  const initialRatings = params.activeRatingFilters ?? null;
  const centerOnLocation = params.centerOnLocation;

  // Local filter state — seeded from caller, mirrored back via onFiltersSync.
  const [activeFilters, setActiveFilters] = useState<FilterItem[] | null>(initialFilters);
  const [activeRatingFilters, setActiveRatingFilters] = useState<number[] | null>(initialRatings);

  // ── Quick-chip data sources ─────────────────────────────────────────
  // Following: one-shot fetch on mount. Cheap — the follow graph is
  // small (tens of entries at most) and doesn't need to be live.
  // Critics: one-shot query for user docs with isCritic === true. The
  // query returns an empty set today (no user docs have the flag) but
  // will start working the moment any user doc is flagged in Firestore.
  // Taste profile: reuses the shared useTasteProfile subscription so we
  // don't open a second onSnapshot for the same doc.
  const currentUid = auth().currentUser?.uid ?? null;
  const [followingIds, setFollowingIds] = useState<Set<string>>(() => new Set());
  const [criticIds, setCriticIds] = useState<Set<string>>(() => new Set());
  const { profile: tasteProfile } = useTasteProfile(currentUid);

  useEffect(() => {
    if (!currentUid) return;
    let cancelled = false;
    (async () => {
      try {
        const follows = await getFollowing();
        if (cancelled) return;
        setFollowingIds(new Set(follows.map(f => f.followingId)));
      } catch (err) {
        console.warn('[FullMap] getFollowing failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUid]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await firestore()
          .collection('users')
          .where('isCritic', '==', true)
          .get();
        if (cancelled) return;
        setCriticIds(new Set(snap.docs.map(d => d.id)));
      } catch (err) {
        // Non-fatal — chip will just stay disabled.
        console.warn('[FullMap] critics query failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-apply filters whenever they (or the id sets backing following /
  // critic chips) change.
  const filteredMeals = useMemo(
    () =>
      applyHomeFilters(nearbyMeals, activeFilters, activeRatingFilters, {
        followingIds,
        criticIds,
      }),
    [nearbyMeals, activeFilters, activeRatingFilters, followingIds, criticIds]
  );

  // Quick-chip toggle: add the FilterItem if missing, remove it if
  // present. Mirrors FoodPassport's handleQuickChipPress.
  //
  // Sync note: 'following' and 'critic' are FullMap-only filter types
  // (HomeScreen's applyHomeFilters call doesn't supply the id sets they
  // need, so syncing them back would empty Home's feed). We strip them
  // before calling onFiltersSync. All other chip types — cuisine, flavor,
  // protein, etc. — sync normally so the Home feed reflects the user's
  // choices on return.
  const FULLMAP_ONLY_TYPES = useMemo(
    () => new Set(['following', 'critic']),
    []
  );

  const handleQuickChipToggle = useCallback(
    (filter: FilterItem) => {
      const current = activeFilters || [];
      const isOn = current.some(f => f.type === filter.type && f.value === filter.value);
      const next = isOn
        ? current.filter(f => !(f.type === filter.type && f.value === filter.value))
        : [...current, filter];
      const out = next.length > 0 ? next : null;
      setActiveFilters(out);
      const synced = out ? out.filter(f => !FULLMAP_ONLY_TYPES.has(f.type)) : null;
      onFiltersSync?.(synced && synced.length > 0 ? synced : null, activeRatingFilters);
    },
    [activeFilters, activeRatingFilters, onFiltersSync, FULLMAP_ONLY_TYPES]
  );

  // Split activeFilters into two slices so the search bar (which doesn't
  // know about 'following' / 'critic') can manage its own slice without
  // clobbering the quick-chip slice. The search bar sees / emits only
  // non-fullmap-only filters; we merge quick-chip filters back in when
  // its state changes.
  const nonFullMapFilters = useMemo(
    () => (activeFilters ? activeFilters.filter(f => !FULLMAP_ONLY_TYPES.has(f.type)) : null),
    [activeFilters, FULLMAP_ONLY_TYPES]
  );

  const handleFilterChange = useCallback((filters: FilterItem[] | null) => {
    const fullMapOnly = (activeFilters || []).filter(f => FULLMAP_ONLY_TYPES.has(f.type));
    const merged = [...fullMapOnly, ...(filters || [])];
    const next = merged.length > 0 ? merged : null;
    setActiveFilters(next);
    // HomeScreen never needs to see fullmap-only filters.
    onFiltersSync?.(filters, activeRatingFilters);
  }, [activeFilters, onFiltersSync, activeRatingFilters, FULLMAP_ONLY_TYPES]);

  const handleRatingFilterChange = useCallback((ratings: number[] | null) => {
    setActiveRatingFilters(ratings);
    onFiltersSync?.(activeFilters, ratings);
  }, [onFiltersSync, activeFilters]);

  // Manage image errors locally
  const [imageErrors, setImageErrors] = useState<{ [key: string]: boolean }>({});

  const handleImageError = useCallback((mealId: string) => {
    setImageErrors(prev => ({ ...prev, [mealId]: true }));
  }, []);

  // ── Map ↔ carousel state ────────────────────────────────────────────
  // currentRegion is fed by HomeMapComponent.onRegionChange. Its bounds
  // decide which meals the bottom carousel shows ("meals currently on
  // the map"). Defaults to a user-location-sized region so the carousel
  // has data to render on first paint — HomeMapComponent uses the same
  // default for its initialRegion.
  const [currentRegion, setCurrentRegion] = useState<Region | null>(() => {
    if (userLocation) {
      return {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    return null;
  });
  const [focusedMealId, setFocusedMealId] = useState<string | null>(null);

  const handleRegionChange = useCallback((region: Region) => {
    setCurrentRegion(region);
  }, []);

  // Meals whose coordinates fall inside the visible map bounds. The
  // carousel consumes this directly. When the map pans and a meal
  // leaves the frame, it drops out of the carousel on the next tick.
  const visibleMeals = useMemo(() => {
    if (!currentRegion) return filteredMeals;
    const minLat = currentRegion.latitude - currentRegion.latitudeDelta / 2;
    const maxLat = currentRegion.latitude + currentRegion.latitudeDelta / 2;
    const minLng = currentRegion.longitude - currentRegion.longitudeDelta / 2;
    const maxLng = currentRegion.longitude + currentRegion.longitudeDelta / 2;
    return filteredMeals.filter(m => {
      if (!m.location) return false;
      const { latitude, longitude } = m.location;
      return (
        latitude >= minLat &&
        latitude <= maxLat &&
        longitude >= minLng &&
        longitude <= maxLng
      );
    });
  }, [filteredMeals, currentRegion]);

  // If the user pans away from the focused card's marker, drop focus so
  // no off-screen dot stays highlighted.
  useEffect(() => {
    if (focusedMealId && !visibleMeals.some(m => m.id === focusedMealId)) {
      setFocusedMealId(null);
    }
  }, [visibleMeals, focusedMealId]);

  const handleCarouselFocus = useCallback((mealId: string | null) => {
    setFocusedMealId(mealId);
  }, []);

  const viewMealDetails = useCallback((meal: MealEntry) => {
    navigation.navigate('MealDetail', {
      mealId: meal.id,
      previousScreen: 'FullMap',
    });
  }, [navigation]);

  const handleClose = useCallback(() => {
    // Explicitly target Home — goBack() would fall through to the tab
    // navigator's firstRoute (FoodPassport) in React Nav v7.
    navigation.navigate('Home');
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header — forkful logo on left, close on right (mirrors HomeScreen
          layout where the right-hand control is the map toggle). */}
      <View style={styles.headerContainer}>
        <Image
          source={require('../assets/forkful_logos/forkful_logo_cursive2.png')}
          style={styles.headerLogo}
          resizeMode="contain"
        />
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleClose}
          activeOpacity={0.8}
        >
          <Icon name="close" size={24} color="#1a2b49" />
        </TouchableOpacity>
      </View>

      {/* Filter bar — same component HomeScreen uses (search, chips, rating
          dropdown). Filter state is local to this screen and synced back to
          HomeScreen via onFiltersSync. */}
      <View style={styles.filterArea}>
        <CompositeFilterComponent
          key="fullmap-filter"
          onFilterChange={handleFilterChange}
          onRatingFilterChange={handleRatingFilterChange}
          initialFilters={nonFullMapFilters}
          initialRatings={activeRatingFilters}
          onUserSelect={(userId, userName, userPhoto) => {
            navigation.navigate('FoodPassport', {
              userId,
              userName,
              userPhoto,
              tabIndex: 0,
            });
          }}
        />
      </View>

      <View style={styles.mapAndCarousel}>
        <HomeMapComponent
          navigation={navigation}
          nearbyMeals={filteredMeals}
          loading={false}
          refreshing={false}
          activeFilters={activeFilters}
          showingLimitedResults={false}
          userLocation={userLocation}
          imageErrors={imageErrors}
          onImageError={handleImageError}
          onViewMealDetails={viewMealDetails}
          centerOnLocation={centerOnLocation}
          tabIndex={1}
          MAX_MEALS_TO_DISPLAY={MAX_MEALS_TO_DISPLAY}
          dotsOnly
          focusedMealId={focusedMealId}
          onRegionChange={handleRegionChange}
          hideFilterModeToggle
        />
        {/* Quick-chip row floats OVER the top of the map so the map tiles
            extend edge-to-edge. Sits above the map in z-order (pointerEvents
            defaults to 'auto' for the chips themselves, while the ScrollView
            row doesn't cover the whole map so pan/zoom on the map works
            everywhere else). */}
        <View style={styles.chipsOverlay} pointerEvents="box-none">
          <FullMapQuickChips
            activeFilters={activeFilters}
            onToggleFilter={handleQuickChipToggle}
            followingCount={followingIds.size}
            criticCount={criticIds.size}
            tasteProfile={tasteProfile}
          />
        </View>
        {visibleMeals.length > 0 && (
          <View style={styles.carouselContainer}>
            <NearYouCarousel
              meals={visibleMeals}
              title="In view"
              onMealPress={viewMealDetails}
              onFocusChange={handleCarouselFocus}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.lightTan,
  },
  headerContainer: {
    backgroundColor: 'transparent',
    paddingTop: spacing.sm,
    paddingBottom: 2,
    paddingHorizontal: spacing.screenPadding,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLogo: {
    width: 150,
    height: 50,
    marginLeft: -16,
  },
  closeButton: {
    padding: 8,
    marginRight: -4,
  },
  filterArea: {
    paddingHorizontal: spacing.md,
    paddingTop: 0,
    paddingBottom: spacing.sm,
    backgroundColor: colors.lightTan,
    borderBottomWidth: 1,
    borderBottomColor: colors.mediumGray,
    zIndex: 5,
  },
  mapAndCarousel: {
    flex: 1,
    position: 'relative',
  },
  // Chip row floats at the top of the map. Transparent background so the
  // map tiles show through between chips. zIndex keeps it above map
  // markers.
  chipsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 4,
  },
  // Carousel floats over the bottom of the map. pointerEvents defaults
  // to 'auto' so the carousel itself stays scrollable, but anything
  // outside its bounds (the map above it) keeps receiving pan/zoom
  // gestures.
  carouselContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.sm,
    backgroundColor: 'transparent',
  },
});

export default FullMapScreen;
