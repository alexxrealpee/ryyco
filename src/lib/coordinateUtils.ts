/**
 * Utility functions to extract, validate, and build Google Maps and Waze navigation URLs
 * using exact satellite coordinates (latitude & longitude) for store pickup and delivery destinations.
 */

export interface GeoCoords {
  lat: number;
  lng: number;
}

/**
 * Extracts latitude and longitude from Google Maps URLs, query strings, or raw coordinate text.
 * Examples supported:
 * - https://www.google.com/maps?q=0.827429,-77.659088
 * - https://maps.google.com/?q=0.827429,-77.659088
 * - https://www.google.com/maps/search/?api=1&query=0.827429,-77.659088
 * - https://www.google.com/maps/dir/?api=1&destination=0.827429,-77.659088
 * - https://www.google.com/maps/place/0.827429,-77.659088
 * - https://www.google.com/maps/@0.827429,-77.659088,17z
 * - geo:0.827429,-77.659088
 * - "0.827429, -77.659088"
 */
export function extractCoordinates(input?: string | null): GeoCoords | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const patterns = [
    // URL query parameter with q=, query=, destination=, ll=, center=
    /[?&](?:q|query|destination|ll|center)=([+-]?\d{1,3}(?:\.\d+)?)[,%2C\s]+([+-]?\d{1,3}(?:\.\d+)?)/i,
    // Google Maps path with @lat,lng
    /@([+-]?\d{1,3}(?:\.\d+)?)[,%2C\s]+([+-]?\d{1,3}(?:\.\d+)?)/i,
    // Google Maps /place/lat,lng
    /\/place\/([+-]?\d{1,3}(?:\.\d+)?)[,%2C\s]+([+-]?\d{1,3}(?:\.\d+)?)/i,
    // geo: uri
    /geo:([+-]?\d{1,3}(?:\.\d+)?)[,%2C\s]+([+-]?\d{1,3}(?:\.\d+)?)/i,
    // Plain text like "0.827429, -77.659088" or "0.827429,-77.659088"
    /(?:^|[^\d.-])([+-]?\d{1,3}\.\d{3,12})[,\s]+([+-]?\d{1,3}\.\d{3,12})(?:[^\d.-]|$)/
  ];

  for (const regex of patterns) {
    const match = trimmed.match(regex);
    if (match && match[1] && match[2]) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return {
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6))
        };
      }
    }
  }

  return null;
}

/**
 * Validates if numeric latitude and longitude are within acceptable geographical bounds.
 */
