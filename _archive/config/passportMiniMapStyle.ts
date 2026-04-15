/**
 * Artistic "momento" style for the embedded PassportMiniMap widget.
 *
 * Minimalist monochrome: white land, light-grey roads, soft-grey water.
 * All labels hidden — this is a keepsake, not a GPS tool.
 *
 * Preview/edit at: https://mapstyle.withgoogle.com/
 */
export const passportMiniMapStyle = [
  // Base — white across all geometry (land, POIs, default fill).
  {
    elementType: 'geometry',
    stylers: [{ color: '#FFFFFF' }],
  },
  // Kill ALL labels — biggest single lever for the "artistic" feel.
  {
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  {
    elementType: 'labels.icon',
    stylers: [{ visibility: 'off' }],
  },
  // Administrative boundaries — hidden so no state/country border lines.
  {
    featureType: 'administrative',
    stylers: [{ visibility: 'off' }],
  },
  // POIs, parks — same white as land so nothing pops as its own shape.
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#FFFFFF' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#FFFFFF' }],
  },
  // Transit — gone entirely.
  {
    featureType: 'transit',
    stylers: [{ visibility: 'off' }],
  },
  // Roads — slight grey so they read as faint lines, not navigation routes.
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#ECECEC' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#DDDDDD' }, { weight: 0.5 }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#E0E0E0' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#CFCFCF' }, { weight: 0.7 }],
  },
  // Water — soft grey.
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#E5E8EB' }],
  },
];