export function isValidCoordinate(lat?: number | null, lng?: number | null): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (isNaN(lat) || isNaN(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Calculates distance in kilometers between two GPS coordinates using the Haversine formula.
 */
export function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Formats a distance in kilometers to a clean, user-friendly label (e.g. "850 m" or "2,4 km").
 */
export function formatDistanceKm(km?: number | null): string {
  if (km === undefined || km === null || isNaN(km) || km < 0) return '';
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1).replace('.', ',')} km`;
}

/**
 * Computes the route distance breakdown for an order:
 * - Driver GPS to store (if driver position is available)
 * - Store to customer
 * - Total estimated distance
 */
export function getOrderRouteDistance(options: {
  driverLat?: number | null;
  driverLng?: number | null;
  storeLat?: number | null;
  storeLng?: number | null;
  storeMapUrl?: string | null;
  customerLat?: number | null;
  customerLng?: number | null;
  customerMapUrl?: string | null;
}): {
  storeToCustomerKm: number | null;
  driverToStoreKm: number | null;
  totalEstimatedKm: number | null;
  summaryLabel: string;
} {
  let storeCoords: GeoCoords | null = null;
  if (isValidCoordinate(options.storeLat, options.storeLng)) {
    storeCoords = { lat: options.storeLat!, lng: options.storeLng! };
  } else if (options.storeMapUrl) {
    storeCoords = extractCoordinates(options.storeMapUrl);
  }

  let custCoords: GeoCoords | null = null;
  if (isValidCoordinate(options.customerLat, options.customerLng)) {
    custCoords = { lat: options.customerLat!, lng: options.customerLng! };
  } else if (options.customerMapUrl) {
    custCoords = extractCoordinates(options.customerMapUrl);
  }

  let storeToCustomerKm: number | null = null;
  if (storeCoords && custCoords) {
    storeToCustomerKm = calculateDistanceKm(storeCoords.lat, storeCoords.lng, custCoords.lat, custCoords.lng);
  }

  let driverToStoreKm: number | null = null;
  if (isValidCoordinate(options.driverLat, options.driverLng) && storeCoords) {
    driverToStoreKm = calculateDistanceKm(options.driverLat!, options.driverLng!, storeCoords.lat, storeCoords.lng);
  }

  let totalEstimatedKm: number | null = null;
  if (driverToStoreKm !== null && storeToCustomerKm !== null) {
    totalEstimatedKm = driverToStoreKm + storeToCustomerKm;
  } else if (storeToCustomerKm !== null) {
    totalEstimatedKm = storeToCustomerKm;
  } else if (driverToStoreKm !== null) {
    totalEstimatedKm = driverToStoreKm;
  }

  let summaryLabel = '';
  if (totalEstimatedKm !== null) {
    summaryLabel = formatDistanceKm(totalEstimatedKm);
  }

  return {
    storeToCustomerKm,
    driverToStoreKm,
    totalEstimatedKm,
    summaryLabel
  };
}

/**
 * Builds a direct Google Maps Navigation URL (turn-by-turn routing).
 * If coordinates are provided, it leads the driver exactly to that GPS pinpoint.
 */
export function buildGoogleNavigationUrl(options: {
  lat?: number | null;
  lng?: number | null;
  mapUrl?: string | null;
  address?: string | null;
  city?: string | null;
  storeName?: string | null;
}): string {
  let coords: GeoCoords | null = null;
  if (isValidCoordinate(options.lat, options.lng)) {
    coords = { lat: options.lat!, lng: options.lng! };
  } else if (options.mapUrl) {
    coords = extractCoordinates(options.mapUrl);
  }

  if (coords) {
    return `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}&travelmode=driving`;
  }

  const queryParts = [options.address, options.city, options.storeName].filter(Boolean);
  const fallbackQuery = queryParts.join(', ') || 'Ubicación';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fallbackQuery)}&travelmode=driving`;
}

/**
 * Builds a Waze Navigation URL towards exact coordinates or address query.
 */
export function buildWazeNavigationUrl(options: {
  lat?: number | null;
  lng?: number | null;
  mapUrl?: string | null;
  address?: string | null;
  city?: string | null;
}): string {
  let coords: GeoCoords | null = null;
  if (isValidCoordinate(options.lat, options.lng)) {
    coords = { lat: options.lat!, lng: options.lng! };
  } else if (options.mapUrl) {
    coords = extractCoordinates(options.mapUrl);
  }

  if (coords) {
    return `https://waze.com/ul?ll=${coords.lat},${coords.lng}&navigate=yes`;
  }

  const queryParts = [options.address, options.city].filter(Boolean);
  const fallbackQuery = queryParts.join(', ') || 'Ubicación';
  return `https://waze.com/ul?q=${encodeURIComponent(fallbackQuery)}&navigate=yes`;
}

/**
 * Builds a standard Google Maps Search / Pin view URL.
 */
export function buildGoogleMapSearchUrl(options: {
  lat?: number | null;
  lng?: number | null;
  mapUrl?: string | null;
  address?: string | null;
  city?: string | null;
}): string {
  let coords: GeoCoords | null = null;
  if (isValidCoordinate(options.lat, options.lng)) {
    coords = { lat: options.lat!, lng: options.lng! };
  } else if (options.mapUrl) {
    coords = extractCoordinates(options.mapUrl);
  }

  if (coords) {
    return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
  }

  const queryParts = [options.address, options.city].filter(Boolean);
  const fallbackQuery = queryParts.join(', ') || 'Ubicación';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallbackQuery)}`;
}

/**
 * Builds a Google Maps Directions URL showing the complete 2-stage route:
 * Stage 1 (Before pickup): Domiciliario (Live GPS) -> Restaurante (Waypoint) -> Cliente (Final Destination)
 * Stage 2 (After pickup): Domiciliario (Live GPS) -> Cliente (Final Destination)
 */
export function buildGoogleFullRouteUrl(options: {
  driverLat?: number | null;
  driverLng?: number | null;
  storeLat?: number | null;
  storeLng?: number | null;
  storeAddress?: string | null;
  storeMapUrl?: string | null;
  destLat?: number | null;
  destLng?: number | null;
  destAddress?: string | null;
  destMapUrl?: string | null;
  isPickedUp?: boolean;
  // Backward compatibility aliases
  originLat?: number | null;
  originLng?: number | null;
  originAddress?: string | null;
  originMapUrl?: string | null;
  waypointLat?: number | null;
  waypointLng?: number | null;
  waypointAddress?: string | null;
}): string {
  // Destination is the Customer
  let destStr = '';
  let destCoords: GeoCoords | null = null;
  const targetDestLat = options.destLat;
  const targetDestLng = options.destLng;
  const targetDestMapUrl = options.destMapUrl;
  const targetDestAddress = options.destAddress;

  if (isValidCoordinate(targetDestLat, targetDestLng)) {
    destCoords = { lat: targetDestLat!, lng: targetDestLng! };
  } else if (targetDestMapUrl) {
    destCoords = extractCoordinates(targetDestMapUrl);
  }

  if (destCoords) {
    destStr = `${destCoords.lat},${destCoords.lng}`;
  } else if (targetDestAddress) {
    destStr = encodeURIComponent(targetDestAddress);
  }

  // Origin is always the courier's real-time live GPS position
  let originStr = '';
  const effDriverLat = options.driverLat ?? options.originLat;
  const effDriverLng = options.driverLng ?? options.originLng;
  if (isValidCoordinate(effDriverLat, effDriverLng)) {
    originStr = `${effDriverLat},${effDriverLng}`;
  }

  // Waypoint is the Restaurant when in Stage 1 (before pickup)
  let waypointStr = '';
  const isAlreadyPickedUp = !!options.isPickedUp;

  if (!isAlreadyPickedUp) {
    let storeCoords: GeoCoords | null = null;
    const targetStoreLat = options.storeLat ?? options.waypointLat;
    const targetStoreLng = options.storeLng ?? options.waypointLng;
    const targetStoreMapUrl = options.storeMapUrl;
    const targetStoreAddress = options.storeAddress ?? options.waypointAddress;

    if (isValidCoordinate(targetStoreLat, targetStoreLng)) {
      storeCoords = { lat: targetStoreLat!, lng: targetStoreLng! };
    } else if (targetStoreMapUrl) {
      storeCoords = extractCoordinates(targetStoreMapUrl);
    }

    if (storeCoords) {
      waypointStr = `&waypoints=${storeCoords.lat},${storeCoords.lng}`;
    } else if (targetStoreAddress) {
      waypointStr = `&waypoints=${encodeURIComponent(targetStoreAddress)}`;
    }
  }

  // If driver GPS is available, route strictly starts at the driver's current position
  if (originStr && destStr) {
    return `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}${waypointStr}&travelmode=driving`;
  }

  // Fallback if driver GPS is waiting for satellite fix: Google Maps defaults origin to user's real-time device location
  if (destStr) {
    return `https://www.google.com/maps/dir/?api=1&destination=${destStr}${waypointStr}&travelmode=driving`;
  }

  return 'https://www.google.com/maps';
}

/**
 * Normalizes coordinates into a clean Google Maps standard link
 */
export function buildNormalizedMapUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}
